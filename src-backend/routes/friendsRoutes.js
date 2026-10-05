// src-backend/routes/friendsRoutes.js
const express = require("express");
const router = express.Router();
const { FriendshipModel } = require("../models/friendshipModel");
const { authService } = require("../services/authService");

async function authUser(req) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    try { return await authService.me(match[1].trim()); } catch (e) { return null; }
}

function sendError(res, err) {
    const status = err.message.includes("No autorizado") ? 403 :
                   err.message.includes("no encontrad") ? 404 :
                   err.message.includes("Ya son amigos") || err.message.includes("ya enviad") ? 409 : 400;
    res.status(status).json({ error: err.message });
}

// POST /api/friends/request  { toUid }
router.post("/friends/request", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const { toUid } = req.body;
        if (!toUid) return res.status(400).json({ error: "Falta toUid" });
        const result = await FriendshipModel.sendRequest(user.id, toUid);
        res.json({ ok: true, ...result });
    } catch (e) { sendError(res, e); }
});

// POST /api/friends/accept  { friendshipId }
router.post("/friends/accept", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const { friendshipId } = req.body;
        const result = await FriendshipModel.acceptRequest(friendshipId, user.id);
        res.json({ ok: true, ...result });
    } catch (e) { sendError(res, e); }
});

// POST /api/friends/reject  { friendshipId }
router.post("/friends/reject", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const { friendshipId } = req.body;
        const result = await FriendshipModel.rejectRequest(friendshipId, user.id);
        res.json({ ok: true, ...result });
    } catch (e) { sendError(res, e); }
});

// DELETE /api/friends/:friendshipId
router.delete("/friends/:friendshipId", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const result = await FriendshipModel.removeFriend(req.params.friendshipId, user.id);
        res.json({ ok: true, ...result });
    } catch (e) { sendError(res, e); }
});

// GET /api/friends
router.get("/friends", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const friends = await FriendshipModel.getFriends(user.id);
        res.json({ friends });
    } catch (e) { sendError(res, e); }
});

// GET /api/friends/requests/received
router.get("/friends/requests/received", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const requests = await FriendshipModel.getReceivedRequests(user.id);
        res.json({ requests });
    } catch (e) { sendError(res, e); }
});

// GET /api/friends/requests/sent
router.get("/friends/requests/sent", async (req, res) => {
    try {
        const user = await authUser(req);
        if (!user) return res.status(401).json({ error: "Requiere login" });
        const requests = await FriendshipModel.getSentRequests(user.id);
        res.json({ requests });
    } catch (e) { sendError(res, e); }
});

module.exports = router;