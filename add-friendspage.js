const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// Add FriendsPage component before App component
// ============================================================
const friendsPageComponent = `
/* ---------- FriendsPage: gestión de amistades ----------
   Props: currentUser, onNavigate */
function FriendsPage(props) {
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;

    const tabState = React.useState("friends"); // friends | requests | search
    const tab = tabState[0];
    const setTab = tabState[1];

    const friendsState = React.useState([]);
    const friends = friendsState[0];
    const setFriends = friendsState[1];

    const receivedState = React.useState([]);
    const received = receivedState[0];
    const setReceived = receivedState[1];

    const sentState = React.useState([]);
    const sent = sentState[0];
    const setSent = sentState[1];

    const searchState = React.useState("");
    const searchQuery = searchState[0];
    const setSearchQuery = searchState[1];

    const searchResultsState = React.useState([]);
    const searchResults = searchResultsState[0];
    const setSearchResults = searchResultsState[1];

    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];

    const authHeaders = () => {
        const tok = getStoredToken();
        return tok ? { Authorization: "Bearer " + tok, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
    };

    // Cargar datos iniciales
    React.useEffect(() => {
        loadAll();
    }, [currentUser]);

    const loadAll = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const [f, rec, snt] = await Promise.all([
                fetch("/api/friends", { headers: authHeaders() }).then(r => r.json()),
                fetch("/api/friends/requests/received", { headers: authHeaders() }).then(r => r.json()),
                fetch("/api/friends/requests/sent", { headers: authHeaders() }).then(r => r.json())
            ]);
            setFriends(f.friends || []);
            setReceived(rec.requests || []);
            setSent(snt.requests || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (!q || q.length < 2) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/users/search?q=" + encodeURIComponent(q), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error en búsqueda");
            // Filtrar usuario actual y amigos actuales
            const filtered = (data.results || []).filter(u => 
                u.id !== currentUser.id && 
                !friends.some(f => f.friendUid === u.id) &&
                !received.some(r => r.fromUid === u.id) &&
                !sent.some(s => s.toUid === u.id)
            );
            setSearchResults(filtered);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const sendRequest = async (targetUid) => {
        setLoading(true);
        try {
            const res = await fetch("/api/friends/request", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ toUid: targetUid })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            await loadAll();
            setSearchQuery("");
            setSearchResults([]);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const acceptRequest = async (friendshipId) => {
        try {
            await fetch("/api/friends/accept", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ friendshipId })
            });
            await loadAll();
        } catch (e) { console.error(e); }
    };

    const rejectRequest = async (friendshipId) => {
        try {
            await fetch("/api/friends/reject", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ friendshipId })
            });
            await loadAll();
        } catch (e) { console.error(e); }
    };

    const removeFriend = async (friendshipId) => {
        if (!window.confirm("¿Eliminar amigo?")) return;
        try {
            await fetch("/api/friends/" + friendshipId, {
                method: "DELETE",
                headers: authHeaders()
            });
            await loadAll();
        } catch (e) { console.error(e); }
    };

    const cancelRequest = async (friendshipId) => {
        try {
            await fetch("/api/friends/" + friendshipId, {
                method: "DELETE",
                headers: authHeaders()
            });
            await loadAll();
        } catch (e) { console.error(e); }
    };

    // Renderizado
    const tabButtons = [
        { id: "friends", label: "Amigos (" + friends.length + ")", icon: "👥" },
        { id: "requests", label: "Solicitudes (" + (received.length + sent.length) + ")", icon: "📨" },
        { id: "search", label: "Buscar", icon: "🔍" }
    ];

    return h("div", { className: "friends-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Amistades"),
            h("p", { className: "muted" }, "Conecta con amigos y comparte tus colecciones")
        ),

        h("div", { className: "friends-tabs" },
            tabButtons.map(t => h("button", {
                className: "tab-btn" + (tab === t.id ? " active" : ""),
                onClick: () => setTab(t.id)
            }, h("span", null, t.icon), " ", t.label))
        ),

        error ? h("p", { className: "error" }, error) : null,

        tab === "friends" && h("div", { className: "friends-content" },
            loading && friends.length === 0 ? h("p", { className: "muted" }, "Cargando...") : null,
            !loading && friends.length === 0 ? h("p", { className: "muted" }, "Aún no tienes amigos. Busca a alguien por su nickname o comparte tu enlace.") : null,
            !loading && friends.length > 0 && h("div", { className: "friends-list" },
                friends.map(f => h("div", { key: f.friendshipId, className: "friend-item" },
                    h("div", { className: "friend-info" },
                        f.avatar ? h("img", { src: f.avatar, alt: "", className: "friend-avatar" }) : null,
                        h("div", null,
                            h("strong", null, f.name),
                            h("span", { className: "friend-nickname" }, " @" + f.name)
                        )
                    ),
                    h("button", { className: "btn-ghost btn-small", onClick: () => removeFriend(f.friendshipId) }, "Eliminar")
                ))
            )
        ),

        tab === "requests" && h("div", { className: "friends-content" },
            received.length > 0 && h("div", null,
                h("h3", { className: "section-title" }, "Recibidas (" + received.length + ")"),
                h("div", { className: "requests-list" },
                    received.map(r => h("div", { key: r.friendshipId, className: "request-item" },
                        h("div", { className: "friend-info" },
                            r.fromAvatar ? h("img", { src: r.fromAvatar, alt: "", className: "friend-avatar" }) : null,
                            h("div", null,
                                h("strong", null, r.fromName),
                                r.fromNickname ? h("span", { className: "friend-nickname" }, " @" + r.fromNickname) : null
                            )
                        ),
                        h("div", { className: "request-actions" },
                            h("button", { className: "btn-primary btn-small", onClick: () => acceptRequest(r.friendshipId) }, "Aceptar"),
                            h("button", { className: "btn-ghost btn-small", onClick: () => rejectRequest(r.friendshipId) }, "Rechazar")
                        )
                    ))
                )
            ) : null,

            sent.length > 0 && h("div", null,
                h("h3", { className: "section-title" }, "Enviadas (" + sent.length + ")"),
                h("div", { className: "requests-list" },
                    sent.map(s => h("div", { key: s.friendshipId, className: "request-item" },
                        h("div", { className: "friend-info" },
                            s.toAvatar ? h("img", { src: s.toAvatar, alt: "", className: "friend-avatar" }) : null,
                            h("div", null,
                                h("strong", null, s.toName),
                                s.toNickname ? h("span", { className: "friend-nickname" }, " @" + s.toNickname) : null
                            )
                        ),
                        h("button", { className: "btn-ghost btn-small", onClick: () => cancelRequest(s.friendshipId) }, "Cancelar")
                    ))
                )
            ) : null,

            received.length === 0 && sent.length === 0 && !loading && h("p", { className: "muted" }, "No hay solicitudes pendientes.")
        ),

        tab === "search" && h("div", { className: "friends-content" },
            h("form", { onSubmit: handleSearch, className: "friend-search-form" },
                h("input", {
                    type: "text",
                    value: searchQuery,
                    onChange: (e) => setSearchQuery(e.target.value),
                    placeholder: "Buscar por nickname (ej. @juan)",
                    maxLength: 30,
                    autoComplete: "off",
                    autoFocus: true
                }),
                h("button", { type: "submit", disabled: loading || !searchQuery.trim() }, loading ? "Buscando..." : "Buscar")
            ),
            error ? h("p", { className: "error" }, error) : null,
            searchResults.length > 0 && h("div", { className: "search-results" },
                searchResults.map(u => h("div", { key: u.id, className: "search-result-item" },
                    h("div", { className: "friend-info" },
                        u.avatar ? h("img", { src: u.avatar, alt: "", className: "friend-avatar" }) : null,
                        h("div", null,
                            h("strong", null, u.nickname || u.name),
                            u.email ? h("span", { className: "friend-email" }, u.email) : null
                        )
                    ),
                    h("button", { className: "btn-primary btn-small", onClick: () => sendRequest(u.id) }, "Agregar")
                ))
            ) : null,
            !loading && searchQuery && searchResults.length === 0 && h("p", { className: "muted" }, "No se encontraron usuarios.")
        )
    );
}
`;

const insertPoint = content.indexOf('/* ---------- App raíz ---------- */');
if (insertPoint === -1) {
    console.error('Insert point not found');
    process.exit(1);
}

content = content.substring(0, insertPoint) + friendsPageComponent + '\n\n' + content.substring(insertPoint);

fs.writeFileSync('public/js/bundle.js', content, 'utf8');
console.log('FriendsPage component added successfully!');