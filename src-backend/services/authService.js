// Auth con scrypt (nativo de Node, sin dependencias) + sesiones con token.
// Persiste en Firestore si hay firebase-key.json; si no, en memoria
// (en modo local los usuarios se pierden al reiniciar el servidor).
const crypto = require("crypto");

let db = null;

try {
    const admin = require("firebase-admin");
    const path = require("path");
    const fs = require("fs");
    const keyPath = path.join(__dirname, "../../firebase-key.json");

    if (fs.existsSync(keyPath)) {
        try {
            const serviceAccount = require(keyPath);
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            db = admin.firestore();
        } catch (e) {
            console.warn("[auth] firebase-key.json inválido. Usuarios en memoria.");
        }
    }
} catch (e) {
    console.warn("[auth] firebase-admin no disponible. Usuarios en memoria.");
}

// Memoria para modo local.
const localUsers = new Map(); // email -> user
const localSessions = new Map(); // token -> { userId, expiresAt }

const SESSION_DAYS = 30;

function sessionExpiry() {
    return Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
}

function validateName(name) {
    const clean = (name || "").toString().trim();
    if (clean.length < 2) throw new Error("El nombre debe tener al menos 2 caracteres");
    if (clean.length > 80) throw new Error("El nombre es demasiado largo");
    return clean;
}

function validateEmail(email) {
    const clean = (email || "").toString().trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
        throw new Error("El email no es válido");
    }
    if (clean.length > 160) throw new Error("El email es demasiado largo");
    return clean;
}

function validatePassword(password) {
    const pass = (password || "").toString();
    if (pass.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    if (pass.length > 200) throw new Error("La contraseña es demasiado larga");
    return pass;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return salt + ":" + hash;
}

function verifyPassword(password, stored) {
    const parts = String(stored || "").split(":");
    if (parts.length !== 2) return false;
    const hash = crypto.scryptSync(password, parts[0], 64);
    const expected = Buffer.from(parts[1], "hex");
    if (hash.length !== expected.length) return false;
    return crypto.timingSafeEqual(hash, expected);
}

function defaultPrefs() {
    return {
        favoriteGenres: [],      // máx 3, strings (ej: ["Action", "Drama", "Sci-Fi"])
        likesSeries: null,       // true | false | null
        likesMovies: null,       // true | false | null
        likesMiniseries: null,   // true | false | null
        onboardingDone: false    // true cuando completó el cuestionario
    };
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        prefs: user.prefs || defaultPrefs()
    };
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
    register: async ({ name, email, password, prefs }) => {
        const cleanName = validateName(name);
        const cleanEmail = validateEmail(email);
        const cleanPassword = validatePassword(password);

        const existing = await findUserByEmail(cleanEmail);
        if (existing) {
            const err = new Error("Ese email ya está registrado. Prueba a entrar.");
            err.code = "DUPLICATE";
            throw err;
        }

        const user = {
            id: cleanEmail,
            name: cleanName,
            email: cleanEmail,
            passHash: hashPassword(cleanPassword),
            prefs: prefs || defaultPrefs(),
            createdAt: new Date().toISOString()
        };

        if (!db) {
            localUsers.set(cleanEmail, user);
        } else {
            await db.collection("users").doc(cleanEmail).set(user);
        }

        const token = await createSession(user.id);
        return { token, user: publicUser(user) };
    },

    login: async ({ email, password }) => {
        const cleanEmail = validateEmail(email);
        const pass = (password || "").toString();

        const user = await findUserByEmail(cleanEmail);
        if (!user || !verifyPassword(pass, user.passHash)) {
            const err = new Error("Email o contraseña incorrectos");
            err.code = "INVALID_CREDENTIALS";
            throw err;
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
    }
};

module.exports = { authService };