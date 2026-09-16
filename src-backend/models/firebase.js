// Centraliza la conexión a Firestore (firebase-admin v14).
// Prioridad: 1) variables de entorno, 2) firebase-key.json (legacy), 3) modo local.
const path = require("path");
const fs = require("fs");

let db = null;
let mode = "local";

function loadEnvIfNeeded() {
    // server.js ya carga el .env, esto es solo para usos directos (scripts).
    if (process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PRIVATE_KEY) return;
    const envPath = path.join(__dirname, "../../.env");
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

function serviceAccountFromEnv() {
    const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
    if (!projectId || !clientEmail || !privateKey) return null;
    // En el .env la clave viene con \n escapados: hay que convertirlos.
    privateKey = privateKey.replace(/\\n/g, "\n");
    return { projectId, clientEmail, privateKey };
}

function serviceAccountFromFile() {
    const keyPath = path.join(__dirname, "../../firebase-key.json");
    if (!fs.existsSync(keyPath)) return null;
    try {
        return require(keyPath);
    } catch (e) {
        return null;
    }
}

try {
    loadEnvIfNeeded();
    const admin = require("firebase-admin");
    const { getFirestore } = require("firebase-admin/firestore");

    const fromEnv = serviceAccountFromEnv();
    const fromFile = fromEnv ? null : serviceAccountFromFile();
    const serviceAccount = fromEnv || fromFile;

    if (serviceAccount) {
        const apps = typeof admin.getApps === "function" ? admin.getApps() : (admin.apps || []);
        if (apps.length === 0) {
            const credential = typeof admin.cert === "function"
                ? admin.cert(serviceAccount)
                : admin.credential.cert(serviceAccount);
            admin.initializeApp({ credential });
        }
        db = typeof getFirestore === "function" ? getFirestore() : admin.firestore();
        mode = fromEnv ? "firestore-env" : "firestore-file";
        console.log("Firestore conectado (" + (fromEnv ? "variables de entorno" : "firebase-key.json") + ")");
    } else {
        console.warn("Sin credenciales Firebase (ni .env ni firebase-key.json). Modo local (memoria).");
    }
} catch (e) {
    console.warn("Firestore no disponible. Modo local (memoria). Detalle:", e.message);
}

module.exports = {
    getDb: () => db,
    isFirestoreConnected: () => db !== null,
    getMode: () => mode
};
