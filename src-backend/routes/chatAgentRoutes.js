const express = require("express");
const router = express.Router();
const { authService } = require("../services/authService");
const { processChat } = require("../services/chatAgentService");

function tokenFromHeader(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

async function authUser(req) {
    const token = tokenFromHeader(req);
    if (!token) return null;
    try {
        return await authService.me(token);
    } catch (e) {
        return null;
    }
}

router.post("/chat-agent", async (req, res) => {
    try {
        const body = req.body || {};
        const messages = Array.isArray(body.messages) ? body.messages : [];

        if (messages.length === 0) {
            return res.status(400).json({ error: "Se requiere al menos un mensaje" });
        }

        const user = await authUser(req);
        const userId = user ? user.id : null;

        const reply = await processChat(messages, userId);
        res.json({ reply });
    } catch (error) {
        console.error("[ChatAgent] Error:", error);
        res.status(500).json({ error: "Error procesando el chat" });
    }
});

module.exports = router;