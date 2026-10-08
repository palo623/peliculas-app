// Servicio de catálogo para la vista de administración.
//
// Dos responsabilidades:
//   1. Resolver el género de una obra. Las reseñas guardan su propio `genre`
//      pero las antiguas no lo tienen: aquí se completa leyendo el catálogo.
//   2. Buscar en el catálogo (películas + series) ya existente, que es lo que
//      pide la tarea 4 del proyecto ("Integrar API existente").
//
// El catálogo se cachea unos minutos para no releer Firestore en cada petición
// ni en cada reseña. La caché es por proceso y se puede invalidar a mano.

const { slugify, normalizeMediaType, buildMediaKey } = require("../models/mediaKey");
const { MovieModel } = require("../models/movieModel");
const { SeriesModel } = require("../models/seriesModel");

const CACHE_TTL_MS = Math.min(
    Math.max(Number.parseInt(process.env.CATALOG_CACHE_TTL_MS, 10) || 5 * 60 * 1000, 1000),
    60 * 60 * 1000
);

const MAX_GENRE_LENGTH = 200;

let cache = { items: null, builtAt: 0 };

// ---- Géneros ----
// Acepta "Action, Crime", ["Action", "Crime"] o "Action" y devuelve una lista
// limpia, sin duplicados ni valores vacíos/genéricos.
function normalizeGenres(raw) {
    let parts = [];
    if (Array.isArray(raw)) {
        parts = raw;
    } else if (raw != null) {
        parts = String(raw).split(/[,|/]/);
    }
    const out = [];
    for (const part of parts) {
        const value = String(part || "").trim();
        if (!value) continue;
        if (/^(sin genero|sin género|n\/a|na|unknown)$/i.test(value)) continue;
        if (value.length > 60) continue;
        if (!out.some((g) => g.toLowerCase() === value.toLowerCase())) out.push(value);
        if (out.length >= 6) break;
    }
    return out;
}

function toGenreString(raw) {
    const genres = normalizeGenres(raw);
    if (genres.length === 0) return null;
    return genres.join(", ").slice(0, MAX_GENRE_LENGTH);
}

function mediaTypeOf(doc, fallback) {
    const raw = String((doc && (doc.type || doc.Type)) || "").trim().toLowerCase();
    if (raw === "series" || raw === "serie" || raw === "tv" || raw === "show") return "series";
    if (raw === "movie" || raw === "movies" || raw === "film") return "movie";
    return fallback;
}

function titleOf(doc) {
    return String((doc && (doc.title || doc.Title)) || "").trim();
}

function yearOf(doc) {
    const raw = String((doc && doc.year) || "").trim();
    const four = raw.match(/\d{4}/);
    return four ? four[0] : null;
}

function toCatalogItem(doc, fallbackType) {
    const mediaType = mediaTypeOf(doc, fallbackType);
    const title = titleOf(doc);
    if (!title) return null;
    const imdbID = doc.imdbID ? String(doc.imdbID).toLowerCase() : null;
    const year = yearOf(doc);
    const genres = normalizeGenres(doc.genre || doc.Genre);
    return {
        id: doc.id || null,
        title,
        year,
        type: mediaType,
        imdbID,
        mediaKey: buildMediaKey({ mediaType, imdbID, title, year }),
        genres,
        genre: genres.length ? genres.join(", ") : null,
        poster: doc.poster || null,
        rating: doc.rating != null ? doc.rating : null,
        plot: doc.plot || null,
        director: doc.director || null
    };
}

// Lee y cachea el catálogo completo (películas + series). Best-effort: si una
// colección falla, devuelve lo que sí se pudo leer.
async function loadCatalogItems({ force } = {}) {
    const now = Date.now();
    if (!force && cache.items && now - cache.builtAt < CACHE_TTL_MS) {
        return cache.items;
    }
    const items = [];
    let movies = [];
    let series = [];
    try {
        movies = await MovieModel.getCatalogMovies();
    } catch (e) {
        console.warn("[catalog] No se pudo leer el catálogo de películas:", e.message);
    }
    try {
        series = await SeriesModel.getCatalogSeries();
    } catch (e) {
        console.warn("[catalog] No se pudo leer el catálogo de series:", e.message);
    }
    const seen = new Set();
    for (const doc of Array.isArray(movies) ? movies : []) {
        const item = toCatalogItem(doc, "movie");
        if (!item) continue;
        const key = item.imdbID || item.mediaKey;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
    }
    for (const doc of Array.isArray(series) ? series : []) {
        const item = toCatalogItem(doc, "series");
        if (!item) continue;
        const key = item.imdbID || item.mediaKey;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(item);
    }
    cache = { items, builtAt: now };
    return items;
}

function invalidateCatalogCache() {
    cache = { items: null, builtAt: 0 };
}

// Mapa imdbID/mediaKey/título-año -> géneros, construido sobre la caché.
function buildGenreLookup(items) {
    const byImdb = new Map();
    const byMediaKey = new Map();
    const byTitleYear = new Map();
    for (const item of items) {
        if (item.genres.length === 0) continue;
        if (item.imdbID) byImdb.set(item.imdbID, item.genres);
        byMediaKey.set(item.mediaKey, item.genres);
        const tKey = `${slugify(item.title)}|${item.year || ""}`;
        if (!byTitleYear.has(tKey)) byTitleYear.set(tKey, item.genres);
    }
    return { byImdb, byMediaKey, byTitleYear };
}

// Busca los géneros de una obra dentro de un `lookup` ya construido.
// Se usa tanto al resolver una obra concreta como al enriquecer listas enteras
// de reseñas sin volver a leer el catálogo.
function genresFromLookup({ mediaType, imdbID, mediaKey, title, year }, lookup) {
    if (!lookup) return [];
    let type = "movie";
    try {
        type = normalizeMediaType(mediaType);
    } catch (e) {
        type = null;
    }
    const cleanImdb = imdbID ? String(imdbID).trim().toLowerCase() : null;
    if (cleanImdb && lookup.byImdb.has(cleanImdb)) return lookup.byImdb.get(cleanImdb);

    const cleanKey = mediaKey ? String(mediaKey).trim().toLowerCase() : null;
    if (cleanKey && lookup.byMediaKey.has(cleanKey)) return lookup.byMediaKey.get(cleanKey);

    const cleanTitle = title ? String(title).trim() : "";
    if (cleanTitle) {
        const cleanYear = year ? String(year).trim().slice(0, 4) : "";
        const key = buildMediaKey({
            mediaType: type || "movie",
            imdbID: cleanImdb,
            title: cleanTitle,
            year: cleanYear || null
        });
        if (lookup.byMediaKey.has(key)) return lookup.byMediaKey.get(key);
        const tKey = `${slugify(cleanTitle)}|${cleanYear}`;
        if (lookup.byTitleYear.has(tKey)) return lookup.byTitleYear.get(tKey);
        const loose = `${slugify(cleanTitle)}|`;
        for (const [k, v] of lookup.byTitleYear) {
            if (k.startsWith(loose)) return v;
        }
    }
    return [];
}

// Géneros de una obra, leídos del catálogo. Devuelve [] si no se encuentra.
async function resolveGenres(ref) {
    const items = await loadCatalogItems();
    if (items.length === 0) return [];
    return genresFromLookup(ref, buildGenreLookup(items));
}

// ---- Búsqueda de catálogo (tarea 4) ----
async function searchCatalog({ query, type, genre, page, limit, force } = {}) {
    const items = await loadCatalogItems({ force });
    const wanted = String(query || "").trim().toLowerCase();
    const wantedType = type ? (() => { try { return normalizeMediaType(type); } catch (e) { return null; } })() : null;
    const wantedGenres = normalizeGenres(genre).map((g) => g.toLowerCase());
    const pageNum = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 1000);
    const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);

    const matches = items.filter((item) => {
        if (wantedType && item.type !== wantedType) return false;
        if (wanted && !item.title.toLowerCase().includes(wanted)) return false;
        if (wantedGenres.length > 0) {
            const own = item.genres.map((g) => g.toLowerCase());
            if (!wantedGenres.some((g) => own.includes(g))) return false;
        }
        return true;
    });
    matches.sort((a, b) => a.title.localeCompare(b.title, "es"));

    const start = (pageNum - 1) * pageSize;
    return {
        results: matches.slice(start, start + pageSize),
        totalResults: matches.length,
        page: pageNum,
        limit: pageSize
    };
}

// Ficha de una obra concreta (para la cabecera del panel de administración).
async function findCatalogItem({ mediaType, imdbID, title, year, mediaKey } = {}) {
    const items = await loadCatalogItems();
    const cleanImdb = imdbID ? String(imdbID).trim().toLowerCase() : null;
    const cleanKey = mediaKey ? String(mediaKey).trim().toLowerCase() : null;
    const cleanTitle = title ? String(title).trim().toLowerCase() : null;
    const cleanYear = year ? String(year).trim().slice(0, 4) : null;
    let type = null;
    try {
        type = mediaType ? normalizeMediaType(mediaType) : null;
    } catch (e) {
        type = null;
    }
    const found = items.find((item) => {
        if (cleanKey && item.mediaKey.toLowerCase() === cleanKey) return true;
        if (cleanImdb && item.imdbID === cleanImdb) return true;
        if (cleanTitle && item.title.toLowerCase() === cleanTitle) {
            if (type && item.type !== type) return false;
            if (cleanYear && item.year !== cleanYear) return false;
            return true;
        }
        return false;
    });
    return found || null;
}

// Lista de géneros disponibles en el catálogo (para el filtro de la vista admin).
async function listGenres() {
    const items = await loadCatalogItems();
    const all = new Map();
    for (const item of items) {
        for (const g of item.genres) {
            const key = g.toLowerCase();
            if (!all.has(key)) all.set(key, g);
        }
    }
    return [...all.values()].sort((a, b) => a.localeCompare(b, "es"));
}

module.exports = {
    normalizeGenres,
    toGenreString,
    resolveGenres,
    genresFromLookup,
    searchCatalog,
    findCatalogItem,
    listGenres,
    loadCatalogItems,
    invalidateCatalogCache,
    buildGenreLookup
};
