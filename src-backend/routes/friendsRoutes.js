// API de amistades entre usuarios.
// Todas las operaciones privadas usan el usuario autenticado (sesión técnica
// Bearer de authService), nunca un userId enviado por el cliente.
// La información privada de otro usuario (perfil, Top 5, películas y series)
// solo se devuelve si existe una amistad aceptada.
const express = require("express");
const router = express.Router();
const { FriendshipModel } = require("../models/friendshipModel");
const { authService, cardUser } = require("../services/authService");
const { MovieModel } = require("../models/movieModel");
const { SeriesModel } = require("../models/seriesModel");

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

// El modelo ya trae err.code; este fallback cubre errores sin código
// con el mismo estilo de las rutas de películas/series (regex sobre el mensaje).
function statusFor(error) {
    if (error && error.code === "BAD_REQUEST") return 400;
    if (error && error.code === "FORBIDDEN") return 403;
    if (error && error.code === "NOT_FOUND") return 404;
    if (error && error.code === "CONFLICT") return 409;
    const msg = (error && error.message) || "";
    if (/ya sois amigos|ya has enviado|ya te ha enviado|ya estaba aceptada|duplicad/i.test(msg)) return 409;
    if (/solo el|puede cancelarla|sin permiso|no autorizado/i.test(msg)) return 403;
    if (/no encontrad|no existe|no sois amigos/i.test(msg)) return 404;
    if (/inválido|falta|mismo|máximo|caracteres|demasiado largo|necesita/i.test(msg)) return 400;
    return 500;
}

function sendError(res, error) {
    res.status(statusFor(error)).json({ error: (error && error.message) || "Error interno del servidor" });
}

async function cardOrNull(userId) {
    try {
        const user = await authService.getById(userId);
        return user ? cardUser(user) : null;
    } catch (e) {
        return null;
    }
}

// Solo el propio usuario o un amigo aceptado puede ver estos datos.
async function assertFriendAccess(me, otherId) {
    const other = String(otherId || "").trim().toLowerCase();
    if (!other) {
        const err = new Error("Falta el usuario");
        err.code = "BAD_REQUEST";
        throw err;
    }
    if (other === String(me || "").trim().toLowerCase()) return other;
    const friends = await FriendshipModel.areFriends(me, other);
    if (!friends) {
        const err = new Error("Solo los amigos pueden ver esta información");
        err.code = "FORBIDDEN";
        throw err;
    }
    return other;
}

// GET /api/users/search?q=ana — busca usuarios para añadir amigos.
router.get("/users/search", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const results = await authService.searchUsers(req.query.q, {
            excludeId: user.id,
            limit: req.query.limit
        });
        res.json({ results, totalResults: results.length });
    } catch (error) {
        sendError(res, error);
    }
});

// POST /api/friends/requests { to: "otro@email.com" } — enviar solicitud.
router.post("/friends/requests", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const to = req.body && req.body.to;
        if (!to || !String(to).trim()) {
            return res.status(400).json({ error: "Falta el parámetro 'to' (email del destinatario)" });
        }
        const target = await authService.getById(to);
        if (!target) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        const request = await FriendshipModel.sendRequest({ from: user.id, to: target.id });
        res.status(201).json({ ok: true, request });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/requests/received — solicitudes pendientes recibidas.
router.get("/friends/requests/received", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const requests = await FriendshipModel.getReceivedRequests(user.id);
        const enriched = [];
        for (const r of requests) {
            enriched.push({ request: r, fromUser: await cardOrNull(r.from) });
        }
        res.json({ results: enriched, totalResults: enriched.length });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/requests/sent — solicitudes pendientes enviadas.
router.get("/friends/requests/sent", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const requests = await FriendshipModel.getSentRequests(user.id);
        const enriched = [];
        for (const r of requests) {
            enriched.push({ request: r, toUser: await cardOrNull(r.to) });
        }
        res.json({ results: enriched, totalResults: enriched.length });
    } catch (error) {
        sendError(res, error);
    }
});

// POST /api/friends/requests/:id/accept — aceptar (solo el destinatario).
router.post("/friends/requests/:id/accept", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const request = await FriendshipModel.acceptRequest(req.params.id, user.id);
        res.json({ ok: true, request });
    } catch (error) {
        sendError(res, error);
    }
});

// POST /api/friends/requests/:id/reject — rechazar (solo el destinatario).
router.post("/friends/requests/:id/reject", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const result = await FriendshipModel.rejectRequest(req.params.id, user.id);
        res.json(result);
    } catch (error) {
        sendError(res, error);
    }
});

// DELETE /api/friends/requests/:id — cancelar una solicitud enviada.
router.delete("/friends/requests/:id", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const result = await FriendshipModel.cancelRequest(req.params.id, user.id);
        res.json(result);
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends — lista de amigos del usuario autenticado.
router.get("/friends", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const friendships = await FriendshipModel.getFriends(user.id);
        const friends = [];
        for (const f of friendships) {
            const card = await cardOrNull(f.friendId);
            if (card) friends.push({ ...card, since: f.since });
        }
        res.json({ results: friends, totalResults: friends.length });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/users/me/top5 — Top 5 propio.
router.get("/users/me/top5", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const top5 = await authService.getTop5(user.id);
        res.json({ results: top5, totalResults: top5.length });
    } catch (error) {
        sendError(res, error);
    }
});

// PUT /api/users/me/top5 { top5: [...] } — guarda hasta 5 favoritas.
// Cada item reutiliza referencias existentes: { movieId?, imdbID?, title, year?, poster?, type? }.
router.put("/users/me/top5", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        if (!req.body || typeof req.body !== "object" || !Array.isArray(req.body.top5)) {
            return res.status(400).json({ error: "El cuerpo debe incluir 'top5' como array (máx. 5)" });
        }
        const top5 = await authService.setTop5(user.id, req.body.top5);
        res.json({ ok: true, top5 });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/:friendId/profile — perfil visible para amigos (con Top 5).
router.get("/friends/:friendId/profile", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const targetId = await assertFriendAccess(user.id, req.params.friendId);
        const target = await authService.getById(targetId);
        if (!target) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        const top5 = await authService.getTop5(target.id).catch(() => []);
        let moviesCount = null;
        let seriesCount = null;
        try {
            moviesCount = (await MovieModel.getAllMovies(target.id)).length;
        } catch (e) {
            moviesCount = null;
        }
        try {
            seriesCount = (await SeriesModel.getAllSeries(target.id)).length;
        } catch (e) {
            seriesCount = null;
        }
        res.json({
            id: target.id,
            name: target.name,
            email: target.email,
            photoURL: target.photoURL || null,
            provider: target.provider || null,
            top5,
            stats: { movies: moviesCount, series: seriesCount }
        });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/:friendId/movies — películas guardadas del amigo.
router.get("/friends/:friendId/movies", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const targetId = await assertFriendAccess(user.id, req.params.friendId);
        const target = await authService.getById(targetId);
        if (!target) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        const movies = await MovieModel.getAllMovies(target.id);
        res.json(Array.isArray(movies) ? movies : []);
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/:friendId/series — series guardadas del amigo.
router.get("/friends/:friendId/series", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const targetId = await assertFriendAccess(user.id, req.params.friendId);
        const target = await authService.getById(targetId);
        if (!target) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        const series = await SeriesModel.getAllSeries(target.id);
        res.json(Array.isArray(series) ? series : []);
    } catch (error) {
        sendError(res, error);
    }
});

// DELETE /api/friends/:friendId — eliminar a un amigo.
router.delete("/friends/:friendId", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const result = await FriendshipModel.removeFriend(user.id, req.params.friendId);
        res.json(result);
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/friends/:friendId/full-profile — perfil completo de amigo (usuario + top5 + películas + series).
router.get("/friends/:friendId/full-profile", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const targetId = await assertFriendAccess(user.id, req.params.friendId);
        const target = await authService.getById(targetId);
        if (!target) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        const [top5, movies, series] = await Promise.all([
            authService.getTop5(target.id).catch(() => []),
            MovieModel.getAllMovies(target.id).catch(() => []),
            SeriesModel.getAllSeries(target.id).catch(() => [])
        ]);
        res.json({
            usuario: {
                id: target.id,
                name: target.name,
                email: target.email,
                photoURL: target.photoURL || null,
                provider: target.provider || null
            },
            top5,
            contenidoGuardado: {
                movies: Array.isArray(movies) ? movies : [],
                series: Array.isArray(series) ? series : []
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
