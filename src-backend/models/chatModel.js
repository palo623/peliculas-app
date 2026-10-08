// Modelo de chat entre amigos.
// Usa la colección "chats" de Firestore y una subcolección "messages" por chat.
// En modo local usa Map en memoria.
// El chatId es determinista: "chat_<email1>__<email2>" (emails en minúsculas, ordenados).
// La conexión se centraliza en ./firebase.js (igual que movieModel/seriesModel/friendshipModel).
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();
const { FriendshipModel } = require("./friendshipModel");

// Almacén en memoria para modo local.
const localChats = new Map(); // chatId -> chatDoc
const localMessages = new Map(); // chatId -> [messageDoc]

function normalizeUserId(value) {
    return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

// Error con código para que las rutas traduzcan a 400/403/404/409.
function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// Genera chatId determinista e independiente de quién inicie la conversación.
function makeChatId(a, b) {
    const first = normalizeUserId(a);
    const second = normalizeUserId(b);
    if (!first || !second || !isValidEmail(first) || !isValidEmail(second)) {
        throw codedError("BAD_REQUEST", "Participantes inválidos");
    }
    if (first === second) {
        throw codedError("BAD_REQUEST", "No puedes crear un chat contigo mismo");
    }
    const sorted = [first, second].sort();
    return "chat_" + sorted[0] + "__" + sorted[1];
}

function toPublicChat(doc) {
    return {
        id: doc.id,
        participants: doc.participants,
        createdAt: doc.createdAt || null,
        updatedAt: doc.updatedAt || null,
        lastMessage: doc.lastMessage || null
    };
}

function toPublicMessage(doc) {
    return {
        id: doc.id,
        chatId: doc.chatId,
        senderId: doc.senderId,
        text: doc.text,
        createdAt: doc.createdAt
    };
}

async function runTransaction(fn) {
    if (!db) {
        return fn(null);
    }
    return db.runTransaction(fn);
}

// --- CHATS ---

async function getChatDoc(chatId) {
    if (!db) {
        return localChats.get(chatId) || null;
    }
    const doc = await db.collection("chats").doc(chatId).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
}

async function setChatDoc(chatId, data, isUpdate = false) {
    if (!db) {
        if (isUpdate) {
            const existing = localChats.get(chatId);
            if (existing) localChats.set(chatId, { ...existing, ...data });
        } else {
            localChats.set(chatId, { id: chatId, ...data });
        }
        return;
    }
    if (isUpdate) {
        await db.collection("chats").doc(chatId).update(data);
    } else {
        await db.collection("chats").doc(chatId).set(data);
    }
}

async function deleteChatDoc(chatId) {
    if (!db) {
        localChats.delete(chatId);
        return;
    }
    await db.collection("chats").doc(chatId).delete();
}

// Crea u obtiene la conversación entre dos amigos.
// Solo se permite si ambos usuarios son amigos (validado por la ruta).
async function getOrCreateChat(userA, userB) {
    const chatId = makeChatId(userA, userB);
    const existing = await getChatDoc(chatId);
    if (existing) return toPublicChat(existing);

    const now = new Date().toISOString();
    const chatDoc = {
        id: chatId,
        participants: [normalizeUserId(userA), normalizeUserId(userB)].sort(),
        createdAt: now,
        updatedAt: now,
        lastMessage: null
    };
    await setChatDoc(chatId, chatDoc);
    return toPublicChat(chatDoc);
}

// Lista las conversaciones del usuario (ordenadas por updatedAt desc).
async function listUserChats(userId) {
    const me = normalizeUserId(userId);
    if (!me) throw codedError("BAD_REQUEST", "Falta el usuario");
    let chats = [];
    if (!db) {
        chats = [...localChats.values()].filter((c) => c.participants.includes(me));
    } else {
        const snapshot = await db.collection("chats")
            .where("participants", "array-contains", me)
            .get();
        snapshot.forEach((doc) => {
            chats.push(Object.assign({ id: doc.id }, doc.data()));
        });
    }
    return chats
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .map(toPublicChat);
}

// Verifica que el usuario sea participante del chat.
async function assertChatParticipant(chatId, userId) {
    const me = normalizeUserId(userId);
    const chat = await getChatDoc(chatId);
    if (!chat) throw codedError("NOT_FOUND", "Conversación no encontrada");
    if (!chat.participants.includes(me)) {
        throw codedError("FORBIDDEN", "No eres participante de esta conversación");
    }
    return chat;
}

// --- MESSAGES ---

async function addMessage(chatId, senderId, text) {
    const sender = normalizeUserId(senderId);
    if (!sender || !isValidEmail(sender)) {
        throw codedError("BAD_REQUEST", "Remitente inválido");
    }
    const chat = await getChatDoc(chatId);
    if (!chat) throw codedError("NOT_FOUND", "Conversación no encontrada");
    if (!chat.participants.includes(sender)) {
        throw codedError("FORBIDDEN", "El remitente no es participante del chat");
    }
    if (!chat.participants.includes(sender)) {
        throw codedError("FORBIDDEN", "El remitente no es participante del chat");
    }
    // Verificar que siguen siendo amigos
    const other = chat.participants.find((p) => p !== sender);
    if (other && !(await FriendshipModel.areFriends(sender, other))) {
        throw codedError("FORBIDDEN", "Ya no sois amigos");
    }

    const now = new Date().toISOString();
    const messageId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const messageDoc = {
        id: messageId,
        chatId,
        senderId: sender,
        text: String(text).trim(),
        createdAt: now
    };

    try {
        await runTransaction(async (tx) => {
            const messagesRef = db
                ? db.collection("chats").doc(chatId).collection("messages").doc(messageId)
                : null;
            if (tx && messagesRef) {
                tx.set(messagesRef, messageDoc);
            } else if (!db) {
                const arr = localMessages.get(chatId) || [];
                arr.push(messageDoc);
                localMessages.set(chatId, arr);
            }

            // Actualizar lastMessage y updatedAt del chat
            const lastMessagePreview = {
                id: messageId,
                senderId: sender,
                text: messageDoc.text.slice(0, 100),
                createdAt: now
            };
            if (tx) {
                tx.update(db.collection("chats").doc(chatId), {
                    lastMessage: lastMessagePreview,
                    updatedAt: now
                });
            } else {
                const c = localChats.get(chatId);
                if (c) {
                    c.lastMessage = lastMessagePreview;
                    c.updatedAt = now;
                    localChats.set(chatId, c);
                }
            }
        });
    } catch (error) {
        if (error.code) throw error;
        console.error("Error al guardar mensaje:", error.message || error);
        throw new Error("No se pudo enviar el mensaje");
    }
    return toPublicMessage(messageDoc);
}

// Obtiene historial paginado de mensajes (más recientes primero, se invierte al final).
async function getMessages(chatId, userId, opts = {}) {
    const me = normalizeUserId(userId);
    const chat = await assertChatParticipant(chatId, me);
    const limit = Math.min(Math.max(Number.parseInt(opts.limit, 10) || 50, 1), 200);
    const before = opts.before ? String(opts.before).trim() : null; // cursor createdAt ISO

    let messages = [];
    if (!db) {
        const all = localMessages.get(chatId) || [];
        messages = all.filter((m) => !before || m.createdAt < before);
    } else {
        let query = db.collection("chats").doc(chatId).collection("messages")
            .orderBy("createdAt", "desc")
            .limit(limit);
        if (before) {
            query = query.where("createdAt", "<", before);
        }
        const snapshot = await query.get();
        snapshot.forEach((doc) => {
            messages.push(Object.assign({ id: doc.id }, doc.data()));
        });
    }
    // Devolver en orden cronológico (antiguos primero)
    return messages.reverse().map(toPublicMessage);
}

const ChatModel = {
    isFirestoreConnected: () => firebaseConn.isFirestoreConnected(),

    makeChatId,
    getOrCreateChat,
    listUserChats,
    addMessage,
    getMessages,
    assertChatParticipant
};

module.exports = { ChatModel };