const express = require("express");
const router = express.Router();
const { ReviewModel } = require("../models/reviewModel");
const { authService } = require("../services/authService");

function tokenFromHeader(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

async function authUser(req) {
    const token = tokenFromHeader(req);
    if (!token) return null;
    try {
        return await authService.me(token);
    } catch (error) {
        return null;
    }
}

router.get("/reviews/:mediaType/:mediaId", async (req, res) => {
    try {
        const user = await authUser(req);
        const reviews = await ReviewModel.getReviews(req.params.mediaType, req.params.mediaId, user && user.id);
        res.json({ reviews });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudieron leer las reseñas" });
    }
});

router.post("/reviews", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const review = await ReviewModel.createReview({
            mediaType: req.body && req.body.mediaType,
            mediaId: req.body && req.body.mediaId,
            text: req.body && req.body.text,
            userId: user.id,
            userName: user.name || user.nickname || user.email
        });
        res.status(201).json({ review });
    } catch (error) {
        const status = /Ya has escrito/i.test(error.message || "") ? 409 : (/iniciar sesión|reseña debe|superar|identificador|tipo de contenido|inválidos/i.test(error.message || "") ? 400 : 500);
        res.status(status).json({ error: error.message || "No se pudo guardar la reseña" });
    }
});

router.delete("/reviews/:id", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const deleted = await ReviewModel.deleteReview(req.params.id, user.id);
        if (!deleted) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: "No se pudo eliminar la reseña" });
    }
});

module.exports = router;