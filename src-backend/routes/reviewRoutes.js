// src-backend/routes/reviewRoutes.js
const express = require("express");
const router = express.Router();
const { ReviewModel } = require("../models/reviewModel");
const { authService } = require("../services/authService");

async function authUser(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try { return await authService.me(match[1].trim()); } catch (e) { return null; }
}

// Admin middleware
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrador" });
    }
    next();
}

function statusFor(err) {
    if (err.code === "BAD_REQUEST") return 400;
    if (err.code === "FORBIDDEN") return 403;
    if (err.code === "NOT_FOUND") return 404;
    if (err.code === "CONFLICT") return 409;
    return 500;
}

function sendError(res, err) {
    res.status(statusFor(err)).json({ error: err.message });
}

// Anti-spam: 30 writes per IP per minute
const writeHits = new Map();
router.use("/reviews", (req, res, next) => {
    if (["POST", "PUT", "DELETE"].includes(req.method)) {
        const now = Date.now();
        const ip = req.ip || "unknown";
        const windowMs = 60 * 1000;
        const hits = (writeHits.get(ip) || []).filter(t => now - t < windowMs);
        hits.push(now);
        writeHits.set(ip, hits);
        if (writeHits.size > 500) {
            for (const [key, times] of writeHits) {
                if (!times.some(t => now - t < windowMs)) writeHits.delete(key);
            }
        }
        if (hits.length > 30) {
            return res.status(429).json({ error: "Demasiadas escrituras. Espera un minuto." });
        }
    }
    next();
});

// GET /api/reviews - list reviews
router.get("/reviews", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token).catch(() => null);
        const { mediaType, imdbID, title, year, sort, page, limit } = req.query;

        if (!mediaType || !["movie", "series"].includes(mediaType)) {
            return res.status(400).json({ error: "mediaType requerido (movie|series)" });
        }
        if (!imdbID && !title) {
            return res.status(400).json({ error: "Se requiere imdbID o title" });
        }

        const results = await ReviewModel.list({
            mediaType,
            imdbID,
            mediaTitle: title,
            mediaYear: year ? Number(year) : undefined,
            sort,
            page: Math.max(1, Number(page) || 1),
            limit: Math.min(50, Math.max(1, Number(limit) || 20)),
            userId: user?.id
        });
        res.json({ results, page: Number(page) || 1, limit: Number(limit) || 20 });
    } catch (e) { sendError(res, e); }
});

// GET /api/reviews/summary
router.get("/reviews/summary", async (req, res) => {
    try {
        const { mediaType, imdbID, title, year } = req.query;
        if (!mediaType || !["movie", "series"].includes(mediaType)) {
            return res.status(400).json({ error: "mediaType requerido" });
        }
        if (!imdbID && !title) return res.status(400).json({ error: "imdbID o title requerido" });
        const summary = await ReviewModel.summary({ mediaType, imdbID, mediaTitle: title, mediaYear: year ? Number(year) : undefined });
        res.json(summary);
    } catch (e) { sendError(res, e); }
});

// GET /api/reviews/mine - user's reviews
router.get("/reviews/mine", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const results = await ReviewModel.listByUser(user.id, page, limit);
        res.json({ results, page, limit });
    } catch (e) { sendError(res, e); }
});

// GET /api/reviews/:id
router.get("/reviews/:id", async (req, res) => {
    try {
        const review = await ReviewModel.getById(req.params.id);
        if (!review) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json(review);
    } catch (e) { sendError(res, e); }
});

// POST /api/reviews - create
router.post("/reviews", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });

        const body = req.body || {};
        const { mediaType, imdbID, mediaTitle, mediaYear, text, rating, visibility } = body;

        if (!mediaType || !["movie", "series"].includes(mediaType)) {
            return res.status(400).json({ error: "mediaType requerido (movie|series)" });
        }
        if (!imdbID && !mediaTitle) return res.status(400).json({ error: "imdbID o mediaTitle requerido" });
        if (!text || text.trim().length < 50 || text.trim().length > 2000) {
            return res.status(400).json({ error: "El texto debe tener 50-2000 caracteres" });
        }
        if (rating !== undefined && (rating === null || (Number(rating) < 1 || Number(rating) > 10))) {
            return res.status(400).json({ error: "rating debe ser 1-10 o null" });
        }

        const result = await ReviewModel.create({
            userId: user.id,
            mediaType,
            imdbID: imdbID || null,
            mediaTitle,
            mediaYear: mediaYear ? Number(mediaYear) : null,
            text: text.trim(),
            rating: rating !== undefined ? Number(rating) : null
        });
        res.status(201).json(result);
    } catch (e) { sendError(res, e); }
});

// PUT /api/reviews/:id
router.put("/reviews/:id", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });

        const body = req.body || {};
        const { text, rating, visibility } = body;

        if (text !== undefined && (text.trim().length < 50 || text.trim().length > 2000)) {
            return res.status(400).json({ error: "El texto debe tener 50-2000 caracteres" });
        }
        if (rating !== undefined && rating !== null && (Number(rating) < 1 || Number(rating) > 10)) {
            return res.status(400).json({ error: "rating debe ser 1-10 o null" });
        }
        if (visibility !== undefined && !["public", "friends", "private"].includes(visibility)) {
            return res.status(400).json({ error: "visibility inválida" });
        }

        const result = await ReviewModel.update(req.params.id, user.id, { text, rating, visibility });
        res.json(result);
    } catch (e) { sendError(res, e); }
});

// DELETE /api/reviews/:id
router.delete("/reviews/:id", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const result = await ReviewModel.delete(req.params.id, user.id);
        res.json(result);
    } catch (e) { sendError(res, e); }
});

// POST /api/reviews/:id/vote
router.post("/reviews/:id/vote", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });

        const body = req.body || {};
        const value = body.value;
        if (![1, -1, 0].includes(Number(value))) {
            return res.status(400).json({ error: "value debe ser 1, -1 o 0" });
        }

        const result = await ReviewModel.vote(req.params.id, user.id, Number(value));
        res.json(result);
    } catch (e) { sendError(res, e); }
});

// GET /api/reviews/:id/replies
router.get("/reviews/:id/replies", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token).catch(() => null);
        const replies = await ReviewModel.getReplies(req.params.id, user?.id);
        res.json({ results: replies });
    } catch (e) { sendError(res, e); }
});

// POST /api/reviews/:id/replies
router.post("/reviews/:id/replies", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });

        const body = req.body || {};
        const text = body.text;
        if (!text || text.trim().length < 1 || text.trim().length > 1000) {
            return res.status(400).json({ error: "El texto debe tener 1-1000 caracteres" });
        }

        const result = await ReviewModel.addReply(req.params.id, user.id, text.trim());
        res.status(201).json(result);
    } catch (e) { sendError(res, e); }
});

// DELETE /api/reviews/:id/replies/:replyId
router.delete("/reviews/:id/replies/:replyId", async (req, res) => {
    try {
        const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });

        const result = await ReviewModel.deleteReply(req.params.replyId, user.id);
        res.json(result);
    } catch (e) { sendError(res, e); }
});

module.exports = router;