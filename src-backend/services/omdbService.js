// Lee la clave desde el entorno. server.js carga el .env antes de requerir este módulo.
const OMDB_API_KEY = process.env.OMDB_API_KEY || "";
const OMDB_BASE_URL = "https://www.omdbapi.com/";
const REQUEST_TIMEOUT_MS = 8000;

if (!OMDB_API_KEY) {
    console.warn("[omdbService] OMDB_API_KEY no definida. Define OMDB_API_KEY en tu .env.");
}

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`OMDb respondió con HTTP ${response.status}`);
        }
        return await response.json();
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

const omdbService = {
    // Búsqueda exacta por título: ?t=Inception
    searchMovie: async (movieTitle) => {
        const title = assertTitle(movieTitle);
        const url = `${OMDB_BASE_URL}?t=${encodeURIComponent(title)}&apikey=${OMDB_API_KEY}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Película no encontrada");
        }
        return data;
    },

    // Búsqueda por lista: ?s=Batman&page=1 (devuelve varios resultados)
    searchMovies: async (query, page = 1) => {
        const q = assertTitle(query);
        const p = Number.parseInt(page, 10) || 1;
        const safePage = Math.min(Math.max(p, 1), 100);
        const url = `${OMDB_BASE_URL}?s=${encodeURIComponent(q)}&page=${safePage}&apikey=${OMDB_API_KEY}`;
        const data = await fetchWithTimeout(url);

        if (data.Response === "False") {
            throw new Error(data.Error || "Sin resultados");
        }
        return data; // { Search: [...], totalResults, Response }
    }
};

module.exports = { omdbService };
