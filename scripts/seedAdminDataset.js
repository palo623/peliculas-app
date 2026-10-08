/**
 * Dataset de pruebas para la vista de administrador (tarea 13 del proyecto).
 *
 * Genera 100 usuarios de prueba y 100 reseñas asociadas a películas y series
 * del catálogo, clasifica cada reseña con el análisis de sentimiento y guarda
 * todo en Firebase (Firestore).
 *
 * Uso:
 *   node scripts/seedAdminDataset.js --dry-run          # plan, sin escribir nada
 *   node scripts/seedAdminDataset.js                    # 100 usuarios + 100 reseñas
 *   node scripts/seedAdminDataset.js --users=50 --count=200
 *   node scripts/seedAdminDataset.js --ai               # refina el sentimiento con IA
 *   node scripts/seedAdminDataset.js --admin=tu@email.com
 *   node scripts/seedAdminDataset.js --cleanup          # borra lo generado antes
 *
 * Los documentos generados llevan `seedSource: "admin-dataset"`, así que
 * --cleanup solo elimina los datos de prueba (nunca usuarios reales).
 *
 * Requiere credenciales Firebase Admin en .env (o firebase-key.json).
 */

const firebaseConn = require("../src-backend/models/firebase");
const catalog = require("../src-backend/services/catalogService");
const { buildMediaKey } = require("../src-backend/models/mediaKey");
const { analyzeSentiment, analyzeSentimentAI } = require("../src-backend/services/sentimentService");

const SEED_SOURCE = "admin-dataset";
const db = firebaseConn.getDb();

// Catálogo mínimo por si la colección del catálogo todavía está vacía: así el
// dataset de pruebas siempre tiene obras reales a las que asociar reseñas.
const FALLBACK_MEDIA = [
    { title: "Inception", year: "2010", type: "movie", imdbID: "tt1375666", genres: ["Sci-Fi", "Action", "Thriller"] },
    { title: "The Dark Knight", year: "2008", type: "movie", imdbID: "tt0468569", genres: ["Action", "Crime", "Drama"] },
    { title: "Interstellar", year: "2014", type: "movie", imdbID: "tt0816692", genres: ["Sci-Fi", "Adventure", "Drama"] },
    { title: "The Godfather", year: "1972", type: "movie", imdbID: "tt0068646", genres: ["Crime", "Drama"] },
    { title: "Parasite", year: "2019", type: "movie", imdbID: "tt6751668", genres: ["Comedy", "Drama", "Thriller"] },
    { title: "Titanic", year: "1997", type: "movie", imdbID: "tt0120338", genres: ["Drama", "Romance"] },
    { title: "Toy Story", year: "1995", type: "movie", imdbID: "tt0114709", genres: ["Animation", "Comedy", "Family"] },
    { title: "Breaking Bad", year: "2008", type: "series", imdbID: "tt0903747", genres: ["Crime", "Drama", "Thriller"] },
    { title: "Stranger Things", year: "2016", type: "series", imdbID: "tt4574334", genres: ["Sci-Fi", "Horror", "Drama"] },
    { title: "The Office", year: "2005", type: "series", imdbID: "tt0386676", genres: ["Comedy"] },
    { title: "Game of Thrones", year: "2011", type: "series", imdbID: "tt0944947", genres: ["Action", "Adventure", "Drama"] },
    { title: "La Casa de Papel", year: "2017", type: "series", imdbID: "tt6468322", genres: ["Crime", "Thriller", "Drama"] }
];

// ---- Generadores de texto (aseguran >= 50 caracteres, como exige ReviewModel) ----
const POSITIVE_TEXTS = [
    "Me ha parecido una obra excelente: el guion está muy cuidado y las interpretaciones son brillantes.",
    "Una película impresionante, de las que se disfrutan de principio a fin y se recomiendan sin dudar.",
    "La serie es genial, engancha desde el primer capítulo y mantiene un nivel altísimo temporada tras temporada.",
    "Una historia emotiva y muy bien contada, con personajes memorables y una banda sonora espectacular.",
    "Me ha encantado, es entretenida, original y sorprendente; una de mis favoritas sin ninguna duda."
];

const NEGATIVE_TEXTS = [
    "Me ha parecido muy aburrida y predecible: el guion es flojo y los personajes resultan poco creíbles.",
    "Una decepción total, esperaba mucho más y termina siendo un desperdicio de dos horas largas.",
    "La serie es pesada y confusa, con un ritmo lento que hace imposible seguirla con interés.",
    "Un desastre de montaje y de guion; las actuaciones son mediocres y el final resulta ridículo.",
    "No la recomiendo nada, es tediosa, incoherente y me dejó con la sensación de haber perdido el tiempo."
];

const NEUTRAL_TEXTS = [
    "Es una película correcta sin más: tiene cosas buenas y cosas que no me convencieron del todo.",
    "La serie cumple, aunque no destaca en nada; se deja ver pero no me ha marcado especialmente.",
    "Historia normal, con un reparto decente y algunos momentos interesantes y otros bastante flojos.",
    "Ni buena ni mala: entretiene lo justo y no aporta nada nuevo dentro de su género habitual.",
    "Tiene un planteamiento interesante, pero el desarrollo es predecible y el resultado queda a medias."
];

const POSITIVE_RATINGS = [8, 9, 10];
const NEUTRAL_RATINGS = [5, 6, 7];
const NEGATIVE_RATINGS = [1, 2, 3, 4];

// RNG reproducible: con la misma semilla el dataset es idéntico.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
}

function pad(text) {
    const extra = " En conjunto, me parece una propuesta a tener en cuenta dentro de su género.";
    return text.length >= 50 ? text : `${text}${extra}`;
}

function buildUsers(count, adminEmails = []) {
    const admins = new Set(adminEmails.map((e) => String(e).trim().toLowerCase()));
    const users = [];
    for (let i = 1; i <= count; i++) {
        const num = String(i).padStart(3, "0");
        const email = `cineairos.user${num}@example.com`;
        users.push({
            id: email,
            email,
            name: `Usuario Prueba ${num}`,
            role: admins.has(email) ? "admin" : "user",
            provider: "seed",
            prefs: { favoriteGenres: [], likesMovies: null, onboardingDone: true },
            seedSource: SEED_SOURCE,
            createdAt: new Date().toISOString()
        });
    }
    return users;
}

// Construye las reseñas: cada etiqueta de sentimiento aparece ~1/3 de las veces
// para que las estadísticas y los gráficos tengan datos de los tres tipos.
async function buildReviews({ users, media, count, seed = 20261008, useAI = false } = {}) {
    if (!Array.isArray(users) || users.length === 0) throw new Error("Se necesitan usuarios para generar reseñas");
    if (!Array.isArray(media) || media.length === 0) throw new Error("Se necesita catálogo para asociar las reseñas");
    const rng = mulberry32(seed);
    const labels = ["positive", "negative", "neutral"];
    const usedPairs = new Set();
    const reviews = [];
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };

    for (let i = 0; i < count; i++) {
        const user = users[i % users.length];
        const label = labels[i % labels.length];

        // Asocia la reseña a una obra evitando repetir usuario+obra.
        let item = null;
        for (let attempt = 0; attempt < media.length * 2; attempt++) {
            const candidate = media[Math.floor(rng() * media.length)];
            const pair = `${user.id}__${candidate.mediaKey || candidate.title}`;
            if (!usedPairs.has(pair)) {
                usedPairs.add(pair);
                item = candidate;
                break;
            }
        }
        if (!item) continue;

        const text = pad(pick(
            label === "positive" ? POSITIVE_TEXTS : label === "negative" ? NEGATIVE_TEXTS : NEUTRAL_TEXTS,
            rng
        ));
        const rating = pick(
            label === "positive" ? POSITIVE_RATINGS : label === "negative" ? NEGATIVE_RATINGS : NEUTRAL_RATINGS,
            rng
        );

        const mediaType = item.type === "series" ? "series" : "movie";
        const imdbID = item.imdbID ? String(item.imdbID).toLowerCase() : null;
        const year = item.year ? String(item.year).slice(0, 4) : null;
        const genres = Array.isArray(item.genres) ? item.genres : catalog.normalizeGenres(item.genre);
        const genre = genres.length > 0 ? genres.join(", ") : null;

        let sentiment;
        try {
            sentiment = useAI ? await analyzeSentimentAI(text) : analyzeSentiment(text);
        } catch (e) {
            sentiment = analyzeSentiment(text);
        }
        sentimentCounts[sentiment.label] = (sentimentCounts[sentiment.label] || 0) + 1;

        const daysAgo = Math.floor(rng() * 180);
        const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

        reviews.push({
            userId: user.id,
            userName: user.name,
            mediaType,
            mediaKey: buildMediaKey({ mediaType, imdbID, title: item.title, year }),
            imdbID,
            mediaTitle: item.title,
            mediaYear: year,
            text,
            rating,
            genre,
            sentiment,
            sentimentLabel: sentiment.label,
            upvotes: Math.floor(rng() * 25),
            downvotes: Math.floor(rng() * 6),
            replyCount: 0,
            createdAt,
            updatedAt: createdAt,
            seedSource: SEED_SOURCE
        });
        reviews[reviews.length - 1].score = reviews[reviews.length - 1].upvotes - reviews[reviews.length - 1].downvotes;
    }
    return { reviews, sentimentCounts };
}

async function writeInBatches(docs, collectionName, idOf) {
    let written = 0;
    for (let i = 0; i < docs.length; i += 400) {
        const chunk = docs.slice(i, i + 400);
        const batch = db.batch();
        for (const doc of chunk) {
            const { id, ...data } = doc;
            const idValue = idOf ? idOf(doc) : null;
            const ref = idValue
                ? db.collection(collectionName).doc(String(idValue))
                : db.collection(collectionName).doc();
            batch.set(ref, data);
        }
        await batch.commit();
        written += chunk.length;
        console.log(`  ${collectionName}: ${written}/${docs.length}`);
    }
    return written;
}

async function cleanup() {
    let total = 0;
    for (const collectionName of ["reviews", "users"]) {
        let removed = 0;
        while (true) {
            const snap = await db.collection(collectionName).where("seedSource", "==", SEED_SOURCE).limit(400).get();
            if (snap.empty) break;
            const batch = db.batch();
            snap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            removed += snap.size;
            if (snap.size < 400) break;
        }
        console.log(`Cleanup ${collectionName}: ${removed} documentos de prueba eliminados.`);
        total += removed;
    }
    return total;
}

function parseArgs(argv) {
    const has = (flag) => argv.includes(flag);
    const value = (name, fallback) => {
        const arg = argv.find((a) => a.startsWith(`--${name}=`));
        return arg ? arg.split("=").slice(1).join("=").trim() : fallback;
    };
    return {
        dryRun: has("--dry-run"),
        cleanup: has("--cleanup"),
        ai: has("--ai"),
        users: Math.min(Math.max(Number.parseInt(value("users", "100"), 10) || 100, 1), 1000),
        count: Math.min(Math.max(Number.parseInt(value("count", "100"), 10) || 100, 1), 5000),
        seed: Number.parseInt(value("seed", "20261008"), 10) || 20261008,
        adminEmail: value("admin", "")
    };
}

async function run(argv) {
    const args = parseArgs(argv);

    // El dry-run no toca la base de datos, así que también sirve sin Firestore
    // para revisar qué se generaría.
    if (!db && !args.dryRun) {
        console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
        console.error("(Puedes validar la generación con: node scripts/seedAdminDataset.js --dry-run)");
        return { ok: false, reason: "sin-firestore" };
    }

    if (args.cleanup) {
        const removed = await cleanup();
        return { ok: true, mode: "cleanup", removed };
    }

    const users = buildUsers(args.users, args.adminEmail ? [args.adminEmail] : []);
    let catalogItems = [];
    try {
        catalogItems = await catalog.loadCatalogItems();
    } catch (e) {
        catalogItems = [];
    }
    const media = catalogItems.length > 0 ? catalogItems : FALLBACK_MEDIA;
    const source = catalogItems.length > 0 ? "catálogo de Firestore" : "catálogo de reserva (el catálogo está vacío)";

    const { reviews, sentimentCounts } = await buildReviews({
        users,
        media,
        count: args.count,
        seed: args.seed,
        useAI: args.ai
    });

    console.log(`Origen de obras: ${source} (${media.length} obras distintas)`);
    console.log(`Vista previa del dataset: ${users.length} usuarios y ${reviews.length} reseñas.`);
    console.log(`Sentimiento detectado: ${JSON.stringify(sentimentCounts)}`);
    console.log(`Ejemplo: ${reviews[0] ? reviews[0].mediaTitle : "-"} -> "${(reviews[0] && reviews[0].text || "").slice(0, 70)}..."`);

    if (args.dryRun) {
        console.log("Dry-run: no se ha escrito nada en Firestore.");
        return { ok: true, mode: "dry-run", users: users.length, reviews: reviews.length, sentimentCounts };
    }

    console.log("Escribiendo usuarios...");
    // El id del documento de usuario es su email (igual que authService).
    await writeInBatches(users, "users", (user) => user.email);
    console.log("Escribiendo reseñas...");
    await writeInBatches(reviews, "reviews");

    console.log("Dataset de pruebas generado correctamente.");
    return { ok: true, mode: "seed", users: users.length, reviews: reviews.length, sentimentCounts };
}

module.exports = { buildUsers, buildReviews, parseArgs, cleanup, run, FALLBACK_MEDIA, SEED_SOURCE };

if (require.main === module) {
    run(process.argv.slice(2))
        .then((result) => {
            if (result && result.ok === false) process.exitCode = 1;
        })
        .catch((error) => {
            console.error("Error generando el dataset:", error.message || error);
            process.exitCode = 1;
        })
        .finally(() => {
            // El proceso queda vivo por el SDK de Firestore; lo cerramos a mano.
            setTimeout(() => process.exit(process.exitCode || 0), 100);
        });
}
