// Firebase Authentication valida la identidad; este servicio sincroniza el perfil
// con Firestore y crea una sesión técnica para las rutas privadas.
const crypto = require("crypto");

// Conexión centralizada a Firestore (ver ../models/firebase.js).
const firebaseConn = require("../models/firebase");
const db = firebaseConn.getDb();
if (!firebaseConn.isFirestoreConnected()) {
    console.warn("[auth] Sin Firestore. La autenticación Firebase no estará disponible.");
}

// Memoria para modo local.
const localUsers = new Map(); // email -> user
const localSessions = new Map(); // token -> { userId, expiresAt }

const SESSION_DAYS = 30;

// Firebase demuestra quién es el usuario; esta sesión técnica autoriza las
// operaciones de Firestore de la aplicación sin exponer credenciales Admin.
function sessionExpiry() {
    return Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
}

function defaultPrefs() {
    return {
        favoriteGenres: [],      // máx 3, strings (ej: ["Action", "Drama", "Sci-Fi"])
        likesMovies: null,       // true | false | null
        onboardingDone: false,   // true cuando completó el cuestionario
        nickname: null,          // apodo visible público
        colorTheme: "default"    // default, vibrant, neon, pastel
    };
}

function publicUser(user) {
    const prefs = user.prefs || defaultPrefs();
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        nickname: user.nickname || null,
        photoURL: user.photoURL || null,
        provider: user.provider || (user.passHash ? "password" : "firebase"),
        nickname: prefs.nickname || user.name,
        colorTheme: prefs.colorTheme || "default",
        prefs: prefs
    };
}

function cleanDisplayName(raw, emailFallback) {
    const clean = (raw || "").toString().trim().slice(0, 80);
    if (clean.length >= 2) return clean;
    const prefix = String(emailFallback || "").split("@")[0] || "Usuario";
    return prefix.slice(0, 80) || "Usuario";
}

async function findUserByEmail(email) {
    if (!db) return localUsers.get(email) || null;
    const doc = await db.collection("users").doc(email).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
}

async function findUserByNickname(nickname) {
    if (!db) {
        for (const u of localUsers.values()) {
            if (u.nickname && u.nickname.toLowerCase() === nickname.toLowerCase()) return u;
        }
        return null;
    }
    const query = await db.collection("users").where("nickname", "==", nickname).limit(1).get();
    if (query.empty) return null;
    const doc = query.docs[0];
    return Object.assign({ id: doc.id }, doc.data());
}

async function setUserNickname(userId, nickname) {
    const cleanNickname = nickname.trim().toLowerCase();
    if (cleanNickname.length < 3) {
        const err = new Error("El nickname debe tener al menos 3 caracteres");
        err.code = "INVALID_NICKNAME";
        throw err;
    }
    if (cleanNickname.length > 30) {
        const err = new Error("El nickname no puede superar 30 caracteres");
        err.code = "INVALID_NICKNAME";
        throw err;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanNickname)) {
        const err = new Error("El nickname solo puede contener letras, números y guión bajo");
        err.code = "INVALID_NICKNAME";
        throw err;
    }
    const existing = await findUserByNickname(cleanNickname);
    if (existing && existing.id !== userId) {
        const err = new Error("Ese nickname ya está en uso");
        err.code = "NICKNAME_TAKEN";
        throw err;
    }
    if (!db) {
        const u = localUsers.get(userId);
        if (u) {
            u.nickname = cleanNickname;
            localUsers.set(userId, u);
        }
        return cleanNickname;
    }
    await db.collection("users").doc(userId).set({ nickname: cleanNickname }, { merge: true });
    return cleanNickname;
}

async function createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const session = { userId, createdAt: new Date().toISOString(), expiresAt: sessionExpiry() };
    if (!db) {
        localSessions.set(token, session);
    } else {
        await db.collection("sessions").doc(token).set(session);
    }
    return token;
}

async function readSession(token) {
    if (!token) return null;
    let session = null;
    if (!db) {
        session = localSessions.get(token) || null;
    } else {
        const doc = await db.collection("sessions").doc(token).get();
        if (doc.exists) session = doc.data();
    }
    if (!session) return null;
    if (session.expiresAt && session.expiresAt < Date.now()) {
        await deleteSession(token);
        return null;
    }
    return session;
}

async function deleteSession(token) {
    if (!token) return;
    if (!db) {
        localSessions.delete(token);
    } else {
        try {
            await db.collection("sessions").doc(token).delete();
        } catch (e) {
            /*logout best-effort*/
        }
    }
}

async function updateUserPrefs(userId, prefs) {
    const merged = { ...defaultPrefs(), ...prefs };
    if (!db) {
        const u = localUsers.get(userId);
        if (u) {
            u.prefs = merged;
            localUsers.set(userId, u);
        }
        return merged;
    }
    await db.collection("users").doc(userId).set({ prefs: merged }, { merge: true });
    return merged;
}

const authService = {
    // Recibe el ID token del navegador, lo verifica con Admin y sincroniza el
    // perfil local antes de devolver la sesión técnica de la aplicación.
    loginWithFirebase: async ({ idToken, name }) => {
        const adminAuth = firebaseConn.getAuth();
        if (!adminAuth) {
            const err = new Error("Firebase Auth no configurado en el servidor (faltan credenciales de la cuenta de servicio)");
            err.code = "FIREBASE_NOT_CONFIGURED";
            throw err;
        }
        if (!idToken || typeof idToken !== "string" || idToken.length < 20) {
            const err = new Error("ID token de Firebase requerido");
            err.code = "INVALID_FIREBASE_TOKEN";
            throw err;
        }
        let decoded;
        try {
            decoded = await adminAuth.verifyIdToken(idToken);
        } catch (e) {
            const err = new Error("Sesión de Firebase no válida o caducada. Vuelve a entrar.");
            err.code = "INVALID_FIREBASE_TOKEN";
            throw err;
        }
        const email = String(decoded.email || "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
            const err = new Error("La cuenta de Firebase no tiene un email válido");
            err.code = "INVALID_FIREBASE_TOKEN";
            throw err;
        }
        const provider = (decoded.firebase && decoded.firebase.sign_in_provider) || "firebase";
        const displayName = cleanDisplayName(name || decoded.name, email);

        let user = await findUserByEmail(email);
        if (!user) {
            user = {
                id: email,
                name: displayName,
                email: email,
                passHash: null,
                provider: provider,
                firebaseUid: decoded.uid || null,
                photoURL: decoded.picture || null,
                emailVerified: Boolean(decoded.email_verified),
                prefs: defaultPrefs(),
                createdAt: new Date().toISOString()
            };
            if (!db) {
                localUsers.set(email, user);
            } else {
                await db.collection("users").doc(email).set(user);
            }
        } else {
            // Enlaza cuentas legacy (email+password propio) con Firebase si comparten email.
            const patch = {};
            if (!user.firebaseUid && decoded.uid) patch.firebaseUid = decoded.uid;
            if (!user.provider) patch.provider = user.passHash ? "password" : provider;
            if ((!user.name || user.name.length < 2) && displayName) patch.name = displayName;
            if (!user.photoURL && decoded.picture) patch.photoURL = decoded.picture;
            if (Object.keys(patch).length > 0) {
                Object.assign(user, patch);
                if (!db) {
                    localUsers.set(email, user);
                } else {
                    await db.collection("users").doc(email).set(patch, { merge: true });
                }
            }
        }

        const token = await createSession(user.id);
        return { token, user: publicUser(user) };
    },

    logout: async (token) => {
        await deleteSession(token);
        return true;
    },

    me: async (token) => {
        const session = await readSession(token);
        if (!session) return null;
        let user = null;
        if (!db) {
            for (const u of localUsers.values()) {
                if (u.id === session.userId) {
                    user = u;
                    break;
                }
            }
        } else {
            const doc = await db.collection("users").doc(session.userId).get();
            if (doc.exists) user = Object.assign({ id: doc.id }, doc.data());
        }
        if (!user) {
            await deleteSession(token);
            return null;
        }
        return publicUser(user);
    },

    // Actualiza preferencias (cuestionario onboarding)
    updatePrefs: async (token, prefs) => {
        const session = await readSession(token);
        if (!session) return null;
        const merged = await updateUserPrefs(session.userId, prefs);
        return merged;
    },

    // Actualiza perfil público (nickname, colorTheme)
    updateProfile: async (token, { nickname, colorTheme }) => {
        const session = await readSession(token);
        if (!session) return null;
        const prefs = {};
        if (nickname !== undefined) {
            const clean = String(nickname).trim().slice(0, 30);
            if (clean.length < 2) throw new Error("El apodo debe tener al menos 2 caracteres");
            prefs.nickname = clean;
        }
        if (colorTheme !== undefined) {
            const validThemes = ["default", "vibrant", "neon", "pastel"];
            if (!validThemes.includes(colorTheme)) throw new Error("Tema de color no válido");
            prefs.colorTheme = colorTheme;
        }
        if (Object.keys(prefs).length === 0) return null;
        const merged = await updateUserPrefs(session.userId, prefs);
        return merged;
    },

    // Obtiene perfil público de un usuario por ID
    getPublicProfile: async (userId) => {
        if (!userId) return null;
        let user = null;
        if (!db) {
            for (const u of localUsers.values()) {
                if (u.id === userId) {
                    user = u;
                    break;
                }
            }
        } else {
            const doc = await db.collection("users").doc(userId).get();
            if (doc.exists) user = Object.assign({ id: doc.id }, doc.data());
        }
        if (!user) return null;
        return publicUser(user);
    },

    // Busca usuarios por nombre/apodo (para añadir amigos)
    searchUsers: async (query, currentUserId) => {
        if (!query || !query.trim()) return [];
        const searchTerm = query.trim().toLowerCase();
        let users = [];
        if (!db) {
            for (const u of localUsers.values()) {
                if (u.id !== currentUserId) {
                    users.push(u);
                }
            }
        } else {
            const snapshot = await db.collection("users").get();
            snapshot.forEach((doc) => {
                const u = Object.assign({ id: doc.id }, doc.data());
                if (u.id !== currentUserId) users.push(u);
            });
        }
        return users
            .filter((u) => {
                const name = (u.name || "").toLowerCase();
                const nickname = (u.prefs?.nickname || "").toLowerCase();
                const email = (u.email || "").toLowerCase();
                return name.includes(searchTerm) || nickname.includes(searchTerm) || email.includes(searchTerm);
            })
            .slice(0, 20)
            .map((u) => publicUser(u));
    },

    // Sistema de seguimiento (follow/unfollow)
    followUser: async (token, targetUserId) => {
        const session = await readSession(token);
        if (!session) return null;
        if (session.userId === targetUserId) throw new Error("No puedes seguirte a ti mismo");

        if (!db) {
            const me = localUsers.get(session.userId);
            const target = localUsers.get(targetUserId);
            if (!me || !target) throw new Error("Usuario no encontrado");
            me.following = me.following || [];
            target.followers = target.followers || [];
            if (!me.following.includes(targetUserId)) me.following.push(targetUserId);
            if (!target.followers.includes(session.userId)) target.followers.push(session.userId);
            localUsers.set(session.userId, me);
            localUsers.set(targetUserId, target);
            return { ok: true };
        }

        const meRef = db.collection("users").doc(session.userId);
        const targetRef = db.collection("users").doc(targetUserId);

        await db.runTransaction(async (transaction) => {
            const meDoc = await transaction.get(meRef);
            const targetDoc = await transaction.get(targetRef);
            if (!meDoc.exists || !targetDoc.exists) throw new Error("Usuario no encontrado");

            const meData = meDoc.data();
            const targetData = targetDoc.data();

            const following = meData.following || [];
            const followers = targetData.followers || [];

            if (!following.includes(targetUserId)) {
                following.push(targetUserId);
                transaction.update(meRef, { following });
            }
            if (!followers.includes(session.userId)) {
                followers.push(session.userId);
                transaction.update(targetRef, { followers });
            }
        });
        return { ok: true };
    },

    unfollowUser: async (token, targetUserId) => {
        const session = await readSession(token);
        if (!session) return null;
        if (session.userId === targetUserId) throw new Error("No puedes dejar de seguirte a ti mismo");

        if (!db) {
            const me = localUsers.get(session.userId);
            const target = localUsers.get(targetUserId);
            if (!me || !target) throw new Error("Usuario no encontrado");
            me.following = (me.following || []).filter((id) => id !== targetUserId);
            target.followers = (target.followers || []).filter((id) => id !== session.userId);
            localUsers.set(session.userId, me);
            localUsers.set(targetUserId, target);
            return { ok: true };
        }

        const meRef = db.collection("users").doc(session.userId);
        const targetRef = db.collection("users").doc(targetUserId);

        await db.runTransaction(async (transaction) => {
            const meDoc = await transaction.get(meRef);
            const targetDoc = await transaction.get(targetRef);
            if (!meDoc.exists || !targetDoc.exists) throw new Error("Usuario no encontrado");

            const meData = meDoc.data();
            const targetData = targetDoc.data();

            const following = (meData.following || []).filter((id) => id !== targetUserId);
            const followers = (targetData.followers || []).filter((id) => id !== session.userId);

            transaction.update(meRef, { following });
            transaction.update(targetRef, { followers });
        });
        return { ok: true };
    },

    getFollowing: async (token) => {
        const session = await readSession(token);
        if (!session) return null;
        let user = null;
        if (!db) {
            user = localUsers.get(session.userId);
        } else {
            const doc = await db.collection("users").doc(session.userId).get();
            if (doc.exists) user = Object.assign({ id: doc.id }, doc.data());
        }
        if (!user) return [];

        const followingIds = user.following || [];
        if (followingIds.length === 0) return [];

        let followingUsers = [];
        if (!db) {
            for (const id of followingIds) {
                const u = localUsers.get(id);
                if (u) followingUsers.push(publicUser(u));
            }
        } else {
            const snapshot = await db.collection("users").where("__name__", "in", followingIds).get();
            snapshot.forEach((doc) => {
                followingUsers.push(publicUser(Object.assign({ id: doc.id }, doc.data())));
            });
        }
        return followingUsers;
    },

    getFollowers: async (token) => {
        const session = await readSession(token);
        if (!session) return null;
        let user = null;
        if (!db) {
            user = localUsers.get(session.userId);
        } else {
            const doc = await db.collection("users").doc(session.userId).get();
            if (doc.exists) user = Object.assign({ id: doc.id }, doc.data());
        }
        if (!user) return [];

        const followerIds = user.followers || [];
        if (followerIds.length === 0) return [];

        let followerUsers = [];
        if (!db) {
            for (const id of followerIds) {
                const u = localUsers.get(id);
                if (u) followerUsers.push(publicUser(u));
            }
        } else {
            const snapshot = await db.collection("users").where("__name__", "in", followerIds).get();
            snapshot.forEach((doc) => {
                followerUsers.push(publicUser(Object.assign({ id: doc.id }, doc.data())));
            });
        }
        return followerUsers;
    },

    getUserMovies: async (userId) => {
        if (!userId) return [];
        const { MovieModel } = require("../models/movieModel");
        return MovieModel.getAllMovies(userId);
    },

    isFollowing: async (token, targetUserId) => {
        const session = await readSession(token);
        if (!session) return false;
        let user = null;
        if (!db) {
            user = localUsers.get(session.userId);
        } else {
            const doc = await db.collection("users").doc(session.userId).get();
            if (doc.exists) user = Object.assign({ id: doc.id }, doc.data());
        }
        if (!user) return false;
        return (user.following || []).includes(targetUserId);
    },
    readSession: async (token) => {
        return await readSession(token);
    }

};

module.exports = { authService, findUserByNickname, setUserNickname };