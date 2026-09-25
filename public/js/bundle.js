/* ============================================================
   bundle.js — front CineAIros en JavaScript PLANO (sin JSX).
   Se usa React.createElement a través del ayudante h().
   NO necesita Babel: index.html lo carga como <script> clásico.
    Secciones: Inicio (landing), Películas y cuenta personal.
   ============================================================ */

const { useState, useEffect } = React;
const h = React.createElement;

const BRAND = "CineAIros";
const SLOGAN = "Descubre, explora y guarda tus películas favoritas";

// Temas de color disponibles
const COLOR_THEMES = {
    default: {
        name: "Predeterminado",
        primary: "#b3122e",
        primaryHover: "#8c0e24",
        primaryLight: "#fddde5",
        accent: "#c9a227",
        background: "#0d1219",
        surface: "#151c27",
        text: "#f4f6f9",
        textMuted: "#a7b1c0",
        border: "#2a3444",
        success: "#10b981",
        error: "#ef4444",
        primaryRgb: "179, 18, 46"
    },
    vibrant: {
        name: "Colores vivos",
        primary: "#d62839",
        primaryHover: "#b3122e",
        primaryLight: "#ffe1ea",
        accent: "#f59e0b",
        background: "#1a0f15",
        surface: "#25161d",
        text: "#fdf2f8",
        textMuted: "#f9a8d4",
        border: "#6b1d2b",
        success: "#10b981",
        error: "#ef4444",
        primaryRgb: "214, 40, 57"
    },
    neon: {
        name: "Neón",
        primary: "#a855f7",
        primaryHover: "#9333ea",
        primaryLight: "#f3e8ff",
        accent: "#06b6d4",
        background: "#0f0f1a",
        surface: "#1a1a2e",
        text: "#fafafa",
        textMuted: "#a1a1aa",
        border: "#3f3f5c",
        success: "#22d3ee",
        error: "#f87171",
        primaryRgb: "168, 85, 247"
    },
    pastel: {
        name: "Pastel",
        primary: "#8b5cf6",
        primaryHover: "#7c3aed",
        primaryLight: "#ede9fe",
        accent: "#f472b6",
        background: "#fafafa",
        surface: "#ffffff",
        text: "#4c1d95",
        textMuted: "#7e69a3",
        border: "#ddd6fe",
        success: "#4ade80",
        error: "#fca5a5",
        primaryRgb: "139, 92, 246"
    }
};

// Aplica el tema al document.documentElement (CSS variables)
function applyColorTheme(themeKey) {
    const theme = COLOR_THEMES[themeKey] || COLOR_THEMES.default;
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
        if (key !== "name") {
            root.style.setProperty("--color-" + key, value);
        }
    });
    root.setAttribute("data-theme", themeKey);
}

// "Popular ahora" se carga desde Firebase a través de /api/movies/popular.

// Único origen del token: localStorage (así fetchMovies siempre lo ve actualizado).
function getStoredToken() {
    try {
        return window.localStorage.getItem("cineairos_token");
    } catch (e) {
        return null;
    }
}

function authHeaders() {
    const tok = getStoredToken();
    return tok ? { Authorization: "Bearer " + tok } : {};
}

function firebaseActionSettings(mode) {
    return {
        url: window.location.origin + "/?mode=" + encodeURIComponent(mode),
        handleCodeInApp: true
    };
}

/* ---------- Firebase Auth (email+password y Google) ----------
   La config pública se sirve en /api/firebase-config (ver server.js).
    Sin la configuración web, Firebase Authentication no puede arrancar. */
let __firebaseConfigCache = null;
let __firebaseInitPromise = null;

function ensureFirebase() {
    if (typeof firebase === "undefined" || !firebase.auth) {
        return Promise.reject(new Error("SDK de Firebase no cargado (revisa tu conexión a internet)"));
    }
    if (__firebaseConfigCache) return Promise.resolve(__firebaseConfigCache);
    if (__firebaseInitPromise) return __firebaseInitPromise;
    __firebaseInitPromise = fetch("/api/firebase-config")
        .then((r) => r.json())
        .then((cfg) => {
            if (!cfg || !cfg.configured) {
                throw new Error("Firebase no configurado: añade la configuración web FIREBASE_API_KEY y FIREBASE_APP_ID al .env");
            }
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(cfg);
            }
            __firebaseConfigCache = cfg;
            return cfg;
        })
        .catch((e) => {
            __firebaseInitPromise = null;
            throw e;
        });
    return __firebaseInitPromise;
}

function isFirebaseUnavailableMessage(msg) {
    const m = String(msg || "");
    return m.indexOf("Firebase no configurado") !== -1 || m.indexOf("SDK de Firebase") !== -1;
}

function friendlyFirebaseError(err) {
    const code = (err && err.code) || "";
    const map = {
        "auth/email-already-in-use": "Ese email ya está registrado. Prueba a entrar.",
        "auth/user-not-found": "No existe una cuenta Firebase con ese correo. Usa Crear cuenta primero.",
        "auth/wrong-password": "Email o contraseña incorrectos.",
        "auth/invalid-credential": "Email o contraseña incorrectos.",
        "auth/invalid-email": "El email no es válido.",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
        "auth/popup-closed-by-user": "Ventana de Google cerrada. Inténtalo de nuevo.",
        "auth/cancelled-popup-request": "Ya hay una ventana de Google abierta.",
        "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Permite ventanas emergentes.",
        "auth/operation-not-allowed": "Ese método de login no está activado en Firebase Console.",
        "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Auth.",
        "auth/invalid-continue-uri": "La URL de retorno no es válida. Revisa los dominios autorizados en Firebase.",
        "auth/missing-continue-uri": "Falta la URL de retorno de Firebase.",
        "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a probar.",
        "auth/internal-error": "Firebase no pudo completar el acceso. Revisa la cuota de Firebase e inténtalo de nuevo.",
        "auth/expired-action-code": "El enlace ha caducado. Solicita otro.",
        "auth/invalid-action-code": "El enlace no es válido. Solicita otro."
    };
    if (map[code]) return map[code];
    if (code === "auth/network-request-failed") return "Sin conexión. Revisa tu internet.";
    if (/RESOURCE_EXHAUSTED|quota exceeded/i.test(String(err && err.message || ""))) {
        return "Firebase ha alcanzado su cuota temporal. Espera a que se restablezca e inténtalo de nuevo.";
    }
    return (err && err.message) || "No se pudo entrar con Firebase";
}

// Envía el ID token de Firebase al backend, que verifica y devuelve sesión propia.
async function firebaseSessionWithBackend(firebaseUser, fallbackName) {
    const idToken = await firebaseUser.getIdToken(true);
    const displayName = fallbackName || firebaseUser.displayName || "";
    const res = await fetch("/api/auth/firebase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: idToken, name: displayName })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo entrar con Firebase");
    try {
        window.localStorage.setItem("cineairos_token", data.token);
    } catch (e) { /* sin almacenamiento */ }
    return data;
}

// Logo "G" de Google (SVG inline, colores oficiales).
function GoogleGIcon() {
    return h("svg", { className: "google-g", viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" },
        h("path", { fill: "#4285F4", d: "M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" }),
        h("path", { fill: "#34A853", d: "M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.4 7.5 24 12 24z" }),
        h("path", { fill: "#FBBC05", d: "M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7-.1.1C.5 8.9 0 10.4 0 12s.5 3.1 1.5 4.5l3.7-2.1z" }),
        h("path", { fill: "#EA4335", d: "M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.6 1.5 6.9l3.7 2.9c1-2.9 3.6-5.2 6.8-5.2z" })
    );
}

// El año de OMDb puede venir como "2010" o rango "2008–2013": comparamos los 4 primeros dígitos.
function yearOf(item) {
    const m = String(item.year || "").match(/\d{4}/);
    return m ? Number.parseInt(m[0], 10) : null;
}

function ratingOf(item) {
    const r = Number.parseFloat(item.rating);
    return Number.isNaN(r) ? null : r;
}

// Géneros para el filtro (valor en inglés = como lo devuelve OMDb).
const GENRES = [
    ["", "Todos"],
    ["Action", "Acción"],
    ["Adventure", "Aventura"],
    ["Animation", "Animación"],
    ["Comedy", "Comedia"],
    ["Crime", "Crimen"],
    ["Documentary", "Documental"],
    ["Drama", "Drama"],
    ["Fantasy", "Fantasía"],
    ["Horror", "Terror"],
    ["Mystery", "Misterio"],
    ["Romance", "Romance"],
    ["Sci-Fi", "Ciencia ficción"],
    ["Thriller", "Suspense"],
    ["War", "Bélica"],
    ["Western", "Western"]
];

/* ---------- Reseñas (backend /api/reviews) ----------
   Capa compartida por Películas, Series y MiCuenta. Antes el front
   guardaba las reseñas solo en memoria; ahora todo persiste en el
   backend (Firestore) y varios usuarios comparten las mismas reseñas. */
function reviewMediaTypeOf(detail, fallback) {
    const t = String((detail && detail.type) || fallback || "movie").toLowerCase();
    return t === "series" ? "series" : "movie";
}

function reviewQueryOf(mediaType, detail) {
    const parts = ["mediaType=" + encodeURIComponent(mediaType)];
    if (detail.imdbID) {
        parts.push("imdbID=" + encodeURIComponent(detail.imdbID));
    } else {
        parts.push("title=" + encodeURIComponent(detail.title || ""));
        if (detail.year) parts.push("year=" + encodeURIComponent(String(detail.year).slice(0, 4)));
    }
    return parts.join("&");
}

function toFrontReview(raw) {
    const r = Object.assign({}, raw);
    r.user = raw.userName || raw.user || "Usuario";
    r.replies = Array.isArray(raw.replies) ? raw.replies : [];
    return r;
}

function toFrontReply(raw) {
    const r = Object.assign({}, raw);
    r.user = raw.userName || raw.user || "Usuario";
    return r;
}

/* Modal de reseñas conectado al backend.
   Props: detail, mediaType ("movie"|"series"), user|null, onNavigate?(fn), onClose(fn) */
function ReviewsModal(props) {
    const detail = props.detail;
    const user = props.user || null;
    const onNavigate = props.onNavigate || null;
    const onClose = props.onClose || (() => {});
    const mediaType = reviewMediaTypeOf(detail, props.mediaType);
    const mediaKey = mediaType + "|" + (detail.imdbID || (detail.title + "|" + detail.year));

    const itemsState = React.useState([]);
    const items = itemsState[0];
    const setItems = itemsState[1];
    const totalState = React.useState(0);
    const total = totalState[0];
    const setTotal = totalState[1];
    const sortState = React.useState("relevance");
    const sort = sortState[0];
    const setSort = sortState[1];
    const loadingState = React.useState(true);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const writingState = React.useState(false);
    const writing = writingState[0];
    const setWriting = writingState[1];
    const textState = React.useState("");
    const text = textState[0];
    const setText = textState[1];
    const submittingState = React.useState(false);
    const submitting = submittingState[0];
    const setSubmitting = submittingState[1];
    const replyingState = React.useState(null);
    const replyingTo = replyingState[0];
    const setReplyingTo = replyingState[1];
    const replyTextState = React.useState("");
    const replyText = replyTextState[0];
    const setReplyText = replyTextState[1];
    const replyBusyState = React.useState(false);
    const replyBusy = replyBusyState[0];
    const setReplyBusy = replyBusyState[1];

    const goLogin = (target) => {
        onClose();
        if (onNavigate) onNavigate(target || "login");
    };

    // Carga la lista y adjunta las respuestas (best-effort, en paralelo).
    const load = async (wantedSort) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/reviews?" + reviewQueryOf(mediaType, detail) + "&sort=" + encodeURIComponent(wantedSort || sort) + "&limit=20", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudieron cargar las reseñas");
            const list = (Array.isArray(data.results) ? data.results : []).map(toFrontReview);
            setTotal(typeof data.total === "number" ? data.total : list.length);
            const withReplies = await Promise.all(list.map(async (r) => {
                try {
                    const rr = await fetch("/api/reviews/" + encodeURIComponent(r.id) + "/replies?limit=20", { headers: authHeaders() });
                    const dd = await rr.json();
                    if (rr.ok && Array.isArray(dd.results)) r.replies = dd.results.map(toFrontReply);
                } catch (e) { /* respuestas opcionales */ }
                return r;
            }));
            setItems(withReplies);
        } catch (e) {
            setError(e.message);
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    };

    // Recarga al abrir otra obra o al cambiar el orden.
    React.useEffect(() => { load(sort); }, [mediaKey, sort]);

    const handlePublish = async () => {
        const body = text.trim();
        if (body.length < 50 || submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload = { mediaType: mediaType, text: body };
            if (detail.imdbID) payload.imdbID = detail.imdbID;
            payload.mediaTitle = detail.title;
            if (detail.year) payload.mediaYear = String(detail.year).slice(0, 4);
            const res = await fetch("/api/reviews", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) { goLogin("login"); return; }
                throw new Error(data.error || "No se pudo publicar la reseña");
            }
            setText("");
            setWriting(false);
            await load(sort);
        } catch (e) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleVote = async (review, value) => {
        if (!user) { goLogin("login"); return; }
        const next = review.userVote === value ? 0 : value;
        try {
            const res = await fetch("/api/reviews/" + encodeURIComponent(review.id) + "/vote", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ value: next })
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) { goLogin("login"); return; }
                throw new Error(data.error || "No se pudo votar");
            }
            const updated = toFrontReview(data);
            updated.replies = review.replies;
            setItems(items.map((r) => (r.id === review.id ? updated : r)));
        } catch (e) {
            setError(e.message);
        }
    };

    const handleDelete = async (review) => {
        if (!window.confirm("¿Eliminar tu reseña?")) return;
        try {
            const res = await fetch("/api/reviews/" + encodeURIComponent(review.id), {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo eliminar");
            setItems(items.filter((r) => r.id !== review.id));
            setTotal(Math.max(0, total - 1));
        } catch (e) {
            setError(e.message);
        }
    };

    const handleReply = async (review) => {
        const body = replyText.trim();
        if (!body || replyBusy) return;
        setReplyBusy(true);
        try {
            const res = await fetch("/api/reviews/" + encodeURIComponent(review.id) + "/replies", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ text: body })
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) { goLogin("login"); return; }
                throw new Error(data.error || "No se pudo responder");
            }
            setItems(items.map((r) => (r.id === review.id
                ? Object.assign({}, r, { replies: (r.replies || []).concat([toFrontReply(data)]), replyCount: (r.replyCount || (r.replies || []).length) + 1 })
                : r)));
            setReplyText("");
            setReplyingTo(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setReplyBusy(false);
        }
    };

    const authPrompt = () => h("div", { className: "auth-prompt" },
        h("p", null, "Para escribir una reseña necesitas "),
        onNavigate ? h("button", { onClick: () => goLogin("login") }, "iniciar sesión") : h("span", null, "iniciar sesión"),
        h("p", null, " o "),
        onNavigate ? h("button", { onClick: () => goLogin("register") }, "crear cuenta") : h("span", null, "crear cuenta")
    );

    return h("div", { className: "modal-backdrop", onClick: onClose },
        h("div", { className: "modal modal-reviews", onClick: (e) => e.stopPropagation() },
            h("button", { className: "modal-close", onClick: onClose }, "✕"),
            h("div", { className: "modal-content" },
                h("h2", null, "Reseñas de " + detail.title),
                error ? h("p", { className: "error" }, error) : null,
                writing ? h("div", { className: "review-form" },
                    user ? h("div", null,
                        h("h3", null, "Escribe tu reseña"),
                        h("textarea", {
                            value: text,
                            onChange: (e) => setText(e.target.value),
                            placeholder: "¿Qué te pareció? (mín. 50 caracteres)",
                            rows: 4,
                            maxLength: 2000
                        }),
                        text.length > 0 && text.length < 50 ? h("p", { className: "muted" }, "Mínimo 50 caracteres (" + text.length + "/50)") : null,
                        h("div", { className: "result-actions" },
                            h("button", {
                                className: "btn-primary",
                                onClick: handlePublish,
                                disabled: submitting || text.trim().length < 50
                            }, submitting ? "Publicando..." : "Publicar reseña"),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => { setWriting(false); setText(""); } }, "Cancelar")
                        )
                    ) : authPrompt()
                ) : h("div", { className: "reviews-section" },
                    h("div", { className: "reviews-header" },
                        h("h3", null, "Reseñas (" + total + ")"),
                        h("button", {
                            className: "btn-ghost btn-small",
                            onClick: () => setWriting(true)
                        }, "Escribir reseña")
                    ),
                    h("div", { className: "reviews-sort" },
                        h("label", null, "Ordenar: "),
                        h("select", {
                            value: sort,
                            onChange: (e) => setSort(e.target.value)
                        },
                            h("option", { value: "relevance" }, "Mayor relevancia"),
                            h("option", { value: "votes" }, "Más votados"),
                            h("option", { value: "recent" }, "Más recientes")
                        )
                    ),
                    loading ? h("p", { className: "muted" }, "Cargando reseñas...") : null,
                    !loading && items.length === 0 ? h("p", { className: "muted" }, "Aún no hay reseñas. ¡Sé el primero en escribir una!") : null,
                    !loading && items.length > 0 ? h("div", { className: "reviews-list" },
                        items.map((review) => h("div", { key: review.id, className: "review-item" },
                            h("div", { className: "review-header" },
                                h("strong", null, review.user),
                                h("span", { className: "review-date" }, new Date(review.createdAt).toLocaleDateString("es-ES"))
                            ),
                            review.rating ? h("p", { className: "muted" }, "★ " + review.rating + "/10") : null,
                            h("p", { className: "review-text" }, review.text),
                            h("div", { className: "review-actions" },
                                h("button", {
                                    className: "vote-btn" + (review.userVote === 1 ? " voted" : ""),
                                    onClick: () => handleVote(review, 1)
                                }, "👍 " + review.upvotes),
                                h("button", {
                                    className: "vote-btn" + (review.userVote === -1 ? " voted" : ""),
                                    onClick: () => handleVote(review, -1)
                                }, "👎 " + review.downvotes),
                                h("button", {
                                    className: "btn-ghost btn-small",
                                    onClick: () => {
                                        if (!user) { goLogin("login"); return; }
                                        setReplyingTo(replyingTo === review.id ? null : review.id);
                                        setReplyText("");
                                    }
                                }, "Responder (" + (review.replyCount != null ? review.replyCount : (review.replies || []).length) + ")"),
                                user && review.userId === user.id ? h("button", {
                                    className: "btn-ghost btn-small",
                                    onClick: () => handleDelete(review)
                                }, "Eliminar") : null
                            ),
                            replyingTo === review.id ? h("div", { className: "review-form reply-form" },
                                h("textarea", {
                                    value: replyText,
                                    onChange: (e) => setReplyText(e.target.value),
                                    placeholder: "Escribe tu respuesta (máx. 1000 caracteres)",
                                    rows: 2,
                                    maxLength: 1000
                                }),
                                h("div", { className: "result-actions" },
                                    h("button", {
                                        className: "btn-primary btn-small",
                                        onClick: () => handleReply(review),
                                        disabled: replyBusy || !replyText.trim()
                                    }, replyBusy ? "Enviando..." : "Responder"),
                                    h("button", { className: "btn-ghost btn-small", type: "button", onClick: () => { setReplyingTo(null); setReplyText(""); } }, "Cancelar")
                                )
                            ) : null,
                            review.replies && review.replies.length > 0 ? h("div", { className: "review-replies" },
                                review.replies.map((reply) => h("div", { key: reply.id, className: "reply-item" },
                                    h("strong", null, reply.user),
                                    h("span", { className: "reply-date" }, new Date(reply.createdAt).toLocaleDateString("es-ES")),
                                    h("p", null, reply.text)
                                ))
                            ) : null
                        ))
                    ) : null
                )
            )
        )
    );
}

/* ---------- Header ---------- */
function SiteHeader(props) {
    const page = props.page;
    const onNavigate = props.onNavigate;
    const peliCount = props.peliCount || 0;
    const user = props.user || null;
    const onLogout = props.onLogout || (() => {});
    const openState = React.useState(false);
    const open = openState[0];
    const setOpen = openState[1];
    const userMenuState = React.useState(false);
    const userMenuOpen = userMenuState[0];
    const setUserMenuOpen = userMenuState[1];

    const go = (target) => {
        setOpen(false);
        setUserMenuOpen(false);
        onNavigate(target);
    };

    return h("header", { className: "site-header" },
        h("div", { className: "header-inner" },
            h("button", { className: "logo", onClick: () => go("home"), "aria-label": "Ir al inicio" },
                h("img", {
                    className: "logo-img", src: "/img/logo-icon.png", alt: "",
                    onError: (e) => { e.target.style.display = "none"; }
                }),
                h("span", { className: "logo-text" }, BRAND)
            ),
            h("nav", { className: "main-nav" + (open ? " open" : "") },
                h("button",
                    { className: "nav-link" + (page === "home" ? " active" : ""), onClick: () => go("home") },
                    "Inicio"
                ),
                h("button",
                    { className: "nav-link" + (page === "peliculas" ? " active" : ""), onClick: () => go("peliculas") },
                    "Películas"
                ),
                h("button",
                    { className: "nav-link" + (page === "series" ? " active" : ""), onClick: () => go("series") },
                    "Series"
                ),
                user
                    ? h("div", { className: "user-menu" },
                        h("button", { className: "user-chip", title: "Mi cuenta", onClick: () => setUserMenuOpen(!userMenuOpen) }, user.nickname || user.name),
                        userMenuOpen && h("div", { className: "user-dropdown" },
                            h("button", { className: "dropdown-item", onClick: () => go("cuenta") }, "Mi cuenta"),
                            h("button", { className: "dropdown-item", onClick: () => go("perfil") }, "Mi perfil público"),
                            h("button", { className: "dropdown-item", onClick: () => go("buscar-usuarios") }, "Buscar usuarios"),
                            h("button", { className: "dropdown-item", onClick: () => go("amigos") }, "Amigos"),
                            h("button", { className: "dropdown-item", onClick: () => go("configuracion") }, "Configuración"),
                            h("hr", { className: "dropdown-divider" }),
                            h("button", { className: "dropdown-item danger", onClick: () => { setUserMenuOpen(false); onLogout(); } }, "Cerrar sesión")
                        )
                    )
                    : null,
                user
                    ? h("button", { className: "nav-link", onClick: () => { setOpen(false); onLogout(); } }, "Salir")
                    : h("button",
                        {
                            className: "nav-link nav-cta" + ((page === "login" || page === "register" || page === "auth" || page === "recuperar") ? " active" : ""),
                            onClick: () => go("auth")
                        },
                        "Entrar"
                      )
            ),
            h("button",
                { className: "menu-toggle", onClick: () => setOpen(!open), "aria-label": "Abrir menú", "aria-expanded": open },
                open ? "✕" : "☰"
            )
        )
    );
}

/* ---------- Footer ---------- */
function SiteFooter(props) {
    const onNavigate = props.onNavigate;
    const year = new Date().getFullYear();
    return h("footer", { className: "site-footer" },
        h("div", { className: "footer-inner" },
            h("div", { className: "footer-col" },
                h("p", { className: "footer-logo" }, BRAND),
                h("p", { className: "muted" }, SLOGAN)
            ),
            h("div", { className: "footer-col" },
                h("p", { className: "footer-title" }, "Navegación"),
                h("button", { className: "footer-link", onClick: () => onNavigate("home") }, "Inicio"),
                h("button", { className: "footer-link", onClick: () => onNavigate("peliculas") }, "Películas"),
            ),
            h("div", { className: "footer-col" },
                h("p", { className: "footer-title" }, "Empieza ahora"),
                h("p", { className: "muted" }, "Busca tu primera historia y pulsa Guardar"),
                h("button", { className: "footer-link", onClick: () => onNavigate("peliculas") }, "Continuar ahora →")
            )
        ),
        h("div", { className: "footer-bottom" },
            h("small", null, "© " + year + " " + BRAND)
        )
    );
}

/* ---------- MovieCard ---------- */
const PLACEHOLDER_POSTER = "https://via.placeholder.com/300x450?text=Sin+imagen";

function MovieCard(props) {
    const movie = props.movie;
    const onDelete = props.onDelete;
    const onDetail = props.onDetail;
    const showDelete = props.showDelete;

    return h("article",
        { className: "movie-card", onClick: () => { if (onDetail) onDetail(movie); } },
        h("div", { className: "movie-card-poster" },
            h("img", { src: movie.poster || PLACEHOLDER_POSTER, alt: movie.title, loading: "lazy" }),
            movie.rating ? h("span", { className: "rating-badge" }, "★ " + movie.rating) : null
        ),
        h("div", { className: "movie-card-body" },
            h("h3", { title: movie.title }, movie.title),
            h("p", { className: "movie-meta" }, (movie.year || "----") + " · Película"),
            movie.genre ? h("p", { className: "movie-genre" }, movie.genre) : null,
            (showDelete && onDelete)
                ? h("button", {
                    className: "delete-btn",
                    onClick: (e) => { e.stopPropagation(); onDelete(movie.id); }
                }, "Eliminar")
                : null
        )
    );
}

/* ---------- MovieCarousel ---------- */
function MovieCarousel(props) {
    const title = props.title;
    const subtitle = props.subtitle;
    const movies = props.movies;
    const onDelete = props.onDelete;
    const onDetail = props.onDetail;
    const emptyText = props.emptyText;
    const showDelete = props.showDelete;
    const trackRef = React.useRef(null);

    const scrollBy = (dir) => {
        const el = trackRef.current;
        if (!el) return;
        const amount = Math.round(el.clientWidth * 0.8) * dir;
        el.scrollBy({ left: amount, behavior: "smooth" });
    };

    if (!movies || movies.length === 0) {
        return h("section", { className: "carousel-section" },
            h("h2", null, title),
            subtitle ? h("p", { className: "muted" }, subtitle) : null,
            h("p", { className: "muted" }, emptyText || "Nada que mostrar todavía.")
        );
    }

    return h("section", { className: "carousel-section" },
        h("div", { className: "carousel-head" },
            h("div", null,
                h("h2", null, title),
                subtitle ? h("p", { className: "muted" }, subtitle) : null
            ),
            h("div", { className: "carousel-controls" },
                h("button", { onClick: () => scrollBy(-1), "aria-label": "Anterior" }, "‹"),
                h("button", { onClick: () => scrollBy(1), "aria-label": "Siguiente" }, "›")
            )
        ),
        h("div", { className: "carousel-track", ref: trackRef },
            movies.map((movie) =>
                h("div", { className: "carousel-item", key: movie.id || movie.imdbID || movie.title },
                    h(MovieCard, { movie: movie, onDelete: onDelete, onDetail: onDetail, showDelete: showDelete })
                )
            )
        )
    );
}

/* ---------- LandingPage ---------- */
function LandingPage(props) {
    const onExplore = props.onExplore;
    const movies = props.movies;
    const user = props.user || null;
    const featuredState = React.useState([]);
    const featuredMovies = featuredState[0];
    const setFeaturedMovies = featuredState[1];

    React.useEffect(() => {
        if (user) {
            setFeaturedMovies([]);
            return;
        }
        let alive = true;
        fetch("/api/movies/popular?limit=3")
            .then((res) => res.json())
            .then((data) => {
                if (alive && Array.isArray(data.results)) setFeaturedMovies(data.results);
            })
            .catch(() => {
                if (alive) setFeaturedMovies([]);
            });
        return () => { alive = false; };
    }, [user]);

    const preview = (movies || []).slice(0, 10);
    const source = !user && featuredMovies.length > 0 ? featuredMovies : preview;
    const heroPosters = (source.length > 0
        ? source
        : [{ title: "Inception", poster: null }, { title: "Dune", poster: null }, { title: "Avatar", poster: null }]
    ).slice(0, 3);

    return h("div", { className: "landing" },
        h("section", { className: "hero" },
            h("div", { className: "hero-text" },
                h("p", { className: "hero-kicker" }, BRAND),
                h("h1", null, "Descubre, explora", h("br", null), "y guarda tus favoritas"),
                h("p", { className: "hero-sub" }, SLOGAN),
                h("div", { className: "hero-actions" },
                    h("button", { className: "btn-primary btn-big", onClick: onExplore }, "Continuar ahora →")
                ),
                h("div", { className: "hero-stats" },
                    h("div", null, h("strong", null, String((movies || []).length)), h("span", null, "guardadas")),
                    h("div", null, h("strong", null, "Miles"), h("span", null, "de títulos")),
                    h("div", null, h("strong", null, "Gratis"), h("span", null, "para siempre"))
                )
            ),
            h("div", { className: "hero-visual", "aria-hidden": "true" },
                h("div", { className: "hero-posters" },
                    heroPosters.map((m, i) =>
                        h("div", { className: "hero-poster-card tilt-" + i, key: m.id || (m.title + i) },
                            h("img", {
                                src: m.poster || ("https://via.placeholder.com/300x450?text=" + encodeURIComponent(m.title)),
                                alt: "",
                                loading: "lazy"
                            })
                        )
                    )
                )
            )
        ),
        h("section", { className: "features" },
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "01"),
                h("h3", null, "Encuentra tu próxima favorita"),
                h("p", null, "Busca entre miles de películas por su título")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "02"),
                h("h3", null, "Desliza y descubre"),
                h("p", null, "Explora las cards cómodamente")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "03"),
                h("h3", null, "Guarda tu colección"),
                h("p", null, "Guarda las que te gusten y tenlas siempre a mano")
            )
        ),
        h("section", { className: "cta-band" },
            h("h2", null, "¿Empezamos?"),
            h("p", null, "Busca tu primera película, guárdala y aparecerá en tu colección"),
            h("button", { className: "btn-primary btn-big", onClick: onExplore }, "Continuar ahora")
        )
    );
}

/* ---------- AuthChoice: pantalla inicial para elegir Entrar / Registrarse ---------- */
function AuthChoice(props) {
    const onLogin = props.onLogin;
    const onRegister = props.onRegister;

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card auth-choice" },
            h("h1", null, "Bienvenido a " + BRAND),
            h("p", { className: "muted" }, "Elige cómo quieres continuar:"),
            h("div", { className: "choice-buttons" },
                h("button", { className: "btn-primary btn-big", onClick: onLogin }, "Iniciar sesión"),
                h("button", { className: "btn-ghost btn-big", onClick: onRegister }, "Crear cuenta")
            )
        )
    );
}

/* ---------- ForgotPasswordPage ---------- */
function ForgotPasswordPage(props) {
    const onBack = props.onBack;
    const emailState = React.useState("");
    const email = emailState[0];
    const setEmail = emailState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(null);
    const success = successState[0];
    const setSuccess = successState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    const submit = async (e) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) { setError("Escribe tu email."); return; }
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
            await ensureFirebase();
            await firebase.auth().sendPasswordResetEmail(cleanEmail, firebaseActionSettings("resetPassword"));
            setSuccess("Si el email existe, recibirás un enlace para restablecer la contraseña.");
        } catch (err) {
            setError(friendlyFirebaseError(err));
        } finally {
            setLoading(false);
        }
    };

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card" },
            h("h1", null, "Recuperar contraseña"),
            h("p", { className: "muted" }, "Te enviaremos un enlace a tu email para crear una nueva contraseña."),
            error ? h("p", { className: "error" }, error) : null,
            success ? h("p", { className: "success" }, success) : null,
            h("form", { onSubmit: submit },
                h("div", { className: "auth-field" },
                    h("label", null, "Email"),
                    h("input", {
                        type: "email", value: email,
                        onChange: (e) => setEmail(e.target.value),
                        placeholder: "tu@email.com", autoComplete: "email"
                    })
                ),
                h("button", { className: "btn-primary", type: "submit", disabled: loading },
                    loading ? "Enviando..." : "Enviar enlace"
                )
            ),
            h("p", { className: "auth-switch" }, "¿Recordaste la contraseña? ",
                h("button", { type: "button", onClick: onBack }, "Volver a entrar")
            )
        )
    );
}

/* ---------- EmailVerificationPage (Firebase Auth) ---------- */
function EmailVerificationPage(props) {
    const onBack = props.onBack;
    const params = new URLSearchParams(window.location.search);
    const actionCode = params.get("oobCode") || "";
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(false);
    const success = successState[0];
    const setSuccess = successState[1];
    const loadingState = React.useState(true);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    React.useEffect(() => {
        if (!actionCode) {
            setError("El enlace de verificación no es válido.");
            setLoading(false);
            return;
        }
        ensureFirebase()
            .then(() => firebase.auth().applyActionCode(actionCode))
            .then(() => setSuccess(true))
            .catch((err) => setError(friendlyFirebaseError(err)))
            .finally(() => setLoading(false));
    }, []);

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card" },
            h("h1", null, "Verificación de correo"),
            loading ? h("p", { className: "muted" }, "Comprobando el enlace...") : null,
            error ? h("p", { className: "error" }, error) : null,
            success ? h("p", { className: "success" }, "Correo verificado correctamente. Ya puedes iniciar sesión.") : null,
            h("button", { className: "btn-primary", type: "button", onClick: onBack }, "Ir a iniciar sesión")
        )
    );
}

/* ---------- PasswordResetPage (Firebase Auth) ---------- */
function PasswordResetPage(props) {
    const onBack = props.onBack;
    const params = new URLSearchParams(window.location.search);
    const actionCode = params.get("oobCode") || "";
    const emailState = React.useState("");
    const email = emailState[0];
    const setEmail = emailState[1];
    const passwordState = React.useState("");
    const password = passwordState[0];
    const setPassword = passwordState[1];
    const password2State = React.useState("");
    const password2 = password2State[0];
    const setPassword2 = password2State[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(null);
    const success = successState[0];
    const setSuccess = successState[1];
    const loadingState = React.useState(true);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    React.useEffect(() => {
        if (!actionCode) {
            setError("El enlace de recuperación no es válido.");
            setLoading(false);
            return;
        }
        ensureFirebase()
            .then(() => firebase.auth().verifyPasswordResetCode(actionCode))
            .then((resolvedEmail) => {
                setEmail(resolvedEmail);
                setLoading(false);
            })
            .catch((err) => {
                setError(friendlyFirebaseError(err));
                setLoading(false);
            });
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            setError("La contraseña debe tener al menos 6 caracteres.");
            return;
        }
        if (password !== password2) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await firebase.auth().confirmPasswordReset(actionCode, password);
            setSuccess("Contraseña actualizada. Ya puedes iniciar sesión.");
        } catch (err) {
            setError(friendlyFirebaseError(err));
        } finally {
            setLoading(false);
        }
    };

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card" },
            h("h1", null, "Nueva contraseña"),
            email ? h("p", { className: "muted" }, email) : null,
            error ? h("p", { className: "error" }, error) : null,
            success ? h("p", { className: "success" }, success) : null,
            !success && !error && !loading
                ? h("form", { onSubmit: submit },
                    h("div", { className: "auth-field" },
                        h("label", null, "Nueva contraseña"),
                        h("input", {
                            type: "password", value: password,
                            onChange: (e) => setPassword(e.target.value),
                            autoComplete: "new-password", minLength: 6
                        })
                    ),
                    h("div", { className: "auth-field" },
                        h("label", null, "Repite la contraseña"),
                        h("input", {
                            type: "password", value: password2,
                            onChange: (e) => setPassword2(e.target.value),
                            autoComplete: "new-password", minLength: 6
                        })
                    ),
                    h("button", { className: "btn-primary", type: "submit", disabled: loading },
                        loading ? "Guardando..." : "Guardar contraseña"
                    )
                )
                : null,
            h("p", { className: "auth-switch" },
                h("button", { type: "button", onClick: onBack }, "Volver a entrar")
            )
        )
    );
}

/* ---------- LoginPage (Firebase email+password + Google) ---------- */
function LoginPage(props) {
    const onAuth = props.onAuth;
    const onSwitch = props.onSwitch;
    const onForgot = props.onForgot;
    const emailState = React.useState("");
    const email = emailState[0];
    const setEmail = emailState[1];
    const passState = React.useState("");
    const password = passState[0];
    const setPassword = passState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const googleLoadingState = React.useState(false);
    const googleLoading = googleLoadingState[0];
    const setGoogleLoading = googleLoadingState[1];
    const fbState = React.useState(null); // null | "ready" | "unavailable"
    const fbStatus = fbState[0];
    const setFbStatus = fbState[1];

    React.useEffect(() => {
        let alive = true;
        ensureFirebase().then(() => { if (alive) setFbStatus("ready"); })
            .catch(() => { if (alive) setFbStatus("unavailable"); });
        return () => { alive = false; };
    }, []);

    const submit = async (e) => {
        e.preventDefault();
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !password) {
            setError("Escribe tu email y tu contraseña.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const cred = await firebase.auth().signInWithEmailAndPassword(cleanEmail, password);
            if (!cred.user.emailVerified) {
                await cred.user.sendEmailVerification();
                await firebase.auth().signOut();
                throw new Error("Debes verificar tu correo antes de entrar. Te hemos enviado un nuevo enlace.");
            }
            const data = await firebaseSessionWithBackend(cred.user, "");
            onAuth(data.token, data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        setGoogleLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const provider = new firebase.auth.GoogleAuthProvider();
            const cred = await firebase.auth().signInWithPopup(provider);
            const data = await firebaseSessionWithBackend(cred.user, "");
            onAuth(data.token, data.user);
        } catch (err) {
            setError(isFirebaseUnavailableMessage(err.message)
                ? "Google no disponible: falta FIREBASE_API_KEY en el servidor. Activa Google en Firebase Console y añade la config web al .env."
                : friendlyFirebaseError(err));
        } finally {
            setGoogleLoading(false);
        }
    };

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card" },
            h("h1", null, "Entrar"),
            h("p", { className: "muted" }, "Bienvenido de nuevo a " + BRAND),
            error ? h("p", { className: "error" }, error) : null,
            h("form", { onSubmit: submit },
                h("div", { className: "auth-field" },
                    h("label", null, "Email"),
                    h("input", {
                        type: "email", value: email,
                        onChange: (e) => setEmail(e.target.value),
                        placeholder: "tu@email.com", autoComplete: "email"
                    })
                ),
                h("div", { className: "auth-field" },
                    h("label", null, "Contraseña"),
                    h("input", {
                        type: "password", value: password,
                        onChange: (e) => setPassword(e.target.value),
                        placeholder: "Tu contraseña", autoComplete: "current-password"
                    })
                ),
                h("button", { className: "btn-primary", type: "submit", disabled: loading || googleLoading },
                    loading ? "Entrando..." : "Entrar"
                )
            ),
            h("div", { className: "auth-divider" }, h("span", null, "o")),
            h("button", {
                className: "btn-google", type: "button",
                onClick: loginWithGoogle, disabled: loading || googleLoading
            },
                h(GoogleGIcon, null),
                googleLoading ? "Conectando con Google..." : "Continuar con Google"
            ),
            
            h("p", { className: "auth-switch" }, "¿No tienes cuenta? ",
                h("button", { type: "button", onClick: onSwitch }, "Regístrate")
            ),
            h("p", { className: "auth-switch" }, "¿Has olvidado la contraseña? ",
                h("button", { type: "button", onClick: onForgot }, "Recuperar contraseña")
            )
        )
    );
}

/* ---------- RegisterPage: multi-paso (datos básicos → cuestionario) ---------- */
const ALL_GENRES = [
    "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
    "Drama", "Family", "Fantasy", "History", "Horror", "Music",
    "Mystery", "Romance", "Sci-Fi", "Thriller", "War", "Western"
];

/* Traducir géneros al español para mostrar */
function genreLabel(g) {
    const map = {
        Action: "Acción", Adventure: "Aventura", Animation: "Animación",
        Comedy: "Comedia", Crime: "Crimen", Documentary: "Documental",
        Drama: "Drama", Family: "Familiar", Fantasy: "Fantasía",
        History: "Histórico", Horror: "Terror", Music: "Música",
        Mystery: "Misterio", Romance: "Romance", "Sci-Fi": "Ciencia ficción",
        Thriller: "Suspense", War: "Bélica", Western: "Western"
    };
    return map[g] || g;
}

function RegisterPage(props) {
    const onAuth = props.onAuth;
    const onSwitch = props.onSwitch;
    const questionnaireOnly = props.questionnaireOnly === true;

    // Paso 1: datos básicos | Paso 2: cuestionario
    const stepState = React.useState(questionnaireOnly ? 2 : 1);
    const step = stepState[0];
    const setStep = stepState[1];

    // Datos básicos
    const nameState = React.useState("");
    const name = nameState[0];
    const setName = nameState[1];
    const emailState = React.useState("");
    const email = emailState[0];
    const setEmail = emailState[1];
    const passState = React.useState("");
    const password = passState[0];
    const setPassword = passState[1];
    const pass2State = React.useState("");
    const password2 = pass2State[0];
    const setPassword2 = pass2State[1];
    const nicknameState = React.useState("");
    const nickname = nicknameState[0];
    const setNickname = nicknameState[1];
    const nicknameErrorState = React.useState(null);
    const nicknameError = nicknameErrorState[0];
    const setNicknameError = nicknameErrorState[1];
    const checkingNicknameState = React.useState(false);
    const checkingNickname = checkingNicknameState[0];
    const setCheckingNickname = checkingNicknameState[1];

    // Cuestionario
    const genresState = React.useState([]);
    const selectedGenres = genresState[0];
    const setSelectedGenres = genresState[1];
    const likesMoviesState = React.useState(null);
    const likesMovies = likesMoviesState[0];
    const setLikesMovies = likesMoviesState[1];
    const likesSeriesState = React.useState(null);
    const likesSeries = likesSeriesState[0];
    const setLikesSeries = likesSeriesState[1];
    const likesMiniseriesState = React.useState(null);
    const likesMiniseries = likesMiniseriesState[0];
    const setLikesMiniseries = likesMiniseriesState[1];

    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const verificationState = React.useState(false);
    const verificationSent = verificationState[0];
    const setVerificationSent = verificationState[1];

    const toggleGenre = (g) => {
        setSelectedGenres((prev) =>
            prev.includes(g)
                ? prev.filter((x) => x !== g)
                : prev.length < 3
                    ? [...prev, g]
                    : prev
        );
    };

    const checkNickname = async (value) => {
        const clean = value.trim().toLowerCase();
        if (clean.length < 3) {
            setNicknameError("El nickname debe tener al menos 3 caracteres");
            return;
        }
        if (clean.length > 30) {
            setNicknameError("El nickname no puede superar 30 caracteres");
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(clean)) {
            setNicknameError("Solo letras, números y guión bajo");
            return;
        }
        setCheckingNickname(true);
        setNicknameError(null);
        try {
            const res = await fetch("/api/auth/nickname/check/" + encodeURIComponent(clean));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al comprobar");
            if (!data.available) {
                setNicknameError("Ese nickname ya está en uso");
            }
        } catch (err) {
            setNicknameError(err.message);
        } finally {
            setCheckingNickname(false);
        }
    };

    const fbState = React.useState(null); // null | "ready" | "unavailable"
    const fbStatus = fbState[0];
    const setFbStatus = fbState[1];
    const googleLoadingState = React.useState(false);
    const googleLoading = googleLoadingState[0];
    const setGoogleLoading = googleLoadingState[1];

    React.useEffect(() => {
        let alive = true;
        ensureFirebase().then(() => { if (alive) setFbStatus("ready"); })
            .catch(() => { if (alive) setFbStatus("unavailable"); });
        return () => { alive = false; };
    }, []);

    // Tras crear sesión con Firebase: si ya hizo el cuestionario, entra directo;
    // si no, avanza al paso 2 (NO llama a onAuth para no navegar todavía).
    const afterFirebaseSession = (data, needsVerification) => {
        try {
            window.localStorage.setItem("cineairos_token", data.token);
        } catch (e) { /* sin almacenamiento */ }
        if (data.user && data.user.prefs && data.user.prefs.onboardingDone) {
            onAuth(data.token, data.user);
        } else {
            setVerificationSent(Boolean(needsVerification));
            setStep(2);
        }
    };

    const resendVerification = async () => {
        setLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) throw new Error("La sesión de Firebase ha caducado. Vuelve a registrarte.");
            await currentUser.sendEmailVerification(firebaseActionSettings("verifyEmail"));
            setVerificationSent(true);
        } catch (err) {
            setError(friendlyFirebaseError(err));
        } finally {
            setLoading(false);
        }
    };

    const continueAfterVerification = async () => {
        setLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const currentUser = firebase.auth().currentUser;
            if (!currentUser) throw new Error("La sesión de Firebase ha caducado. Vuelve a registrarte.");
            await currentUser.reload();
            if (!currentUser.emailVerified) {
                throw new Error("El correo todavía no aparece como verificado. Abre el enlace recibido y vuelve a intentarlo.");
            }
            const data = await firebaseSessionWithBackend(currentUser, currentUser.displayName || name.trim());
            setVerificationSent(false);
            afterFirebaseSession(data, false);
        } catch (err) {
            setError(friendlyFirebaseError(err));
        } finally {
            setLoading(false);
        }
    };

    const handleStep1 = async (e) => {
        e.preventDefault();
        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanNickname = nickname.trim().toLowerCase();
        if (cleanName.length < 2) { setError("Escribe tu nombre."); return; }
        if (!cleanEmail) { setError("Escribe tu email."); return; }
        if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
        if (password !== password2) { setError("Las contraseñas no coinciden."); return; }
        if (cleanNickname.length < 3) { setError("El nickname debe tener al menos 3 caracteres."); return; }
        if (cleanNickname.length > 30) { setError("El nickname no puede superar 30 caracteres."); return; }
        if (!/^[a-zA-Z0-9_]+$/.test(cleanNickname)) { setError("El nickname solo puede contener letras, números y guión bajo."); return; }

        setLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const cred = await firebase.auth().createUserWithEmailAndPassword(cleanEmail, password);
            try {
                await cred.user.updateProfile({ displayName: cleanName });
            } catch (updErr) { /* nombre opcional */ }
            await cred.user.sendEmailVerification(firebaseActionSettings("verifyEmail"));
            // Set nickname after verification
            const token = getStoredToken();
            if (token) {
                const nicknameRes = await fetch("/api/auth/nickname", {
                    method: "POST",
                    headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                    body: JSON.stringify({ nickname: cleanNickname })
                });
                if (!nicknameRes.ok) {
                    const data = await nicknameRes.json();
                    setError(data.error || "No se pudo guardar el nickname");
                    setLoading(false);
                    return;
                }
            }
            setVerificationSent(true);
            setStep(2);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const registerWithGoogle = async () => {
        setGoogleLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const provider = new firebase.auth.GoogleAuthProvider();
            const cred = await firebase.auth().signInWithPopup(provider);
            const data = await firebaseSessionWithBackend(cred.user, cred.user.displayName || name.trim());
            afterFirebaseSession(data, false);
        } catch (err) {
            setError(isFirebaseUnavailableMessage(err.message)
                ? "Google no disponible: falta FIREBASE_API_KEY en el servidor. Activa Google en Firebase Console y añade la config web al .env."
                : friendlyFirebaseError(err));
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleQuestionnaire = async (e) => {
        e.preventDefault();
        if (selectedGenres.length !== 3) {
            setError("Selecciona exactamente 3 géneros.");
            return;
        }
        if (likesMovies === null) {
            setError("Responde la pregunta de películas.");
            return;
        }
        if (likesSeries === null) {
            setError("Responde la pregunta de series.");
            return;
        }
        if (likesMiniseries === null) {
            setError("Responde la pregunta de miniseries.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const token = getStoredToken();
            const res = await fetch("/api/auth/prefs", {
                method: "PUT",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({
                    favoriteGenres: selectedGenres,
                    likesMovies: likesMovies,
                    likesSeries: likesSeries,
                    likesMiniseries: likesMiniseries,
                    onboardingDone: true
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo guardar");
            // Refrescar usuario con prefs y terminar
            const meRes = await fetch("/api/auth/me", { headers: authHeaders() });
            const meData = await meRes.json();
            if (meRes.ok && meData.user) {
                onAuth(token, meData.user);
            } else {
                // Fallback: login automático
                onAuth(token, { ...meData.user, prefs: data.prefs });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const renderStep1 = () => React.createElement(React.Fragment, null,
        h("form", { onSubmit: handleStep1 },
            h("div", { className: "auth-field" },
                h("label", null, "Nombre"),
                h("input", {
                    type: "text", value: name,
                    onChange: (e) => setName(e.target.value),
                    placeholder: "Tu nombre", autoComplete: "name", maxLength: 80
                })
            ),
            h("div", { className: "auth-field" },
                h("label", null, "Email"),
                h("input", {
                    type: "email", value: email,
                    onChange: (e) => setEmail(e.target.value),
                    placeholder: "tu@email.com", autoComplete: "email"
                })
            ),
            h("div", { className: "auth-field" },
                h("label", null, "Contraseña"),
                h("input", {
                    type: "password", value: password,
                    onChange: (e) => setPassword(e.target.value),
                    placeholder: "Mínimo 6 caracteres", autoComplete: "new-password"
                })
            ),
            h("div", { className: "auth-field" },
                h("label", null, "Repite la contraseña"),
                h("input", {
                    type: "password", value: password2,
                    onChange: (e) => setPassword2(e.target.value),
                    placeholder: "Otra vez", autoComplete: "new-password"
                })
            ),
            h("div", { className: "auth-field" },
                h("label", null, "Nickname (único)"),
                h("div", { className: "nickname-field" },
                    h("span", { className: "nickname-prefix" }, "@"),
                    h("input", {
                        type: "text", value: nickname,
                        onChange: (e) => {
                            const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                            setNickname(v);
                            if (v.length >= 3) checkNickname(v);
                            else setNicknameError(null);
                        },
                        placeholder: "min. 3 chars, letras, números, _", autoComplete: "username", maxLength: 30
                    }),
                    checkingNickname ? h("span", { className: "nickname-checking" }, "⟳") : null
                ),
                nicknameError ? h("p", { className: "error hint" }, nicknameError) : null,
                h("p", { className: "hint" }, "Tu identidad única para que te encuentren tus amigos")
            ),
            h("button", { className: "btn-primary", type: "submit", disabled: loading || googleLoading },
                loading ? "Creando cuenta..." : "Continuar"
            )
        ),
        h("div", { className: "auth-divider" }, h("span", null, "o")),
        h("button", {
            className: "btn-google", type: "button",
            onClick: registerWithGoogle, disabled: loading || googleLoading
        },
            h(GoogleGIcon, null),
            googleLoading ? "Conectando con Google..." : "Registrarse con Google"
        ),
        
    );

    const renderStep2 = () => h("form", { onSubmit: handleQuestionnaire },
        h("p", { className: "muted" }, "Solo 4 preguntas rápidas para personalizar tu experiencia."),
        verificationSent
            ? h("div", { className: "success" },
                "Te hemos enviado un correo de verificación. No se abrirá tu sesión hasta que confirmes tu dirección.",
                h("div", { className: "result-actions" },
                    h("button", { type: "button", className: "btn-primary btn-small", onClick: continueAfterVerification, disabled: loading }, loading ? "Comprobando..." : "Ya he verificado mi correo"),
                    h("button", { type: "button", className: "btn-ghost btn-small", onClick: resendVerification, disabled: loading }, "Reenviar correo")
                )
            )
            : h(React.Fragment, null,
        // Pregunta 1: Géneros (multi-select, máx 3)
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "1"), " ¿Cuáles son tus 3 géneros favoritos?"),
            h("div", { className: "genre-grid" },
                ALL_GENRES.map((g) =>
                    h("button", {
                        key: g,
                        type: "button",
                        className: "genre-chip" + (selectedGenres.includes(g) ? " selected" : ""),
                        onClick: () => toggleGenre(g),
                        disabled: !selectedGenres.includes(g) && selectedGenres.length >= 3
                    }, genreLabel(g))
                )
            ),
            h("p", { className: "hint" }, selectedGenres.length + " de 3 seleccionados")
        ),
        // Pregunta 2: Películas
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "2"), " ¿Te gusta ver películas?"),
            h("div", { className: "yn-buttons" },
                h("button", {
                    type: "button", className: "yn-btn" + (likesMovies === true ? " active" : ""),
                    onClick: () => setLikesMovies(true)
                }, "Sí"),
                h("button", {
                    type: "button", className: "yn-btn" + (likesMovies === false ? " active" : ""),
                    onClick: () => setLikesMovies(false)
                }, "No")
            )
        ),
        // Pregunta 3: Series
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "3"), " ¿Te gustan las series?"),
            h("div", { className: "yn-buttons" },
                h("button", {
                    type: "button", className: "yn-btn" + (likesSeries === true ? " active" : ""),
                    onClick: () => setLikesSeries(true)
                }, "Sí"),
                h("button", {
                    type: "button", className: "yn-btn" + (likesSeries === false ? " active" : ""),
                    onClick: () => setLikesSeries(false)
                }, "No")
            )
        ),
        // Pregunta 4: Miniseries
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "4"), " ¿Te gustan las miniseries?"),
            h("div", { className: "yn-buttons" },
                h("button", {
                    type: "button", className: "yn-btn" + (likesMiniseries === true ? " active" : ""),
                    onClick: () => setLikesMiniseries(true)
                }, "Sí"),
                h("button", {
                    type: "button", className: "yn-btn" + (likesMiniseries === false ? " active" : ""),
                    onClick: () => setLikesMiniseries(false)
                }, "No")
            )
        ),
        h("button", { className: "btn-primary", type: "submit", disabled: loading },
            loading ? "Guardando..." : "Terminar"
        )
            ),
    );

    return h("div", { className: "auth-wrap" },
        h("div", { className: "auth-card" },
            h("div", { className: "step-indicator" },
                h("span", { className: "step-dot" + (step >= 1 ? " active" : "") }, "1"),
                h("span", { className: "step-line" }),
                h("span", { className: "step-dot" + (step >= 2 ? " active" : "") }, "2")
            ),
            step === 1 ? (
                React.createElement(React.Fragment, null,
                    h("h1", null, "Crear cuenta"),
                    h("p", { className: "muted" }, "Paso 1 de 2: tus datos básicos"),
                    error ? h("p", { className: "error" }, error) : null,
                    renderStep1(),
                    h("p", { className: "auth-switch" }, "¿Ya tienes cuenta? ",
                        h("button", { type: "button", onClick: onSwitch }, "Entrar")
                    )
                )
            ) : (
                React.createElement(React.Fragment, null,
                    h("h1", null, "Cuéntanos tus gustos"),
                    h("p", { className: "muted" }, "Paso 2 de 2: preferencias"),
                    error ? h("p", { className: "error" }, error) : null,
                    renderStep2()
                )
            )
        )
    );
}

/* ---------- MediaPage: Películas con filtros ----------
    Props: movies, loadingList,
   onRefresh(), onDelete(id), onNavigate(page) */
function MediaPage(props) {
    const user = props.user || null;
    const movies = props.movies;
    const loadingList = props.loadingList;
    const onRefresh = props.onRefresh;
    const onDelete = props.onDelete;
    const onNavigate = props.onNavigate;
    const omdbType = "movie";

    const queryState = React.useState("");
    const query = queryState[0];
    const setQuery = queryState[1];
    const yearState = React.useState("");
    const yearFilter = yearState[0];
    const setYearFilter = yearState[1];
    const ratingState = React.useState(0);
    const minRating = ratingState[0];
    const setMinRating = ratingState[1];
    const genreState = React.useState("");
    const genreFilter = genreState[0];
    const setGenreFilter = genreState[1];
    const sortState = React.useState("relevance");
    const sortBy = sortState[0];
    const setSortBy = sortState[1];
    const resultState = React.useState(null);
    const result = resultState[0];
    const setResult = resultState[1];
    const resultWarningState = React.useState(null);
    const resultWarning = resultWarningState[0];
    const setResultWarning = resultWarningState[1];
    const exploreState = React.useState([]);
    const explore = exploreState[0];
    const setExplore = exploreState[1];
    const exploreTitleState = React.useState("Descubre");
    const exploreTitle = exploreTitleState[0];
    const setExploreTitle = exploreTitleState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const loadingDetailsState = React.useState(false);
    const loadingDetails = loadingDetailsState[0];
    const setLoadingDetails = loadingDetailsState[1];
    const loadingDefaultsState = React.useState(true);
    const loadingDefaults = loadingDefaultsState[0];
    const setLoadingDefaults = loadingDefaultsState[1];
    const savingState = React.useState(false);
    const saving = savingState[0];
    const setSaving = savingState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(null);
    const success = successState[0];
    const setSuccess = successState[1];
    const detailState = React.useState(null);
    const detail = detailState[0];
    const setDetail = detailState[1];
    const detailLoadingState = React.useState(false);
    const detailLoading = detailLoadingState[0];
    const setDetailLoading = detailLoadingState[1];
    // Reseña abierta en el modal compartido ReviewsModal (backend /api/reviews).
    const reviewsDetailState = React.useState(null);
    const reviewsDetail = reviewsDetailState[0];
    const setReviewsDetail = reviewsDetailState[1];
    // Segundos de espera cuando el servidor nos frena (429): el botón se
    // desactiva con cuenta atrás para no realimentar el bloqueo.
    const cooldownState = React.useState(0);
    const cooldown = cooldownState[0];
    const setCooldown = cooldownState[1];

    // Valida el filtro de año (vacío o 4 cifras 1900-2100).
    const parseYearFilter = () => {
        const y = String(yearFilter).trim();
        if (!y) return null;
        if (!/^\d{4}$/.test(y)) throw new Error("El año debe tener 4 cifras (ej. 2010)");
        const n = Number.parseInt(y, 10);
        if (n < 1900 || n > 2100) throw new Error("El año debe estar entre 1900 y 2100");
        return n;
    };

    // Pide el detalle (nota, género...) de cada item de la lista para poder filtrar.
    // Por lotes de 5 para no saturar con ráfagas. Si nos frena el límite (429),
    // se avisa con mensaje claro en vez de filtrar todo en silencio.
    const enrichWithDetails = async (items) => {
        const out = [];
        for (let i = 0; i < items.length; i += 5) {
            const chunk = await Promise.all(items.slice(i, i + 5).map(async (item) => {
                if (!item.imdbID) return { item: item, limited: false };
                try {
                    const res = await fetch("/api/movies/search?i=" + encodeURIComponent(item.imdbID));
                    if (res.status === 429) return { item: item, limited: true };
                    const data = await res.json();
                    if (!res.ok) return { item: item, limited: false };
                    return {
                        item: Object.assign({}, item, {
                            genre: data.genre || item.genre,
                            rating: data.rating || null,
                            plot: data.plot,
                            director: data.director,
                            actors: data.actors,
                            runtime: data.runtime,
                            type: data.type || item.type,
                        }),
                        limited: false
                    };
                } catch (e) {
                    return { item: item, limited: false };
                }
            }));
            if (chunk.some((r) => r.limited)) {
                throw rateLimitExceeded();
            }
            chunk.forEach((r) => out.push(r.item));
        }
        return out;
    };

    const applyClientFilters = (items, year, min, genre, expectedType) => {
        return items.filter((item) => {
            // Blindaje por apartado: la API a veces cuela otro tipo en la lista.
            if (expectedType) {
                const it = String(item.type || "").toLowerCase();
                if (it && it !== expectedType) return false;
            }
            if (year) {
                const iy = yearOf(item);
                if (iy !== year) return false;
            }
            if (min > 0) {
                const r = ratingOf(item);
                if (r === null || r < min) return false;
            }
            if (genre) {
                const g = String(item.genre || "").toLowerCase();
                if (!g || g.indexOf(genre.toLowerCase()) === -1) return false;
            }
            return true;
        });
    };

    const applySort = (items, mode) => {
        const arr = items.slice();
        if (mode === "year-desc") {
            arr.sort((a, b) => (yearOf(b) || -1) - (yearOf(a) || -1));
        } else if (mode === "year-asc") {
            arr.sort((a, b) => (yearOf(a) || 9999) - (yearOf(b) || 9999));
        } else if (mode === "rating-desc") {
            arr.sort((a, b) => {
                const ra = ratingOf(a);
                const rb = ratingOf(b);
                if (ra === null && rb === null) return 0;
                if (ra === null) return 1;
                if (rb === null) return -1;
                return rb - ra;
            });
        }
        return arr;
    };

    // Modo descubrir: pide una muestra aleatoria de Firebase y aplica aquí
    // los filtros que no forman parte de la consulta del servidor.
    const runDiscovery = async (year, min, genre) => {
        let pooled = [];
        try {
            let url = "/api/movies/popular?limit=30";
            if (year) url += "&y=" + year;
            const res = await fetch(url);
            if (res.status === 429) {
                throw rateLimitExceeded();
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Sin resultados para esos filtros.");
            if (Array.isArray(data.results)) pooled = data.results;
        } catch (e) {
            if (e && e.code === "RATE_LIMIT") throw e;
            throw new Error(e.message || "No se pudo cargar contenido desde Firebase.");
        }
        if (pooled.length === 0) {
            throw new Error("Sin resultados para esos filtros. Prueba con otros.");
        }
        // Sin filtro de nota ni género no hace falta pedir detalles: la lista ya trae año y tipo.
        if (min > 0 || genre !== "") {
            setLoadingDetails(true);
            try {
                pooled = await enrichWithDetails(pooled);
            } finally {
                setLoadingDetails(false);
            }
        }
        const filtered = applySort(applyClientFilters(pooled, year, min, genre, omdbType), sortBy);
        setExplore(filtered);
        setExploreTitle("Explora (" + filtered.length + ")");
        if (filtered.length === 0) {
            setError("Nada coincide con esos filtros. Prueba a suavizarlos.");
        }
    };

    // Carga el contenido inicial desde el mismo catálogo que usa el buscador.
    const loadDefaults = async () => {
        setLoadingDefaults(true);
        setError(null);
        try {
            const res = await fetch(
                "/api/movies/popular?limit=12"
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el contenido");
            setExplore(Array.isArray(data.results) ? data.results : []);
            setExploreTitle("Popular ahora");
        } catch (e) {
            setExplore([]);
            setError(e.message || "No se pudo cargar Popular ahora desde Firebase.");
        } finally {
            setLoadingDefaults(false);
        }
    };

    // Al entrar o cambiar de apartado se carga su contenido por defecto.
    useEffect(() => {
        loadDefaults();
    }, []);

    // Ticker de la cuenta atrás del límite (nunca sube, solo baja).
    useEffect(() => {
        const timer = setInterval(() => {
            setCooldown((c) => (c > 0 ? c - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const rateLimitExceeded = () => {
        const err = new Error("Has hecho muchas búsquedas seguidas. Espera un minuto y vuelve a intentarlo.");
        err.code = "RATE_LIMIT";
        return err;
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = query.trim();
        let year = null;
        try {
            year = parseYearFilter();
        } catch (err) {
            setError(err.message);
            return;
        }
        const min = Number(minRating) || 0;
        const genre = genreFilter || "";
        const hasFilters = year !== null || min > 0 || genre !== "";
        if (!q && !hasFilters) {
            setError("Escribe un título o elige algún filtro para explorar");
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        setResult(null);
        setResultWarning(null);
        setExplore([]);
        try {
            // Sin título pero con filtros: modo descubrir.
            if (!q) {
                await runDiscovery(year, min, genre);
                return;
            }
            let exactUrl = "/api/movies/search?t=" + encodeURIComponent(q);
            let listUrl = "/api/movies/search-list?s=" + encodeURIComponent(q);
            if (year) {
                exactUrl += "&y=" + year;
                listUrl += "&y=" + year;
            }
            const results = await Promise.all([
                fetch(exactUrl).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() })),
                fetch(listUrl).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() }))
            ]);
            const exactRes = results[0];
            const listRes = results[1];

            if (exactRes.status === 429 || listRes.status === 429) {
                throw rateLimitExceeded();
            }

            if (exactRes.ok) {
                const warnings = [];
                const exactRating = ratingOf(exactRes.data);
                if (min > 0 && (exactRating === null || exactRating < min)) {
                    warnings.push("Su nota (" + (exactRes.data.rating || "sin nota") + ") está por debajo de tu filtro de " + min + ".");
                }
                if (genre && String(exactRes.data.genre || "").toLowerCase().indexOf(genre.toLowerCase()) === -1) {
                    warnings.push("Su género no coincide con tu filtro.");
                }
                setResult(exactRes.data);
                setResultWarning(warnings.length > 0 ? warnings.join(" ") : null);
            }
            if (listRes.ok) {
                let items = Array.isArray(listRes.data.results) ? listRes.data.results : [];
                // La lista no trae nota ni género: se pide el detalle solo si hace falta filtrar.
                if ((min > 0 || genre !== "") && items.length > 0) {
                    setLoadingDetails(true);
                    try {
                        items = await enrichWithDetails(items);
                    } finally {
                        setLoadingDetails(false);
                    }
                }
                setExplore(applySort(applyClientFilters(items, year, min, genre, omdbType), sortBy));
                setExploreTitle("Resultados de tu búsqueda");
            }
            if (!exactRes.ok && !listRes.ok) {
                throw new Error(exactRes.data.error || listRes.data.error || "Sin resultados");
            }
        } catch (err) {
            setError(err.message);
            if (err && err.code === "RATE_LIMIT") setCooldown(60);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setQuery("");
        setYearFilter("");
        setMinRating(0);
        setGenreFilter("");
        setSortBy("relevance");
        setResult(null);
        setResultWarning(null);
        setError(null);
        setSuccess(null);
        setExploreTitle("Popular ahora");
        loadDefaults();
    };

    const handleSave = async (movieToSave) => {
        const movie = movieToSave || result;
        if (!movie) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/movies", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify(movie)
            });
            const data = await res.json();
            if (!res.ok) {
                const saveErr = new Error(data.error || "Error al guardar");
                saveErr.status = res.status;
                throw saveErr;
            }
            setSuccess("¡Guardada en tu colección!");
            setResult(null);
            setResultWarning(null);
            setDetail(null);
            setQuery("");
            await onRefresh();
        } catch (err) {
            setError(err.message);
            if (err.status === 401) onNavigate("login");
        } finally {
            setSaving(false);
        }
    };

    // Abrir detalle: prefiere el IMDb ID (más preciso) y si ya trae sinopsis la muestra directo.
    const openDetail = async (movie) => {
        if (movie.plot || movie.director) {
            setDetail(movie);
            return;
        }
        setDetailLoading(true);
        try {
            const url = movie.imdbID
                ? "/api/movies/search?i=" + encodeURIComponent(movie.imdbID)
                : "/api/movies/search?t=" + encodeURIComponent(movie.title);
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle");
            setDetail(data);
        } catch (err) {
            setDetail(movie);
        } finally {
            setDetailLoading(false);
        }
    };

    const filtersActive = String(yearFilter).trim() !== "" || Number(minRating) > 0 || genreFilter !== "";

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Películas"),
            h("p", { className: "muted" }, "Busca tus favoritas, guárdalas y vuelve a verlas cuando quieras.")
        ),
        h("form", { onSubmit: handleSearch, className: "search-form" },
            h("input", {
                type: "text",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                placeholder: "Buscar películas... (ej. Inception)",
                maxLength: 100
            }),
            h("button", { type: "submit", disabled: loading || cooldown > 0 }, loading ? "Buscando..." : (cooldown > 0 ? "Espera " + cooldown + "s" : "Buscar"))
        ),
        h("div", { className: "filters" },
            h("label", { className: "filter" },
                h("span", null, "Año"),
                h("input", {
                    type: "number",
                    value: yearFilter,
                    onChange: (e) => setYearFilter(e.target.value),
                    placeholder: "Ej. 2010",
                    min: 1900,
                    max: 2100
                })
            ),
            h("label", { className: "filter" },
                h("span", null, "Nota mínima"),
                h("select", {
                    value: String(minRating),
                    onChange: (e) => setMinRating(Number(e.target.value))
                },
                    h("option", { value: "0" }, "Sin filtro"),
                    h("option", { value: "6" }, "★ 6 o más"),
                    h("option", { value: "7" }, "★ 7 o más"),
                    h("option", { value: "8" }, "★ 8 o más"),
                    h("option", { value: "9" }, "★ 9 o más")
                )
            ),
            h("label", { className: "filter" },
                h("span", null, "Género"),
                h("select", {
                    value: genreFilter,
                    onChange: (e) => setGenreFilter(e.target.value)
                },
                    GENRES.map((g) => h("option", { key: g[0], value: g[0] }, g[1]))
                )
            ),
            h("label", { className: "filter" },
                h("span", null, "Ordenar"),
                h("select", {
                    value: sortBy,
                    onChange: (e) => setSortBy(e.target.value)
                },
                    h("option", { value: "relevance" }, "Relevancia"),
                    h("option", { value: "rating-desc" }, "Mejor nota"),
                    h("option", { value: "year-desc" }, "Más recientes"),
                    h("option", { value: "year-asc" }, "Más antiguas")
                )
            ),
            filtersActive
                ? h("button", { type: "button", className: "btn-ghost btn-small", onClick: handleClear }, "Limpiar")
                : null
        ),
        h("p", { className: "muted hint" }, "Consejo: puedes buscar solo con filtros, sin escribir ningún título."),
        error ? h("p", { className: "error" }, error) : null,
        success ? h("p", { className: "success" }, success) : null,
        (detailLoading || loadingDetails) ? h("p", { className: "muted" }, "Cargando detalles...") : null,
        result ? h("div", { className: "result" },
            h("div", { className: "result-content" },
                h("img", {
                    src: result.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                    alt: result.title,
                    className: "poster",
                    loading: "lazy"
                }),
                h("div", { className: "result-info" },
                    h("h2", null, result.title + " (" + result.year + ")"),
                    h("p", null, h("strong", null, "Director:"), " " + result.director),
                    h("p", null, h("strong", null, "Género:"), " " + result.genre),
                    result.runtime ? h("p", null, h("strong", null, "Duración:"), " " + result.runtime) : null,
                    result.actors ? h("p", null, h("strong", null, "Actores:"), " " + result.actors) : null,
                    result.rating ? h("p", null, h("strong", null, "Nota IMDb:"), " ★ " + result.rating) : null,
                    h("p", null, h("strong", null, "Sinopsis:"), " " + result.plot),
                    resultWarning ? h("p", { className: "muted" }, "ℹ " + resultWarning) : null,
                    h("div", { className: "result-actions" },
                        h("button", { onClick: handleSave, disabled: saving }, saving ? "Guardando..." : "Guardar en mi colección"),
                        h("button", { className: "btn-ghost", type: "button", onClick: () => { setResult(null); setResultWarning(null); } }, "Descartar")
                    )
                )
            )
        ) : null,
        loadingDefaults
            ? h("p", { className: "muted" }, "Cargando películas...")
            : h(MovieCarousel, {
                title: exploreTitle + " · Películas",
                subtitle: "Desliza para descubrir",
                movies: explore,
                onDetail: openDetail,
                showDelete: false,
                emptyText: "Haz una búsqueda para ver aquí más resultados."
            }),
        h("p", { className: "muted hint" }, user ? "Lo que guardes lo encontrarás en tu página personal." : "Entra en tu cuenta para tener tu página personal con tu colección"),
        detail ? h("div", { className: "modal-backdrop", onClick: () => setDetail(null) },
            h("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                h("button", { className: "modal-close", onClick: () => setDetail(null) }, "✕"),
                h("div", { className: "modal-content" },
                    h("img", {
                        src: detail.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                        alt: detail.title
                    }),
                    h("div", null,
                        h("h2", null, detail.title + " (" + detail.year + ")"),
                        detail.genre ? h("p", null, h("strong", null, "Género:"), " " + detail.genre) : null,
                        detail.runtime ? h("p", null, h("strong", null, "Duración:"), " " + detail.runtime) : null,
                        detail.director ? h("p", null, h("strong", null, "Director:"), " " + detail.director) : null,
                        detail.actors ? h("p", null, h("strong", null, "Actores:"), " " + detail.actors) : null,
                        detail.rating ? h("p", null, h("strong", null, "IMDb:"), " ★ " + detail.rating) : null,
                        detail.plot ? h("p", null, detail.plot) : null,
                        h("div", { className: "result-actions" },
                            h("button", {
                                onClick: () => handleSave(detail),
                                disabled: saving
                            }, saving ? "Guardando..." : (user ? "Guardar en mi colección" : "Entrar para guardar")),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setReviewsDetail(detail) }, "Reseñas"),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setDetail(null) }, "Cerrar")
                        )
                    )
                )
            )
        ) : null,
        reviewsDetail ? h(ReviewsModal, { detail: reviewsDetail, mediaType: omdbType, user: user, onNavigate: onNavigate, onClose: () => setReviewsDetail(null) }) : null
    );
}

/* ---------- SeriesPage: pantalla de búsqueda y descubrimiento de series ----------
   Props: user, series, loadingList, onRefresh(), onDelete(id), onNavigate(page) */
function SeriesPage(props) {
    const user = props.user || null;
    const series = props.series;
    const loadingList = props.loadingList;
    const onRefresh = props.onRefresh;
    const onDelete = props.onDelete;
    const onNavigate = props.onNavigate;
    const omdbType = "series";

    const queryState = React.useState("");
    const query = queryState[0];
    const setQuery = queryState[1];
    const yearState = React.useState("");
    const yearFilter = yearState[0];
    const setYearFilter = yearState[1];
    const ratingState = React.useState(0);
    const minRating = ratingState[0];
    const setMinRating = ratingState[1];
    const genreState = React.useState("");
    const genreFilter = genreState[0];
    const setGenreFilter = genreState[1];
    const sortState = React.useState("relevance");
    const sortBy = sortState[0];
    const setSortBy = sortState[1];
    const resultState = React.useState(null);
    const result = resultState[0];
    const setResult = resultState[1];
    const resultWarningState = React.useState(null);
    const resultWarning = resultWarningState[0];
    const setResultWarning = resultWarningState[1];
    const exploreState = React.useState([]);
    const explore = exploreState[0];
    const setExplore = exploreState[1];
    const exploreTitleState = React.useState("Descubre");
    const exploreTitle = exploreTitleState[0];
    const setExploreTitle = exploreTitleState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const loadingDetailsState = React.useState(false);
    const loadingDetails = loadingDetailsState[0];
    const setLoadingDetails = loadingDetailsState[1];
    const loadingDefaultsState = React.useState(true);
    const loadingDefaults = loadingDefaultsState[0];
    const setLoadingDefaults = loadingDefaultsState[1];
    const savingState = React.useState(false);
    const saving = savingState[0];
    const setSaving = savingState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(null);
    const success = successState[0];
    const setSuccess = successState[1];
    const detailState = React.useState(null);
    const detail = detailState[0];
    const setDetail = detailState[1];
    const detailLoadingState = React.useState(false);
    const detailLoading = detailLoadingState[0];
    const setDetailLoading = detailLoadingState[1];
    // Reseña abierta en el modal compartido ReviewsModal (backend /api/reviews).
    const reviewsDetailState = React.useState(null);
    const reviewsDetail = reviewsDetailState[0];
    const setReviewsDetail = reviewsDetailState[1];
    const cooldownState = React.useState(0);
    const cooldown = cooldownState[0];
    const setCooldown = cooldownState[1];

    const parseYearFilter = () => {
        const y = String(yearFilter).trim();
        if (!y) return null;
        if (!/^\d{4}$/.test(y)) throw new Error("El año debe tener 4 cifras (ej. 2010)");
        const n = Number.parseInt(y, 10);
        if (n < 1900 || n > 2100) throw new Error("El año debe estar entre 1900 y 2100");
        return n;
    };

    const enrichWithDetails = async (items) => {
        const out = [];
        for (let i = 0; i < items.length; i += 5) {
            const chunk = await Promise.all(items.slice(i, i + 5).map(async (item) => {
                if (!item.imdbID) return { item: item, limited: false };
                try {
                    const res = await fetch("/api/series/search?i=" + encodeURIComponent(item.imdbID));
                    if (res.status === 429) return { item: item, limited: true };
                    const data = await res.json();
                    if (!res.ok) return { item: item, limited: false };
                    return {
                        item: Object.assign({}, item, {
                            genre: data.genre || item.genre,
                            rating: data.rating || null,
                            plot: data.plot,
                            director: data.director,
                            actors: data.actors,
                            type: data.type || item.type,
                        }),
                        limited: false
                    };
                } catch (e) {
                    return { item: item, limited: false };
                }
            }));
            if (chunk.some((r) => r.limited)) {
                throw rateLimitExceeded();
            }
            chunk.forEach((r) => out.push(r.item));
        }
        return out;
    };

    const applyClientFilters = (items, year, min, genre, expectedType) => {
        return items.filter((item) => {
            if (expectedType) {
                const it = String(item.type || "").toLowerCase();
                if (it && it !== expectedType) return false;
            }
            if (year) {
                const iy = yearOf(item);
                if (iy !== year) return false;
            }
            if (min > 0) {
                const r = ratingOf(item);
                if (r === null || r < min) return false;
            }
            if (genre) {
                const g = String(item.genre || "").toLowerCase();
                if (!g || g.indexOf(genre.toLowerCase()) === -1) return false;
            }
            return true;
        });
    };

    const applySort = (items, mode) => {
        const arr = items.slice();
        if (mode === "year-desc") {
            arr.sort((a, b) => (yearOf(b) || -1) - (yearOf(a) || -1));
        } else if (mode === "year-asc") {
            arr.sort((a, b) => (yearOf(a) || 9999) - (yearOf(b) || 9999));
        } else if (mode === "rating-desc") {
            arr.sort((a, b) => {
                const ra = ratingOf(a);
                const rb = ratingOf(b);
                if (ra === null && rb === null) return 0;
                if (ra === null) return 1;
                if (rb === null) return -1;
                return rb - ra;
            });
        }
        return arr;
    };

    const runDiscovery = async (year, min, genre) => {
        let pooled = [];
        try {
            let url = "/api/series/popular?limit=30";
            if (year) url += "&y=" + year;
            const res = await fetch(url);
            if (res.status === 429) {
                throw rateLimitExceeded();
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Sin resultados para esos filtros.");
            if (Array.isArray(data.results)) pooled = data.results;
        } catch (e) {
            if (e && e.code === "RATE_LIMIT") throw e;
            throw new Error(e.message || "No se pudo cargar contenido desde Firebase.");
        }
        if (pooled.length === 0) {
            throw new Error("Sin resultados para esos filtros. Prueba con otros.");
        }
        if (min > 0 || genre !== "") {
            setLoadingDetails(true);
            try {
                pooled = await enrichWithDetails(pooled);
            } finally {
                setLoadingDetails(false);
            }
        }
        const filtered = applySort(applyClientFilters(pooled, year, min, genre, omdbType), sortBy);
        setExplore(filtered);
        setExploreTitle("Explora (" + filtered.length + ")");
        if (filtered.length === 0) {
            setError("Nada coincide con esos filtros. Prueba a suavizarlos.");
        }
    };

    const loadDefaults = async () => {
        setLoadingDefaults(true);
        setError(null);
        try {
            const res = await fetch(
                "/api/series/popular?limit=12"
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el contenido");
            setExplore(Array.isArray(data.results) ? data.results : []);
            setExploreTitle("Popular ahora");
        } catch (e) {
            setExplore([]);
            setError(e.message || "No se pudo cargar Popular ahora desde Firebase.");
        } finally {
            setLoadingDefaults(false);
        }
    };

    useEffect(() => {
        loadDefaults();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setCooldown((c) => (c > 0 ? c - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const rateLimitExceeded = () => {
        const err = new Error("Has hecho muchas búsquedas seguidas. Espera un minuto y vuelve a intentarlo.");
        err.code = "RATE_LIMIT";
        return err;
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = query.trim();
        let year = null;
        try {
            year = parseYearFilter();
        } catch (err) {
            setError(err.message);
            return;
        }
        const min = Number(minRating) || 0;
        const genre = genreFilter || "";
        const hasFilters = year !== null || min > 0 || genre !== "";
        if (!q && !hasFilters) {
            setError("Escribe un título o elige algún filtro para explorar.");
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        setResult(null);
        setResultWarning(null);
        setExplore([]);
        try {
            if (!q) {
                await runDiscovery(year, min, genre);
                return;
            }
            let exactUrl = "/api/series/search?t=" + encodeURIComponent(q);
            let listUrl = "/api/series/search-list?s=" + encodeURIComponent(q);
            if (year) {
                exactUrl += "&y=" + year;
                listUrl += "&y=" + year;
            }
            const results = await Promise.all([
                fetch(exactUrl).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() })),
                fetch(listUrl).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json() }))
            ]);
            const exactRes = results[0];
            const listRes = results[1];

            if (exactRes.status === 429 || listRes.status === 429) {
                throw rateLimitExceeded();
            }

            if (exactRes.ok) {
                const warnings = [];
                const exactRating = ratingOf(exactRes.data);
                if (min > 0 && (exactRating === null || exactRating < min)) {
                    warnings.push("Su nota (" + (exactRes.data.rating || "sin nota") + ") está por debajo de tu filtro de " + min + ".");
                }
                if (genre && String(exactRes.data.genre || "").toLowerCase().indexOf(genre.toLowerCase()) === -1) {
                    warnings.push("Su género no coincide con tu filtro.");
                }
                setResult(exactRes.data);
                setResultWarning(warnings.length > 0 ? warnings.join(" ") : null);
            }
            if (listRes.ok) {
                let items = Array.isArray(listRes.data.results) ? listRes.data.results : [];
                if ((min > 0 || genre !== "") && items.length > 0) {
                    setLoadingDetails(true);
                    try {
                        items = await enrichWithDetails(items);
                    } finally {
                        setLoadingDetails(false);
                    }
                }
                setExplore(applySort(applyClientFilters(items, year, min, genre, omdbType), sortBy));
                setExploreTitle("Resultados de tu búsqueda");
            }
            if (!exactRes.ok && !listRes.ok) {
                throw new Error(exactRes.data.error || listRes.data.error || "Sin resultados");
            }
        } catch (err) {
            setError(err.message);
            if (err && err.code === "RATE_LIMIT") setCooldown(60);
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setQuery("");
        setYearFilter("");
        setMinRating(0);
        setGenreFilter("");
        setSortBy("relevance");
        setResult(null);
        setResultWarning(null);
        setError(null);
        setSuccess(null);
        setExploreTitle("Popular ahora");
        loadDefaults();
    };

    const handleSave = async (seriesToSave) => {
        const serie = seriesToSave || result;
        if (!serie) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/series", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify(serie)
            });
            const data = await res.json();
            if (!res.ok) {
                const saveErr = new Error(data.error || "Error al guardar");
                saveErr.status = res.status;
                throw saveErr;
            }
            setSuccess("¡Guardada en tu colección!");
            setResult(null);
            setResultWarning(null);
            setDetail(null);
            setQuery("");
            await onRefresh();
        } catch (err) {
            setError(err.message);
            if (err.status === 401) onNavigate("login");
        } finally {
            setSaving(false);
        }
    };

    const openDetail = async (serie) => {
        if (serie.plot || serie.director) {
            setDetail(serie);
            return;
        }
        setDetailLoading(true);
        try {
            const url = serie.imdbID
                ? "/api/series/search?i=" + encodeURIComponent(serie.imdbID)
                : "/api/series/search?t=" + encodeURIComponent(serie.title);
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle");
            setDetail(data);
        } catch (err) {
            setDetail(serie);
        } finally {
            setDetailLoading(false);
        }
    };

    const filtersActive = String(yearFilter).trim() !== "" || Number(minRating) > 0 || genreFilter !== "";

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Series"),
            h("p", { className: "muted" }, "Busca tus favoritas, guárdalas y vuelve a verlas cuando quieras.")
        ),
        h("form", { onSubmit: handleSearch, className: "search-form" },
            h("input", {
                type: "text",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                placeholder: "Buscar series... (ej. Breaking Bad)",
                maxLength: 100
            }),
            h("button", { type: "submit", disabled: loading || cooldown > 0 }, loading ? "Buscando..." : (cooldown > 0 ? "Espera " + cooldown + "s" : "Buscar"))
        ),
        h("div", { className: "filters" },
            h("label", { className: "filter" },
                h("span", null, "Año"),
                h("input", {
                    type: "number",
                    value: yearFilter,
                    onChange: (e) => setYearFilter(e.target.value),
                    placeholder: "Ej. 2010",
                    min: 1900,
                    max: 2100
                })
            ),
            h("label", { className: "filter" },
                h("span", null, "Nota mínima"),
                h("select", {
                    value: String(minRating),
                    onChange: (e) => setMinRating(Number(e.target.value))
                },
                    h("option", { value: "0" }, "Sin filtro"),
                    h("option", { value: "6" }, "★ 6 o más"),
                    h("option", { value: "7" }, "★ 7 o más"),
                    h("option", { value: "8" }, "★ 8 o más"),
                    h("option", { value: "9" }, "★ 9 o más")
                )
            ),
            h("label", { className: "filter" },
                h("span", null, "Género"),
                h("select", {
                    value: genreFilter,
                    onChange: (e) => setGenreFilter(e.target.value)
                },
                    GENRES.map((g) => h("option", { key: g[0], value: g[0] }, g[1]))
                )
            ),
            h("label", { className: "filter" },
                h("span", null, "Ordenar"),
                h("select", {
                    value: sortBy,
                    onChange: (e) => setSortBy(e.target.value)
                },
                    h("option", { value: "relevance" }, "Relevancia"),
                    h("option", { value: "rating-desc" }, "Mejor nota"),
                    h("option", { value: "year-desc" }, "Más recientes"),
                    h("option", { value: "year-asc" }, "Más antiguas")
                )
            ),
            filtersActive
                ? h("button", { type: "button", className: "btn-ghost btn-small", onClick: handleClear }, "Limpiar")
                : null
        ),
        h("p", { className: "muted hint" }, "Consejo: puedes buscar solo con filtros, sin escribir ningún título."),
        error ? h("p", { className: "error" }, error) : null,
        success ? h("p", { className: "success" }, success) : null,
        (detailLoading || loadingDetails) ? h("p", { className: "muted" }, "Cargando detalles...") : null,
        result ? h("div", { className: "result" },
            h("div", { className: "result-content" },
                h("img", {
                    src: result.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                    alt: result.title,
                    className: "poster",
                    loading: "lazy"
                }),
                h("div", { className: "result-info" },
                    h("h2", null, result.title + " (" + result.year + ")"),
                    h("p", null, h("strong", null, "Director:"), " " + result.director),
                    h("p", null, h("strong", null, "Género:"), " " + result.genre),
                    result.actors ? h("p", null, h("strong", null, "Actores:"), " " + result.actors) : null,
                    result.rating ? h("p", null, h("strong", null, "Nota IMDb:"), " ★ " + result.rating) : null,
                    h("p", null, h("strong", null, "Sinopsis:"), " " + result.plot),
                    resultWarning ? h("p", { className: "muted" }, "ℹ " + resultWarning) : null,
                    h("div", { className: "result-actions" },
                        h("button", { onClick: handleSave, disabled: saving }, saving ? "Guardando..." : "Guardar en mi colección"),
                        h("button", { className: "btn-ghost", type: "button", onClick: () => { setResult(null); setResultWarning(null); } }, "Descartar")
                    )
                )
            )
        ) : null,
        loadingDefaults
            ? h("p", { className: "muted" }, "Cargando series...")
            : h(MovieCarousel, {
                title: exploreTitle + " · Series",
                subtitle: "Desliza para descubrir",
                movies: explore,
                onDetail: openDetail,
                showDelete: false,
                emptyText: "Haz una búsqueda para ver aquí más resultados."
            }),
        h("p", { className: "muted hint" }, user ? "Lo que guardes lo encontrarás en tu página personal." : "Entra en tu cuenta para tener tu página personal con tu colección."),
        detail ? h("div", { className: "modal-backdrop", onClick: () => setDetail(null) },
            h("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                h("button", { className: "modal-close", onClick: () => setDetail(null) }, "✕"),
                h("div", { className: "modal-content" },
                    h("img", {
                        src: detail.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                        alt: detail.title
                    }),
                    h("div", null,
                        h("h2", null, detail.title + " (" + detail.year + ")"),
                        detail.genre ? h("p", null, h("strong", null, "Género:"), " " + detail.genre) : null,
                        detail.director ? h("p", null, h("strong", null, "Director:"), " " + detail.director) : null,
                        detail.actors ? h("p", null, h("strong", null, "Actores:"), " " + detail.actors) : null,
                        detail.rating ? h("p", null, h("strong", null, "IMDb:"), " ★ " + detail.rating) : null,
                        detail.plot ? h("p", null, detail.plot) : null,
                        h("div", { className: "result-actions" },
                            h("button", {
                                onClick: () => handleSave(detail),
                                disabled: saving
                            }, saving ? "Guardando..." : (user ? "Guardar en mi colección" : "Entrar para guardar")),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setReviewsDetail(detail) }, "Reseñas"),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setDetail(null) }, "Cerrar")
                        )
                    )
                )
            )
        ) : null,
        reviewsDetail ? h(ReviewsModal, { detail: reviewsDetail, mediaType: omdbType, user: user, onNavigate: onNavigate, onClose: () => setReviewsDetail(null) }) : null
    );
}

/* ---------- MiCuenta: pantalla personal del usuario ----------
   Props: user, movies, loadingList, onDelete(id) */
function MiCuenta(props) {
    const user = props.user;
    const movies = props.movies;
    const loadingList = props.loadingList;
    const onDelete = props.onDelete;
    const detailState = React.useState(null);
    const detail = detailState[0];
    const setDetail = detailState[1];
    const detailLoadingState = React.useState(false);
    const detailLoading = detailLoadingState[0];
    const setDetailLoading = detailLoadingState[1];
    // Reseña abierta en el modal compartido ReviewsModal (backend /api/reviews).
    const reviewsDetailState = React.useState(null);
    const reviewsDetail = reviewsDetailState[0];
    const setReviewsDetail = reviewsDetailState[1];
    const shown = movies || [];
    const recent = shown.slice(0, 10);

    // Amistades state
    const friendsTabState = React.useState("friends"); // friends, requests, search
    const friendsTab = friendsTabState[0];
    const setFriendsTab = friendsTabState[1];
    const friendsState = React.useState([]);
    const friends = friendsState[0];
    const setFriends = friendsState[1];
    const requestsState = React.useState([]);
    const requests = requestsState[0];
    const setRequests = requestsState[1];
    const searchQueryState = React.useState("");
    const searchQuery = searchQueryState[0];
    const setSearchQuery = searchQueryState[1];
    const searchResultsState = React.useState([]);
    const searchResults = searchResultsState[0];
    const setSearchResults = searchResultsState[1];
    const searchingState = React.useState(false);
    const searching = searchingState[0];
    const setSearching = searchingState[1];
    const searchErrorState = React.useState(null);
    const searchError = searchErrorState[0];
    const setSearchError = searchErrorState[1];
    const loadingFriendsState = React.useState(true);
    const loadingFriends = loadingFriendsState[0];
    const setLoadingFriends = loadingFriendsState[1];
    const shareLinkState = React.useState("");
    const shareLink = shareLinkState[0];
    const setShareLink = shareLinkState[1];

    const openDetail = async (movie) => {
        if (movie.plot || movie.director) {
            setDetail(movie);
            return;
        }
        setDetailLoading(true);
        try {
            const url = movie.imdbID
                ? "/api/movies/search?i=" + encodeURIComponent(movie.imdbID)
                : "/api/movies/search?t=" + encodeURIComponent(movie.title);
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle");
            setDetail(data);
        } catch (err) {
            setDetail(movie);
        } finally {
            setDetailLoading(false);
        }
    };

    const loadFriends = async () => {
        setLoadingFriends(true);
        try {
            const res = await fetch("/api/auth/friends", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al cargar amigos");
            setFriends(data.friends || []);
        } catch (err) {
            console.error("Error loading friends:", err);
        } finally {
            setLoadingFriends(false);
        }
    };

    const loadRequests = async () => {
        try {
            const res = await fetch("/api/auth/friends/requests", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al cargar solicitudes");
            setRequests(data.requests || []);
        } catch (err) {
            console.error("Error loading requests:", err);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = searchQuery.trim().toLowerCase();
        if (!q) { setSearchError("Escribe un nickname"); return; }
        if (q === (user.nickname || "").toLowerCase()) { setSearchError("No te puedes buscar a ti mismo"); return; }
        setSearching(true);
        setSearchError(null);
        setSearchResults([]);
        try {
            const res = await fetch("/api/auth/user/" + encodeURIComponent(q), { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Usuario no encontrado");
            setSearchResults([data.user]);
        } catch (err) {
            setSearchError(err.message);
        } finally {
            setSearching(false);
        }
    };

    const sendRequest = async (targetId) => {
        try {
            const res = await fetch("/api/auth/friends/request", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ toNickname: searchResults.find(u => u.id === targetId)?.nickname })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al enviar solicitud");
            alert("Solicitud enviada");
            setSearchResults([]);
            setSearchQuery("");
        } catch (err) {
            alert(err.message);
        }
    };

    const acceptRequest = async (requestId) => {
        try {
            const res = await fetch("/api/auth/friends/request/accept", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ requestId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al aceptar");
            loadRequests();
            loadFriends();
        } catch (err) {
            alert(err.message);
        }
    };

    const declineRequest = async (requestId) => {
        try {
            const res = await fetch("/api/auth/friends/request/decline", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ requestId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al rechazar");
            loadRequests();
        } catch (err) {
            alert(err.message);
        }
    };

    const removeFriend = async (friendId) => {
        if (!window.confirm("¿Eliminar a este amigo?")) return;
        try {
            const res = await fetch("/api/auth/friends/" + encodeURIComponent(friendId), {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al eliminar");
            loadFriends();
        } catch (err) {
            alert(err.message);
        }
    };

    const copyShareLink = () => {
        const link = window.location.origin + "/?friend=" + (user.nickname || "");
        navigator.clipboard.writeText(link).then(() => {
            setShareLink(link);
            setTimeout(() => setShareLink(""), 3000);
        });
    };

    React.useEffect(() => {
        loadFriends();
        loadRequests();
    }, []);

    // Handle friend parameter from shared link
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const friendParam = params.get("friend");
        if (friendParam && friendParam !== (user.nickname || "").toLowerCase()) {
            setFriendsTab("search");
            setSearchQuery(friendParam);
            handleSearch({ preventDefault: () => {} });
        }
    }, [user]);

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Hola, " + user.name),
            h("p", { className: "muted" }, user.email),
            user.nickname ? h("p", { className: "muted" }, "Nickname: @" + user.nickname) : null
        ),

        /* ----- Índice / Tabla de contenidos ----- */
        h("nav", { className: "profile-toc" },
            h("h3", null, "📋 Índice"),
            h("ul", null,
                h("li", null, h("a", { href: "#peliculas-recientes", onClick: (e) => { e.preventDefault(); document.getElementById("peliculas-recientes")?.scrollIntoView({ behavior: "smooth" }); } }, "🎬 Películas recientes")),
                h("li", null, h("a", { href: "#todas-peliculas", onClick: (e) => { e.preventDefault(); document.getElementById("todas-peliculas")?.scrollIntoView({ behavior: "smooth" }); } }, "📁 Todas las películas")),
                h("li", null, h("a", { href: "#series-recientes", onClick: (e) => { e.preventDefault(); document.getElementById("series-recientes")?.scrollIntoView({ behavior: "smooth" }); } }, "📺 Series recientes")),
                h("li", null, h("a", { href: "#todas-series", onClick: (e) => { e.preventDefault(); document.getElementById("todas-series")?.scrollIntoView({ behavior: "smooth" }); } }, "📁 Todas las series"))
            )
        ),

        h("div", { className: "hero-stats account-stats" },
            h("div", null, h("strong", null, String((movies || []).length)), h("span", null, "guardadas")),
            h("div", null, h("strong", null, String(shown.length)), h("span", null, "películas"))
        ),
        h("h2", { id: "peliculas-recientes" }, "Películas guardadas recientemente"),
        detailLoading ? h("p", { className: "muted" }, "Cargando detalle...") : null,
        h(MovieCarousel, {
            title: "Guardadas recientemente",
            subtitle: "Tus últimas películas",
            movies: recent,
            onDelete: onDelete,
            onDetail: openDetail,
            showDelete: true,
            emptyText: "Aún no guardaste películas. Explora Películas y pulsa Guardar"
        }),
        h("h2", { id: "todas-peliculas" }, "Todas tus películas"),
        loadingList ? h("p", { className: "muted" }, "Cargando lista...") : null,
        (!loadingList && shown.length === 0)
            ? h("p", { className: "muted" }, "Vacío por ahora.")
            : null,
        h("div", { className: "movies-grid" },
            shown.map((movie) =>
                h(MovieCard, { key: movie.id, movie: movie, onDelete: onDelete, onDetail: openDetail, showDelete: true })
            )
        ),



        detail ? h("div", { className: "modal-backdrop", onClick: () => setDetail(null) },
            h("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                h("button", { className: "modal-close", onClick: () => setDetail(null) }, "✕"),
                h("div", { className: "modal-content" },
                    h("img", {
                        src: detail.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                        alt: detail.title
                    }),
                    h("div", null,
                        h("h2", null, detail.title + " (" + detail.year + ")"),
                        detail.genre ? h("p", null, h("strong", null, "Género:"), " " + detail.genre) : null,
                        detail.runtime ? h("p", null, h("strong", null, "Duración:"), " " + detail.runtime) : null,
                        detail.director ? h("p", null, h("strong", null, "Director:"), " " + detail.director) : null,
                        detail.actors ? h("p", null, h("strong", null, "Actores:"), " " + detail.actors) : null,
                        detail.rating ? h("p", null, h("strong", null, "IMDb:"), " ★ " + detail.rating) : null,
                        detail.plot ? h("p", null, detail.plot) : null,
                        h("div", { className: "result-actions" },
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setReviewsDetail(detail) }, "Reseñas"),
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setDetail(null) }, "Cerrar")
                        )
                    )
                )
            )
        ) : null,
        reviewsDetail ? h(ReviewsModal, { detail: reviewsDetail, mediaType: "movie", user: user, onClose: () => setReviewsDetail(null) }) : null
    );
}

/* ---------- UserProfile: perfil público de otro usuario ---------- */
function UserProfile(props) {
    const userId = props.userId;
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;
    const profileState = React.useState(null);
    const profile = profileState[0];
    const setProfile = profileState[1];
    const moviesState = React.useState([]);
    const movies = moviesState[0];
    const setMovies = moviesState[1];
    const loadingState = React.useState(true);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const followingState = React.useState(false);
    const isFollowing = followingState[0];
    const setIsFollowing = followingState[1];
    const followLoadingState = React.useState(false);
    const followLoading = followLoadingState[0];
    const setFollowLoading = followLoadingState[1];
    const detailState = React.useState(null);
    const detail = detailState[0];
    const setDetail = detailState[1];
    const detailLoadingState = React.useState(false);
    const detailLoading = detailLoadingState[0];
    const setDetailLoading = detailLoadingState[1];

    const loadProfile = async () => {
        try {
            const res = await fetch("/api/users/" + encodeURIComponent(userId));
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Usuario no encontrado");
            setProfile(data.user);
            if (currentUser) {
                const followRes = await fetch("/api/users/" + encodeURIComponent(userId) + "/is-following", {
                    headers: authHeaders()
                });
                const followData = await followRes.json();
                setIsFollowing(followData.following || false);
            }
        } catch (e) {
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const loadMovies = async () => {
        try {
            const res = await fetch("/api/users/" + encodeURIComponent(userId) + "/movies");
            const data = await res.json();
            setMovies(Array.isArray(data.movies) ? data.movies : []);
        } catch (e) {
            setMovies([]);
        }
    };

    React.useEffect(() => {
        loadProfile();
        loadMovies();
    }, [userId]);

    const handleFollow = async () => {
        if (!currentUser) {
            onNavigate("auth");
            return;
        }
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await fetch("/api/users/" + encodeURIComponent(userId) + "/follow", {
                    method: "DELETE",
                    headers: authHeaders()
                });
                setIsFollowing(false);
            } else {
                await fetch("/api/users/" + encodeURIComponent(userId) + "/follow", {
                    method: "POST",
                    headers: authHeaders()
                });
                setIsFollowing(true);
            }
        } catch (e) {
            // error silencioso
        } finally {
            setFollowLoading(false);
        }
    };

    const openDetail = async (movie) => {
        if (movie.plot || movie.director) {
            setDetail(movie);
            return;
        }
        setDetailLoading(true);
        try {
            const url = movie.imdbID
                ? "/api/movies/search?i=" + encodeURIComponent(movie.imdbID)
                : "/api/movies/search?t=" + encodeURIComponent(movie.title);
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el detalle");
            setDetail(data);
        } catch (err) {
            setDetail(movie);
        } finally {
            setDetailLoading(false);
        }
    };

    if (loading) return h("div", { className: "movies-page" }, h("p", { className: "muted" }, "Cargando perfil..."));
    if (!profile) return h("div", { className: "movies-page" }, h("p", { className: "error" }, "Usuario no encontrado"));

    const isOwnProfile = currentUser && currentUser.id === profile.id;
    const shown = movies || [];
    const recent = shown.slice(0, 10);

    return h("div", { className: "movies-page" },
        h("div", { className: "profile-header" },
            h("div", { className: "profile-avatar" },
                profile.photoURL ? h("img", { src: profile.photoURL, alt: profile.nickname || profile.name }) : h("span", null, (profile.nickname || profile.name || "U")[0].toUpperCase())
            ),
            h("div", { className: "profile-info" },
                h("h1", null, profile.nickname || profile.name),
                h("p", { className: "muted" }, "@" + (profile.id.split("@")[0] || profile.id)),
                !isOwnProfile && currentUser && h("button", {
                    className: "btn-primary" + (isFollowing ? " following" : ""),
                    onClick: handleFollow,
                    disabled: followLoading
                }, followLoading ? "..." : (isFollowing ? "Dejar de seguir" : "Seguir"))
            )
        ),
        h("div", { className: "hero-stats account-stats" },
            h("div", null, h("strong", null, String(shown.length)), h("span", null, "películas")),
            h("div", null, h("strong", null, profile.prefs?.followers?.length || 0), h("span", null, "seguidores")),
            h("div", null, h("strong", null, profile.prefs?.following?.length || 0), h("span", null, "siguiendo"))
        ),
        detailLoading ? h("p", { className: "muted" }, "Cargando detalle...") : null,
        h(MovieCarousel, {
            title: "Guardadas recientemente",
            subtitle: "Películas de " + (profile.nickname || profile.name),
            movies: recent,
            onDelete: null,
            onDetail: openDetail,
            showDelete: false,
            emptyText: "Aún no ha guardado películas"
        }),
        h("h2", null, "Todas las películas"),
        h("div", { className: "movies-grid" },
            shown.map((movie) =>
                h(MovieCard, { key: movie.id, movie: movie, onDelete: null, onDetail: openDetail, showDelete: false })
            )
        ),
        detail ? h("div", { className: "modal-backdrop", onClick: () => setDetail(null) },
            h("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                h("button", { className: "modal-close", onClick: () => setDetail(null) }, "✕"),
                h("div", { className: "modal-content" },
                    h("img", {
                        src: detail.poster || "https://via.placeholder.com/300x450?text=Sin+imagen",
                        alt: detail.title
                    }),
                    h("div", null,
                        h("h2", null, detail.title + " (" + detail.year + ")"),
                        detail.genre ? h("p", null, h("strong", null, "Género:"), " " + detail.genre) : null,
                        detail.director ? h("p", null, h("strong", null, "Director:"), " " + detail.director) : null,
                        detail.actors ? h("p", null, h("strong", null, "Actores:"), " " + detail.actors) : null,
                        detail.rating ? h("p", null, h("strong", null, "IMDb:"), " ★ " + detail.rating) : null,
                        detail.plot ? h("p", null, detail.plot) : null
                    )
                )
            )
        ) : null
    );
}

/* ---------- UserSearch: buscar y seguir usuarios ---------- */
function UserSearch(props) {
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;
    const queryState = React.useState("");
    const query = queryState[0];
    const setQuery = queryState[1];
    const resultsState = React.useState([]);
    const results = resultsState[0];
    const setResults = resultsState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const followingMapState = React.useState({});
    const followingMap = followingMapState[0];
    const setFollowingMap = followingMapState[1];

    const search = async (q) => {
        if (!q || !q.trim()) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/users/search?q=" + encodeURIComponent(q.trim()));
            const data = await res.json();
            setResults(Array.isArray(data.users) ? data.users : []);
            // Cargar estado de seguimiento
            if (currentUser && data.users.length > 0) {
                const ids = data.users.map(u => u.id);
                const followRes = await fetch("/api/users/me/following", { headers: authHeaders() });
                const followData = await followRes.json();
                const followingIds = (followData.users || []).map(u => u.id);
                const map = {};
                followingIds.forEach(id => map[id] = true);
                setFollowingMap(map);
            }
        } catch (e) {
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        const timer = setTimeout(() => search(query), 300);
        return () => clearTimeout(timer);
    }, [query]);

    const handleFollow = async (targetUserId) => {
        if (!currentUser) {
            onNavigate("auth");
            return;
        }
        const isF = followingMap[targetUserId];
        try {
            if (isF) {
                await fetch("/api/users/" + encodeURIComponent(targetUserId) + "/follow", {
                    method: "DELETE",
                    headers: authHeaders()
                });
            } else {
                await fetch("/api/users/" + encodeURIComponent(targetUserId) + "/follow", {
                    method: "POST",
                    headers: authHeaders()
                });
            }
            setFollowingMap(prev => ({ ...prev, [targetUserId]: !isF }));
        } catch (e) {
            // error silencioso
        }
    };

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Buscar usuarios"),
            h("p", { className: "muted" }, "Encuentra amigos y descubre sus colecciones")
        ),
        h("div", { className: "search-bar" },
            h("input", {
                type: "text",
                placeholder: "Buscar por nombre, apodo o email...",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                autoFocus: true
            })
        ),
        loading ? h("p", { className: "muted" }, "Buscando...") : null,
        !loading && query && results.length === 0 ? h("p", { className: "muted" }, "No se encontraron usuarios") : null,
        h("div", { className: "user-list" },
            results.map((u) =>
                h("div", { key: u.id, className: "user-item" },
                    h("div", { className: "user-avatar" },
                        u.photoURL ? h("img", { src: u.photoURL, alt: u.nickname || u.name }) : h("span", null, (u.nickname || u.name || "U")[0].toUpperCase())
                    ),
                    h("div", { className: "user-info" },
                        h("strong", null, u.nickname || u.name),
                        h("span", { className: "muted" }, "@" + (u.id.split("@")[0] || u.id))
                    ),
                    u.id !== currentUser?.id && h("button", {
                        className: "btn-primary btn-small" + (followingMap[u.id] ? " following" : ""),
                        onClick: () => handleFollow(u.id)
                    }, followingMap[u.id] ? "Siguiendo" : "Seguir")
                )
            )
        )
    );
}

/* ---------- FriendsPage: mis amigos (following/followers) ---------- */
function FriendsPage(props) {
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;
    const tabState = React.useState("following");
    const tab = tabState[0];
    const setTab = tabState[1];
    const followingState = React.useState([]);
    const following = followingState[0];
    const setFollowing = followingState[1];
    const followersState = React.useState([]);
    const followers = followersState[0];
    const setFollowers = followersState[1];
    const loadingState = React.useState(true);
    const loading = loadingState[0];
    const setLoading = loadingState[1];
    const followingMapState = React.useState({});
    const followingMap = followingMapState[0];
    const setFollowingMap = followingMapState[1];

    const loadData = async () => {
        setLoading(true);
        try {
            const [followRes, followerRes] = await Promise.all([
                fetch("/api/users/me/following", { headers: authHeaders() }),
                fetch("/api/users/me/followers", { headers: authHeaders() })
            ]);
            const followData = await followRes.json();
            const followerData = await followerRes.json();
            setFollowing(Array.isArray(followData.users) ? followData.users : []);
            setFollowers(Array.isArray(followerData.users) ? followerData.users : []);
            const ids = [...(followData.users || []).map(u => u.id), ...(followerData.users || []).map(u => u.id)];
            const uniqueIds = [...new Set(ids)];
            const map = {};
            uniqueIds.forEach(id => map[id] = true);
            setFollowingMap(map);
        } catch (e) {
            setFollowing([]);
            setFollowers([]);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadData();
    }, []);

    const handleUnfollow = async (targetUserId) => {
        try {
            await fetch("/api/users/" + encodeURIComponent(targetUserId) + "/follow", {
                method: "DELETE",
                headers: authHeaders()
            });
            setFollowing(prev => prev.filter(u => u.id !== targetUserId));
            setFollowers(prev => prev.filter(u => u.id !== targetUserId));
            setFollowingMap(prev => ({ ...prev, [targetUserId]: false }));
        } catch (e) {
            // error silencioso
        }
    };

    const handleFollow = async (targetUserId) => {
        try {
            await fetch("/api/users/" + encodeURIComponent(targetUserId) + "/follow", {
                method: "POST",
                headers: authHeaders()
            });
            setFollowingMap(prev => ({ ...prev, [targetUserId]: true }));
            loadData();
        } catch (e) {
            // error silencioso
        }
    };

    const currentList = tab === "following" ? following : followers;
    const currentListTitle = tab === "following" ? "Siguiendo" : "Seguidores";

    if (loading) return h("div", { className: "movies-page" }, h("p", { className: "muted" }, "Cargando..."));

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Mis amigos"),
            h("p", { className: "muted" }, "Gestiona a quién sigues y quién te sigue")
        ),
        h("div", { className: "tabs" },
            h("button", { className: "tab" + (tab === "following" ? " active" : ""), onClick: () => setTab("following") }, "Siguiendo (" + following.length + ")"),
            h("button", { className: "tab" + (tab === "followers" ? " active" : ""), onClick: () => setTab("followers") }, "Seguidores (" + followers.length + ")")
        ),
        currentList.length === 0 ? h("p", { className: "muted" }, tab === "following" ? "No sigues a nadie todavía. Busca usuarios para empezar." : "Aún no tienes seguidores") : null,
        h("div", { className: "user-list" },
            currentList.map((u) =>
                h("div", { key: u.id, className: "user-item" },
                    h("div", { className: "user-avatar" },
                        u.photoURL ? h("img", { src: u.photoURL, alt: u.nickname || u.name }) : h("span", null, (u.nickname || u.name || "U")[0].toUpperCase())
                    ),
                    h("div", { className: "user-info" },
                        h("strong", null, u.nickname || u.name),
                        h("span", { className: "muted" }, "@" + (u.id.split("@")[0] || u.id))
                    ),
                    u.id !== currentUser.id && h("button", {
                        className: "btn-primary btn-small" + (followingMap[u.id] ? " following" : ""),
                        onClick: () => followingMap[u.id] ? handleUnfollow(u.id) : handleFollow(u.id)
                    }, followingMap[u.id] ? "Dejar de seguir" : "Seguir")
                )
            )
        )
    );
}

/* ---------- ProfileSettings: configuración de perfil ---------- */
function ProfileSettings(props) {
    const currentUser = props.currentUser;
    const onNavigate = props.onNavigate;
    const nicknameState = React.useState(currentUser?.nickname || currentUser?.name || "");
    const nickname = nicknameState[0];
    const setNickname = nicknameState[1];
    const themeState = React.useState(currentUser?.colorTheme || "default");
    const theme = themeState[0];
    const setTheme = themeState[1];
    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const successState = React.useState(null);
    const success = successState[0];
    const setSuccess = successState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    React.useEffect(() => {
        if (currentUser) {
            setNickname(currentUser.nickname || currentUser.name || "");
            setTheme(currentUser.colorTheme || "default");
        }
    }, [currentUser]);

    React.useEffect(() => {
        applyColorTheme(theme);
    }, [theme]);

    const handleSave = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        const cleanNickname = nickname.trim();
        if (cleanNickname.length < 2) {
            setError("El apodo debe tener al menos 2 caracteres");
            return;
        }
        if (cleanNickname.length > 30) {
            setError("El apodo no puede exceder 30 caracteres");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/auth/profile", {
                method: "PUT",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify({ nickname: cleanNickname, colorTheme: theme })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo actualizar");
            setSuccess("Perfil actualizado correctamente");
            // Actualizar usuario en estado global
            if (props.onUpdateUser) {
                props.onUpdateUser({ ...currentUser, nickname: cleanNickname, colorTheme: theme, prefs: { ...currentUser.prefs, nickname: cleanNickname, colorTheme: theme } });
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Configuración de perfil"),
            h("p", { className: "muted" }, "Personaliza tu apodo visible y el tema de color")
        ),
        error ? h("div", { className: "error-toast" }, error) : null,
        success ? h("div", { className: "success-toast" }, success) : null,
        h("form", { className: "settings-form", onSubmit: handleSave },
            h("div", { className: "settings-section" },
                h("h2", null, "Apodo visible"),
                h("div", { className: "auth-field" },
                    h("label", null, "Apodo (nombre público)"),
                    h("input", {
                        type: "text",
                        value: nickname,
                        onChange: (e) => setNickname(e.target.value),
                        placeholder: "Tu apodo",
                        maxLength: 30,
                        autoComplete: "nickname"
                    }),
                    h("small", { className: "muted" }, "Este nombre será visible para otros usuarios. Mínimo 2, máximo 30 caracteres.")
                )
            ),
            h("div", { className: "settings-section" },
                h("h2", null, "Tema de color"),
                h("p", { className: "muted" }, "Elige una paleta de colores para la interfaz (botones, enlaces, acentos)"),
                h("div", { className: "theme-options" },
                    Object.entries(COLOR_THEMES).map(([key, t]) =>
                        h("button", {
                            key: key,
                            type: "button",
                            className: "theme-option" + (theme === key ? " selected" : ""),
                            onClick: () => setTheme(key),
                            style: {
                                borderColor: t.primary,
                                backgroundColor: theme === key ? t.primaryLight : "transparent"
                            }
                        },
                            h("div", { className: "theme-preview", style: { backgroundColor: t.primary } }),
                            h("div", null,
                                h("strong", null, t.name),
                                h("br"),
                                h("small", { className: "muted" }, "Principal: " + t.primary + " · Acento: " + t.accent)
                            )
                        )
                    )
                )
            ),
            h("button", { className: "btn-primary", type: "submit", disabled: loading },
                loading ? "Guardando..." : "Guardar cambios"
            )
        )
    );
}

/* ---------- CookieConsentBanner ---------- */
function CookieConsentBanner() {
    const consentState = React.useState(false);
    const consent = consentState[0];
    const setConsent = consentState[1];

    if (consent) return null;

    const handleChoice = (choice) => {
        setConsent(true);
    };

    return h("div", { className: "cookie-banner" },
        h("div", { className: "cookie-content" },
            h("p", { className: "cookie-text" },
                "Utilizamos cookies propias y de terceros para asegurar el funcionamiento de la web, analizar el tráfico y personalizar la experiencia. Puedes aceptar todas o elegir solo las esenciales."
            ),
            h("div", { className: "cookie-actions" },
                h("button", {
                    className: "btn-ghost btn-small",
                    onClick: () => handleChoice("essential")
                }, "Solo esenciales"),
                h("button", {
                    className: "btn-primary btn-small",
                    onClick: () => handleChoice("all")
                }, "Aceptar todas")
            )
        )
    );
}

/* ---------- App raíz ---------- */
function App() {
    const pageState = useState(() => {
        const params = new URLSearchParams(window.location.search);
        if (!params.get("oobCode")) return "home";
        if (params.get("mode") === "resetPassword") return "reset-password";
        if (params.get("mode") === "verifyEmail") return "verify-email";
        return "home";
    });
    const page = pageState[0];
    const setPage = pageState[1];
    const moviesState = useState([]);
    const movies = moviesState[0];
    const setMovies = moviesState[1];
    const loadingListState = useState(true);
    const loadingList = loadingListState[0];
    const setLoadingList = loadingListState[1];
    const seriesState = useState([]);
    const series = seriesState[0];
    const setSeries = seriesState[1];
    const loadingSeriesState = useState(true);
    const loadingSeries = loadingSeriesState[0];
    const setLoadingSeries = loadingSeriesState[1];
    const toastState = useState(null);
    const toast = toastState[0];
    const setToast = toastState[1];
    const userState = useState(null);
    const user = userState[0];
    const setUser = userState[1];

    // La sesión Firebase autentica al usuario; el token propio autoriza las
    // rutas privadas del backend y se restaura al recargar la página.
    const restoreSession = async () => {
        let saved = null;
        try {
            saved = window.localStorage.getItem("cineairos_token");
        } catch (e) {
            saved = null;
        }
        if (!saved) return;
        try {
            const res = await fetch("/api/auth/me", {
                headers: { Authorization: "Bearer " + saved }
            });
            const data = await res.json();
            if (!res.ok) throw new Error("invalid");
            setUser(data.user);
            if (!data.user.prefs || !data.user.prefs.onboardingDone) {
                navigate("cuestionario");
            }
        } catch (e) {
            try {
                window.localStorage.removeItem("cineairos_token");
            } catch (e2) {
                /* sin almacenamiento */
            }
        }
    };

    useEffect(() => {
        fetchMovies();
        fetchSeries();
        restoreSession();
    }, []);

    // Aplicar tema de color del usuario al cargar y cuando cambia
    useEffect(() => {
        if (user && user.colorTheme) {
            applyColorTheme(user.colorTheme);
        } else {
            applyColorTheme("default");
        }
    }, [user]);

    const fetchMovies = async () => {
        setLoadingList(true);
        try {
            const res = await fetch("/api/movies", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al cargar películas");
            setMovies(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Error al cargar películas:", e);
            setMovies([]);
            setToast({ type: "error", text: e.message });
        } finally {
            setLoadingList(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar este título?")) return;
        try {
            const res = await fetch("/api/movies/" + encodeURIComponent(id), {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) {
                const err = new Error(data.error || "Error al eliminar");
                err.status = res.status;
                throw err;
            }
            setToast({ type: "success", text: "Eliminado de tu colección" });
            await fetchMovies();
        } catch (e) {
            setToast({ type: "error", text: e.message });
            if (e.status === 401) navigate("login");
        }
    };

    const fetchSeries = async () => {
        setLoadingSeries(true);
        try {
            const res = await fetch("/api/series", { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error al cargar series");
            setSeries(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Error al cargar series:", e);
            setSeries([]);
            setToast({ type: "error", text: e.message });
        } finally {
            setLoadingSeries(false);
        }
    };

    const handleDeleteSeries = async (id) => {
        if (!window.confirm("¿Eliminar esta serie?")) return;
        try {
            const res = await fetch("/api/series/" + encodeURIComponent(id), {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) {
                const err = new Error(data.error || "Error al eliminar");
                err.status = res.status;
                throw err;
            }
            setToast({ type: "success", text: "Eliminada de tu colección" });
            await fetchSeries();
        } catch (e) {
            setToast({ type: "error", text: e.message });
            if (e.status === 401) navigate("login");
        }
    };

    const navigate = (target) => {
        setToast(null);
        setPage(target);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // Check for friend parameter in URL to auto-open friends tab
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const friendParam = params.get("friend");
        if (friendParam && page === "cuenta" && user) {
            // The MiCuenta component will handle this via its own effect
        }
    }, [page, user]);

    const handleAuth = async (tokenValue, userValue) => {
        try {
            window.localStorage.setItem("cineairos_token", tokenValue);
        } catch (e) {
            /* sin almacenamiento */
        }
        setUser(userValue);
        setToast({ type: "success", text: "Hola, " + userValue.name });
        if (!userValue.prefs || !userValue.prefs.onboardingDone) {
            navigate("cuestionario");
            return;
        }
        await fetchMovies();
        navigate("peliculas");
    };

    const handleLogout = async () => {
        const tok = getStoredToken();
        if (tok) {
            try {
                await fetch("/api/auth/logout", {
                    method: "POST",
                    headers: { Authorization: "Bearer " + tok }
                });
            } catch (e) {
                /* salida best-effort */
            }
        }
        if (typeof firebase !== "undefined" && firebase.auth) {
            try {
                await firebase.auth().signOut();
            } catch (e) {
                /* salida best-effort */
            }
        }
        try {
            window.localStorage.removeItem("cineairos_token");
        } catch (e) {
            /* sin almacenamiento */
        }
        setUser(null);
        setMovies([]);
        navigate("home");
    };

    const peliCount = (movies || []).length;

    return h("div", { className: "layout" },
        h(SiteHeader, { page: page, onNavigate: navigate, peliCount: peliCount, user: user, onLogout: handleLogout }),
        toast ? h("div", { className: "toast " + toast.type },
            h("span", null, toast.text),
            h("button", { onClick: () => setToast(null), "aria-label": "Cerrar" }, "✕")
        ) : null,
        h("main", { className: "main" },
            page === "home"
                ? h(LandingPage, { onExplore: () => navigate("peliculas"), movies: movies, user: user })
                : page === "auth"
                ? h(AuthChoice, { onLogin: () => navigate("login"), onRegister: () => navigate("register") })
                : page === "login"
                ? h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") })
                : page === "recuperar"
                ? h(ForgotPasswordPage, { onBack: () => navigate("login") })
                : page === "reset-password"
                ? h(PasswordResetPage, { onBack: () => navigate("login") })
                : page === "verify-email"
                ? h(EmailVerificationPage, { onBack: () => navigate("login") })
                : page === "register"
                ? h(RegisterPage, { onAuth: handleAuth, onSwitch: () => navigate("auth") })
                : page === "cuestionario"
                ? h(RegisterPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), questionnaireOnly: true })
                : page === "cuenta"
                ? (user
                    ? h(MiCuenta, { user: user, movies: movies, loadingList: loadingList, onDelete: handleDelete })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") }))
                : page === "perfil"
                ? (user
                    ? h(UserProfile, { userId: new URLSearchParams(window.location.search).get("id") || user.id, currentUser: user, onNavigate: navigate, onDetail: (m) => { /* handled by parent */ } })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") }))
                : page === "buscar-usuarios"
                ? (user
                    ? h(UserSearch, { currentUser: user, onNavigate: navigate })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") }))
                : page === "amigos"
                ? (user
                    ? h(FriendsPage, { currentUser: user, onNavigate: navigate })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") }))
                : page === "configuracion"
                ? (user
                    ? h(ProfileSettings, { currentUser: user, onNavigate: navigate, onUpdateUser: (u) => setUser(u) })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth"), onForgot: () => navigate("recuperar") }))
                : page === "series"
                ? h(SeriesPage, {
                    key: page,
                    user: user,
                    series: series,
                    loadingList: loadingSeries,
                    onRefresh: fetchSeries,
                    onDelete: handleDeleteSeries,
                    onNavigate: navigate
                })
                : h(MediaPage, {
                    key: page,
                    user: user,
                    movies: movies,
                    loadingList: loadingList,
                    onRefresh: fetchMovies,
                    onDelete: handleDelete,
                    onNavigate: navigate
                })
        ),
        h(SiteFooter, { onNavigate: navigate }),
        h(CookieConsentBanner, null)
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App, null));
