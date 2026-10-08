const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// 1. Add ChatWidget component before App component
// ============================================================
const chatWidgetComponent = `
/* ---------- ChatWidget: Soporte embebido / Chat entre amigos ---------- */
function ChatWidget(props) {
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;

    const openState = React.useState(false);
    const isOpen = openState[0];
    const setOpen = openState[1];

    const viewState = React.useState("list"); // "list" | "conversation"
    const view = viewState[0];
    const setView = viewState[1];

    const chatsState = React.useState([]);
    const chats = chatsState[0];
    const setChats = chatsState[1];

    const messagesState = React.useState([]);
    const messages = messagesState[0];
    const setMessages = messagesState[1];

    const activeChatState = React.useState(null);
    const activeChat = activeChatState[0];
    const setActiveChat = activeChatState[1];

    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];

    const messageTextState = React.useState("");
    const messageText = messageTextState[0];
    const setMessageText = messageTextState[1];

    const sendingState = React.useState(false);
    const sending = sendingState[0];
    const setSending = sendingState[1];

    const authHeaders = () => {
        const tok = getStoredToken();
        return tok ? { Authorization: "Bearer " + tok, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
    };

    // Cargar lista de chats
    const loadChats = async () => {
        try {
            const res = await fetch("/api/chats", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            setChats(data.results || []);
        } catch (e) {
            console.error(e);
        }
    };

    // Abrir conversación con un amigo
    const openConversation = async (friend) => {
        setActiveChat(friend);
        setView("conversation");
        await loadMessages(friend.id);
    };

    // Cargar mensajes
    const loadMessages = async (friendId) => {
        try {
            const res = await fetch("/api/chats/" + encodeURIComponent(friendId) + "/messages", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            setMessages(data.results || []);
        } catch (e) {
            console.error(e);
        }
    };

    // Enviar mensaje
    const handleSend = async (e) => {
        e.preventDefault();
        if (!messageText.trim() || !activeChat || sending) return;
        setSending(true);
        try {
            const res = await fetch("/api/chats/" + encodeURIComponent(activeChat.id) + "/messages", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ text: messageText.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            setMessageText("");
            setMessages(prev => [...prev, data.message]);
        } catch (e) {
            console.error(e);
        } finally {
            setSending(false);
        }
    };

    // Volver a lista
    const backToList = () => {
        setView("list");
        setActiveChat(null);
        setMessages([]);
    };

    // Cargar chats al abrir
    React.useEffect(() => {
        if (isOpen) loadChats();
    }, [isOpen]);

    // Real-time listener para mensajes (si hay chat activo)
    React.useEffect(() => {
        if (!activeChat || view !== "conversation") return;
        let unsub = null;
        try {
            const { getFirestore, collection, query, orderBy, onSnapshot } = firebase.firestore();
            const db = getFirestore();
            const chatId = "chat_" + [currentUser.id, activeChat.id].sort().join("__");
            const messagesRef = collection(db, "chats", chatId, "messages");
            const q = query(messagesRef, orderBy("createdAt", "asc"));
            unsub = onSnapshot(q, (snapshot) => {
                const msgs = [];
                snapshot.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
                setMessages(msgs);
            });
        } catch (e) {
            console.warn("Real-time no disponible:", e);
        }
        return () => { if (unsub) unsub(); };
    }, [activeChat, view, currentUser]);

    if (!isOpen) return null;

    return h("div", { className: "chat-widget" },
        // Botón flotante
        !isOpen && h("button", {
            className: "chat-fab",
            onClick: () => { setOpen(true); loadChats(); },
            "aria-label": "Abrir chat"
        }, h("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
            h("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" })
        )),

        // Modal
        isOpen && h("div", { className: "chat-widget-backdrop", onClick: () => setOpen(false) },
            h("div", { className: "chat-widget-modal", onClick: (e) => e.stopPropagation() },
                // Header
                h("div", { className: "chat-widget-header" },
                    view === "list"
                        ? h("h3", null, "Chat")
                        : h("div", null,
                            h("button", { className: "chat-back", onClick: () => { setView("list"); setActiveChat(null); setMessages([]); }, "aria-label": "Volver" }, "‹"),
                            h("div", { className: "chat-peer" },
                                activeChat.avatar ? h("img", { src: activeChat.avatar, alt: "", className: "peer-avatar" }) : null,
                                h("div", null,
                                    h("strong", null, activeChat.name || activeChat.email),
                                    h("span", { className: "peer-status" }, "En línea")
                                )
                            )
                        ),
                    h("button", { className: "chat-close", onClick: () => setOpen(false), "aria-label": "Cerrar" }, "✕")
                ),

                // Contenido
                h("div", { className: "chat-widget-content" },
                    view === "list" && h("div", { className: "chat-list" },
                        loading ? h("p", { className: "muted" }, "Cargando...") : null,
                        chats.length === 0 ? h("p", { className: "muted", style: { textAlign: "center", padding: "2rem" } }, "No tienes conversaciones yet. Ve a Amigos para empezar.") : null,
                        h("ul", { className: "chat-list-items" },
                            chats.map(c => h("li", {
                                key: c.id,
                                className: "chat-item",
                                onClick: () => openConversation(c.otherUser || c.participants?.find(p => p !== currentUser.id))
                            },
                                h("div", { className: "chat-avatar" },
                                    c.otherUser?.avatar ? h("img", { src: c.otherUser.avatar, alt: "" }) : null
                                ),
                                h("div", { className: "chat-info" },
                                    h("strong", null, c.otherUser?.name || c.otherUser?.email || "Usuario"),
                                    c.lastMessage ? h("span", { className: "chat-preview" }, c.lastMessage.text?.substring(0, 40)) : h("span", { className: "muted" }, "Sin mensajes")
                                ),
                                c.lastMessage ? h("span", { className: "chat-time" }, new Date(c.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) : null
                            ))
                        )
                    ),

                    view === "conversation" && activeChat && h("div", { className: "chat-conversation" },
                        h("div", { className: "messages-list" },
                            messages.length === 0 ? h("p", { className: "muted", style: { textAlign: "center", marginTop: "2rem" } }, "Sin mensajes. ¡Inicia la conversación!") : null,
                            messages.map(m => h("div", {
                                key: m.id,
                                className: "message " + (m.senderId === currentUser.id ? "own" : "other")
                            },
                                h("div", { className: "message-bubble" },
                                    h("p", null, m.text),
                                    h("span", { className: "message-time" }, new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
                                )
                            ))
                        ),
                        h("form", { onSubmit: handleSend, className: "chat-input-form" },
                            h("input", {
                                type: "text",
                                value: messageText,
                                onChange: (e) => setMessageText(e.target.value),
                                placeholder: "Escribe un mensaje...",
                                maxLength: 4000,
                                disabled: sending
                            }),
                            h("button", { type: "submit", disabled: sending || !messageText.trim() }, sending ? "Enviando..." : "Enviar")
                        )
                    )
                ),

                // Botón nueva conversación (en lista)
                view === "list" && h("button", { className: "chat-fab-small", onClick: () => onNavigate("amigos") }, "+")
            )
        )
    );
}
`;

const insertPoint = content.indexOf('/* ---------- App raíz ---------- */');
if (insertPoint === -1) {
    console.error('Insert point not found');
    process.exit(1);
}

content = content.substring(0, insertPoint) + chatWidgetComponent + '\n\n' + content.substring(insertPoint);

fs.writeFileSync('public/js/bundle.js', content, 'utf8');
console.log('ChatWidget component added successfully!');