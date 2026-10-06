/* ============================================================
   bundle.js — front CineAIros en JavaScript PLANO (sin JSX).
   Se usa React.createElement a través del ayudante h().
   NO necesita Babel: index.html lo carga como <script> clásico.
    Secciones: Inicio (landing), Películas y cuenta personal.
   ============================================================ */

const { useState, useEffect } = React;
const h = React.createElement;

const BRAND = "CineAIros";
const SLOGAN = "Descubre, explora y guarda tus películas favoritas.";

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

    const go = (target) => {
        setOpen(false);
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
                    ? h("button", { className: "user-chip", title: "Mi cuenta", onClick: () => go("cuenta") }, user.name)
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
                h("p", { className: "muted" }, "Busca tu primera historia y pulsa Guardar."),
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
            movie.rating ? h("span", { className: "rating-badge" }, "★ " + movie.rating) : null,
            movie.runtime ? h("span", { className: "runtime-badge" }, movie.runtime) : null
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
                h("h1", null, "Descubre, explora", h("br", null), "y guarda tus favoritas."),
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
                h("p", null, "Busca entre miles de películas por su título.")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "02"),
                h("h3", null, "Desliza y descubre"),
                h("p", null, "Explora las cards cómodamente")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "03"),
                h("h3", null, "Guarda tu colección"),
                h("p", null, "Guarda las que te gusten y tenlas siempre a mano.")
            )
        ),
        h("section", { className: "cta-band" },
            h("h2", null, "¿Empezamos?"),
            h("p", null, "Busca tu primera película, guárdala y aparecerá en tu colección."),
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
            h("p", { className: "muted" }, "Elige cómo quieres continuar."),
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
            h("p", { className: "muted" }, "Bienvenido de nuevo a " + BRAND + "."),
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
        if (cleanName.length < 2) { setError("Escribe tu nombre."); return; }
        if (!cleanEmail) { setError("Escribe tu email."); return; }
        if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
        if (password !== password2) { setError("Las contraseñas no coinciden."); return; }

        setLoading(true);
        setError(null);
        try {
            await ensureFirebase();
            const cred = await firebase.auth().createUserWithEmailAndPassword(cleanEmail, password);
            try {
                await cred.user.updateProfile({ displayName: cleanName });
            } catch (updErr) { /* nombre opcional */ }
            await cred.user.sendEmailVerification(firebaseActionSettings("verifyEmail"));
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
                    h("p", { className: "muted" }, "Paso 1 de 2: tus datos básicos."),
                    error ? h("p", { className: "error" }, error) : null,
                    renderStep1(),
                    h("p", { className: "auth-switch" }, "¿Ya tienes cuenta? ",
                        h("button", { type: "button", onClick: onSwitch }, "Entrar")
                    )
                )
            ) : (
                React.createElement(React.Fragment, null,
                    h("h1", null, "Cuéntanos tus gustos"),
                    h("p", { className: "muted" }, "Paso 2 de 2: preferencias."),
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
    const yearFromState = React.useState("");
    const yearFrom = yearFromState[0];
    const setYearFrom = yearFromState[1];
    const yearToState = React.useState("");
    const yearTo = yearToState[0];
    const setYearTo = yearToState[1];
    const ratingState = React.useState(0);
    const minRating = ratingState[0];
    const setMinRating = ratingState[1];
    const genreState = React.useState("");
    const genreFilter = genreState[0];
    const setGenreFilter = genreState[1];
    const durationMinState = React.useState("");
    const durationMin = durationMinState[0];
    const setDurationMin = durationMinState[1];
    const durationMaxState = React.useState("");
    const durationMax = durationMaxState[0];
    const setDurationMax = durationMaxState[1];
    const pegiState = React.useState("");
    const pegiFilter = pegiState[0];
    const setPegiFilter = pegiState[1];
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
    // Segundos de espera cuando el servidor nos frena (429): el botón se
    // desactiva con cuenta atrás para no realimentar el bloqueo.
    const cooldownState = React.useState(0);
    const cooldown = cooldownState[0];
    const setCooldown = cooldownState[1];

    // Valida el filtro de año (vacío o 4 cifras 1900-2100).
    const parseYearRange = () => {
        const from = String(yearFrom).trim();
        const to = String(yearTo).trim();
        const result = { from: null, to: null };
        if (from) {
            if (!/^\d{4}$/.test(from)) throw new Error("Año desde: 4 cifras (ej. 2010)");
            const n = Number.parseInt(from, 10);
            if (n < 1900 || n > 2100) throw new Error("Año desde: entre 1900 y 2100");
            result.from = n;
        }
        if (to) {
            if (!/^\d{4}$/.test(to)) throw new Error("Año hasta: 4 cifras (ej. 2020)");
            const n = Number.parseInt(to, 10);
            if (n < 1900 || n > 2100) throw new Error("Año hasta: entre 1900 y 2100");
            result.to = n;
        }
        if (result.from && result.to && result.from > result.to) {
            throw new Error("Año desde no puede ser mayor que año hasta");
        }
        return result;
    };

    // Valida duración en minutos.
    const parseDuration = (val, label) => {
        const v = String(val).trim();
        if (!v) return null;
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n) || n < 1 || n > 1000) throw new Error(label + ": minutos inválidos (1-1000)");
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

    const applyClientFilters = (items, yearRange, min, genre, durationRange, pegi, expectedType) => {
        return items.filter((item) => {
            // Blindaje por apartado: la API a veces cuela otro tipo en la lista.
            if (expectedType) {
                const it = String(item.type || "").toLowerCase();
                if (it && it !== expectedType) return false;
            }
            // Year range filter
            if (yearRange && (yearRange.from || yearRange.to)) {
                const iy = yearOf(item);
                if (!iy) return false;
                if (yearRange.from && iy < yearRange.from) return false;
                if (yearRange.to && iy > yearRange.to) return false;
            }
            if (min > 0) {
                const r = ratingOf(item);
                if (r === null || r < min) return false;
            }
            if (genre) {
                const g = String(item.genre || "").toLowerCase();
                if (!g || g.indexOf(genre.toLowerCase()) === -1) return false;
            }
            // Duration range filter (in minutes)
            if (durationRange && (durationRange.min || durationRange.max)) {
                const runtime = item.runtime;
                if (!runtime) return false;
                const mins = parseRuntimeToMinutes(runtime);
                if (mins === null) return false;
                if (durationRange.min && mins < durationRange.min) return false;
                if (durationRange.max && mins > durationRange.max) return false;
            }
            // PEGI / age rating filter
            if (pegi) {
                const rated = String(item.rated || item.ageRating || "").toUpperCase();
                if (!rated) return false;
                if (!pegiMatches(pegi, rated)) return false;
            }
            return true;
        });
    };

    // Helper: parse runtime string like "2h 22m" or "142 min" to minutes
    function parseRuntimeToMinutes(str) {
        if (!str) return null;
        const s = String(str).toLowerCase().trim();
        // Try "2h 22m" format
        const hMatch = s.match(/(\d+)h/);
        const mMatch = s.match(/(\d+)m/);
        if (hMatch || mMatch) {
            const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
            const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
            return hours * 60 + mins;
        }
        // Try "142 min" or "142" format
        const numMatch = s.match(/(\d+)/);
        if (numMatch) {
            const val = parseInt(numMatch[1], 10);
            // If value > 60, assume it's already minutes
            return val > 60 ? val : val * 60;
        }
        return null;
    }

    // Helper: check if item's rated matches PEGI filter
    function pegiMatches(filter, rated) {
        // filter examples: "G", "PG", "PG-13", "R", "NC-17", "7", "12", "16", "18"
        const pegiMap = {
            "G": ["G"],
            "PG": ["G", "PG"],
            "PG-13": ["G", "PG", "PG-13"],
            "R": ["G", "PG", "PG-13", "R"],
            "NC-17": ["G", "PG", "PG-13", "R", "NC-17"],
            "7": ["G", "PG", "7"],
            "12": ["G", "PG", "7", "12", "PG-13"],
            "16": ["G", "PG", "7", "12", "PG-13", "16", "R"],
            "18": ["G", "PG", "7", "12", "PG-13", "16", "R", "NC-17", "18"]
        };
        const allowed = pegiMap[filter];
        if (!allowed) return true;
        return allowed.includes(rated);
    }

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
    const runDiscovery = async (yearRange, min, genre, durationRange, pegi) => {
        let pooled = [];
        try {
            let url = "/api/movies/popular?limit=30";
            if (yearRange && yearRange.from) url += "&y=" + yearRange.from;
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
        const needDetails = min > 0 || genre !== "" || (durationRange && (durationRange.min || durationRange.max)) || pegi;
        if (needDetails) {
            setLoadingDetails(true);
            try {
                pooled = await enrichWithDetails(pooled);
            } finally {
                setLoadingDetails(false);
            }
        }
        const filtered = applySort(applyClientFilters(pooled, yearRange, min, genre, durationRange, pegi, omdbType), sortBy);
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

    
    // Si venimos de una portada del Hero, buscar automáticamente esa película.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('cineairos_hero_detail');
            if (raw) {
                const movie = JSON.parse(raw);
                sessionStorage.removeItem('cineairos_hero_detail');
                if (movie && (movie.imdbID || movie.title)) {
                    setQuery(movie.title);
                    setTimeout(() => {
                        const form = document.querySelector('.search-form');
                        if (form) form.requestSubmit();
                    }, 0);
                }
            }
        } catch (e) {
            /* ignora errores de storage/parseo */
        }
    }, []);



    // Si venimos de una portada del Hero, buscar automáticamente esa película.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('cineairos_hero_detail');
            if (raw) {
                const movie = JSON.parse(raw);
                sessionStorage.removeItem('cineairos_hero_detail');
                if (movie && (movie.imdbID || movie.title)) {
                    setQuery(movie.title);
                    setTimeout(() => {
                        const form = document.querySelector('.search-form');
                        if (form) form.requestSubmit();
                    }, 0);
                }
            }
        } catch (e) {
            /* ignora errores de storage/parseo */
        }
    }, []);


const rateLimitExceeded = () => {
        const err = new Error("Has hecho muchas búsquedas seguidas. Espera un minuto y vuelve a intentarlo.");
        err.code = "RATE_LIMIT";
        return err;
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = query.trim();
        let yearRange = null;
        let durationRange = null;
        let pegi = null;
        try {
            yearRange = parseYearRange();
            durationRange = {
                min: parseDuration(durationMin, "Duración mínima"),
                max: parseDuration(durationMax, "Duración máxima")
            };
            pegi = pegiFilter || null;
        } catch (err) {
            setError(err.message);
            return;
        }
        const min = Number(minRating) || 0;
        const genre = genreFilter || "";
        const hasFilters = (yearRange && (yearRange.from || yearRange.to)) || min > 0 || genre || (durationRange && (durationRange.min || durationRange.max)) || pegi;
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
            // Sin título pero con filtros: modo descubrir.
            if (!q) {
                await runDiscovery(yearRange, min, genre, durationRange, pegi);
                return;
            }
            let exactUrl = "/api/movies/search?t=" + encodeURIComponent(q);
            let listUrl = "/api/movies/search-list?s=" + encodeURIComponent(q);
            if (yearRange && yearRange.from) {
                exactUrl += "&y=" + yearRange.from;
                listUrl += "&y=" + yearRange.from;
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
        setYearFrom("");
        setYearTo("");
        setMinRating(0);
        setGenreFilter("");
        setDurationMin("");
        setDurationMax("");
        setPegiFilter("");
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

const filtersActive = String(yearFrom).trim() !== "" || String(yearTo).trim() !== "" || Number(minRating) > 0 || genreFilter !== "";

    return h("div", { className: "movies-page" },
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
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setDetail(null) }, "Cerrar")
                        )
                    )
                )
            )
        ) : null
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
    const yearFromState = React.useState("");
    const yearFrom = yearFromState[0];
    const setYearFrom = yearFromState[1];
    const yearToState = React.useState("");
    const yearTo = yearToState[0];
    const setYearTo = yearToState[1];
    const ratingState = React.useState(0);
    const minRating = ratingState[0];
    const setMinRating = ratingState[1];
    const genreState = React.useState("");
    const genreFilter = genreState[0];
    const setGenreFilter = genreState[1];
    const durationMinState = React.useState("");
    const durationMin = durationMinState[0];
    const setDurationMin = durationMinState[1];
    const durationMaxState = React.useState("");
    const durationMax = durationMaxState[0];
    const setDurationMax = durationMaxState[1];
    const pegiState = React.useState("");
    const pegiFilter = pegiState[0];
    const setPegiFilter = pegiState[1];
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
    const cooldownState = React.useState(0);
    const cooldown = cooldownState[0];
    const setCooldown = cooldownState[1];

    const parseYearRange = () => {
        const from = String(yearFrom).trim();
        const to = String(yearTo).trim();
        const result = { from: null, to: null };
        if (from) {
            if (!/^\d{4}$/.test(from)) throw new Error("Año desde: 4 cifras (ej. 2010)");
            const n = Number.parseInt(from, 10);
            if (n < 1900 || n > 2100) throw new Error("Año desde: entre 1900 y 2100");
            result.from = n;
        }
        if (to) {
            if (!/^\d{4}$/.test(to)) throw new Error("Año hasta: 4 cifras (ej. 2020)");
            const n = Number.parseInt(to, 10);
            if (n < 1900 || n > 2100) throw new Error("Año hasta: entre 1900 y 2100");
            result.to = n;
        }
        if (result.from && result.to && result.from > result.to) {
            throw new Error("Año desde no puede ser mayor que año hasta");
        }
        return result;
    };

    // Valida duración en minutos.
    const parseDuration = (val, label) => {
        const v = String(val).trim();
        if (!v) return null;
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n) || n < 1 || n > 1000) throw new Error(label + ": minutos inválidos (1-1000)");
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

    const applyClientFilters = (items, yearRange, min, genre, durationRange, pegi, expectedType) => {
        return items.filter((item) => {
            if (expectedType) {
                const it = String(item.type || "").toLowerCase();
                if (it && it !== expectedType) return false;
            }
            // Year range filter
            if (yearRange && (yearRange.from || yearRange.to)) {
                const iy = yearOf(item);
                if (!iy) return false;
                if (yearRange.from && iy < yearRange.from) return false;
                if (yearRange.to && iy > yearRange.to) return false;
            }
            if (min > 0) {
                const r = ratingOf(item);
                if (r === null || r < min) return false;
            }
            if (genre) {
                const g = String(item.genre || "").toLowerCase();
                if (!g || g.indexOf(genre.toLowerCase()) === -1) return false;
            }
            // Duration range filter (in minutes)
            if (durationRange && (durationRange.min || durationRange.max)) {
                const runtime = item.runtime;
                if (!runtime) return false;
                const mins = parseRuntimeToMinutes(runtime);
                if (mins === null) return false;
                if (durationRange.min && mins < durationRange.min) return false;
                if (durationRange.max && mins > durationRange.max) return false;
            }
            // PEGI / age rating filter
            if (pegi) {
                const rated = String(item.rated || item.ageRating || "").toUpperCase();
                if (!rated) return false;
                if (!pegiMatches(pegi, rated)) return false;
            }
            return true;
        });
    };

    // Helper: parse runtime string like "2h 22m" or "142 min" to minutes
    function parseRuntimeToMinutes(str) {
        if (!str) return null;
        const s = String(str).toLowerCase().trim();
        // Try "2h 22m" format
        const hMatch = s.match(/(\d+)h/);
        const mMatch = s.match(/(\d+)m/);
        if (hMatch || mMatch) {
            const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
            const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
            return hours * 60 + mins;
        }
        // Try "142 min" or "142" format
        const numMatch = s.match(/(\d+)/);
        if (numMatch) {
            const val = parseInt(numMatch[1], 10);
            // If value > 60, assume it's already minutes
            return val > 60 ? val : val * 60;
        }
        return null;
    }

    // Helper: check if item's rated matches PEGI filter
    function pegiMatches(filter, rated) {
        // filter examples: "G", "PG", "PG-13", "R", "NC-17", "7", "12", "16", "18"
        const pegiMap = {
            "G": ["G"],
            "PG": ["G", "PG"],
            "PG-13": ["G", "PG", "PG-13"],
            "R": ["G", "PG", "PG-13", "R"],
            "NC-17": ["G", "PG", "PG-13", "R", "NC-17"],
            "7": ["G", "PG", "7"],
            "12": ["G", "PG", "7", "12", "PG-13"],
            "16": ["G", "PG", "7", "12", "PG-13", "16", "R"],
            "18": ["G", "PG", "7", "12", "PG-13", "16", "R", "NC-17", "18"]
        };
        const allowed = pegiMap[filter];
        if (!allowed) return true;
        return allowed.includes(rated);
    }

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

    const runDiscovery = async (yearRange, min, genre, durationRange, pegi) => {
        let pooled = [];
        try {
            let url = "/api/series/popular?limit=30";
            if (yearRange && yearRange.from) url += "&y=" + yearRange.from;
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
        const needDetails = min > 0 || genre !== "" || (durationRange && (durationRange.min || durationRange.max)) || pegi;
        if (needDetails) {
            setLoadingDetails(true);
            try {
                pooled = await enrichWithDetails(pooled);
            } finally {
                setLoadingDetails(false);
            }
        }
        const filtered = applySort(applyClientFilters(pooled, yearRange, min, genre, durationRange, pegi, omdbType), sortBy);
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

    
    // Si venimos de una portada del Hero, buscar automáticamente esa película.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('cineairos_hero_detail');
            if (raw) {
                const movie = JSON.parse(raw);
                sessionStorage.removeItem('cineairos_hero_detail');
                if (movie && (movie.imdbID || movie.title)) {
                    setQuery(movie.title);
                    setTimeout(() => {
                        const form = document.querySelector('.search-form');
                        if (form) form.requestSubmit();
                    }, 0);
                }
            }
        } catch (e) {
            /* ignora errores de storage/parseo */
        }
    }, []);


const rateLimitExceeded = () => {
        const err = new Error("Has hecho muchas búsquedas seguidas. Espera un minuto y vuelve a intentarlo.");
        err.code = "RATE_LIMIT";
        return err;
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        const q = query.trim();
        let yearRange = null;
        let durationRange = null;
        let pegi = null;
        try {
            yearRange = parseYearRange();
            durationRange = {
                min: parseDuration(durationMin, "Duración mínima"),
                max: parseDuration(durationMax, "Duración máxima")
            };
            pegi = pegiFilter || null;
        } catch (err) {
            setError(err.message);
            return;
        }
        const min = Number(minRating) || 0;
        const genre = genreFilter || "";
        const hasFilters = (yearRange && (yearRange.from || yearRange.to)) || min > 0 || genre || (durationRange && (durationRange.min || durationRange.max)) || pegi;
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
                await runDiscovery(yearRange, min, genre, durationRange, pegi);
                return;
            }
            let exactUrl = "/api/series/search?t=" + encodeURIComponent(q);
            let listUrl = "/api/series/search-list?s=" + encodeURIComponent(q);
            if (yearRange && yearRange.from) {
                exactUrl += "&y=" + yearRange.from;
                listUrl += "&y=" + yearRange.from;
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
        setYearFrom("");
        setYearTo("");
        setMinRating(0);
        setGenreFilter("");
        setDurationMin("");
        setDurationMax("");
        setPegiFilter("");
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

const filtersActive = String(yearFrom).trim() !== "" || String(yearTo).trim() !== "" || Number(minRating) > 0 || genreFilter !== "" || String(durationMin).trim() !== "" || String(durationMax).trim() !== "" || pegiFilter !== "";

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
                h("span", null, "Año desde"),
                h("input", {
                    type: "number",
                    value: yearFrom,
                    onChange: (e) => setYearFrom(e.target.value),
                    placeholder: "Ej. 2010",
                    min: 1900,
                    max: 2100
                })
            ),
            h("label", { className: "filter" },
                h("span", null, "Año hasta"),
                h("input", {
                    type: "number",
                    value: yearTo,
                    onChange: (e) => setYearTo(e.target.value),
                    placeholder: "Ej. 2020",
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
                h("span", null, "Duración min"),
                h("input", {
                    type: "number",
                    value: durationMin,
                    onChange: (e) => setDurationMin(e.target.value),
                    placeholder: "Ej. 90",
                    min: 1,
                    max: 1000
                })
            ),
            h("label", { className: "filter" },
                h("span", null, "Duración max"),
                h("input", {
                    type: "number",
                    value: durationMax,
                    onChange: (e) => setDurationMax(e.target.value),
                    placeholder: "Ej. 180",
                    min: 1,
                    max: 1000
                })
            ),
            h("label", { className: "filter" },
                h("span", null, "PEGI"),
                h("select", {
                    value: pegiFilter,
                    onChange: (e) => setPegiFilter(e.target.value)
                },
                    h("option", { value: "" }, "Sin filtro"),
                    h("option", { value: "G" }, "G - Todos"),
                    h("option", { value: "PG" }, "PG"),
                    h("option", { value: "PG-13" }, "PG-13"),
                    h("option", { value: "R" }, "R"),
                    h("option", { value: "NC-17" }, "NC-17"),
                    h("option", { value: "7" }, "7+"),
                    h("option", { value: "12" }, "12+"),
                    h("option", { value: "16" }, "16+"),
                    h("option", { value: "18" }, "18+")
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
                            h("button", { className: "btn-ghost", type: "button", onClick: () => setDetail(null) }, "Cerrar")
                        )
                    )
                )
            )
        ) : null
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
    const mainTabState = React.useState("movies");
    const mainTab = mainTabState[0];
    const setMainTab = mainTabState[1];
const shown = movies || [];
    const recent = shown.slice(0, 10);

    const top5State = React.useState([]);
    const top5 = top5State[0];
    const setTop5 = top5State[1];
    const top5LoadingState = React.useState(false);
    const top5Loading = top5LoadingState[0];
    const setTop5Loading = top5LoadingState[1];

    const loadTop5 = async () => {
        try {
            setTop5Loading(true);
            const token = getStoredToken();
            const res = await fetch("/api/auth/top5", { headers: { Authorization: "Bearer " + token } });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            setTop5(data.top5 || []);
        } catch (e) {
            console.error(e);
        } finally {
            setTop5Loading(false);
        }
    };

    const saveTop5 = async (items) => {
        try {
            const token = getStoredToken();
            const res = await fetch("/api/auth/top5", {
                method: "PUT",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Error");
            setTop5(data.top5 || []);
        } catch (e) {
            console.error(e);
        }
    };

    React.useEffect(() => {
        if (mainTab === "top5") loadTop5();
    }, [mainTab]);

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

    return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Hola, " + user.name),
            h("p", { className: "muted" }, user.email),
            user.nickname ? h("p", { className: "muted" }, "Apodo: @" + user.nickname) : null
        ),

        /* ----- Tabs principales ----- */
        h("div", { className: "friends-tabs" },
            h("button", { className: "tab-btn" + (mainTab === "movies" ? " active" : ""), onClick: () => setMainTab("movies") }, "🎬 Películas"),
            h("button", { className: "tab-btn" + (mainTab === "series" ? " active" : ""), onClick: () => setMainTab("series") }, "📺 Series"),
            h("button", { className: "tab-btn" + (mainTab === "friends" ? " active" : ""), onClick: () => setMainTab("friends") }, "👥 Amigos"),
            h("button", { className: "tab-btn" + (mainTab === "top5" ? " active" : ""), onClick: () => setMainTab("top5") }, "⭐ Top 5")
        ),

        /* ----- Contenido por tab ----- */
        mainTab === "movies" && h("div", null,
            h("div", { className: "hero-stats account-stats" },
            h("div", null, h("strong", null, String((movies || []).length)), h("span", null, "guardadas")),
            h("div", null, h("strong", null, String(shown.length)), h("span", null, "películas"))
        ),
        detailLoading ? h("p", { className: "muted" }, "Cargando detalle...") : null,
        h(MovieCarousel, {
            title: "Guardadas recientemente",
            subtitle: "Tus últimas películas",
            movies: recent,
            onDelete: onDelete,
            onDetail: openDetail,
            showDelete: true,
            emptyText: "Aún no guardaste películas. Explora Películas y pulsa Guardar."
        }),
        h("h2", null, "Todas tus películas"),
        loadingList ? h("p", { className: "muted" }, "Cargando lista...") : null,
        (!loadingList && shown.length === 0)
            ? h("p", { className: "muted" }, "Vacío por ahora.")
            : null,
        h("div", { className: "movies-grid" },
            shown.map((movie) =>
                h(MovieCard, { key: movie.id, movie: movie, onDelete: onDelete, onDetail: openDetail, showDelete: true })
            )
        )
        ),

        mainTab === "series" && h("div", null,
            h("h2", null, "Todas tus series"),
            loadingList ? h("p", { className: "muted" }, "Cargando lista...") : null,
            (!loadingList && shown.length === 0)
                ? h("p", { className: "muted" }, "Vacío por ahora.")
                : null,
            h("div", { className: "movies-grid" },
                shown.map((movie) =>
                    h(MovieCard, { key: movie.id, movie: movie, onDelete: onDelete, onDetail: openDetail, showDelete: true })
                )
            )
        ),

        mainTab === "friends" && h(FriendsPage, { currentUser: user, onNavigate: (p) => {} }),

        mainTab === "top5" && h("div", null,
            h("h2", null, "Tu Top 5"),
            h("p", { className: "muted" }, "Arrastra para reordenar. Máximo 5 películas/series."),
            top5Loading ? h("p", { className: "muted" }, "Cargando...") : null,
            h("div", { className: "top5-list" },
                top5.map((item, idx) => h("div", {
                    key: item.imdbID || item.title + idx,
                    className: "top5-item"
                },
                    h("span", { className: "top5-rank" }, idx + 1),
                    item.poster ? h("img", { src: item.poster, alt: "", className: "top5-poster" }) : null,
                    h("div", { className: "top5-info" },
                        h("strong", null, item.title),
                        item.year ? h("span", { className: "muted" }, " (" + item.year + ")") : null,
                        item.type === "series" ? h("span", { className: "badge series" }, "Serie") : h("span", { className: "badge movie" }, "Película")
                    ),
                    h("button", {
                        className: "btn-ghost btn-small top5-remove",
                        onClick: () => saveTop5(top5.filter((_, i) => i !== idx)),
                        "aria-label": "Eliminar del Top 5"
                    }, "✕")
                ))
            ),
            top5.length < 5 && h("button", {
                className: "btn-primary top5-add",
                onClick: () => {
                    const saved = props.movies || [];
                    if (saved.length === 0) return alert("No tienes nada guardado para añadir.");
                    const options = saved.filter(m => !top5.some(t => t.imdbID === m.imdbID || t.title === m.title));
                    if (options.length === 0) return alert("Ya están todas tus guardadas en el Top 5.");
                    const pick = options[Math.floor(Math.random() * options.length)];
                    saveTop5([...top5, { imdbID: pick.imdbID, title: pick.title, year: pick.year, poster: pick.poster, type: pick.type || "movie" }]);
                }
            }, "+ Añadir desde guardadas"),
            top5.length === 5 && h("p", { className: "muted" }, "Top 5 completo. Elimina uno para añadir otro.")
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



/* ---------- ThemePicker: Selector de paleta de colores ---------- */
function ThemePicker() {
    const themes = [
        { id: "default", name: "CineAIros", swatch: "linear-gradient(135deg, #b3122e 0%, #b3122e 55%, #7fb0d8 100%)" },
        { id: "ocean", name: "Océano", swatch: "linear-gradient(135deg, #006994 0%, #006994 55%, #00b4d8 100%)" },
        { id: "forest", name: "Bosque", swatch: "linear-gradient(135deg, #2d6a4f 0%, #2d6a4f 55%, #52b788 100%)" },
        { id: "sunset", name: "Atardecer", swatch: "linear-gradient(135deg, #e85d04 0%, #e85d04 55%, #ff9f1c 100%)" },
        { id: "purple", name: "Púrpura", swatch: "linear-gradient(135deg, #7209b7 0%, #7209b7 55%, #b5179e 100%)" },
        { id: "mono", name: "Monocromo", swatch: "linear-gradient(135deg, #ffffff 0%, #ffffff 55%, #bbbbbb 100%)" }
    ];

    const openState = React.useState(false);
    const isOpen = openState[0];
    const setOpen = openState[1];

    const themeState = React.useState(() => {
        try { return localStorage.getItem("cineairos_theme") || "default"; } catch (e) { return "default"; }
    });
    const currentTheme = themeState[0];
    const setCurrentTheme = themeState[1];

    React.useEffect(() => {
        document.documentElement.setAttribute("data-theme", currentTheme);
        try { localStorage.setItem("cineairos_theme", currentTheme); } catch (e) {}
    }, [currentTheme]);

    const selectTheme = (themeId) => {
        setCurrentTheme(themeId);
        setOpen(false);
    };

    return h("div", { className: "theme-picker" },
        h("button", {
            className: "theme-picker-btn",
            onClick: () => setOpen(!isOpen),
            "aria-label": "Cambiar tema",
            "aria-expanded": isOpen
        },
            h("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
                h("circle", { cx: "12", cy: "12", r: "5" }),
                h("line", { x1: "12", y1: "1", x2: "12", y2: "3" }),
                h("line", { x1: "12", y1: "21", x2: "12", y2: "23" }),
                h("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }),
                h("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }),
                h("line", { x1: "1", y1: "12", x2: "3", y2: "12" }),
                h("line", { x1: "21", y1: "12", x2: "23", y2: "12" }),
                h("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }),
                h("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
            )
        ),
        h("div", { className: "theme-picker-panel" + (isOpen ? " open" : "") },
            themes.map(t => h("button", {
                key: t.id,
                className: "theme-option" + (currentTheme === t.id ? " active" : ""),
                onClick: () => selectTheme(t.id),
                "aria-pressed": currentTheme === t.id
            },
                h("div", { className: "theme-swatch", style: { background: t.swatch } }),
                h("span", { className: "theme-name" }, t.name)
            ))
        )
    );
}

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
            received.length > 0 ? h("div", null,
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

            sent.length > 0 ? h("div", null,
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
            searchResults.length > 0 ? h("div", { className: "search-results" },
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
        h(CookieConsentBanner, null),
        h(ThemePicker, null),
        user ? h(ChatWidget, { currentUser: user, onNavigate: navigate }) : null
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App, null));
