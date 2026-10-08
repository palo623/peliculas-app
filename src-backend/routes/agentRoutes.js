const express = require("express");
const router = express.Router();
const { agentService } = require("../services/agentService");

/**
 * POST /api/agent/query
 * Cuerpo JSON: { query: "título de película o serie" }
 * Devuelve información del catálogo OMDb o indica que necesita LLM.
 */
router.post("/query", async (req, res) => {
    try {
        const { query } = req.body || {};
        if (!query || typeof query !== "string") {
            return res.status(400).json({ error: "Falta el parámetro 'query' (string)" });
        }
        const result = await agentService.processQuery(query);
        res.json(result);
    } catch (error) {
        console.error("[agentRoutes] Error processing query:", error.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * GET /api/agent/catalog/search?query=...
 * Busca en el catálogo OMDb y devuelve resultados.
 */
router.get("/catalog/search", async (req, res) => {
    try {
        const { query } = req.query || {};
        if (!query) {
            return res.status(400).json({ error: "Falta el parámetro 'query'" });
        }
        const result = await agentService.searchCatalog(query);
        if (result) {
            res.json({ source: "omdb", ...result });
        } else {
            res.json({ source: "omdb", error: "No se encontraron resultados" });
        }
    } catch (error) {
        console.error("[agentRoutes] Error searching catalog:", error.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

/**
 * GET /api/agent/detail/:imdbID
 * Obtiene detalles de una película/serie por IMDb ID.
 */
router.get("/detail/:imdbID", async (req, res) => {
    try {
        const { imdbID } = req.params;
        const result = await agentService.getDetailById(imdbID);
        if (result) {
            res.json({ source: "omdb", ...result });
        } else {
            res.status(404).json({ source: "omdb", error: "Película/serie no encontrada" });
        }
    } catch (error) {
        console.error("[agentRoutes] Error getting detail:", error.message);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;