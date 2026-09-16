/**
 * Llena la colección `movies` de Firestore con series obtenidas de OMDb.
 *
 * Por cada serie guarda el documento completo (título, año, director, género,
 * sinopsis, póster, nota, imdbID y totalSeasons), asociado a tu usuario para
 * que aparezca en el apartado Series de la web.
 *
 * Uso:
 *   node scripts/seedSeries.js --user tu@email.com
 *   node scripts/seedSeries.js --user tu@email.com --count 200
 *   node scripts/seedSeries.js --user tu@email.com --count 5 --dry-run
 *
 * Notas:
 * - Es idempotente: si la serie ya existe para ese usuario, se omite.
 *   Puedes relanzarlo para continuar donde lo dejaste.
 * - Consume ~1 petición de lista + 1 de detalle por serie (~250 para 200
 *   series). La cuota gratuita de OMDb es 1000/día: no lo lances más de
 *   3-4 veces al día. El script espera entre peticiones para no saturar.
 */

// Carga el .env ANTES de requerir los servicios (omdbService lee la key al cargarse).
const fs = require("fs");
const path = require("path");
(function loadEnv() {
    const envPath = path.join(__dirname, "../.env");
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
})();

const firebaseConn = require("../src-backend/models/firebase");
const { omdbService } = require("../src-backend/services/omdbService");
const { MovieModel } = require("../src-backend/models/movieModel");

const db = firebaseConn.getDb();

if (!db) {
    console.error("❌ Sin conexión a Firestore. Revisa tu .env (FIREBASE_*) o firebase-key.json.");
    process.exit(1);
}

// Búsquedas variadas para conseguir series distintas (cada una aporta hasta 30).
const SEED_QUERIES = [
    "breaking", "stranger", "thrones", "office", "friends", "crown",
    "witcher", "vikings", "sherlock", "doctor", "walking", "lost",
    "dark", "money", "queen", "peaky", "narcos", "westworld",
    "mandalorian", "wednesday", "lupin", "squid", "bridgerton", "ozark",
    "severance", "ted lasso", "fargo", "true detective", "black mirror", "house",
    "wire", "sopranos", "mad men", "better call", "chernobyl", "succession"
];
const PAGES_PER_QUERY = 3;
const LIST_DELAY_MS = 400;
const DETAIL_DELAY_MS = 700;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
    const args = process.argv.slice(2);
    // Acepta --clave valor y --clave=valor.
    const get = (name, def) => {
        const eq = args.find((x) => x.startsWith("--" + name + "="));
        if (eq) {
            const v = eq.slice(name.length + 3).trim();
            return v !== "" ? v : def;
        }
        const i = args.indexOf("--" + name);
        if (i !== -1 && args[i + 1] && !args[i + 1].startsWith("--")) {
            return args[i + 1].trim();
        }
        return def;
    };
    return {
        user: get("user", null),
        count: Number.parseInt(get("count", "200"), 10) || 200,
        dryRun: args.includes("--dry-run")
    };
}

async function collectCandidates(target) {
    const seen = new Map(); // imdbID -> { title, year, imdbID }
    for (const q of SEED_QUERIES) {
        if (seen.size >= target) break;
        for (let page = 1; page <= PAGES_PER_QUERY; page++) {
            if (seen.size >= target) break;
            try {
                const data = await omdbService.searchMovies(q, page, { type: "series" });
                const items = Array.isArray(data.Search) ? data.Search : [];
                if (items.length === 0) break;
                for (const it of items) {
                    if (!it.imdbID || seen.has(it.imdbID)) continue;
                    if (String(it.Type || "").toLowerCase() !== "series") continue;
                    seen.set(it.imdbID, { title: it.Title, year: it.Year, imdbID: it.imdbID });
                    if (seen.size >= target) break;
                }
                if (items.length < 10) break; // no hay más páginas para esta búsqueda
            } catch (e) {
                // "too many results", "not found", etc.: se pasa a la siguiente búsqueda.
                break;
            }
            await sleep(LIST_DELAY_MS);
        }
        console.log(`  … "${q}": ${seen.size} candidatas acumuladas.`);
    }
    return [...seen.values()];
}

async function seed() {
    const { user, count, dryRun } = parseArgs();

    if (!user || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(user)) {
        console.error("❌ Indica el usuario dueño de las series: node scripts/seedSeries.js --user tu@email.com");
        console.error("   (usa el mismo email con el que entras en la web para verlas en tu apartado Series).");
        process.exit(1);
    }

    console.log("\n--- SEMBRANDO SERIES DESDE OMDB (" + firebaseConn.getMode() + ") ---");
    console.log(`👤 Usuario: ${user} | 🎯 Objetivo: ${count} series${dryRun ? " | 🔍 dry-run (sin escribir)" : ""}\n`);

    if (!process.env.OMDB_API_KEY) {
        console.error("❌ Falta OMDB_API_KEY en el .env.");
        process.exit(1);
    }

    // 1. Recolectar candidatas distintas.
    console.log("Fase 1/2: buscando candidatas...");
    const candidates = await collectCandidates(count);
    console.log(`\n✔ Candidatas distintas encontradas: ${candidates.length}\n`);

    if (candidates.length === 0) {
        console.error("❌ Sin candidatas. Revisa tu OMDB_API_KEY o la cuota diaria.");
        process.exit(1);
    }

    // 2. Detalle + guardado.
    console.log("Fase 2/2: pidiendo detalle y guardando...");
    let saved = 0;
    let skipped = 0;
    let failed = 0;

    for (const cand of candidates.slice(0, count)) {
        try {
            const raw = await omdbService.getById(cand.imdbID);
            const formatted = MovieModel.formatData(raw);
            if (String(formatted.type || "").toLowerCase() !== "series") {
                skipped++;
                continue;
            }
            if (dryRun) {
                console.log(`  ✔ ${formatted.title} (${formatted.year}): ${formatted.totalSeasons != null ? formatted.totalSeasons + " temp." : "sin dato temp."} (dry-run)`);
                saved++;
            } else {
                await MovieModel.saveToDatabase(formatted, user);
                saved++;
                if (saved % 25 === 0) console.log(`  … ${saved} guardadas.`);
            }
        } catch (e) {
            failed++;
            console.log(`  ✖ ${cand.title || cand.imdbID}: ${e.message}`);
            if (/429|muchas búsquedas|límite/i.test(e.message || "")) {
                console.log("⏸ Límite de la API alcanzado. Vuelve a lanzar mañana: retomará donde lo dejaste (omite las ya guardadas).");
                break;
            }
        }
        await sleep(DETAIL_DELAY_MS);
    }

    console.log(`\n✨ Terminado. Guardadas: ${saved} | Omitidas (no series): ${skipped} | Fallos: ${failed}.`);
    if (!dryRun) console.log("Entra en la web con " + user + " y revisa el apartado Series.");
    process.exit(0);
}

seed().catch((e) => {
    console.error("❌ Error inesperado:", e.message || e);
    process.exit(1);
});
