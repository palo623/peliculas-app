/**
 * Añade series aleatorias de OMDb a la colección movies (type: series) de Firestore.
 * No borra series existentes.
 *
 * Uso:
 *   node scripts/seedRandomSeries.js
 *   node scripts/seedRandomSeries.js --count=200
 *   node scripts/seedRandomSeries.js --count=200 --dry-run
 *   node scripts/seedRandomSeries.js --count=200 --userId=usuario@example.com
 *
 * Requiere OMDB_API_KEY y credenciales Firebase Admin en .env.
 * 200 series consumen aproximadamente 220 peticiones de OMDb.
 */

const firebaseConn = require("../src-backend/models/firebase");
const { omdbService } = require("../src-backend/services/omdbService");
const { SeriesModel } = require("../src-backend/models/seriesModel");

const db = firebaseConn.getDb();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const countArg = args.find((arg) => arg.startsWith("--count="));
const ownerArg = args.find((arg) => arg.startsWith("--userId="));
const requestedCount = countArg ? Number.parseInt(countArg.split("=")[1], 10) : 200;
const targetCount = Math.min(Math.max(requestedCount || 200, 1), 400);
const ownerId = ownerArg ? ownerArg.split("=").slice(1).join("=").trim() : "catalog-seed";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const seedQueries = [
    "breaking bad", "game of thrones", "friends", "the office", "stranger things",
    "chernobyl", "the wire", "sopranos", "mad men", "lost",
    "westworld", "black mirror", "the crown", "mandalorian", "vikings",
    "the walking dead", "house", "dexter", "sherlock", "true detective",
    "fargo", "better call saul", "ozark", "the boys", "euphoria",
    "succession", "the witcher", "money heist", "dark", "mindhunter",
    "narcos", "peak blinders", "the handmaid", "mr robot", "barry",
    "atlanta", "fargo", "the americans", "homeland", "silicon valley",
    "veep", "parks", "brooklyn", "community", "modern family",
    "how i met", "big bang", "two and a half", "scrubs", "entourage",
    "ballers", "shameless", "sons", "boardwalk", "true blood",
    "rome", "spartacus", "v", "falling", "revolution",
    "arrow", "flash", "supergirl", "legends", "titans",
    "doom", "umbrella", "witcher", "wheel", "sandman",
    "peripheral", "rings", "house of the dragon", "willow", "andor",
    "obi", "mandalorian", "boba", "kenobi", "ashoka"
];

if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

if (!process.env.OMDB_API_KEY) {
    console.error("Falta OMDB_API_KEY en .env.");
    process.exit(1);
}

function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
}

function candidateKey(item) {
    return String(item.imdbID || `${item.Title}|${item.Year}`).toLowerCase();
}

async function existingIds() {
    const snapshot = await db.collection("movies").where("type", "==", "series").select("imdbID").get();
    return new Set(snapshot.docs.map((doc) => String(doc.data().imdbID || "").toLowerCase()).filter(Boolean));
}

async function collectCandidates(alreadySaved) {
    const candidates = new Map();
    const queries = shuffle(seedQueries);
    for (const query of queries) {
        const pages = shuffle([1, 2, 3]);
        for (const page of pages) {
            try {
                const data = await omdbService.searchMovies(query.trim(), page, { type: "series" });
                for (const item of data.Search || []) {
                    const type = String(item.Type || "series").toLowerCase();
                    const key = candidateKey(item);
                    if (type !== "series" || alreadySaved.has(key) || candidates.has(key)) continue;
                    candidates.set(key, item);
                }
            } catch (error) {
                if (/429|límite|muchas búsquedas/i.test(error.message || "")) throw error;
            }
            if (candidates.size >= targetCount) return shuffle([...candidates.values()]).slice(0, targetCount);
            await delay(250);
        }
    }
    return shuffle([...candidates.values()]).slice(0, targetCount);
}

async function loadDetails(candidates) {
    const series = [];
    for (const candidate of candidates) {
        try {
            const raw = await omdbService.getById(candidate.imdbID);
            if (String(raw.Type || "").toLowerCase() !== "series") continue;
            series.push(SeriesModel.formatData(raw));
            console.log(`Preparada ${series.length}/${candidates.length}: ${raw.Title}`);
        } catch (error) {
            console.warn(`No se pudo cargar "${candidate.Title}": ${error.message}`);
            if (/429|límite|muchas búsquedas/i.test(error.message || "")) break;
        }
        await delay(250);
    }
    return series;
}

async function main() {
    console.log(`Objetivo: ${targetCount} series aleatorias. Propietario: ${ownerId}`);
    const savedIds = await existingIds();
    const candidates = await collectCandidates(savedIds);
    console.log(`Candidatas nuevas encontradas: ${candidates.length}`);
    if (candidates.length === 0) throw new Error("No se encontraron series nuevas.");

    const series = await loadDetails(candidates);
    console.log(`Series con detalle completo: ${series.length}`);
    if (dryRun) {
        console.log("Dry-run: no se escribirá nada en Firestore.");
        return;
    }

    let saved = 0;
    for (const serie of series) {
        await SeriesModel.saveToDatabase(serie, ownerId);
        saved++;
    }
    console.log(`Carga terminada. Series guardadas: ${saved}.`);
}

main().catch((error) => {
    console.error("Error durante la carga:", error.message || error);
    process.exitCode = 1;
});