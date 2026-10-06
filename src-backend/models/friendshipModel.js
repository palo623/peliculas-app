// src-backend/models/friendshipModel.js
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

// Colección: friendships/{friendshipId}
// { fromUid, toUid, status: "pending" | "accepted" | "blocked", createdAt, updatedAt }
// friendshipId = [uid1, uid2].sort().join("_")  (unidireccional único)

async function getFriendshipId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
}

const FriendshipModel = {
    // Enviar solicitud
    async sendRequest(fromUid, toUid) {
        if (fromUid === toUid) throw new Error("No puedes agregarte a ti mismo");
        
        const fid = await getFriendshipId(fromUid, toUid);
        const ref = db.collection("friendships").doc(fid);
        const snap = await ref.get();
        
        if (snap.exists) {
            const data = snap.data();
            if (data.status === "accepted") throw new Error("Ya son amigos");
            if (data.status === "pending") throw new Error("Solicitud ya enviada");
            if (data.status === "blocked") throw new Error("No se puede enviar solicitud");
        }
        
        const now = new Date().toISOString();
        await ref.set({
            fromUid,
            toUid,
            status: "pending",
            createdAt: now,
            updatedAt: now
        });
        return { friendshipId: fid, status: "pending" };
    },

    // Aceptar solicitud
    async acceptRequest(friendshipId, currentUid) {
        const ref = db.collection("friendships").doc(friendshipId);
        const snap = await ref.get();
        if (!snap.exists) throw new Error("Solicitud no encontrada");
        
        const data = snap.data();
        if (data.toUid !== currentUid) throw new Error("No autorizado");
        if (data.status !== "pending") throw new Error("No está pendiente");
        
        await ref.update({ status: "accepted", updatedAt: new Date().toISOString() });
        return { friendshipId, status: "accepted" };
    },

    // Rechazar solicitud
    async rejectRequest(friendshipId, currentUid) {
        const ref = db.collection("friendships").doc(friendshipId);
        const snap = await ref.get();
        if (!snap.exists) throw new Error("Solicitud no encontrada");
        
        const data = snap.data();
        if (data.toUid !== currentUid) throw new Error("No autorizado");
        
        await ref.delete();
        return { ok: true };
    },

    // Eliminar amistad (bidireccional)
    async removeFriend(friendshipId, currentUid) {
        const ref = db.collection("friendships").doc(friendshipId);
        const snap = await ref.get();
        if (!snap.exists) throw new Error("Amistad no encontrada");
        
        const data = snap.data();
        if (data.fromUid !== currentUid && data.toUid !== currentUid) {
            throw new Error("No autorizado");
        }
        
        await ref.delete();
        return { ok: true };
    },

    // Listar amigos aceptados
    async getFriends(uid) {
        const [fromSnap, toSnap] = await Promise.all([
            db.collection("friendships").where("fromUid", "==", uid).where("status", "==", "accepted").get(),
            db.collection("friendships").where("toUid", "==", uid).where("status", "==", "accepted").get()
        ]);
        
        const friends = [];
        fromSnap.forEach(doc => {
            const d = doc.data();
            friends.push({ friendshipId: doc.id, friendUid: d.toUid, since: d.updatedAt });
        });
        toSnap.forEach(doc => {
            const d = doc.data();
            friends.push({ friendshipId: doc.id, friendUid: d.fromUid, since: d.updatedAt });
        });
        
        // Obtener datos de perfil de cada amigo
        const friendData = await Promise.all(friends.map(async f => {
            const profileSnap = await db.collection("users").doc(f.friendUid).get();
            if (profileSnap.exists) {
                const p = profileSnap.data();
                return { ...f, name: p.nickname || p.name || "Usuario", avatar: p.avatar || null };
            }
            return { ...f, name: "Usuario", avatar: null };
        }));
        
        return friendData;
    },

    // Solicitudes recibidas (pendientes)
    async getReceivedRequests(uid) {
        const snap = await db.collection("friendships")
            .where("toUid", "==", uid)
            .where("status", "==", "pending")
            .orderBy("createdAt", "desc")
            .get();
        
        const requests = [];
        for (const doc of snap.docs) {
            const d = doc.data();
            const fromSnap = await db.collection("users").doc(d.fromUid).get();
            const fromData = fromSnap.exists ? fromSnap.data() : {};
            requests.push({
                friendshipId: doc.id,
                fromUid: d.fromUid,
                fromName: fromData.nickname || fromData.name || "Usuario",
                fromAvatar: fromData.avatar || null,
                createdAt: d.createdAt
            });
        }
        return requests;
    },

    // Solicitudes enviadas (pendientes)
    async getSentRequests(uid) {
        const snap = await db.collection("friendships")
            .where("fromUid", "==", uid)
            .where("status", "==", "pending")
            .orderBy("createdAt", "desc")
            .get();
        
        const requests = [];
        for (const doc of snap.docs) {
            const d = doc.data();
            const toSnap = await db.collection("users").doc(d.toUid).get();
            const toData = toSnap.exists ? toSnap.data() : {};
            requests.push({
                friendshipId: doc.id,
                toUid: d.toUid,
                toName: toData.nickname || toData.name || "Usuario",
                toAvatar: toData.avatar || null,
                createdAt: d.createdAt
            });
        }
        return requests;
    },

    // Verificar si son amigos
    async areFriends(uid1, uid2) {
        const fid = await getFriendshipId(uid1, uid2);
        const snap = await db.collection("friendships").doc(fid).get();
        return snap.exists && snap.data().status === "accepted";
    },

    // Obtener amistad por ID
    async getFriendshipById(friendshipId) {
        const snap = await db.collection("friendships").doc(friendshipId).get();
        if (!snap.exists) return null;
        return { friendshipId: snap.id, ...snap.data() };
    }
};

module.exports = { FriendshipModel };