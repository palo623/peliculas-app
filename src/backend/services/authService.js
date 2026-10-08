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

// ---- Roles (tarea 1: sistema de roles Admin/User) ----
// Solo existen dos roles: "user" (por defecto) y "admin".
function normalizeRole(raw) {
    return String(raw || "").trim().toLowerCase() === "admin" ? "admin" : "user";
}

// ADMIN_EMAILS="admin@x.com,otro@y.com" en el .env: esas cuentas reciben rol
// admin al entrar. Permite crear al primer administrador sin tocar Firestore.
function bootstrapAdminEmails() {
    return new Set(
        String(process.env.ADMIN_EMAILS || "")
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean)
    );
}

function roleForNewUser(email) {
    return bootstrapAdminEmails().has(String(email || "").trim().toLowerCase()) ? "admin" : "user";
}

function isAdminUser(user) {
    return Boolean(user) && normalizeRole(user.role) === "admin";
}

function publicUser(user) {
    const role = normalizeRole(user.role);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL || null,
        provider: user.provider || (user.passHash ? "password" : "firebase"),
        role,
        isAdmin: role === "admin",
        prefs: user.prefs || defaultPrefs()
    };
}

// Tarjeta pública mínima de otro usuario (la usan las rutas de amistades).
function cardUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        photoURL: user.photoURL || null,
        provider: user.provider || null,
        role: normalizeRole(user.role)
    };
}

// Hasta 5 favoritas por usuario: { movieId?, imdbID?, title, year?, poster?, type? }.
function validateTop5(items) {
    if (!Array.isArray(items)) throw new Error("'top5' debe ser un array");
    const out = [];
    for (const raw of items.slice(0, 5)) {
        if (!raw || typeof raw !== "object") continue;
        const title = String(raw.title || "").trim();
        if (!title) continue;
        out.push({
            movieId: raw.movieId ? String(raw.movieId).slice(0, 160) : null,
            imdbID: raw.imdbID ? String(raw.imdbID).slice(0, 20) : null,
            title: title.slice(0, 200),
            year: raw.year ? String(raw.year).slice(0, 4) : null,
            poster: raw.poster ? String(raw.poster).slice(0, 500) : null,
            type: raw.type ? String(raw.type).slice(0, 20) : null
        });
    }
    return out;
}

async function listStoredUsers() {
    if (!db) return [...localUsers.values()];
    const snapshot = await db.collection("users").limit(5000).get();
    return snapshot.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
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
                role: roleForNewUser(email),
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
            // Backfill de rol para cuentas creadas antes de existir roles.
            if (!user.role) patch.role = roleForNewUser(email);
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

    // ---- Usuarios (amistades, Top 5 y administración) ----

    getById: async (id) => {
        const key = String(id || "").trim().toLowerCase();
        if (!key) return null;
        if (!db) {
            if (localUsers.has(key)) return localUsers.get(key);
            for (const user of localUsers.values()) {
                if (String(user.id || "").toLowerCase() === key) return user;
            }
            return null;
        }
        const doc = await db.collection("users").doc(key).get();
        if (!doc.exists) return null;
        return Object.assign({ id: doc.id }, doc.data());
    },

    // Busca usuarios por nombre o email (para añadir amigos).
    searchUsers: async (query, { excludeId, limit } = {}) => {
        const q = String(query || "").trim().toLowerCase();
        const max = Math.min(Math.max(Number.parseInt(limit, 10) || 10, 1), 50);
        const exclude = excludeId ? String(excludeId).trim().toLowerCase() : null;
        const users = await listStoredUsers();
        return users
            .filter((user) => user && user.id)
            .filter((user) => String(user.id).toLowerCase() !== exclude)
            .filter((user) => {
                if (!q) return true;
                return String(user.name || "").toLowerCase().includes(q)
                    || String(user.email || "").toLowerCase().includes(q)
                    || String(user.id).toLowerCase().includes(q);
            })
            .slice(0, max)
            .map(cardUser);
    },

    // Listado paginado de usuarios para el panel de administración.
    listUsers: async ({ q, role, page, limit } = {}) => {
        const query = String(q || "").trim().toLowerCase();
        const wantedRole = role ? normalizeRole(role) : null;
        const pageNum = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 1000);
        const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
        const users = await listStoredUsers();
        const filtered = users.filter((user) => {
            if (!user || !user.id) return false;
            if (wantedRole && normalizeRole(user.role) !== wantedRole) return false;
            if (!query) return true;
            return String(user.name || "").toLowerCase().includes(query)
                || String(user.email || "").toLowerCase().includes(query)
                || String(user.id).toLowerCase().includes(query);
        });
        filtered.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "es"));
        const byRole = filtered.reduce((acc, user) => {
            const key = normalizeRole(user.role);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, { admin: 0, user: 0 });
        const start = (pageNum - 1) * pageSize;
        return {
            results: filtered.slice(start, start + pageSize).map(publicUser),
            total: filtered.length,
            page: pageNum,
            limit: pageSize,
            byRole
        };
    },

    countUsers: async () => {
        if (!db) return localUsers.size;
        try {
            const snap = await db.collection("users").count().get();
            return snap.data().count;
        } catch (e) {
            const snap = await db.collection("users").limit(5000).get();
            return snap.size;
        }
    },

    // Cambia el rol de un usuario (solo lo llaman las rutas de admin).
    setRole: async (id, role) => {
        const key = String(id || "").trim().toLowerCase();
        if (!key) throw new Error("Falta el usuario");
        const clean = String(role || "").trim().toLowerCase();
        if (clean !== "admin" && clean !== "user") throw new Error("Rol inválido (usa 'admin' o 'user')");
        const user = await authService.getById(key);
        if (!user) return null;
        if (!db) {
            user.role = clean;
            localUsers.set(key, user);
        } else {
            await db.collection("users").doc(key).set({ role: clean }, { merge: true });
        }
        return publicUser({ ...user, role: clean });
    },

    getTop5: async (id) => {
        const user = await authService.getById(id);
        if (!user || !Array.isArray(user.top5)) return [];
        return user.top5;
    },

    setTop5: async (id, items) => {
        const key = String(id || "").trim().toLowerCase();
        if (!key) throw new Error("Falta el usuario");
        const clean = validateTop5(items);
        if (!db) {
            const user = localUsers.get(key);
            if (!user) return [];
            user.top5 = clean;
            localUsers.set(key, user);
            return clean;
        }
        await db.collection("users").doc(key).set({ top5: clean }, { merge: true });
        return clean;
    },

    // ---- Ayuda para desarrollo/pruebas ----
    // Crea (o reutiliza) un usuario local y una sesión sin Firebase. Solo
    // funciona en modo local: con Firestore conectado lanza NOT_LOCAL_MODE.
    seedLocalUser: async ({ email, name, role } = {}) => {
        if (db) {
            const err = new Error("seedLocalUser solo está disponible en modo local (sin Firestore)");
            err.code = "NOT_LOCAL_MODE";
            throw err;
        }
        const cleanEmail = String(email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) throw new Error("Email inválido");
        const existing = localUsers.get(cleanEmail);
        const user = existing || {
            id: cleanEmail,
            name: String(name || cleanEmail.split("@")[0]).slice(0, 80),
            email: cleanEmail,
            passHash: null,
            provider: "local",
            prefs: defaultPrefs(),
            createdAt: new Date().toISOString()
        };
        if (name) user.name = String(name).slice(0, 80);
        user.role = role ? normalizeRole(role) : normalizeRole(user.role || roleForNewUser(cleanEmail));
        localUsers.set(cleanEmail, user);
        const token = await createSession(user.id);
        return { token, user: publicUser(user) };
    }
};

module.exports = { authService, cardUser, isAdminUser };