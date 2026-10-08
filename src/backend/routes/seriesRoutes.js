const express = require("express");
const router = express.Router();
const { SeriesModel } = require("../models/seriesModel");
const { authService } = require("../services/authService");
const { omdbService } = require("../services/omdbService");

async function authUser(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        return await authService.me(match[1].trim());
    } catch (e) {
        return null;
    }
}

router.get("/health", async (req, res) => {
    res.json({
        status: "ok",
        firestore: SeriesModel.isFirestoreConnected(),
        timestamp: new Date().toISOString()
    });
});

router.get("/series/search", async (req, res) => {
    const { t, i, y } = req.query;
    try {
        if ((!t || !t.trim()) && (!i || !i.trim())) {
            return res.status(400).json({ error: "Falta el parámetro 't' (título) o 'i' (IMDb ID)" });
        }
        if (t && t.trim().length > 100) {
            return res.status(400).json({ error: "El título es demasiado largo" });
        }
        const serie = await SeriesModel.findCatalogSeries({ title: t, year: y, imdbID: i });
        if (!serie) return res.status(404).json({ error: "Serie no encontrada en el catálogo" });
        res.json(serie);
    } catch (error) {
        const badRequest = /inválido|falta el título|demasiado largo/i.test(error.message || "");
        const notFound = /no encontrada|catálogo/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

router.get("/series/search-list", async (req, res) => {
    const { s, page, y } = req.query;
    if (!s || !s.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 's' (texto de búsqueda)" });
    }
    try {
        if (s.trim().length > 100) {
            return res.status(400).json({ error: "El texto de búsqueda es demasiado largo" });
        }
        const data = await SeriesModel.searchCatalog({ query: s, page, year: y });
        res.json(data);
    } catch (error) {
        const badRequest = /inválido|demasiado largo/i.test(error.message || "");
        const notFound = /no encontrada|catálogo/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

router.get("/series/popular", async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 30);
        const yRaw = String(req.query.y || "").trim();
        let year = null;
        if (yRaw) {
            const n = Number.parseInt(yRaw, 10);
            if (!Number.isNaN(n) && n >= 1900 && n <= 2100) year = n;
        }

        const fromDb = await SeriesModel.getPopularFromDb({ year, limit });
        res.json({ results: fromDb, totalResults: fromDb.length, source: "firebase" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/series", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const seriesId = await SeriesModel.saveToDatabase(req.body, user.id);
        res.status(201).json({ ok: true, id: seriesId });
    } catch (error) {
        const isValidation = /necesita|inválido|demasiado largo/i.test(error.message || "");
        res.status(isValidation ? 400 : 500).json({ error: error.message });
    }
});

router.get("/series", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.json([]);
        }
        const series = await SeriesModel.getAllSeries(user.id);
        res.json(Array.isArray(series) ? series : []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/series/:id", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const serie = await SeriesModel.getSeriesById(req.params.id, user.id);
        if (!serie) {
            return res.status(404).json({ error: "Serie no encontrada" });
        }
        res.json(serie);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete("/series/:id", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const deleted = await SeriesModel.deleteSeries(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: "Serie no encontrada" });
        }
        res.json({ ok: true, id: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/series/seasons", async (req, res) => {
    const { imdbID } = req.query;
    if (!imdbID || !imdbID.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 'imdbID'" });
    }
    try {
        const data = await SeriesModel.getSeasons(imdbID);
        res.json(data);
    } catch (error) {
        const msg = error.message || "";
        if (/inválido/i.test(msg)) return res.status(400).json({ error: error.message });
        if (/no encontrada/i.test(msg)) return res.status(404).json({ error: error.message });
        if (/HTTP 429|rate limit|demasiadas peticiones/i.test(msg)) return res.status(429).json({ error: "Límite de peticiones excedido en OMDb" });
        res.status(500).json({ error: error.message });
    }
});

router.get("/series/episodes", async (req, res) => {
    const { imdbID, season } = req.query;
    if (!imdbID || !imdbID.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 'imdbID'" });
    }
    if (season === undefined || season === null || String(season).trim() === "") {
        return res.status(400).json({ error: "Falta el parámetro 'season'" });
    }
    try {
        const episodes = await SeriesModel.getEpisodes(imdbID, season);
        res.json(episodes);
    } catch (error) {
        const msg = error.message || "";
        if (/inválido/i.test(msg)) return res.status(400).json({ error: error.message });
        if (/no encontrada|no encontrados/i.test(msg)) return res.status(404).json({ error: error.message });
        if (/HTTP 429|rate limit|demasiadas peticiones/i.test(msg)) return res.status(429).json({ error: "Límite de peticiones excedido en OMDb" });
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;