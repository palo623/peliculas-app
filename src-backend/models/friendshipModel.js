// Modelo de amistades entre usuarios.
// Usa la colección "friendships" de Firestore (igual que "users", "sessions" y
// "movies") y un array en memoria cuando no hay Firestore (modo local).
// Cada documento representa una solicitud o una amistad aceptada:
//   { from, to, status: "pending" | "accepted", createdAt, updatedAt }
// El id es direccional: "<from>__<to>" en minúsculas, lo que impide duplicados
// en el mismo sentido; el sentido inverso se comprueba por lectura.
// La conexión se centraliza en ./firebase.js (igual que movieModel/seriesModel).
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

// Almacén en memoria para que el modo local sí persista mientras el servidor corre.
const localFriendships = [];

function normalizeUserId(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

// Error con código para que las rutas traduzcan a 400/403/404/409.
function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function requestId(from, to) {
    return normalizeUserId(from) + "__" + normalizeUserId(to);
}

function toPublic(doc) {
    return {
        id: doc.id,
        from: doc.from,
        to: doc.to,
        status: doc.status,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null
    };
}

function sortByCreatedDesc(list) {
    return [...list].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function getDocById(id) {
    if (!db) {
        return localFriendships.find((f) => f.id === id) || null;
    }
    const doc = await db.collection("friendships").doc(id).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
}

async function putDoc(doc) {
    if (!db) {
        const idx = localFriendships.findIndex((f) => f.id === doc.id);
        if (idx >= 0) {
            localFriendships[idx] = doc;
        } else {
            localFriendships.unshift(doc);
        }
        return;
    }
    await db.collection("friendships").doc(doc.id).set({
        from: doc.from,
        to: doc.to,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
    });
}

async function deleteDoc(id) {
    if (!db) {
        const idx = localFriendships.findIndex((f) => f.id === id);
        if (idx >= 0) localFriendships.splice(idx, 1);
        return;
    }
    await db.collection("friendships").doc(id).delete();
}

// Transacción para operaciones atómicas en Firestore.
// En modo local, ejecuta la función directamente (single-threaded, sin races reales).
async function runTransaction(fn) {
    if (!db) {
        return fn(null);
    }
    return db.runTransaction(fn);
}

// Lecturas de un solo campo (sin índices compuestos): se filtran en memoria,
// igual que hacen MovieModel.getAllMovies y SeriesModel.getAllSeries.
async function listByFrom(userId) {
    if (!db) {
        return localFriendships.filter((f) => f.from === userId);
    }
    const snapshot = await db.collection("friendships").where("from", "==", userId).get();
    const out = [];
    snapshot.forEach((doc) => {
        out.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return out;
}

async function listByTo(userId) {
    if (!db) {
        return localFriendships.filter((f) => f.to === userId);
    }
    const snapshot = await db.collection("friendships").where("to", "==", userId).get();
    const out = [];
    snapshot.forEach((doc) => {
        out.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return out;
}

const FriendshipModel = {
    isFirestoreConnected: () => firebaseConn.isFirestoreConnected(),

    // Crea una solicitud pendiente. La existencia del destinatario la comprueba
    // la ruta con authService.getById antes de llamar aquí.
    sendRequest: async ({ from, to }) => {
        const sender = normalizeUserId(from);
        const receiver = normalizeUserId(to);
        if (!sender || !isValidEmail(sender)) {
            throw codedError("BAD_REQUEST", "Remitente inválido");
        }
        if (!receiver || !isValidEmail(receiver)) {
            throw codedError("BAD_REQUEST", "Destinatario inválido");
        }
        if (sender === receiver) {
            throw codedError("BAD_REQUEST", "No puedes enviarte una solicitud de amistad a ti mismo");
        }
        const rid = requestId(sender, receiver);
        const reverseId = requestId(receiver, sender);
        try {
            return await runTransaction(async (tx) => {
                const directSnap = tx ? await tx.get(db.collection("friendships").doc(rid)) : { exists: !!localFriendships.find(f => f.id === rid) };
                const reverseSnap = tx ? await tx.get(db.collection("friendships").doc(reverseId)) : { exists: !!localFriendships.find(f => f.id === reverseId) };

                const direct = directSnap.exists ? (tx ? directSnap.data() : localFriendships.find(f => f.id === rid)) : null;
                const reverse = reverseSnap.exists ? (tx ? reverseSnap.data() : localFriendships.find(f => f.id === reverseId)) : null;

                if ((direct && direct.status === "accepted") || (reverse && reverse.status === "accepted")) {
                    throw codedError("CONFLICT", "Ya sois amigos");
                }
                if (direct && direct.status === "pending") {
                    throw codedError("CONFLICT", "Ya has enviado una solicitud a este usuario");
                }
                if (reverse && reverse.status === "pending") {
                    throw codedError("CONFLICT", "Este usuario ya te ha enviado una solicitud. Revísala en recibidas.");
                }

                const now = new Date().toISOString();
                const doc = {
                    id: rid,
                    from: sender,
                    to: receiver,
                    status: "pending",
                    createdAt: now,
                    updatedAt: now
                };

                if (tx) {
                    tx.set(db.collection("friendships").doc(rid), doc);
                } else {
                    localFriendships.unshift(doc);
                }
                return toPublic(doc);
            });
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al guardar la solicitud:", error.message || error);
            throw new Error("No se pudo enviar la solicitud de amistad");
        }
    },

    getReceivedRequests: async (userId) => {
        const me = normalizeUserId(userId);
        if (!me) throw codedError("BAD_REQUEST", "Falta el usuario");
        try {
            const docs = await listByTo(me);
            return sortByCreatedDesc(docs.filter((d) => d.status === "pending")).map(toPublic);
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al leer solicitudes recibidas:", error.message || error);
            throw new Error("No se pudieron leer las solicitudes recibidas");
        }
    },

    getSentRequests: async (userId) => {
        const me = normalizeUserId(userId);
        if (!me) throw codedError("BAD_REQUEST", "Falta el usuario");
        try {
            const docs = await listByFrom(me);
            return sortByCreatedDesc(docs.filter((d) => d.status === "pending")).map(toPublic);
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al leer solicitudes enviadas:", error.message || error);
            throw new Error("No se pudieron leer las solicitudes enviadas");
        }
    },

    acceptRequest: async (requestIdRaw, userId) => {
        const me = normalizeUserId(userId);
        const id = String(requestIdRaw || "").trim().toLowerCase();
        if (!id) throw codedError("BAD_REQUEST", "Falta el id de la solicitud");
        try {
            return await runTransaction(async (tx) => {
                const docRef = tx ? db.collection("friendships").doc(id) : null;
                const snap = tx ? await tx.get(docRef) : { exists: !!localFriendships.find(f => f.id === id) };
                if (!snap.exists) throw codedError("NOT_FOUND", "Solicitud no encontrada");
                const doc = tx ? snap.data() : localFriendships.find(f => f.id === id);
                if (doc.to !== me) {
                    throw codedError("FORBIDDEN", "Solo el destinatario puede aceptar esta solicitud");
                }
                if (doc.status === "accepted") {
                    throw codedError("CONFLICT", "La solicitud ya estaba aceptada");
                }
                doc.status = "accepted";
                doc.updatedAt = new Date().toISOString();
                if (tx) {
                    tx.update(docRef, { status: "accepted", updatedAt: doc.updatedAt });
                } else {
                    const idx = localFriendships.findIndex(f => f.id === id);
                    if (idx >= 0) localFriendships[idx] = doc;
                }
                return toPublic(doc);
            });
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al aceptar la solicitud:", error.message || error);
            throw new Error("No se pudo aceptar la solicitud");
        }
    },

    rejectRequest: async (requestIdRaw, userId) => {
        const me = normalizeUserId(userId);
        const id = String(requestIdRaw || "").trim().toLowerCase();
        if (!id) throw codedError("BAD_REQUEST", "Falta el id de la solicitud");
        try {
            return await runTransaction(async (tx) => {
                const docRef = tx ? db.collection("friendships").doc(id) : null;
                const snap = tx ? await tx.get(docRef) : { exists: !!localFriendships.find(f => f.id === id) };
                if (!snap.exists) throw codedError("NOT_FOUND", "Solicitud no encontrada");
                const doc = tx ? snap.data() : localFriendships.find(f => f.id === id);
                if (doc.to !== me) {
                    throw codedError("FORBIDDEN", "Solo el destinatario puede rechazar esta solicitud");
                }
                if (tx) {
                    tx.delete(docRef);
                } else {
                    const idx = localFriendships.findIndex(f => f.id === id);
                    if (idx >= 0) localFriendships.splice(idx, 1);
                }
                return { ok: true, id };
            });
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al rechazar la solicitud:", error.message || error);
            throw new Error("No se pudo rechazar la solicitud");
        }
    },

    // Cancela una solicitud enviada por el propio usuario.
    cancelRequest: async (requestIdRaw, userId) => {
        const me = normalizeUserId(userId);
        const id = String(requestIdRaw || "").trim().toLowerCase();
        if (!id) throw codedError("BAD_REQUEST", "Falta el id de la solicitud");
        try {
            return await runTransaction(async (tx) => {
                const docRef = tx ? db.collection("friendships").doc(id) : null;
                const snap = tx ? await tx.get(docRef) : { exists: !!localFriendships.find(f => f.id === id) };
                if (!snap.exists) throw codedError("NOT_FOUND", "Solicitud no encontrada");
                const doc = tx ? snap.data() : localFriendships.find(f => f.id === id);
                if (doc.from !== me) {
                    throw codedError("FORBIDDEN", "Solo quien envió la solicitud puede cancelarla");
                }
                if (doc.status === "accepted") {
                    throw codedError("CONFLICT", "Ya sois amigos. Usa eliminar amigo en su lugar.");
                }
                if (tx) {
                    tx.delete(docRef);
                } else {
                    const idx = localFriendships.findIndex(f => f.id === id);
                    if (idx >= 0) localFriendships.splice(idx, 1);
                }
                return { ok: true, id };
            });
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al cancelar la solicitud:", error.message || error);
            throw new Error("No se pudo cancelar la solicitud");
        }
    },

    // true si ambos ids son el mismo usuario o tienen amistad aceptada.
    areFriends: async (a, b) => {
        const first = normalizeUserId(a);
        const second = normalizeUserId(b);
        if (!first || !second) return false;
        if (first === second) return true;
        const direct = await getDocById(requestId(first, second));
        if (direct && direct.status === "accepted") return true;
        const reverse = await getDocById(requestId(second, first));
        return !!(reverse && reverse.status === "accepted");
    },

    // Lista de amistades aceptadas con el id del otro usuario y la fecha.
    getFriends: async (userId) => {
        const me = normalizeUserId(userId);
        if (!me) throw codedError("BAD_REQUEST", "Falta el usuario");
        try {
            const sent = await listByFrom(me);
            const received = await listByTo(me);
            const out = [];
            for (const doc of sent) {
                if (doc.status === "accepted" && doc.to && doc.to !== me) {
                    out.push({ friendshipId: doc.id, friendId: doc.to, since: doc.updatedAt || doc.createdAt || null });
                }
            }
            for (const doc of received) {
                if (doc.status === "accepted" && doc.from && doc.from !== me) {
                    out.push({ friendshipId: doc.id, friendId: doc.from, since: doc.updatedAt || doc.createdAt || null });
                }
            }
            return out;
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al listar amigos:", error.message || error);
            throw new Error("No se pudo listar la base de datos");
        }
    },

    // Elimina la amistad aceptada entre ambos usuarios, la inicie quien la inicie.
    removeFriend: async (userId, friendId) => {
        const me = normalizeUserId(userId);
        const other = normalizeUserId(friendId);
        if (!other || !isValidEmail(other)) {
            throw codedError("BAD_REQUEST", "Amigo inválido");
        }
        if (me === other) {
            throw codedError("BAD_REQUEST", "No puedes eliminarte a ti mismo");
        }
        const directId = requestId(me, other);
        const reverseId = requestId(other, me);
        try {
            return await runTransaction(async (tx) => {
                const directRef = tx ? db.collection("friendships").doc(directId) : null;
                const reverseRef = tx ? db.collection("friendships").doc(reverseId) : null;
                const directSnap = tx ? await tx.get(directRef) : { exists: !!localFriendships.find(f => f.id === directId) };
                const reverseSnap = tx ? await tx.get(reverseRef) : { exists: !!localFriendships.find(f => f.id === reverseId) };

                const direct = directSnap.exists ? (tx ? directSnap.data() : localFriendships.find(f => f.id === directId)) : null;
                const reverse = reverseSnap.exists ? (tx ? reverseSnap.data() : localFriendships.find(f => f.id === reverseId)) : null;

                const existing = (direct && direct.status === "accepted" && direct)
                    || (reverse && reverse.status === "accepted" && reverse)
                    || null;
                if (!existing) {
                    throw codedError("NOT_FOUND", "No sois amigos");
                }

                if (tx) {
                    tx.delete(db.collection("friendships").doc(existing.id));
                } else {
                    const idx = localFriendships.findIndex(f => f.id === existing.id);
                    if (idx >= 0) localFriendships.splice(idx, 1);
                }
                return { ok: true, id: existing.id };
            });
        } catch (error) {
            if (error.code) throw error;
            console.error("Error al eliminar amigo:", error.message || error);
            throw new Error("No se pudo eliminar al amigo");
        }
    }
};

module.exports = { FriendshipModel };
