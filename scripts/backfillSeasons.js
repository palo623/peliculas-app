/**
 * Rellena el campo `totalSeasons` de todas las series guardadas en Firestore.
 *
 * OMDb solo devuelve el número de temporadas en el detalle (?t= / ?i=),
 * así que este script pide el detalle de cada serie (por imdbID si existe,
 * si no por título) y lo guarda en el documento.
 *
 * Uso:
 *   node scripts/backfillSeasons.js            -> procesa todas las series sin totalSeasons
 *   node scripts/backfillSeasons.js --all      -> reprocesa TODAS las series (aunque ya tengan valor)
 *   node scripts/backfillSeasons.js --dry-run  -> solo muestra lo que haría, sin escribir
 *   node scripts/backfillSeasons.js --limit 10 -> procesa como máximo 10 series
 *
 * Ojo con la cuota gratuita de OMDb (1000 peticiones/día): el script espera
 * ~1s entre peticiones para no saturar la API.
 */

const firebaseConn = require("../src-backend/models/firebase");
const { omdbService } = require("../src-backend/services/omdbService");

const db = firebaseConn.getDb();

if (!db) {
    console.error("❌ Sin conexión a Firestore. Revisa tu .env (FIREBASE_*) o firebase-key.json.");
    process.exit(1);
}

const args = process.argv.slice(2);
const FORCE_ALL = args.includes("--all");
const DRY_RUN = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit"));
const LIMIT = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) || Infinity : Infinity;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseSeasons(raw) {
    if (!raw || raw.totalSeasons === undefined || raw.totalSeasons === null || raw.totalSeasons === "N/A") {
        return null;
    }
    const n = Number.parseInt(raw.totalSeasons, 10);
    return !Number.isNaN(n) && n > 0 ? n : null;
}

async function backfill() {
    console.log("\n--- RELLENANDO TEMPORADAS DE SERIES (" + firebaseConn.getMode() + ") ---\n");
    if (DRY_RUN) console.log("🔍 Modo dry-run: no se escribirá nada en Firestore.\n");

    const snapshot = await db.collection("movies").get();
    const allDocs = [];
    snapshot.forEach((doc) => allDocs.push(doc));

    // Solo series. Las películas no tienen temporadas: si alguna trae un valor
    // obsoleto se limpia.
    const series = allDocs.filter((doc) => {
        const data = doc.data() || {};
        return String(data.type || "").toLowerCase() === "series";
    });
    const movies = allDocs.filter((doc) => {
        const data = doc.data() || {};
        return String(data.type || "").toLowerCase() !== "series";
    });

    const pending = FORCE_ALL
        ? series
        : series.filter((doc) => {
            const data = doc.data() || {};
            return data.totalSeasons === undefined || data.totalSeasons === null;
        });

    const queue = pending.slice(0, LIMIT);
    console.log(`📚 Series totales: ${series.length} | Pendientes de rellenar: ${pending.length} | A procesar ahora: ${queue.length}`);

    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const doc of queue) {
        const data = doc.data() || {};
        const label = `"${data.title || doc.id}"`;
        try {
            let raw = null;
            if (data.imdbID && /^tt\d+$/i.test(String(data.imdbID))) {
                raw = await omdbService.getById(String(data.imdbID).trim());
            } else if (data.title) {
                raw = await omdbService.searchMovie(String(data.title), { type: "series" });
            } else {
                console.log(`  ⚠ ${doc.id}: sin imdbID ni título, se omite.`);
                failed++;
                continue;
            }
            const seasons = parseSeasons(raw);
            if (seasons === null) {
                console.log(`  ⚠ ${label}: la API no devuelve nº de temporadas.`);
                notFound++;
            } else if (!DRY_RUN) {
                await doc.ref.update({ totalSeasons: seasons });
                console.log(`  ✔ ${label}: ${seasons} temporada(s).`);
                updated++;
            } else {
                console.log(`  ✔ ${label}: ${seasons} temporada(s) (dry-run).`);
                updated++;
            }
        } catch (e) {
            console.log(`  ✖ ${label}: ${e.message}`);
            failed++;
            if (/429|muchas búsquedas|límite/i.test(e.message || "")) {
                console.log("⏸ Límite de la API alcanzado. Espera un rato y vuelve a lanzar el script (retomará donde lo dejaste).");
                break;
            }
        }
        await sleep(1000); // no saturar OMDb
    }

    // Limpieza: ninguna película debería tener totalSeasons.
    let cleaned = 0;
    if (!DRY_RUN) {
        for (const doc of movies) {
            const data = doc.data() || {};
            if (data.totalSeasons !== undefined && data.totalSeasons !== null) {
                await doc.ref.update({ totalSeasons: null });
                cleaned++;
            }
        }
    }

    console.log(`\n✨ Terminado. Actualizadas: ${updated} | Sin dato en API: ${notFound} | Fallos: ${failed} | Películas limpiadas: ${cleaned}.`);
    process.exit(0);
}

backfill().catch((e) => {
    console.error("❌ Error inesperado:", e.message || e);
    process.exit(1);
});
