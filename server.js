// Carga mínima de .env sin dependencias externas (compatible con dotenv si lo instalas).
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");
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
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();
// Si el usuario instala dotenv, también lo usamos (no rompe si no existe).
try {
    require("dotenv").config();
} catch (e) {
    /* dotenv opcional */
}

const express = require("express");
const cors = require("cors");
const movieRoutes = require("./src-backend/routes/movieRoutes");
const seriesRoutes = require("./src-backend/routes/seriesRoutes");
const reviewRoutes = require("./src-backend/routes/reviewRoutes");
const { startDailyEnrichment } = require("./src-backend/services/seasonEnrichmentService");

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 8080;

// Logger mínimo (sin morgan para no añadir dependencias)
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
});

// Cabeceras básicas de seguridad (versión ligera de helmet, sin dependencia)
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Rate-limit de lectura del catálogo: evita bucles accidentales y abusos
// aunque estas rutas ya no consultan directamente la API externa.
const searchHits = new Map();
const seriesSearchHits = new Map();
app.use("/api/movies/search", (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const windowMs = 60 * 1000;
    const hits = (searchHits.get(ip) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    searchHits.set(ip, hits);
    if (searchHits.size > 500) {
        for (const [key, times] of searchHits) {
            if (!times.some((t) => now - t < windowMs)) searchHits.delete(key);
        }
    }
    if (hits.length > 120) {
        return res.status(429).json({ error: "Demasiadas búsquedas. Espera un minuto." });
    }
    next();
});
app.use("/api/series/search", (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const windowMs = 60 * 1000;
    const hits = (seriesSearchHits.get(ip) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    seriesSearchHits.set(ip, hits);
    if (seriesSearchHits.size > 500) {
        for (const [key, times] of seriesSearchHits) {
            if (!times.some((t) => now - t < windowMs)) seriesSearchHits.delete(key);
        }
    }
    if (hits.length > 120) {
        return res.status(429).json({ error: "Demasiadas búsquedas. Espera un minuto." });
    }
    next();
});

app.use("/api", movieRoutes);
app.use("/api", seriesRoutes);

// Anti fuerza bruta en login/registro: 20 intentos por IP y minuto.
const authHits = new Map();
app.use("/api/auth", (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const windowMs = 60 * 1000;
    const hits = (authHits.get(ip) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    authHits.set(ip, hits);
    if (hits.length > 20) {
        return res.status(429).json({ error: "Demasiados intentos. Espera un minuto." });
    }
    next();
});

// Config pública de Firebase para el front (solo claves públicas, sin secretos).
// El front la usa para iniciar Firebase Auth (email+password y Google).
app.get("/api/firebase-config", (req, res) => {
    const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
    const apiKey = (process.env.FIREBASE_API_KEY || "").trim();
    if (!apiKey || !projectId) {
        return res.json({ configured: false });
    }
    res.json({
        configured: true,
        apiKey: apiKey,
        authDomain: (process.env.FIREBASE_AUTH_DOMAIN || (projectId + ".firebaseapp.com")).trim(),
        projectId: projectId,
        storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || (projectId + ".appspot.com")).trim(),
        messagingSenderId: (process.env.FIREBASE_MESSAGING_SENDER_ID || "").trim(),
        appId: (process.env.FIREBASE_APP_ID || "").trim()
    });
});

const authRoutes = require("./src-backend/routes/authRoutes");
app.use("/api", authRoutes);

// Anti-spam de reseñas: 30 escrituras por IP y minuto (lecturas sin límite).
// Debe registrarse ANTES de las rutas para que Express lo ejecute primero.
const reviewWriteHits = new Map();
app.use("/api/reviews", (req, res, next) => {
    if (req.method === "GET") return next();
    const now = Date.now();
    const ip = req.ip || "unknown";
    const windowMs = 60 * 1000;
    const hits = (reviewWriteHits.get(ip) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    reviewWriteHits.set(ip, hits);
    if (reviewWriteHits.size > 500) {
        for (const [key, times] of reviewWriteHits) {
            if (!times.some((t) => now - t < windowMs)) reviewWriteHits.delete(key);
        }
    }
    if (hits.length > 30) {
        return res.status(429).json({ error: "Demasiadas reseñas seguidas. Espera un minuto." });
    }
    next();
});

app.use("/api", reviewRoutes);

// 404 solo para la API (devuelve JSON, no HTML)
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Ruta de API no encontrada" });
});

// Fallback SPA: funciona en Express 4 y 5 (evita app.get("*") que rompe en Express 5)
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Manejador central de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error("Error no controlado:", err);
    res.status(500).json({ error: "Error interno del servidor" });
});

if (!process.env.OMDB_API_KEY) {
    console.warn("AVISO: OMDB_API_KEY no definida. Crea un .env a partir de .env.example");
}

app.listen(PORT, () => {
    console.log(`Servidor arrancado en http://localhost:${PORT}`);
});

// Rellena temporadas/episodios de las series desde OMDb en segundo plano:
// una tanda al arrancar (si hoy no se ha hecho ninguna) y una diaria a la hora
// configurada. No bloquea el servidor. Se controla con las variables
// SEASON_ENRICH_ENABLED, SEASON_ENRICH_DAILY_LIMIT, SEASON_ENRICH_HOUR y
// SEASON_ENRICH_DELAY del .env.
startDailyEnrichment();
