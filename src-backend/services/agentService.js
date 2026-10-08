// Servicio para el agente de IA que responde preguntas sobre películas/series.
// Usa OMDb para datos de catálogo y una API de LLM (OpenAI/Anthropic/etc) para razonar.
// La clave de la LLM se lee de process.env.AI_API_KEY.
"use strict";

const omdbService = require("./omdbService");

// Clave de IA opcional para features de LLM (OpenAI/Anthropic/etc).
// Si no está configurada, el agente sigue funcionando con búsquedas OMDb.
const AI_API_KEY = process.env.AI_API_KEY;

/**
 * Busca en el catálogo de OMDb y devuelve información relevante.
 * @param {string} query - Consulta de búsqueda (título, nombre, etc.)
 * @returns {Object|null} Resultado de la búsqueda o null
 */
async function searchCatalog(query) {
    try {
        const results = await omdbService.searchMovies(query);
        if (results && results.Search && results.Search.length > 0) {
            return {
                source: "omdb",
                count: results.Search.length,
                items: results.Search.map((item) => ({
                    imdbID: item.imdbID,
                    title: item.Title,
                    year: item.Year,
                    type: item.Type,
                    poster: item.Poster,
                    plot: item.Plot
                }))
            };
        }
        return null;
    } catch (error) {
        console.error("[agentService] Error buscando en catálogo OMDb:", error.message);
        return null;
    }
}

/**
 * Obtiene detalles de una película/serie por IMDb ID.
 * @param {string} imdbID - IMDb ID (ej: "tt0133093")
 * @returns {Object} Detalles de la película/serie
 */
async function getDetailById(imdbID) {
    try {
        const detail = await omdbService.getById(imdbID);
        if (detail && detail.Response !== "False") {
            return {
                source: "omdb",
                imdbID: detail.imdbID,
                title: detail.Title,
                year: detail.Year,
                rated: detail.Rated,
                released: detail.Released,
                runtime: detail.Runtime,
                genre: detail.Genre,
                director: detail.Director,
                writer: detail.Writer,
                actors: detail.Actors,
                plot: detail.Plot,
                language: detail.Language,
                country: detail.Country,
                awards: detail.Awards,
                poster: detail.Poster,
                ratings: detail.Ratings,
                runtimeMinutes: detail.Runtime && parseRuntimeMinutes(detail.Runtime),
                imdbRating: detail.imdbRating,
                imdbVotes: detail.imdbVotes,
                type: detail.Type,
                dvd: detail.DVD,
                boxOffice: detail.BoxOffice,
                production: detail.Production,
                website: detail.Website
            };
        }
        return null;
    } catch (error) {
        console.error("[agentService] Error obteniendo detalle OMDb:", error.message);
        return null;
    }
}

/**
 * Parsea la duración de minutos a número.
 */
function parseRuntimeMinutes(runtimeStr) {
    if (!runtimeStr) return null;
    const match = runtimeStr.match(/^(\d+)/);
    return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Formatea una respuesta básica desde datos de OMDb.
 * @param {Object} data - Datos de OMDb
 * @returns {string} Texto formateado
 */
function formatOmdbResponse(data) {
    if (!data) return "No found.";
    const lines = [
        `*${data.title}* (${data.year})`,
        `Type: ${data.type}`,
        `IMDb Rating: ${data.imdbRating || "N/A"} (${data.imdbVotes || "0"} votos)`,
        `Duration: ${data.runtimeMinutes || "N/A"} min`,
        `Genre: ${data.genre || "N/A"}`,
        `Director: ${data.director || "N/A"}`,
        "Plot: " + (data.plot || "Sin sinopsis disponible.")
    ];
    return lines.join("\n");
}

/**
 * Procesa una consulta del usuario.
 * - Si parece una búsqueda de catálogo, usa OMDb.
 * - De lo contrario, devuelve un mensaje indicando que necesita LLM.
 * @param {string} query - La consulta del usuario
 * @returns {Promise<Object>} Resultado con source y data/mensaje
 */
async function processQuery(query) {
    const trimmed = (query || "").trim();
    if (!trimmed) {
        return { source: "error", error: "Query vacía" };
    }

    // Intentar búsqueda en catálogo OMDb (consulta sobre películas/series)
    const catalogResult = await searchCatalog(trimmed);
    if (catalogResult) {
        return {
            source: "catalog",
            message: formatOmdbResponse(catalogResult.items[0]),
            totalResults: catalogResult.count,
            items: catalogResult.items
        };
    }

    // Si no hay resultados OMDb, indicar que necesita LLM
    return {
        source: "llm-needed",
        message: "No encontré en el catálogo. Para respuestas con IA, configura AI_API_KEY."
    };
}

module.exports = {
    processQuery,
    searchCatalog,
    getDetailById,
    formatOmdbResponse,
    parseRuntimeMinutes
};