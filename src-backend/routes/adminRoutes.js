// src-backend/routes/adminRoutes.js
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

// Attach user to req for all admin routes
router.use(async (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
    req.user = await authService.me(token).catch(() => null);
    next();
});

// Admin middleware
function requireAdmin(req, res, next) {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: "Acceso denegado: se requieren permisos de administrador" });
    }
    next();
}

// All admin routes require admin
router.use(requireAdmin);

// GET /api/admin/reviews/sentiment?mediaType=movie&imdbID=tt0111161
router.get("/reviews/sentiment", async (req, res) => {
    try {
        const { mediaType, imdbID, title, year } = req.query;
        if (!mediaType || !["movie", "series"].includes(mediaType)) {
            return res.status(400).json({ error: "mediaType requerido (movie|series)" });
        }
        if (!imdbID && !title) {
            return res.status(400).json({ error: "Se requiere imdbID o title" });
        }

        const result = await ReviewModel.getSentimentAnalysis({
            mediaType,
            imdbID,
            mediaTitle: title,
            mediaYear: year ? Number(year) : undefined
        });

        if (result.error) return res.status(500).json({ error: result.error });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message || "Error al obtener análisis de sentimientos" });
    }
});

// POST /api/admin/reviews/sentiment/batch - batch process sentiment for reviews
router.post("/reviews/sentiment/batch", async (req, res) => {
    try {
        const body = req.body || {};
        const { reviews } = body; // array of { reviewId, sentiment: { score, magnitude, label } }
        if (!Array.isArray(reviews) || reviews.length === 0) {
            return res.status(400).json({ error: "Se requiere array 'reviews'" });
        }

        const results = [];
        for (const r of reviews) {
            try {
                await ReviewModel.updateSentiment(r.reviewId, r.sentiment);
                results.push({ reviewId: r.reviewId, ok: true });
            } catch (e) {
                results.push({ reviewId: r.reviewId, ok: false, error: e.message });
            }
        }
        res.json({ results });
    } catch (e) {
        res.status(500).json({ error: e.message || "Error en procesamiento por lotes" });
    }
});

module.exports = router;