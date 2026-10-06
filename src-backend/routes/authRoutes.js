const express = require("express");
const router = express.Router();
const { authService } = require("../services/authService");

function tokenFromHeader(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

// POST /api/auth/firebase { idToken, name? } — verifica Firebase Auth y crea sesión propia
router.post("/auth/firebase", async (req, res) => {
    try {
        const body = req.body || {};
        if (typeof body !== "object" || !body.idToken) {
            return res.status(400).json({ error: "ID token de Firebase requerido" });
        }
        const { token, user } = await authService.loginWithFirebase({
            idToken: body.idToken,
            name: body.name
        });
        res.json({ ok: true, token, user });
    } catch (error) {
        if (error && (error.code === 8 || error.code === "RESOURCE_EXHAUSTED" || /RESOURCE_EXHAUSTED|quota exceeded/i.test(error.message || ""))) {
            console.error("[auth] Cuota de Firebase agotada:", error.message || error);
            return res.status(503).json({ error: "Firebase ha alcanzado su cuota temporal. Espera a que se restablezca e inténtalo de nuevo." });
        }
        if (error.code === "INVALID_FIREBASE_TOKEN") {
            return res.status(401).json({ error: error.message });
        }
        if (error.code === "FIREBASE_NOT_CONFIGURED") {
            return res.status(500).json({ error: error.message });
        }
        res.status(400).json({ error: error.message || "No se pudo entrar con Firebase" });
    }
});

// POST /api/auth/logout (Bearer opcional, siempre ok)
router.post("/auth/logout", async (req, res) => {
    try {
        await authService.logout(tokenFromHeader(req));
    } catch (e) {
        /* best-effort */
    }
    res.json({ ok: true });
});

// GET /api/auth/me (requiere Bearer válido)
router.get("/auth/me", async (req, res) => {
    try {
        const user = await authService.me(tokenFromHeader(req));
        if (!user) {
            return res.status(401).json({ error: "Sesión no válida" });
        }
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: "No se pudo comprobar la sesión" });
    }
});

// PUT /api/auth/prefs { favoriteGenres, likesMovies, onboardingDone }
router.put("/auth/prefs", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const body = req.body || {};
        if (typeof body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const prefs = await authService.updatePrefs(token, {
            favoriteGenres: Array.isArray(body.favoriteGenres) ? body.favoriteGenres.slice(0, 3) : [],
            likesMovies: typeof body.likesMovies === "boolean" ? body.likesMovies : null,
            onboardingDone: body.onboardingDone === true
        });
        if (!prefs) {
            return res.status(401).json({ error: "Sesión no válida" });
        }
        res.json({ ok: true, prefs });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo actualizar" });
    }
});

// GET /api/users/search?q=...&limit=20 — buscar usuarios para añadir amigos
router.get("/users/search", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const q = req.query.q || "";
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 50);
        const results = await authService.searchUsers(q, { excludeId: user.id, limit });
        res.json({ results });
    } catch (error) {
        const badRequest = /necesita al menos|demasiado largo/i.test(error.message || "");
        res.status(badRequest ? 400 : 500).json({ error: error.message || "Error en búsqueda" });
    }
});

// GET /api/auth/top5 — obtener Top 5 del usuario
router.get("/auth/top5", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const top5 = await authService.getTop5(user.id);
        res.json({ top5 });
    } catch (error) {
        const notFound = /no encontrado/i.test(error.message || "");
        res.status(notFound ? 404 : 500).json({ error: error.message || "Error al obtener Top 5" });
    }
});

// PUT /api/auth/top5 { items: [...] } — actualizar Top 5 (máx 5 items)
router.put("/auth/top5", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const user = await authService.me(token);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const body = req.body || {};
        if (!Array.isArray(body.items)) {
            return res.status(400).json({ error: "El Top 5 debe ser un array 'items'" });
        }
        const top5 = await authService.setTop5(user.id, body.items);
        res.json({ ok: true, top5 });
    } catch (error) {
        const badRequest = /inválido|máximo 5|falta el usuario/i.test(error.message || "");
        const notFound = /no encontrado/i.test(error.message || "");
        res.status(badRequest ? 400 : notFound ? 404 : 500).json({ error: error.message || "Error al actualizar Top 5" });
    }
});

module.exports = router;
