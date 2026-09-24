// Lee la clave desde el entorno. server.js carga el .env antes de requerir este módulo.
const OMDB_API_KEY = process.env.OMDB_API_KEY || "";
const OMDB_BASE_URL = "https://www.omdbapi.com/";
const REQUEST_TIMEOUT_MS = 8000;

if (!OMDB_API_KEY) {
    console.warn("[omdbService] OMDB_API_KEY no definida. Define OMDB_API_KEY en tu .env.");
}

// Mini-caché en memoria: las búsquedas repetidas no gastan cuota de OMDb.
const omdbCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

function cacheGet(url) {
    const entry = omdbCache.get(url);
    if (!entry) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
        omdbCache.delete(url);
        return null;
    }
    return entry.data;
}

function cacheSet(url, data) {
    if (omdbCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = omdbCache.keys().next().value;
        omdbCache.delete(oldest);
    }
    omdbCache.set(url, { at: Date.now(), data });
}

async function fetchWithTimeout(url) {
    const cached = cacheGet(url);
    if (cached) return cached;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`OMDb respondió con HTTP ${response.status}`);
        }
        const data = await response.json();
        cacheSet(url, data);
        return data;
    } catch (err) {
        if (err.name === "AbortError") {
            throw new Error("OMDb tardó demasiado en responder (timeout)");
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function assertTitle(value, maxLen = 100) {
    const title = (value || "").trim();
    if (!title) {
        throw new Error("Falta el título de búsqueda");
    }
    if (title.length > maxLen) {
        throw new Error("El título es demasiado largo (máx. 100 caracteres)");
    }
    return title;
}

// Año opcional para filtrar en OMDb (?y=2010). Devuelve null si no se pasa.
function normalizeYear(y) {
    if (y === undefined || y === null || String(y).trim() === "") return null;
    const n = Number.parseInt(y, 10);
    if (Number.isNaN(n) || n < 1900 || n > 2100) {
        throw new Error("Año inválido (1900-2100)");
    }
    return n;
}

function normalizeType(t) {
    if (t === undefined || t === null || String(t).trim() === "") return "movie";
    const v = String(t).toLowerCase().trim();
    if (v !== "movie" && v !== "series") {
        throw new Error("Tipo inválido (solo se admiten movie o series)");
    }
    return v;
}

const omdbService = {
    OMDB_BASE_URL: "https://www.omdbapi.com/",
    // Detalle exacto por IMDb ID. El catálogo se carga con este método.
    getById: async (imdbID) => {
        const id = (imdbID || "").trim();
        if (!/^tt\d+$/i.test(id)) {
            throw new Error("IMDb ID inválido");
        }
        const url = `${omdbService.OMDB_BASE_URL}?i=${encodeURIComponent(id)}&apikey=${OMDB_API_KEY}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Película no encontrada");
        }
        return data;
    },

    // Obtiene episodios de una temporada específica.
    getEpisodesBySeason: async (imdbID, season) => {
        const id = (imdbID || "").trim();
        if (!/^tt\d+$/i.test(id)) {
            throw new Error("IMDb ID inválido");
        }
        const seasonNum = Number.parseInt(season, 10);
        if (!Number.isInteger(seasonNum) || seasonNum < 1) {
            throw new Error("Temporada inválida");
        }
        const url = `${omdbService.OMDB_BASE_URL}?i=${encodeURIComponent(id)}&Season=${seasonNum}&type=series&apikey=${OMDB_API_KEY}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Episodios no encontrados");
        }
        return (data.Episodes || []).map((ep) => ({
            Episode: Number.parseInt(ep.Episode, 10) || 0,
            Title: ep.Title || "Sin título",
            Released: ep.Released || "N/A",
            imdbRating: ep.imdbRating && ep.imdbRating !== "N/A" ? ep.imdbRating : null,
            Runtime: ep.Runtime && ep.Runtime !== "N/A" ? ep.Runtime : null,
            Plot: ep.Plot && ep.Plot !== "N/A" ? ep.Plot : "Sin sinopsis disponible.",
            imdbID: ep.imdbID || null
        }));
    },

    // Búsqueda por lista. Solo la usan los scripts de carga del catálogo.
    searchMovies: async (query, page = 1, opts = {}) => {
        const q = assertTitle(query);
        const p = Number.parseInt(page, 10) || 1;
        const safePage = Math.min(Math.max(p, 1), 100);
        const year = normalizeYear(opts.year);
        const type = normalizeType(opts.type);
        let url = `${omdbService.OMDB_BASE_URL}?s=${encodeURIComponent(q)}&page=${safePage}&apikey=${OMDB_API_KEY}`;
        if (year) url += `&y=${year}`;
        if (type) url += `&type=${type}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Sin resultados");
        }
        return data; // { Search: [...], totalResults, Response }
    },

    // Episodios de una temporada concreta (?i=tt...&Season=N).
    // Devuelve { Season, Episodes: [...] }.
    getSeason: async (imdbID, seasonNumber) => {
        const id = (imdbID || "").trim();
        if (!/^tt\d+$/i.test(id)) {
            throw new Error("IMDb ID inválido");
        }
        const season = Number.parseInt(seasonNumber, 10);
        if (!Number.isInteger(season) || season < 1) {
            throw new Error("Número de temporada inválido");
        }
        const url = `${OMDB_BASE_URL}?i=${encodeURIComponent(id)}&Season=${season}&apikey=${OMDB_API_KEY}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Temporada no encontrada");
        }
        return data;
    },

    // Cuenta los episodios de cada temporada de una serie leyendo OMDb
    // temporada a temporada. Secuencial y con pausa para respetar la cuota.
    // Devuelve [{ season, episodes }].
    getSeasonCounts: async (imdbID, totalSeasons, delayMs = 300) => {
        const total = Number.parseInt(totalSeasons, 10) || 0;
        const counts = [];
        if (total <= 0) return counts;
        for (let season = 1; season <= total; season++) {
            try {
                const seasonData = await omdbService.getSeason(imdbID, season);
                const episodes = Array.isArray(seasonData.Episodes) ? seasonData.Episodes.length : 0;
                if (episodes > 0) {
                    counts.push({ season, episodes });
                }
            } catch (error) {
                console.warn(`[omdb] Temporada ${season} de ${imdbID} no disponible: ${error.message || error}`);
            }
            if (season < total) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        return counts;
    }
};

module.exports = { omdbService };
