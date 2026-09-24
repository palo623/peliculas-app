/**
 * Enriquece las series del catálogo (colección "series") con el número de
 * temporadas y los episodios de cada una, leyendo OMDb temporada a temporada.
 * Usa la misma lógica que el programador automático del servidor
 * (src-backend/services/seasonEnrichmentService.js).
 *
 * OMDb Free tiene cuota diaria (~1000 peticiones). Cada serie consume
 * 1 petición (detalle) + 1 por temporada. Usa --limit para procesar de a poco.
 *
 * Uso:
 *   node scripts/enrichSeriesSeasons.js --limit=30
 *   node scripts/enrichSeriesSeasons.js --limit=30 --dry-run
 *   node scripts/enrichSeriesSeasons.js --ids=tt0903747,tt0944947
 *   node scripts/enrichSeriesSeasons.js --limit=30 --delay=400
 */

const firebaseConn = require("../src-backend/models/firebase");
const { enrichPendingSeries } = require("../src-backend/services/seasonEnrichmentService");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const argValue = (name, fallback) => {
    const found = args.find((arg) => arg.startsWith(`--${name}=`));
    if (!found) return fallback;
    return found.split("=").slice(1).join("=").trim();
};

const requestedLimit = Number.parseInt(argValue("limit", "50"), 10);
const limit = Math.min(Math.max(requestedLimit || 50, 1), 100);
const delay = Math.min(Math.max(Number.parseInt(argValue("delay", "300"), 10) || 300, 0), 5000);
const ids = argValue("ids", "").split(",").map((s) => s.trim()).filter(Boolean);

const db = firebaseConn.getDb();
if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

if (!process.env.OMDB_API_KEY) {
    console.error("Falta OMDB_API_KEY en .env.");
    process.exit(1);
}

async function main() {
    if (dryRun) {
        const snapshot = await db.collection("series").limit(5000).get();
        let candidates = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((serie) => !serie.dateEnriched || !Array.isArray(serie.seasons) || serie.seasons.length === 0);
        if (ids.length > 0) {
            const wanted = new Set(ids.map((id) => String(id).toLowerCase()));
            candidates = candidates.filter((serie) => wanted.has(String(serie.imdbID || "").toLowerCase()));
        }
        candidates.sort((a, b) => String(a.imdbID || "").localeCompare(String(b.imdbID || "")));
        const toProcess = candidates.slice(0, limit);
        console.log(`Series sin enriquecer disponibles: ${candidates.length}. Procesaría: ${toProcess.length}.`);
        toProcess.slice(0, 10).forEach((s) => console.log("  (dry-run) " + s.imdbID + " - " + s.title));
        console.log("Dry-run: no se escribirá nada en Firestore.");
        return;
    }

    console.log(`Procesando hasta ${limit} series${ids.length ? " (ids: " + ids.join(", ") + ")" : ""}...`);
    const summary = await enrichPendingSeries({ limit, ids, delay });
    console.log("Resultado:", JSON.stringify(summary));
    if (summary.updated === 0 && summary.reason) {
        console.log("Motivo:", summary.reason);
        process.exitCode = 1;
    } else if (summary.processed === 0 && summary.updated === 0 && summary.skipped === 0) {
        console.log("No quedan series pendientes de enriquecer.");
    }
}

main().catch((error) => {
    console.error("Error durante el enriquecimiento:", error.message || error);
    process.exitCode = 1;
});