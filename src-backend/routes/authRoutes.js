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
router.put("/api/auth/prefs", async (req, res) => {
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

// PUT /api/auth/profile { nickname, colorTheme }
router.put("/auth/profile", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const body = req.body || {};
        if (typeof body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const prefs = await authService.updateProfile(token, {
            nickname: body.nickname,
            colorTheme: body.colorTheme
        });
        if (!prefs) {
            return res.status(401).json({ error: "Sesión no válida" });
        }
        res.json({ ok: true, prefs });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo actualizar el perfil" });
    }
});

// GET /api/users/:id — Perfil público de un usuario
router.get("/users/:id", async (req, res) => {
    try {
        const user = await authService.getPublicProfile(req.params.id);
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: "No se pudo obtener el perfil" });
    }
});

// GET /api/users/:id/movies — Películas guardadas de un usuario (público)
router.get("/users/:id/movies", async (req, res) => {
    try {
        const movies = await authService.getUserMovies(req.params.id);
        res.json({ movies: Array.isArray(movies) ? movies : [] });
    } catch (error) {
        res.status(500).json({ error: "No se pudo obtener las películas" });
    }
});

// GET /api/users/search?q=texto — Buscar usuarios
router.get("/users/search", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        let currentUserId = null;
        if (token) {
            const me = await authService.me(token);
            if (me) currentUserId = me.id;
        }
        const q = req.query.q || "";
        const users = await authService.searchUsers(q, currentUserId);
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: "No se pudo buscar usuarios" });
    }
});

// POST /api/users/:id/follow — Seguir a un usuario
router.post("/users/:id/follow", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        if (!token) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const result = await authService.followUser(token, req.params.id);
        if (!result) return res.status(401).json({ error: "Sesión no válida" });
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo seguir al usuario" });
    }
});

// DELETE /api/users/:id/follow — Dejar de seguir a un usuario
router.delete("/users/:id/follow", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        if (!token) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const result = await authService.unfollowUser(token, req.params.id);
        if (!result) return res.status(401).json({ error: "Sesión no válida" });
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo dejar de seguir" });
    }
});

// GET /api/users/me/following — Usuarios que sigo
router.get("/users/me/following", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        if (!token) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const following = await authService.getFollowing(token);
        if (following === null) return res.status(401).json({ error: "Sesión no válida" });
        res.json({ users: following });
    } catch (error) {
        res.status(500).json({ error: "No se pudo obtener seguidos" });
    }
});

// GET /api/users/me/followers — Mis seguidores
router.get("/users/me/followers", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        if (!token) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const followers = await authService.getFollowers(token);
        if (followers === null) return res.status(401).json({ error: "Sesión no válida" });
        res.json({ users: followers });
    } catch (error) {
        res.status(500).json({ error: "No se pudo obtener seguidores" });
    }
});

// GET /api/users/:id/is-following — Comprobar si sigo a un usuario
router.get("/users/:id/is-following", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        if (!token) return res.status(401).json({ error: "Requiere iniciar sesión" });
        const following = await authService.isFollowing(token, req.params.id);
        res.json({ following });
    } catch (error) {
        res.status(500).json({ error: "No se pudo comprobar" });
    }
});

module.exports = router;
