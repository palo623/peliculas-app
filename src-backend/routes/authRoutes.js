const express = require("express");
const router = express.Router();
const { authService } = require("../services/authService");

function tokenFromHeader(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

// POST /api/auth/register { name, email, password }
router.post("/auth/register", async (req, res) => {
    try {
        const body = req.body || {};
        if (typeof body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const { token, user } = await authService.register({
            name: body.name,
            email: body.email,
            password: body.password
        });
        res.status(201).json({ ok: true, token, user });
    } catch (error) {
        if (error.code === "DUPLICATE") {
            return res.status(409).json({ error: error.message });
        }
        res.status(400).json({ error: error.message || "No se pudo registrar" });
    }
});

// POST /api/auth/login { email, password }
router.post("/auth/login", async (req, res) => {
    try {
        const body = req.body || {};
        const { token, user } = await authService.login({
            email: body.email,
            password: body.password
        });
        res.json({ ok: true, token, user });
    } catch (error) {
        if (error.code === "INVALID_CREDENTIALS") {
            return res.status(401).json({ error: error.message });
        }
        res.status(400).json({ error: error.message || "No se pudo entrar" });
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

// PUT /api/auth/prefs { favoriteGenres, likesSeries, likesMovies, likesMiniseries, onboardingDone }
router.put("/auth/prefs", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const body = req.body || {};
        if (typeof body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const prefs = await authService.updatePrefs(token, {
            favoriteGenres: Array.isArray(body.favoriteGenres) ? body.favoriteGenres.slice(0, 3) : [],
            likesSeries: typeof body.likesSeries === "boolean" ? body.likesSeries : null,
            likesMovies: typeof body.likesMovies === "boolean" ? body.likesMovies : null,
            likesMiniseries: typeof body.likesMiniseries === "boolean" ? body.likesMiniseries : null,
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

module.exports = router;
