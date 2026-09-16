const express = require("express");
const router = express.Router();
const { MovieModel } = require("../models/movieModel");
const { authService } = require("../services/authService");

// El catálogo público no necesita sesión; guardar, listar y borrar la colección
// personal sí requieren la sesión técnica emitida por authService.
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

// Búsqueda exacta dentro del catálogo de Firestore.
router.get("/movies/search", async (req, res) => {
    const { t, i, y } = req.query;
    try {
        if ((!t || !t.trim()) && (!i || !i.trim())) {
            return res.status(400).json({ error: "Falta el parámetro 't' (título) o 'i' (IMDb ID)" });
        }
        if (t && t.trim().length > 100) {
            return res.status(400).json({ error: "El título es demasiado largo" });
        }
        const movie = await MovieModel.findCatalogMovie({ title: t, year: y, imdbID: i });
        if (!movie) return res.status(404).json({ error: "Película no encontrada en el catálogo" });
        res.json(movie);
    } catch (error) {
        const badRequest = /inválido|falta el título|demasiado largo/i.test(error.message || "");
        const notFound = /no encontrada|catálogo/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

// Búsqueda por lista dentro del catálogo de Firestore.
router.get("/movies/search-list", async (req, res) => {
    const { s, page, y } = req.query;
    if (!s || !s.trim()) {
        return res.status(400).json({ error: "Falta el parámetro 's' (texto de búsqueda)" });
    }
    try {
        if (s.trim().length > 100) {
            return res.status(400).json({ error: "El texto de búsqueda es demasiado largo" });
        }
        const data = await MovieModel.searchCatalog({ query: s, page, year: y });
        res.json(data);
    } catch (error) {
        const badRequest = /inválido|demasiado largo/i.test(error.message || "");
        const notFound = /no encontrada|catálogo/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message });
    }
});

// Popular aleatorio desde Firestore: /api/movies/popular?limit=12&y=2010
// "Popular ahora" sale exclusivamente de la colección "movies" de Firebase.
// Cada petición devuelve una muestra distinta y aleatoria.

router.get("/movies/popular", async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 30);
        const yRaw = String(req.query.y || "").trim();
        let year = null;
        if (yRaw) {
            const n = Number.parseInt(yRaw, 10);
            if (!Number.isNaN(n) && n >= 1900 && n <= 2100) year = n;
        }

        const fromDb = await MovieModel.getPopularFromDb({ year, limit });
        res.json({ results: fromDb, totalResults: fromDb.length, source: "firebase" });
    } catch (error) {
        res.status(500).json({ error: error.message });
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
