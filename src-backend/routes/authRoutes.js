const express = require("express");
const router = express.Router();
const { authService, findUserByNickname, setUserNickname } = require("../services/authService");
const firebaseConn = require("../models/firebase");
const db = firebaseConn.getDb();

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
// POST /api/auth/nickname { nickname } — establece/actualiza el nickname único
router.post("/auth/nickname", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        const body = req.body || {};
        const nickname = (body.nickname || "").trim();
        if (!nickname) return res.status(400).json({ error: "Nickname requerido" });
        const saved = await setUserNickname(session.userId, nickname);
        res.json({ ok: true, nickname: saved });
    } catch (error) {
        if (error.code === "NICKNAME_TAKEN") return res.status(409).json({ error: error.message });
        if (error.code === "INVALID_NICKNAME") return res.status(400).json({ error: error.message });
        res.status(400).json({ error: error.message || "No se pudo establecer el nickname" });
    }
});

// GET /api/auth/nickname/check/:nickname — verifica si un nickname está disponible
router.get("/auth/nickname/check/:nickname", async (req, res) => {
    try {
        const nickname = (req.params.nickname || "").trim().toLowerCase();
        if (!nickname) return res.status(400).json({ error: "Nickname requerido" });
        const existing = await findUserByNickname(nickname);
        res.json({ available: !existing });
    } catch (error) {
        res.status(400).json({ error: error.message || "Error al comprobar" });
    }
});

// Amistades
function friendsCollection(userId) {
    if (!db) return null;
    return db.collection("users").doc(userId).collection("friends");
}

function requestsCollection(userId) {
    if (!db) return null;
    return db.collection("users").doc(userId).collection("friendRequests");
}

// GET /api/auth/friends — lista de amigos aceptados
router.get("/auth/friends", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        if (!db) return res.json({ friends: [] });
        const snap = await friendsCollection(session.userId).where("status", "==", "accepted").get();
        const friends = [];
        for (const doc of snap.docs) {
            const data = doc.data();
            const friendDoc = await db.collection("users").doc(data.friendId).get();
            if (friendDoc.exists) {
                const f = friendDoc.data();
                friends.push({ id: f.id, name: f.name, nickname: f.nickname, photoURL: f.photoURL });
            }
        }
        res.json({ friends });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo obtener amigos" });
    }
});

// GET /api/auth/friends/requests — solicitudes pendientes recibidas
router.get("/auth/friends/requests", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        if (!db) return res.json({ requests: [] });
        const snap = await requestsCollection(session.userId).where("status", "==", "pending").get();
        const requests = [];
        for (const doc of snap.docs) {
            const data = doc.data();
            const fromDoc = await db.collection("users").doc(data.fromId).get();
            if (fromDoc.exists) {
                const f = fromDoc.data();
                requests.push({ id: doc.id, fromId: f.id, name: f.name, nickname: f.nickname, photoURL: f.photoURL, createdAt: data.createdAt });
            }
        }
        res.json({ requests });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo obtener solicitudes" });
    }
});

// POST /api/auth/friends/request { toNickname } — envía solicitud por nickname
router.post("/auth/friends/request", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        const body = req.body || {};
        const toNickname = (body.toNickname || "").trim().toLowerCase();
        if (!toNickname) return res.status(400).json({ error: "Nickname del destino requerido" });
        if (!db) return res.status(503).json({ error: "Función no disponible en modo local" });
        const target = await findUserByNickname(toNickname);
        if (!target) return res.status(404).json({ error: "Usuario no encontrado" });
        if (target.id === session.userId) return res.status(400).json({ error: "No te puedes agregar a ti mismo" });
        // Verificar si ya son amigos
        const existingFriend = await friendsCollection(session.userId).doc(target.id).get();
        if (existingFriend.exists && existingFriend.data().status === "accepted") {
            return res.status(400).json({ error: "Ya sois amigos" });
        }
        // Verificar si ya hay solicitud pendiente
        const existingReq = await requestsCollection(target.id).where("fromId", "==", session.userId).where("status", "==", "pending").limit(1).get();
        if (!existingReq.empty) return res.status(400).json({ error: "Ya enviaste una solicitud a este usuario" });
        // Crear solicitud
        const reqRef = requestsCollection(target.id).doc();
        await reqRef.set({
            fromId: session.userId,
            status: "pending",
            createdAt: new Date().toISOString()
        });
        res.json({ ok: true, requestId: reqRef.id });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo enviar la solicitud" });
    }
});

// POST /api/auth/friends/request/accept { requestId } — acepta solicitud
router.post("/auth/friends/request/accept", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        const body = req.body || {};
        const requestId = body.requestId;
        if (!requestId) return res.status(400).json({ error: "ID de solicitud requerido" });
        if (!db) return res.status(503).json({ error: "Función no disponible en modo local" });
        const reqDoc = await requestsCollection(session.userId).doc(requestId).get();
        if (!reqDoc.exists) return res.status(404).json({ error: "Solicitud no encontrada" });
        const reqData = reqDoc.data();
        if (reqData.status !== "pending") return res.status(400).json({ error: "La solicitud ya fue procesada" });
        const fromId = reqData.fromId;
        // Crear amistad mutua
        const batch = db.batch();
        batch.set(friendsCollection(session.userId).doc(fromId), { friendId: fromId, status: "accepted", createdAt: new Date().toISOString() });
        batch.set(friendsCollection(fromId).doc(session.userId), { friendId: session.userId, status: "accepted", createdAt: new Date().toISOString() });
        batch.update(reqDoc.ref, { status: "accepted" });
        await batch.commit();
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo aceptar la solicitud" });
    }
});

// POST /api/auth/friends/request/decline { requestId } — rechaza solicitud
router.post("/auth/friends/request/decline", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        const body = req.body || {};
        const requestId = body.requestId;
        if (!requestId) return res.status(400).json({ error: "ID de solicitud requerido" });
        if (!db) return res.status(503).json({ error: "Función no disponible en modo local" });
        const reqDoc = await requestsCollection(session.userId).doc(requestId).get();
        if (!reqDoc.exists) return res.status(404).json({ error: "Solicitud no encontrada" });
        await reqDoc.ref.update({ status: "declined" });
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo rechazar la solicitud" });
    }
});

// DELETE /api/auth/friends/:friendId — elimina amigo
router.delete("/auth/friends/:friendId", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        const friendId = req.params.friendId;
        if (!db) return res.status(503).json({ error: "Función no disponible en modo local" });
        const batch = db.batch();
        batch.delete(friendsCollection(session.userId).doc(friendId));
        batch.delete(friendsCollection(friendId).doc(session.userId));
        await batch.commit();
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ error: error.message || "No se pudo eliminar el amigo" });
    }
});

// GET /api/auth/user/:nickname — buscar usuario por nickname (para agregar amigo)
router.get("/auth/user/:nickname", async (req, res) => {
    try {
        const nickname = (req.params.nickname || "").trim().toLowerCase();
        if (!nickname) return res.status(400).json({ error: "Nickname requerido" });
        const user = await findUserByNickname(nickname);
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        res.json({ user: { id: user.id, name: user.name, nickname: user.nickname, photoURL: user.photoURL } });
    } catch (error) {
        res.status(400).json({ error: error.message || "Error al buscar usuario" });
    }
});

module.exports = router;
