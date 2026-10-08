// Servicio de administración: agrega reseñas, géneros y sentimiento para el
// dashboard del administrador (tareas 8, 10, 11 y 14 del proyecto).
//
// Las rutas /api/admin ya han comprobado el rol; aquí solo hay lógica de datos.
// Las lecturas se hacen con ReviewModel.readAll (tope 5000) porque el proyecto
// es pequeño y así no hacen falta índices compuestos en Firestore.

const { ReviewModel } = require("../models/reviewModel");
const { authService } = require("./authService");
const catalog = require("./catalogService");
const {
    normalizeMediaType,
    normalizeImdbId,
    normalizeYear,
    buildMediaKey
} = require("../models/mediaKey");
const {
    analyzeSentiment,
    analyzeSentimentAI,
    getSentimentProviderInfo,
    LABELS
} = require("./sentimentService");

const SENTIMENTS = LABELS.slice();
const UNCLASSIFIED = "unclassified";
const NO_GENRE = "(sin género)";

function clamp(n, min, max, fallback) {
    const parsed = Number.parseInt(n, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function emptyCounts() {
    return { positive: 0, negative: 0, neutral: 0, unclassified: 0 };
}

function labelOf(review) {
    const label = review.sentimentLabel || (review.sentiment && review.sentiment.label) || null;
    return SENTIMENTS.includes(label) ? label : UNCLASSIFIED;
}

function countSentiments(reviews) {
    const counts = emptyCounts();
    for (const review of reviews) counts[labelOf(review)] += 1;
    counts.total = reviews.length;
    return counts;
}

function withPercent(counts) {
    const total = counts.total || 0;
    const pct = (n) => (total > 0 ? round2((n / total) * 100) : 0);
    return {
        ...counts,
        percent: {
            positive: pct(counts.positive),
            negative: pct(counts.negative),
            neutral: pct(counts.neutral),
            unclassified: pct(counts.unclassified)
        }
    };
}

// Añade a cada reseña su lista de géneros: usa el guardado en la reseña y, si
// falta, lo completa con el catálogo (una sola lectura cacheada).
async function enrichReviews(reviews) {
    let lookup = null;
    try {
        const items = await catalog.loadCatalogItems();
        if (items.length > 0) lookup = catalog.buildGenreLookup(items);
    } catch (e) {
        lookup = null;
    }
    return reviews.map((review) => {
        const stored = catalog.normalizeGenres(review.genre);
        const genres = stored.length > 0
            ? stored
            : (lookup
                ? catalog.genresFromLookup({
                    mediaType: review.mediaType,
                    imdbID: review.imdbID,
                    mediaKey: review.mediaKey,
                    title: review.mediaTitle,
                    year: review.mediaYear
                }, lookup)
                : []);
        return {
            ...review,
            genres,
            genre: genres.length > 0 ? genres.join(", ") : null
        };
    });
}

function sortReviews(list, sort) {
    const arr = [...list];
    if (sort === "oldest") {
        arr.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    } else if (sort === "votes") {
        arr.sort((a, b) => (Number(b.score) - Number(a.score)) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    } else if (sort === "rating") {
        arr.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    } else {
        // recent (por defecto)
        arr.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    }
    return arr;
}

function matchesFilter(review, filter) {
    if (!filter || typeof filter !== "object") return true;
    if (filter.mediaKey) {
        if (String(review.mediaKey || "").toLowerCase() !== String(filter.mediaKey).trim().toLowerCase()) return false;
    }
    if (filter.mediaType) {
        let type = null;
        try {
            type = normalizeMediaType(filter.mediaType);
        } catch (e) {
            type = null;
        }
        if (type && review.mediaType !== type) return false;
    }
    if (filter.imdbID) {
        if (String(review.imdbID || "").toLowerCase() !== String(filter.imdbID).trim().toLowerCase()) return false;
    }
    if (filter.title) {
        if (!String(review.mediaTitle || "").toLowerCase().includes(String(filter.title).trim().toLowerCase())) return false;
    }
    if (filter.year) {
        const year = String(filter.year).trim().slice(0, 4);
        if (String(review.mediaYear || "") !== year) return false;
    }
    if (filter.sentiment) {
        const wanted = String(filter.sentiment).trim().toLowerCase();
        if (wanted === UNCLASSIFIED) {
            if (labelOf(review) !== UNCLASSIFIED) return false;
        } else if (!SENTIMENTS.includes(wanted) || labelOf(review) !== wanted) {
            return false;
        }
    }
    if (filter.genre) {
        const wanted = catalog.normalizeGenres(filter.genre).map((g) => g.toLowerCase());
        if (wanted.length > 0) {
            const own = (review.genres || catalog.normalizeGenres(review.genre)).map((g) => g.toLowerCase());
            if (!wanted.some((g) => own.includes(g))) return false;
        }
    }
    if (filter.q) {
        const q = String(filter.q).trim().toLowerCase();
        if (q) {
            const haystack = [review.mediaTitle, review.userName, review.text, review.mediaKey]
                .map((v) => String(v || "").toLowerCase());
            if (!haystack.some((h) => h.includes(q))) return false;
        }
    }
    return true;
}

// Construye la mediaKey de una obra a partir de sus partes (o la usa tal cual).
function resolveMediaKey(ref) {
    if (!ref || typeof ref !== "object") throw new Error("Falta la obra (mediaKey, imdbID o title)");
    if (ref.mediaKey) return String(ref.mediaKey).trim().toLowerCase();
    const mediaType = normalizeMediaType(ref.mediaType);
    const imdbID = ref.imdbID != null && String(ref.imdbID).trim() !== "" ? normalizeImdbId(ref.imdbID) : null;
    const title = String(ref.title || ref.mediaTitle || "").trim();
    const year = ref.year != null || ref.mediaYear != null
        ? normalizeYear(ref.year != null ? ref.year : ref.mediaYear)
        : null;
    if (!imdbID && !title) throw new Error("Falta identificar la obra (imdbID o title)");
    return buildMediaKey({ mediaType, imdbID, title: title || "untitled", year });
}

function uniqueGenres(reviews) {
    const set = new Map();
    for (const review of reviews) {
        for (const g of review.genres || []) {
            if (!set.has(g.toLowerCase())) set.set(g.toLowerCase(), g);
        }
    }
    return [...set.values()].sort((a, b) => a.localeCompare(b, "es"));
}

const adminService = {
    sentimentInfo: () => getSentimentProviderInfo(),

    // Panel resumen (tarea 14): totales generales + últimas reseñas.
    summary: async ({ latest = 10 } = {}) => {
        const wantLatest = clamp(latest, 1, 50, 10);
        const [usersTotal, reviewsTotal, all, latestRaw] = await Promise.all([
            authService.countUsers().catch(() => 0),
            ReviewModel.countAll().catch(() => 0),
            ReviewModel.readAll().catch(() => []),
            ReviewModel.latest(wantLatest).catch(() => [])
        ]);
        return {
            generatedAt: new Date().toISOString(),
            users: { total: usersTotal },
            reviews: { total: reviewsTotal, sampled: all.length },
            sentiments: withPercent(countSentiments(all)),
            latestReviews: await enrichReviews(latestRaw),
            provider: getSentimentProviderInfo()
        };
    },

    // Listado de reseñas con filtros (tareas 6 y 10).
    listReviews: async ({ mediaType, imdbID, title, year, mediaKey, genre, sentiment, q, sort, page, limit } = {}) => {
        const filter = { mediaType, imdbID, title, year, mediaKey, genre, sentiment, q };
        const all = await ReviewModel.readAll({ mediaKey });
        const enriched = await enrichReviews(all);
        const filtered = enriched.filter((review) => matchesFilter(review, filter));
        const sorted = sortReviews(filtered, sort);
        const pageNum = clamp(page, 1, 1000, 1);
        const pageSize = clamp(limit, 1, 100, 20);
        const start = (pageNum - 1) * pageSize;
        return {
            results: sorted.slice(start, start + pageSize),
            total: sorted.length,
            page: pageNum,
            limit: pageSize,
            sort: sort || "recent"
        };
    },

    // Estadísticas de una obra concreta (tarea 8).
    statsByMedia: async (ref) => {
        const mediaKey = resolveMediaKey(ref);
        let reviews = await enrichReviews(await ReviewModel.readAll({ mediaKey }));

        // Si no hay reseñas por mediaKey, se intenta por título/tipo (obras
        // antiguas que se guardaron con otra clave).
        if (reviews.length === 0 && (ref.title || ref.mediaTitle)) {
            const fallback = await enrichReviews(await ReviewModel.readAll());
            reviews = fallback.filter((review) => matchesFilter(review, { title: ref.title || ref.mediaTitle, mediaType: ref.mediaType }));
        }

        const catalogItem = await catalog.findCatalogItem(ref).catch(() => null);
        const genres = catalogItem && catalogItem.genres.length > 0 ? catalogItem.genres : uniqueGenres(reviews);
        const ratings = reviews.map((r) => r.rating).filter((n) => Number.isInteger(n));
        const first = reviews[0] || {};
        return {
            media: {
                mediaKey,
                mediaType: (catalogItem && catalogItem.type) || (first.mediaType || null),
                title: (catalogItem && catalogItem.title) || (first.mediaTitle || null),
                year: (catalogItem && catalogItem.year) || (first.mediaYear || null),
                imdbID: (catalogItem && catalogItem.imdbID) || (first.imdbID || null),
                genres,
                genre: genres.length > 0 ? genres.join(", ") : null,
                poster: catalogItem ? catalogItem.poster : null,
                inCatalog: Boolean(catalogItem)
            },
            sentiments: withPercent(countSentiments(reviews)),
            avgRating: ratings.length > 0 ? round2(ratings.reduce((a, b) => a + b, 0) / ratings.length) : null,
            ratingsCount: ratings.length,
            score: reviews.reduce((a, r) => a + (Number(r.score) || 0), 0)
        };
    },

    // Estadísticas globales por género (tarea 11).
    statsByGenre: async ({ genre } = {}) => {
        const reviews = await enrichReviews(await ReviewModel.readAll());
        const byGenre = new Map();
        for (const review of reviews) {
            const genres = review.genres && review.genres.length > 0 ? review.genres : [NO_GENRE];
            for (const g of genres) {
                if (!byGenre.has(g)) byGenre.set(g, []);
                byGenre.get(g).push(review);
            }
        }
        const wanted = catalog.normalizeGenres(genre).map((g) => g.toLowerCase());
        const results = [...byGenre.entries()]
            .filter(([g]) => wanted.length === 0 || wanted.includes(g.toLowerCase()))
            .map(([g, list]) => ({ genre: g, ...withPercent(countSentiments(list)) }))
            .sort((a, b) => (b.total - a.total) || a.genre.localeCompare(b.genre, "es"));
        return {
            results,
            totals: withPercent(countSentiments(reviews)),
            genres: [...byGenre.keys()].sort((a, b) => a.localeCompare(b, "es"))
        };
    },

    // Analiza (o recalcula) el sentimiento de las reseñas (tarea 7).
    // useAI=true usa el proveedor de IA configurado; si no hay clave, cae al
    // analizador léxico sin fallar.
    analyzeReviews: async ({ mediaKey, ids, limit, force, useAI } = {}) => {
        const max = clamp(limit, 1, 500, 100);
        let reviews = await ReviewModel.readAll({ mediaKey });
        if (Array.isArray(ids) && ids.length > 0) {
            const wanted = new Set(ids.map((id) => String(id)));
            reviews = reviews.filter((review) => wanted.has(String(review.id)));
        }
        const targets = [];
        for (const review of reviews) {
            const already = review.sentimentLabel && review.sentimentLabel !== UNCLASSIFIED;
            if (already && !force) continue;
            targets.push(review);
            if (targets.length >= max) break;
        }
        let analyzed = 0;
        let failed = 0;
        for (const review of targets) {
            try {
                const sentiment = useAI === false
                    ? analyzeSentiment(review.text)
                    : await analyzeSentimentAI(review.text);
                await ReviewModel.setSentiment(review.id, sentiment);
                analyzed += 1;
            } catch (e) {
                failed += 1;
            }
        }
        return {
            analyzed,
            failed,
            skipped: reviews.length - targets.length,
            candidates: reviews.length,
            provider: getSentimentProviderInfo()
        };
    }
};

module.exports = { adminService, SENTIMENTS, UNCLASSIFIED };
