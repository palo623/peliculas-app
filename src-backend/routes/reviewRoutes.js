const express = require("express");
const router = express.Router();
const { ReviewModel } = require("../models/reviewModel");
const { authService } = require("../services/authService");

// Sesión obligatoria (401) u opcional (null) según la ruta.
// Las lecturas son públicas pero si viene Bearer se añade `userVote`.
async function authUserOptional(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        return await authService.me(match[1].trim());
    } catch (e) {
        return null;
    }
}

async function requireAuth(req, res) {
    const user = await authUserOptional(req);
    if (!user) res.status(401).json({ error: "Requiere iniciar sesión" });
    return user;
}

function mediaQuery(req) {
    // Acepta tanto `title` como `mediaTitle`, `year` como `mediaYear`.
    return {
        mediaType: req.query.mediaType || req.query.type,
        imdbID: req.query.imdbID || req.query.i,
        title: req.query.title || req.query.mediaTitle || req.query.t,
        year: req.query.year || req.query.mediaYear || req.query.y
    };
}

function httpStatusFor(error) {
    const msg = String((error && error.message) || "");
    if (error && error.code === "REVIEW_DUPLICATE") return 409;
    if (error && error.code === "FORBIDDEN") return 403;
    if (error && error.code === "REVIEW_TOO_SHORT") return 400;
    if (/requiere iniciar sesión/i.test(msg)) return 401;
    if (/inválido|falta|demasiado|superar|entre 50|al menos 50|vacía|formato|rango|usa 1/i.test(msg)) return 400;
    return 500;
}

// ---------- Lecturas públicas ----------

// GET /api/reviews?mediaType=movie&imdbID=tt0111161&sort=relevance&page=1&limit=20
// GET /api/reviews?mediaType=series&title=Breaking%20Bad&year=2008&sort=votes
router.get("/reviews", async (req, res) => {
    try {
        const q = mediaQuery(req);
        if (!q.mediaType) return res.status(400).json({ error: "Falta 'mediaType' ('movie' o 'series')" });
        const me = await authUserOptional(req);
        const data = await ReviewModel.listByMedia({
            mediaType: q.mediaType,
            imdbID: q.imdbID,
            title: q.title,
            year: q.year,
            sort: req.query.sort,
            page: req.query.page,
            limit: req.query.limit,
            voterUserId: me ? me.id : null
        });
        res.json(data);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// GET /api/reviews/summary?mediaType=movie&imdbID=tt0111161 -> { count, avgRating, score }
router.get("/reviews/summary", async (req, res) => {
    try {
        const q = mediaQuery(req);
        if (!q.mediaType) return res.status(400).json({ error: "Falta 'mediaType' ('movie' o 'series')" });
        const data = await ReviewModel.summaryByMedia(q);
        res.json(data);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// GET /api/reviews/mine?page=1&limit=20 (requiere Bearer)
router.get("/reviews/mine", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const data = await ReviewModel.listByUser({
            userId: user.id,
            sort: req.query.sort,
            page: req.query.page,
            limit: req.query.limit
        });
        res.json(data);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// GET /api/reviews/:id (pública; con Bearer añade userVote)
router.get("/reviews/:id", async (req, res) => {
    try {
        const me = await authUserOptional(req);
        const review = await ReviewModel.getById(req.params.id, me ? me.id : null);
        if (!review) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json(review);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// ---------- Escritura (requiere Bearer) ----------

// POST /api/reviews { mediaType, imdbID?, mediaTitle, mediaYear?, text, rating? }
// 201 { review } | 409 si ya reseñó esa obra
router.post("/reviews", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const review = await ReviewModel.create(
            { userId: user.id, userName: user.name || user.nickname || user.email },
            req.body
        );
        res.status(201).json(review);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// PUT /api/reviews/:id { text?, rating? } (solo el autor)
router.put("/reviews/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const review = await ReviewModel.update(req.params.id, user.id, {
            text: req.body.text,
            rating: req.body.rating
        });
        if (!review) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json(review);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// DELETE /api/reviews/:id (solo el autor; borra votos y respuestas)
router.delete("/reviews/:id", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const deleted = await ReviewModel.remove(req.params.id, user.id);
        if (!deleted) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json({ ok: true, id: req.params.id });
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// POST /api/reviews/:id/vote { value: 1 | -1 | 0 }
router.post("/reviews/:id/vote", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const review = await ReviewModel.vote(req.params.id, user.id, req.body && req.body.value);
        if (!review) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json(review);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// ---------- Respuestas ----------

// GET /api/reviews/:id/replies?page=1&limit=20
router.get("/reviews/:id/replies", async (req, res) => {
    try {
        const review = await ReviewModel.getById(req.params.id, null);
        if (!review) return res.status(404).json({ error: "Reseña no encontrada" });
        const data = await ReviewModel.listReplies(req.params.id, {
            page: req.query.page,
            limit: req.query.limit
        });
        res.json(data);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// POST /api/reviews/:id/replies { text } (requiere Bearer)
router.post("/reviews/:id/replies", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const reply = await ReviewModel.addReply(
            req.params.id,
            { userId: user.id, userName: user.name || user.nickname || user.email },
            req.body
        );
        if (!reply) return res.status(404).json({ error: "Reseña no encontrada" });
        res.status(201).json(reply);
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

// DELETE /api/reviews/:id/replies/:replyId (solo el autor de la respuesta)
router.delete("/reviews/:id/replies/:replyId", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const deleted = await ReviewModel.removeReply(req.params.id, req.params.replyId, user.id);
        if (!deleted) return res.status(404).json({ error: "Respuesta no encontrada" });
        res.json({ ok: true, id: req.params.replyId });
    } catch (error) {
        res.status(httpStatusFor(error)).json({ error: error.message });
    }
});

module.exports = router;
