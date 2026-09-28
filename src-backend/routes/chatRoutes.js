// API de chat entre amigos.
// Todas las operaciones requieren autenticación (Bearer token).
// Solo amigos pueden acceder a conversaciones y enviar mensajes.
const express = require("express");
const router = express.Router();
const { ChatModel } = require("../models/chatModel");
const { authService } = require("../services/authService");
const { FriendshipModel } = require("../models/friendshipModel");

async function authUser(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try {
        return await authService.me(match[1].trim());
    } catch (e) {
        return null;
    }
}

function statusFor(error) {
    if (error && error.code === "BAD_REQUEST") return 400;
    if (error && error.code === "FORBIDDEN") return 403;
    if (error && error.code === "NOT_FOUND") return 404;
    if (error && error.code === "CONFLICT") return 409;
    const msg = (error && error.message) || "";
    if (/ya no sois amigos|no eres participante|no son amigos|consigo mismo/i.test(msg)) return 403;
    if (/no encontrad|no existe/i.test(msg)) return 404;
    if (/inválido|falta|vacío|demasiado largo|caracteres|obligatorio/i.test(msg)) return 400;
    return 500;
}

function sendError(res, error) {
    res.status(statusFor(error)).json({ error: (error && error.message) || "Error interno del servidor" });
}

// GET /api/chats — lista mis conversaciones (con lastMessage).
router.get("/chats", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const chats = await ChatModel.listUserChats(user.id);
        res.json({ results: chats, totalResults: chats.length });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/chats/:friendId — obtiene/crea conversación con un amigo.
router.get("/chats/:friendId", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const friendId = String(req.params.friendId || "").trim().toLowerCase();
        if (!friendId) {
            return res.status(400).json({ error: "Falta el parámetro friendId" });
        }
        if (friendId === user.id.toLowerCase()) {
            return res.status(400).json({ error: "No puedes crear un chat contigo mismo" });
        }
        // Verificar que el amigo existe
        const friend = await authService.getById(friendId);
        if (!friend) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        // Verificar amistad
        const areFriends = await FriendshipModel.areFriends(user.id, friendId);
        if (!areFriends) {
            return res.status(403).json({ error: "Solo los amigos pueden iniciar un chat" });
        }
        const chat = await ChatModel.getOrCreateChat(user.id, friendId);
        res.json({ ok: true, chat });
    } catch (error) {
        sendError(res, error);
    }
});

// GET /api/chats/:friendId/messages — historial de mensajes con amigo.
router.get("/chats/:friendId/messages", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const friendId = String(req.params.friendId || "").trim().toLowerCase();
        if (!friendId) {
            return res.status(400).json({ error: "Falta el parámetro friendId" });
        }
        if (friendId === user.id.toLowerCase()) {
            return res.status(400).json({ error: "No puedes consultar mensajes contigo mismo" });
        }
        // Verificar que el amigo existe
        const friend = await authService.getById(friendId);
        if (!friend) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        // Verificar amistad (para leer historial también deben ser amigos)
        const areFriends = await FriendshipModel.areFriends(user.id, friendId);
        if (!areFriends) {
            return res.status(403).json({ error: "Solo los amigos pueden ver el historial" });
        }
        const chatId = ChatModel.makeChatId(user.id, friendId);
        const messages = await ChatModel.getMessages(chatId, user.id, {
            limit: req.query.limit,
            before: req.query.before
        });
        res.json({ results: messages, totalResults: messages.length });
    } catch (error) {
        sendError(res, error);
    }
});

// POST /api/chats/:friendId/messages — envía un mensaje al amigo.
router.post("/chats/:friendId/messages", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) {
            return res.status(401).json({ error: "Requiere iniciar sesión" });
        }
        const friendId = String(req.params.friendId || "").trim().toLowerCase();
        if (!friendId) {
            return res.status(400).json({ error: "Falta el parámetro friendId" });
        }
        if (friendId === user.id.toLowerCase()) {
            return res.status(400).json({ error: "No puedes enviarte un mensaje a ti mismo" });
        }
        // Validar body
        const body = req.body || {};
        if (typeof body !== "object") {
            return res.status(400).json({ error: "Cuerpo de petición inválido" });
        }
        const text = String(body.text || "").trim();
        if (!text) {
            return res.status(400).json({ error: "El texto del mensaje es obligatorio" });
        }
        if (text.length > 4000) {
            return res.status(400).json({ error: "El mensaje es demasiado largo (máx. 4000 caracteres)" });
        }
        // Verificar que el amigo existe
        const friend = await authService.getById(friendId);
        if (!friend) {
            return res.status(404).json({ error: "El usuario no existe" });
        }
        // Verificar amistad
        const areFriends = await FriendshipModel.areFriends(user.id, friendId);
        if (!areFriends) {
            return res.status(403).json({ error: "Solo los amigos pueden enviarse mensajes" });
        }
        // Obtener/crear chat y enviar mensaje
        const chat = await ChatModel.getOrCreateChat(user.id, friendId);
        const message = await ChatModel.addMessage(chat.id, user.id, text);
        res.status(201).json({ ok: true, message });
    } catch (error) {
        sendError(res, error);
    }
});

module.exports = router;