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
        onboardingDone: false    // true cuando completó el cuestionario
    };
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL || null,
        provider: user.provider || (user.passHash ? "password" : "firebase"),
        prefs: user.prefs || defaultPrefs(),
        top5: Array.isArray(user.top5) ? user.top5 : []
    };
}

// Errores con código para que las rutas traduzcan a 400/403/404/409.
function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function normalizeUserId(value) {
    return String(value || "").trim().toLowerCase();
}

// Perfil mínimo para listas (búsqueda, amigos): sin prefs ni datos sensibles.
function cardUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL || null,
        provider: user.provider || (user.passHash ? "password" : "firebase")
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

async function getUserById(userId) {
    const id = normalizeUserId(userId);
    if (!id) return null;
    if (!db) {
        for (const u of localUsers.values()) {
            if (normalizeUserId(u.id) === id) return u;
        }
        return null;
    }
    const doc = await db.collection("users").doc(id).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
}

function cleanTop5Item(item) {
    if (!item || typeof item !== "object") {
        throw codedError("BAD_REQUEST", "Cada favorita del Top 5 debe ser un objeto");
    }
    const title = String(item.title || "").trim().slice(0, 200);
    const imdbID = String(item.imdbID || "").trim();
    if (!title && !imdbID) {
        throw codedError("BAD_REQUEST", "Cada favorita necesita 'title' o 'imdbID'");
    }
    if (imdbID && !/^tt\d+$/i.test(imdbID)) {
        throw codedError("BAD_REQUEST", "IMDb ID inválido en el Top 5");
    }
    const type = String(item.type || "movie").toLowerCase().trim();
    if (type !== "movie" && type !== "series") {
        throw codedError("BAD_REQUEST", "Tipo inválido en el Top 5 (solo movie o series)");
    }
    return {
        movieId: String(item.movieId || "").trim().slice(0, 300) || null,
        imdbID: imdbID || null,
        title: title || imdbID,
        year: String(item.year || "").trim().slice(0, 9) || null,
        poster: String(item.poster || "").trim().slice(0, 500) || null,
        type
    };
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

    // Devuelve el usuario completo por id (email). Null si no existe.
    getById: async (userId) => {
        return getUserById(userId);
    },

    // Busca usuarios por nombre o email para añadir amigos. Excluye al propio usuario.
    searchUsers: async (query, opts) => {
        const q = String(query || "").trim().toLowerCase();
        if (q.length < 2) {
            throw codedError("BAD_REQUEST", "La búsqueda necesita al menos 2 caracteres");
        }
        if (q.length > 80) {
            throw codedError("BAD_REQUEST", "El texto de búsqueda es demasiado largo");
        }
        const options = opts || {};
        const excludeId = normalizeUserId(options.excludeId);
        const max = Math.min(Math.max(Number.parseInt(options.limit, 10) || 20, 1), 50);
        let users = [];
        if (!db) {
            users = [...localUsers.values()];
        } else {
            const snapshot = await db.collection("users").limit(200).get();
            snapshot.forEach((doc) => {
                users.push(Object.assign({ id: doc.id }, doc.data()));
            });
        }
        return users
            .filter((u) => {
                if (!u || !u.id || normalizeUserId(u.id) === excludeId) return false;
                const haystack = (String(u.name || "") + " " + String(u.email || "")).toLowerCase();
                return haystack.includes(q);
            })
            .slice(0, max)
            .map(cardUser);
    },

    // Top 5 de favoritas. Se guarda como referencias ligeras en users/{email}.top5
    // (imdbID/title/year/poster/type) para reutilizar las películas ya guardadas
    // sin duplicar su ficha completa.
    getTop5: async (userId) => {
        const user = await getUserById(userId);
        if (!user) {
            throw codedError("NOT_FOUND", "Usuario no encontrado");
        }
        return Array.isArray(user.top5) ? user.top5 : [];
    },

    setTop5: async (userId, items) => {
        const id = normalizeUserId(userId);
        if (!id) {
            throw codedError("BAD_REQUEST", "Falta el usuario");
        }
        if (!Array.isArray(items)) {
            throw codedError("BAD_REQUEST", "El Top 5 debe ser un array");
        }
        if (items.length > 5) {
            throw codedError("BAD_REQUEST", "El Top 5 admite como máximo 5 películas");
        }
        const cleaned = items.map(cleanTop5Item);
        const seen = new Set();
        const unique = [];
        for (const item of cleaned) {
            const key = String(item.imdbID || item.title).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({ ...item, addedAt: new Date().toISOString() });
        }
        const stamp = new Date().toISOString();
        if (!db) {
            const user = await getUserById(id);
            if (!user) {
                throw codedError("NOT_FOUND", "Usuario no encontrado");
            }
            user.top5 = unique;
            user.top5UpdatedAt = stamp;
            localUsers.set(user.email || user.id, user);
        } else {
            const doc = await db.collection("users").doc(id).get();
            if (!doc.exists) {
                throw codedError("NOT_FOUND", "Usuario no encontrado");
            }
            await db.collection("users").doc(id).set({ top5: unique, top5UpdatedAt: stamp }, { merge: true });
        }
        return unique;
    },

};

module.exports = { authService, publicUser, cardUser };