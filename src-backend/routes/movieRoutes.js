const express = require("express");
const router = express.Router();
const { omdbService } = require("../services/omdbService");
const { MovieModel } = require("../models/movieModel");

router.get("/health", async (req, res) => {
    res.json({
        status: "ok",
        firestore: MovieModel.isFirestoreConnected(),
        timestamp: new Date().toISOString()
    });
});

// Búsqueda exacta: /api/movies/search?t=Inception
router.get("/movies/search", async (req, res) => {
    const { t } = req.query;
    if (!t || !t.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 't' (título)" });
    }
    if (t.trim().length > 100) {
        return res.status(400).json({ error: "El título es demasiado largo" });
    }
    try {
        const data = await omdbService.searchMovie(t.trim());
        const cleanData = MovieModel.formatData(data);
        res.json(cleanData);
    } catch (error) {
        const notFound = /no encontrada|not found|incorrect imdb/i.test(error.message || "");
        res.status(notFound ? 404 : 500).json({ error: error.message });
    }
});

// Búsqueda por lista: /api/movies/search-list?s=Batman&page=1
router.get("/movies/search-list", async (req, res) => {
    const { s, page } = req.query;
    if (!s || !s.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 's' (texto de búsqueda)" });
    }
    try {
        const data = await omdbService.searchMovies(s.trim(), page);
        res.json({
            results: (data.Search || []).map((item) => ({
                title: item.Title,
                year: item.Year,
                imdbID: item.imdbID,
                type: item.Type,
                poster: item.Poster && item.Poster !== "N/A" ? item.Poster : null
            })),
            totalResults: Number.parseInt(data.totalResults, 10) || 0
        });
    } catch (error) {
        const notFound = /no encontrada|not found|sin resultados|movie not found/i.test(error.message || "");
        res.status(notFound ? 404 : 500).json({ error: error.message });
    }
});

router.post("/movies", async (req, res) => {
    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const movieId = await MovieModel.saveToDatabase(req.body);
        res.status(201).json({ ok: true, id: movieId });
    } catch (error) {
        const isValidation = /necesita|inválido|demasiado largo/i.test(error.message || "");
        res.status(isValidation ? 400 : 500).json({ error: error.message });
    }
});

router.get("/movies", async (req, res) => {
    try {
        const movies = await MovieModel.getAllMovies();
        res.json(Array.isArray(movies) ? movies : []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/movies/:id", async (req, res) => {
    try {
        const movie = await MovieModel.getMovieById(req.params.id);
        if (!movie) {
            return res.status(404).json({ error: "Película no encontrada" });
        }
        res.json(movie);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete("/movies/:id", async (req, res) => {
    try {
        const deleted = await MovieModel.deleteMovie(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: "Película no encontrada" });
        }
        res.json({ ok: true, id: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
