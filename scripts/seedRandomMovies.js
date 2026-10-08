/**
 * Añade películas aleatorias de OMDb a la colección movies de Firestore.
 * No borra películas existentes.
 *
 * Uso:
 *   node scripts/seedRandomMovies.js
 *   node scripts/seedRandomMovies.js --count=400
 *   node scripts/seedRandomMovies.js --count=400 --dry-run
 *   node scripts/seedRandomMovies.js --count=400 --userId=usuario@example.com
 *
 * Requiere OMDB_API_KEY y credenciales Firebase Admin en .env.
 * 400 películas consumen aproximadamente 440 peticiones de OMDb.
 */

const firebaseConn = require("../src-backend/models/firebase");
const { omdbService } = require("../src-backend/services/omdbService");
const { MovieModel } = require("../src-backend/models/movieModel");

const db = firebaseConn.getDb();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const countArg = args.find((arg) => arg.startsWith("--count="));
const ownerArg = args.find((arg) => arg.startsWith("--userId="));
const requestedCount = countArg ? Number.parseInt(countArg.split("=")[1], 10) : 400;
const targetCount = Math.min(Math.max(requestedCount || 400, 1), 400);
const ownerId = ownerArg ? ownerArg.split("=").slice(1).join("=").trim() : "catalog-seed";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const seedQueries = [
    "action", "adventure", "animation", "comedy", "crime", "drama",
    "fantasy", "horror", "mystery", "romance", "thriller", "war",
    "space", "family", "hero", "detective", "love", "world",
    "night", "city", "life", "dream", "time", "secret", "island",
    "school", "summer", "winter", "future", "history", "music",
    "king", "queen", "fire", "dark", "lost", "road", "house"
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
    const snapshot = await db.collection("movies").select("imdbID").get();
    return new Set(snapshot.docs.map((doc) => String(doc.data().imdbID || "").toLowerCase()).filter(Boolean));
}

async function collectCandidates(alreadySaved) {
    const candidates = new Map();
    const queries = shuffle(seedQueries);
    for (const query of queries) {
        const pages = shuffle([1, 2, 3]);
        for (const page of pages) {
            try {
                const data = await omdbService.searchMovies(query.trim(), page, { type: "movie" });
                for (const item of data.Search || []) {
                    const type = String(item.Type || "movie").toLowerCase();
                    const key = candidateKey(item);
                    if (type !== "movie" || alreadySaved.has(key) || candidates.has(key)) continue;
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
    const movies = [];
    for (const candidate of candidates) {
        try {
            const raw = await omdbService.getById(candidate.imdbID);
            if (String(raw.Type || "").toLowerCase() !== "movie") continue;
            movies.push(MovieModel.formatData(raw));
            console.log(`Preparada ${movies.length}/${candidates.length}: ${raw.Title}`);
        } catch (error) {
            console.warn(`No se pudo cargar "${candidate.Title}": ${error.message}`);
            if (/429|límite|muchas búsquedas/i.test(error.message || "")) break;
        }
        await delay(250);
    }
    return movies;
}

async function main() {
    console.log(`Objetivo: ${targetCount} películas aleatorias. Propietario: ${ownerId}`);
    const savedIds = await existingIds();
    const candidates = await collectCandidates(savedIds);
    console.log(`Candidatas nuevas encontradas: ${candidates.length}`);
    if (candidates.length === 0) throw new Error("No se encontraron películas nuevas.");

    const movies = await loadDetails(candidates);
    console.log(`Películas con detalle completo: ${movies.length}`);
    if (dryRun) {
        console.log("Dry-run: no se escribirá nada en Firestore.");
        return;
    }

    let saved = 0;
    for (const movie of movies) {
        await MovieModel.saveToDatabase(movie, ownerId);
        saved++;
    }
    console.log(`Carga terminada. Películas guardadas: ${saved}.`);
}

main().catch((error) => {
    console.error("Error durante la carga:", error.message || error);
    process.exitCode = 1;
});
