const express = require("express");
const router = express.Router();
const { omdbService } = require("../services/omdbService");
const { MovieModel } = require("../models/movieModel");
const { authService } = require("../services/authService");

// Sesión opcional (listar) u obligatoria (guardar/borrar) según la ruta.
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
        firestore: MovieModel.isFirestoreConnected(),
        timestamp: new Date().toISOString()
    });
});

// Búsqueda exacta: /api/movies/search?t=Inception&y=2010&type=movie
// o por IMDb ID: /api/movies/search?i=tt1375666
router.get("/movies/search", async (req, res) => {
    const { t, i, y, type } = req.query;
    try {
        let data;
        if (i && i.trim()) {
            data = await omdbService.getById(i.trim());
        } else {
            if (!t || !t.trim()) {
                return res.status(400).json({ error: "Falta el parámetro 't' (título) o 'i' (IMDb ID)" });
            }
            if (t.trim().length > 100) {
                return res.status(400).json({ error: "El título es demasiado largo" });
            }
            data = await omdbService.searchMovie(t.trim(), { year: y, type });
        }
        const cleanData = MovieModel.formatData(data);
        res.json(cleanData);
    } catch (error) {
        const badRequest = /inválido|falta el título|demasiado largo/i.test(error.message || "");
        const notFound = /no encontrada|not found|incorrect imdb/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

// Búsqueda por lista: /api/movies/search-list?s=Batman&page=1&type=movie&y=2008
router.get("/movies/search-list", async (req, res) => {
    const { s, page, type, y } = req.query;
    if (!s || !s.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 's' (texto de búsqueda)" });
    }
    try {
        const data = await omdbService.searchMovies(s.trim(), page, { type, year: y });
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
        const badRequest = /inválido/i.test(error.message || "");
        const notFound = /no encontrada|not found|sin resultados|movie not found/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

router.post("/movies", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const movieId = await MovieModel.saveToDatabase(req.body, user.id);
        res.status(201).json({ ok: true, id: movieId });
    } catch (error) {
        const isValidation = /necesita|inválido|demasiado largo/i.test(error.message || "");
        res.status(isValidation ? 400 : 500).json({ error: error.message });
    }
});

router.get("/movies", async (req, res) => {
    try {
        const user = await authUser(req);
        // Sin sesión no hay colección personal.
        if (!user) {
            return res.json([]);
        }
        let movies = await MovieModel.getAllMovies(user.id);
        // Migración única: lo guardado antes de existir usuarios pasa a ser suyo.
        if (movies.length === 0) {
            const claimed = await MovieModel.claimOrphanMovies(user.id);
            if (claimed > 0) {
                movies = await MovieModel.getAllMovies(user.id);
            }
        }
        res.json(Array.isArray(movies) ? movies : []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/movies/:id", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const movie = await MovieModel.getMovieById(req.params.id, user.id);
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
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const deleted = await MovieModel.deleteMovie(req.params.id, user.id);
        if (!deleted) {
            return res.status(404).json({ error: "Película no encontrada" });
        }
        res.json({ ok: true, id: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
