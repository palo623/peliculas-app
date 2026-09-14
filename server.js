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

// Rate-limit muy simple solo para búsqueda (protege la cuota gratuita de OMDb).
// Máx 30 búsquedas por IP y minuto.
const searchHits = new Map();
app.use("/api/movies/search", (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const windowMs = 60 * 1000;
    const hits = (searchHits.get(ip) || []).filter((t) => now - t < windowMs);
    hits.push(now);
    searchHits.set(ip, hits);
    if (hits.length > 30) {
        return res.status(429).json({ error: "Demasiadas búsquedas. Espera un minuto." });
    }
    next();
});

app.use("/api", movieRoutes);

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
