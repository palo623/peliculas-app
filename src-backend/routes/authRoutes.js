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

// Amistades: se almacenan en una colección global para que cada relación
// tenga un único documento con from, to y status.
function friendshipsCollection() {
    if (!db) return null;
    return db.collection("friendships");
}

async function friendshipDocsForUser(userId, status) {
    const [fromSnap, toSnap] = await Promise.all([
        friendshipsCollection().where("from", "==", userId).get(),
        friendshipsCollection().where("to", "==", userId).get()
    ]);
    const docs = new Map();
    [...fromSnap.docs, ...toSnap.docs]
        .filter((doc) => doc.data().status === status)
        .forEach((doc) => docs.set(doc.id, doc));
    return [...docs.values()];
}

async function userSummary(userId) {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return null;
    const user = userDoc.data() || {};
    return { id: user.id || userDoc.id, name: user.name, nickname: user.nickname, photoURL: user.photoURL };
}

// GET /api/auth/friends — lista de amigos aceptados
router.get("/auth/friends", async (req, res) => {
    try {
        const token = tokenFromHeader(req);
        const session = await authService.readSession ? await authService.readSession(token) : null;
        if (!session) return res.status(401).json({ error: "Sesión no válida" });
        if (!db) return res.json({ friends: [] });
        const docs = await friendshipDocsForUser(session.userId, "accepted");
        const friends = [];
        for (const doc of docs) {
            const data = doc.data();
            const friendId = data.from === session.userId ? data.to : data.from;
            const friend = await userSummary(friendId);
            if (friend) friends.push(friend);
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
        const snap = await friendshipsCollection().where("to", "==", session.userId).get();
        const requests = [];
        for (const doc of snap.docs.filter((item) => item.data().status === "pending")) {
            const data = doc.data();
            const from = await userSummary(data.from);
            if (from) requests.push({ id: doc.id, fromId: from.id, name: from.name, nickname: from.nickname, photoURL: from.photoURL, createdAt: data.createdAt });
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
        const [outgoing, incoming] = await Promise.all([
            friendshipsCollection().where("from", "==", session.userId).get(),
            friendshipsCollection().where("to", "==", session.userId).get()
        ]);
        const related = [...outgoing.docs, ...incoming.docs].map((doc) => doc.data());
        const existingFriend = related.find((item) =>
            ((item.from === session.userId && item.to === target.id) || (item.to === session.userId && item.from === target.id)) &&
            item.status === "accepted"
        );
        if (existingFriend) {
            return res.status(400).json({ error: "Ya sois amigos" });
        }
        const existingRequest = related.find((item) => item.from === session.userId && item.to === target.id && item.status === "pending");
        if (existingRequest) return res.status(400).json({ error: "Ya enviaste una solicitud a este usuario" });
        // Crear la solicitud en la colección global.
        const reqRef = friendshipsCollection().doc(encodeURIComponent(`${session.userId}__${target.id}`));
        await reqRef.set({
            from: session.userId,
            to: target.id,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
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
        const reqDoc = await friendshipsCollection().doc(requestId).get();
        if (!reqDoc.exists) return res.status(404).json({ error: "Solicitud no encontrada" });
        const reqData = reqDoc.data();
        if (reqData.status !== "pending" || reqData.to !== session.userId) return res.status(400).json({ error: "La solicitud ya fue procesada" });
        await reqDoc.ref.update({ status: "accepted", updatedAt: new Date().toISOString() });
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
        const reqDoc = await friendshipsCollection().doc(requestId).get();
        if (!reqDoc.exists) return res.status(404).json({ error: "Solicitud no encontrada" });
        if (reqDoc.data().to !== session.userId) return res.status(403).json({ error: "Solicitud no válida" });
        await reqDoc.ref.update({ status: "declined", updatedAt: new Date().toISOString() });
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
        const [outgoing, incoming] = await Promise.all([
            friendshipsCollection().where("from", "==", session.userId).get(),
            friendshipsCollection().where("from", "==", friendId).get()
        ]);
        const batch = db.batch();
        [...outgoing.docs, ...incoming.docs]
            .filter((doc) => {
                const data = doc.data();
                return data.status === "accepted" &&
                    ((data.from === session.userId && data.to === friendId) ||
                        (data.from === friendId && data.to === session.userId));
            })
            .forEach((doc) => batch.delete(doc.ref));
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
