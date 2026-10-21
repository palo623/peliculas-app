const express = require("express");
const router = express.Router();
const { MarathonModel } = require("../models/marathonModel");
const { authService } = require("../services/authService");

// El catálogo de maratones es público (como Películas y Series). El progreso,
// los logros y los marcados necesitan la sesión técnica emitida por authService.
async function authUserOptional(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        return await authService.me(match[1].trim());
    } catch (e) {
        return null;
    }
}

async function requireAuth(req, res) {
    const user = await authUserOptional(req);
    if (!user) res.status(401).json({ error: "Requiere iniciar sesión" });
    return user;
}

function httpStatusFor(error) {
    const code = (error && error.code) || "";
    if (code === "MARATHON_NOT_FOUND" || code === "ITEM_NOT_FOUND") return 404;
    if (code === "MARATHON_LOCKED" || code === "NOT_LAST_WATCHED") return 403;
    return 500;
}

// En el listado no hace falta la sinopsis ni el reparto de cada obra: el front
// sólo pinta carátulas, orden y progreso. Mantiene la respuesta ligera.
function toListItems(items) {
    return items.map((item) => ({
        itemId: item.itemId,
        order: item.order,
        title: item.title,
        year: item.year,
        mediaType: item.mediaType,
        poster: item.poster
    }));
}

function toListMarathon(marathon, summary) {
    return {
        id: marathon.id,
        title: marathon.title,
        kind: marathon.kind,
        description: marathon.description,
        poster: marathon.poster,
        itemCount: marathon.itemCount,
        totalMinutes: marathon.totalMinutes,
        runtimeLabel: marathon.runtimeLabel,
        items: toListItems(marathon.items),
        progress: summary
    };
}

// GET /api/marathons — catálogo completo. Con Bearer incluye progreso, resumen
// global y logros.
router.get("/marathons", async (req, res) => {
    try {
        const me = await authUserOptional(req);
        const marathons = await MarathonModel.loadMarathons();

        if (!me) {
            return res.json({
                marathons: marathons.map((marathon) => toListMarathon(marathon, null)),
                me: null
            });
        }

        // Una sola lectura del progreso del usuario para todo el catálogo.
        const progressByMarathon = await MarathonModel.listProgressForUser(me.id);
        const summaries = new Map(
            marathons.map((marathon) => [
                marathon.id,
                MarathonModel.summarize(marathon, progressByMarathon.get(marathon.id) || null)
            ])
        );
        const achievements = await MarathonModel.getAchievements(me.id, progressByMarathon);

        res.json({
            marathons: marathons.map((marathon) => toListMarathon(marathon, summaries.get(marathon.id) || null)),
            me: { stats: achievements.stats, achievements: achievements.achievements }
        });
    } catch (error) {
        console.error("[marathonRoutes] Error listando maratones:", error.message || error);
        res.status(500).json({ error: "No se pudieron cargar los maratones" });
    }
});

// GET /api/marathons/:id — un maratón con el estado (vista / desbloqueada / con candado).
// El detalle incluye sinopsis y progreso, así que exige sesión: los invitados
// sólo ven el escaparate bloqueado del listado.
router.get("/marathons/:id", async (req, res) => {
    const me = await authUserOptional(req);
    if (!me) return res.status(401).json({ error: "Requiere iniciar sesión" });
    try {
        const detail = await MarathonModel.getMarathonDetail(req.params.id, me.id);
        if (!detail) return res.status(404).json({ error: "Maratón no encontrado" });
        res.json(detail);
    } catch (error) {
        res.status(500).json({ error: "No se pudo cargar el maratón" });
    }
});

// POST /api/marathons/:id/items/:itemId/watched — marca la primera obra pendiente
// como vista. 403 si todavía hay una anterior sin ver.
router.post("/marathons/:id/items/:itemId/watched", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const detail = await MarathonModel.markWatched(user.id, req.params.id, req.params.itemId);
        res.json(detail);
    } catch (error) {
        res.status(httpStatusFor(error)).json({
            error: error.message,
            code: error.code || null
        });
    }
});

// DELETE /api/marathons/:id/items/:itemId/watched — desmarca (sólo la última vista).
router.delete("/marathons/:id/items/:itemId/watched", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const detail = await MarathonModel.unmarkWatched(user.id, req.params.id, req.params.itemId);
        res.json(detail);
    } catch (error) {
        res.status(httpStatusFor(error)).json({
            error: error.message,
            code: error.code || null
        });
    }
});

// DELETE /api/marathons/:id/progress — reinicia el maratón (empieza de cero).
router.delete("/marathons/:id/progress", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
        const detail = await MarathonModel.resetMarathon(user.id, req.params.id);
        res.json(detail);
    } catch (error) {
        res.status(httpStatusFor(error)).json({
            error: error.message,
            code: error.code || null
        });
    }
});

module.exports = router;
