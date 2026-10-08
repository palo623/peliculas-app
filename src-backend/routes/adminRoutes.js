// API de administración (vista de administrador).
//
// Todas las rutas exigen sesión Bearer con rol "admin"; el rol se guarda en el
// documento del usuario en Firestore (ver authService). Un usuario normal recibe
// 403 y sin sesión 401, así que las funciones administrativas quedan ocultas y
// protegidas también en el servidor, no solo en la interfaz.
//
// Rutas (prefijo /api/admin):
//   GET    /health                     estado + proveedor de sentimiento
//   GET    /summary                    panel resumen (tarea 14)
//   GET    /users                      listado de usuarios con filtro por rol
//   PUT    /users/:id/role             cambiar rol admin/user (tarea 1)
//   GET    /catalog/search             buscador de películas y series (tarea 4)
//   GET    /catalog/item               ficha de una obra concreta (tarea 5)
//   GET    /catalog/genres             géneros disponibles para el filtro (tarea 10)
//   GET    /reviews                    listar/filtrar reseñas (tareas 6 y 10)
//   DELETE /reviews/:id                borrar cualquier reseña (tarea 6)
//   POST   /reviews/analyze            clasificar sentimiento con IA (tarea 7)
//   GET    /stats/media                estadísticas de una obra (tarea 8)
//   GET    /stats/genres               estadísticas por género (tarea 11)

const express = require("express");
const router = express.Router();
const { authService, isAdminUser } = require("../services/authService");
const { adminService } = require("../services/adminService");
const { ReviewModel } = require("../models/reviewModel");
const firebaseConn = require("../models/firebase");
const catalog = require("../services/catalogService");

// Valida la sesión y exige rol admin. Deja el usuario en req.adminUser.
async function requireAdmin(req, res, next) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ error: "Requiere iniciar sesión" });
    }
    let user = null;
    try {
        user = await authService.me(match[1].trim());
    } catch (e) {
        user = null;
    }
    if (!user) {
        return res.status(401).json({ error: "Sesión no válida" });
    }
    if (!isAdminUser(user)) {
        return res.status(403).json({ error: "Solo los administradores pueden acceder a esta sección" });
    }
    req.adminUser = user;
    next();
}

function statusFor(error) {
    const msg = String((error && error.message) || "");
    if (/no encontrad/i.test(msg)) return 404;
    if (/inválido|falta|usa 'admin'|debe ser|imdbID|mediaType|año|demasiado/i.test(msg)) return 400;
    return 500;
}

function sendError(res, error) {
    if (error && error.code === "NOT_LOCAL_MODE") return res.status(400).json({ error: error.message });
    res.status(statusFor(error)).json({ error: (error && error.message) || "Error interno del servidor" });
}

// Todo lo que cuelga de /api/admin pasa primero por requireAdmin.
router.use("/admin", requireAdmin);

router.get("/admin/health", async (req, res) => {
    res.json({
        ok: true,
        admin: { id: req.adminUser.id, name: req.adminUser.name },
        firestore: firebaseConn.isFirestoreConnected(),
        sentiment: adminService.sentimentInfo(),
        timestamp: new Date().toISOString()
    });
});

// Panel resumen (tarea 14): totales y últimas reseñas.
router.get("/admin/summary", async (req, res) => {
    try {
        res.json(await adminService.summary({ latest: req.query.latest }));
    } catch (error) {
        sendError(res, error);
    }
});

// Usuarios (tarea 1: gestionar roles).
router.get("/admin/users", async (req, res) => {
    try {
        res.json(await authService.listUsers({
            q: req.query.q,
            role: req.query.role,
            page: req.query.page,
            limit: req.query.limit
        }));
    } catch (error) {
        sendError(res, error);
    }
});

router.put("/admin/users/:id/role", async (req, res) => {
    try {
        const role = req.body && req.body.role;
        const targetId = String(req.params.id || "").trim().toLowerCase();
        if (role === undefined || role === null) {
            return res.status(400).json({ error: "Falta 'role' (\"admin\" o \"user\")" });
        }
        // Evita que un administrador se quite a sí mismo el acceso por error.
        if (targetId === String(req.adminUser.id).toLowerCase() && String(role).trim().toLowerCase() !== "admin") {
            return res.status(409).json({ error: "No puedes quitarte a ti mismo el rol de administrador" });
        }
        const user = await authService.setRole(targetId, role);
        if (!user) return res.status(404).json({ error: "El usuario no existe" });
        res.json({ ok: true, user });
    } catch (error) {
        sendError(res, error);
    }
});

// Buscador de catálogo (tarea 4). Integra el catálogo ya existente en Firestore
// (colecciones "movies" y "series") sin llamar a ninguna API externa.
router.get("/admin/catalog/search", async (req, res) => {
    try {
        res.json(await catalog.searchCatalog({
            query: req.query.s || req.query.q,
            type: req.query.type,
            genre: req.query.genre,
            page: req.query.page,
            limit: req.query.limit
        }));
    } catch (error) {
        sendError(res, error);
    }
});

// Géneros disponibles para el selector de la vista admin (tarea 10).
router.get("/admin/catalog/genres", async (req, res) => {
    try {
        const genres = await catalog.listGenres();
        res.json({ results: genres, totalResults: genres.length });
    } catch (error) {
        sendError(res, error);
    }
});

// Ficha completa de una obra (tarea 5).
router.get("/admin/catalog/item", async (req, res) => {
    try {
        const item = await catalog.findCatalogItem({
            mediaType: req.query.mediaType || req.query.type,
            imdbID: req.query.imdbID || req.query.i,
            title: req.query.title || req.query.t,
            year: req.query.year || req.query.y,
            mediaKey: req.query.mediaKey
        });
        if (!item) return res.status(404).json({ error: "Obra no encontrada en el catálogo" });
        res.json(item);
    } catch (error) {
        sendError(res, error);
    }
});

// Listar y filtrar reseñas (tareas 6 y 10).
router.get("/admin/reviews", async (req, res) => {
    try {
        res.json(await adminService.listReviews({
            mediaType: req.query.mediaType || req.query.type,
            imdbID: req.query.imdbID || req.query.i,
            title: req.query.title || req.query.t,
            year: req.query.year || req.query.y,
            mediaKey: req.query.mediaKey,
            genre: req.query.genre,
            sentiment: req.query.sentiment,
            q: req.query.q,
            sort: req.query.sort,
            page: req.query.page,
            limit: req.query.limit
        }));
    } catch (error) {
        sendError(res, error);
    }
});

// Compatibilidad con el panel del equipo: mismo endpoint y misma forma de
// respuesta (avgScore, avgMagnitude, labelCounts y distribución por bandas).
// GET /api/admin/reviews/sentiment?mediaType=movie&imdbID=tt0111161
router.get("/admin/reviews/sentiment", async (req, res) => {
    try {
        res.json(await adminService.sentimentAnalysisForMedia({
            mediaType: req.query.mediaType || req.query.type,
            imdbID: req.query.imdbID || req.query.i,
            title: req.query.title || req.query.t,
            year: req.query.year || req.query.y,
            mediaKey: req.query.mediaKey
        }));
    } catch (error) {
        sendError(res, error);
    }
});

// Clasificación por lotes. El análisis lo hace SIEMPRE el servidor: cualquier
// "sentiment" que mande el cliente se ignora (antes se guardaba tal cual).
// Acepta { ids: [...] } o el formato del front { reviews: [{ reviewId }] }.
router.post("/admin/reviews/sentiment/batch", async (req, res) => {
    try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        let ids = [];
        if (Array.isArray(body.ids)) ids = body.ids;
        else if (Array.isArray(body.reviews)) ids = body.reviews.map((r) => r && (r.reviewId || r.id)).filter(Boolean);
        ids = ids.map((id) => String(id));
        if (ids.length === 0) {
            return res.status(400).json({ error: "Se requiere 'ids' o 'reviews' con reviewId" });
        }
        const results = [];
        for (const reviewId of ids) {
            try {
                const sentiment = await adminService.analyzeOne(reviewId, { useAI: body.useAI });
                results.push({ reviewId, ok: true, sentiment });
            } catch (e) {
                results.push({ reviewId, ok: false, error: e.message });
            }
        }
        res.json({ results, provider: adminService.sentimentInfo() });
    } catch (error) {
        sendError(res, error);
    }
});

// Borrar cualquier reseña (tarea 6). Se pide confirmación en el front.
router.delete("/admin/reviews/:id", async (req, res) => {
    try {
        const deleted = await ReviewModel.removeAsAdmin(req.params.id);
        if (!deleted) return res.status(404).json({ error: "Reseña no encontrada" });
        res.json({ ok: true, id: req.params.id });
    } catch (error) {
        sendError(res, error);
    }
});

// Clasificar el sentimiento de las reseñas pendientes (tarea 7).
// Body opcional: { mediaKey?, ids?, limit?, force?, useAI? }
router.post("/admin/reviews/analyze", async (req, res) => {
    try {
        const body = req.body && typeof req.body === "object" ? req.body : {};
        res.json(await adminService.analyzeReviews({
            mediaKey: body.mediaKey,
            ids: body.ids,
            limit: body.limit,
            force: body.force === true,
            useAI: body.useAI
        }));
    } catch (error) {
        sendError(res, error);
    }
});

// Estadísticas de una obra concreta (tarea 8).
router.get("/admin/stats/media", async (req, res) => {
    try {
        res.json(await adminService.statsByMedia({
            mediaType: req.query.mediaType || req.query.type,
            imdbID: req.query.imdbID || req.query.i,
            title: req.query.title || req.query.t,
            year: req.query.year || req.query.y,
            mediaKey: req.query.mediaKey
        }));
    } catch (error) {
        sendError(res, error);
    }
});

// Estadísticas globales por género (tarea 11).
router.get("/admin/stats/genres", async (req, res) => {
    try {
        res.json(await adminService.statsByGenre({ genre: req.query.genre }));
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;
