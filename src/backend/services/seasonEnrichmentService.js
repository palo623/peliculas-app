// Enriquecimiento automático de temporadas de series.
// Centraliza la lógica que usan tanto el script CLI (scripts/enrichSeriesSeasons.js)
// como el programador diario del servidor (server.js).
const firebaseConn = require("../models/firebase");
const { omdbService } = require("./omdbService");
const { SeriesModel } = require("../models/seriesModel");

// Evita que dos tandas se solapen dentro del mismo proceso.
let running = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Procesa hasta `limit` series pendientes y devuelve un resumen.
// `ids` (opcional) restringe a IMDb IDs concretos.
async function enrichPendingSeries({ limit = 50, ids = [], delay = 300 } = {}) {
    const db = firebaseConn.getDb();
    if (!db) return { processed: 0, updated: 0, skipped: 0, reason: "sin Firestore" };
    if (running) return { processed: 0, updated: 0, skipped: 0, reason: "ya hay una tanda en curso" };
    if (!process.env.OMDB_API_KEY) return { processed: 0, updated: 0, skipped: 0, reason: "sin OMDB_API_KEY" };

    running = true;
    try {
        const snapshot = await db.collection("series").limit(5000).get();
        let candidates = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((serie) => !serie.dateEnriched || !Array.isArray(serie.seasons) || serie.seasons.length === 0);

        if (Array.isArray(ids) && ids.length > 0) {
            const wanted = new Set(ids.map((id) => String(id).toLowerCase()));
            candidates = candidates.filter((serie) => wanted.has(String(serie.imdbID || "").toLowerCase()));
        }

        candidates.sort((a, b) => String(a.imdbID || "").localeCompare(String(b.imdbID || "")));
        const batch = candidates.slice(0, limit);

        let updated = 0;
        let skipped = 0;
        for (const serie of batch) {
            try {
                const raw = await omdbService.getById(serie.imdbID);
                const totalSeasons = Number.parseInt(raw.totalSeasons || raw.TotalSeasons, 10);
                if (!Number.isInteger(totalSeasons) || totalSeasons <= 0) {
                    await SeriesModel.updateSeasonsByImdbID(serie.imdbID, null, []);
                    skipped++;
                    continue;
                }
                const seasons = await omdbService.getSeasonCounts(serie.imdbID, totalSeasons, delay);
                const touched = await SeriesModel.updateSeasonsByImdbID(serie.imdbID, totalSeasons, seasons);
                updated++;
                console.log(`[enrich] ✔ ${serie.imdbID} ${serie.title}: ${totalSeasons} temporadas, ${seasons.length} con datos (docs: ${touched}).`);
            } catch (error) {
                console.warn(`[enrich] ✖ No se pudo enriquecer "${serie.title}" (${serie.imdbID}): ${error.message}`);
            }
        }

        return { processed: batch.length, updated, skipped };
    } finally {
        running = false;
    }
}

// Programador diario: una tanda al arrancar (si hoy aún no se ha hecho ninguna)
// y después una tanda a la hora configurada.
function startDailyEnrichment() {
    const enabled = String(process.env.SEASON_ENRICH_ENABLED || "true").toLowerCase() !== "false";
    if (!enabled) {
        console.log("[enrich] Enriquecimiento automático desactivado (SEASON_ENRICH_ENABLED=false).");
        return;
    }
    const dailyLimit = Math.min(Math.max(Number.parseInt(process.env.SEASON_ENRICH_DAILY_LIMIT, 10) || 25, 1), 100);
    const hour = Math.min(Math.max(Number.parseInt(process.env.SEASON_ENRICH_HOUR, 10) || 4, 0), 23);
    const delay = Math.min(Math.max(Number.parseInt(process.env.SEASON_ENRICH_DELAY, 10) || 300, 0), 5000);

    if (!firebaseConn.isFirestoreConnected() || !process.env.OMDB_API_KEY) {
        console.log("[enrich] Enriquecimiento automático inactivo: faltan Firestore u OMDB_API_KEY.");
        return;
    }

    let lastRunDay = null;

    const runTodayIfNeeded = async (why) => {
        const today = new Date().toDateString();
        if (lastRunDay === today) return;
        lastRunDay = today;
        console.log(`[enrich] Tanda diaria (${why}): hasta ${dailyLimit} series.`);
        try {
            const summary = await enrichPendingSeries({ limit: dailyLimit, delay });
            console.log(`[enrich] Tanda terminada: ${JSON.stringify(summary)}`);
        } catch (error) {
            console.error("[enrich] Error en la tanda diaria:", error.message || error);
            lastRunDay = null; // reintentar en la próxima comprobación
        }
    };

    // Primera tanda poco después de arrancar el servidor.
    setTimeout(() => { runTodayIfNeeded("arranque"); }, 10 * 1000);

    // Comprobación cada minuto: si toca la hora configurada, hace la tanda.
    setInterval(() => {
        if (new Date().getHours() === hour) {
            runTodayIfNeeded("hora programada");
        }
    }, 60 * 1000);

    console.log(`[enrich] Enriquecimiento automático activo: ${dailyLimit} series/día, hora ${String(hour).padStart(2, "0")}:00.`);
}

module.exports = { enrichPendingSeries, startDailyEnrichment };