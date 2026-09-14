/* ============================================================
   bundle.js — front CineAIros en JavaScript PLANO (sin JSX).
   Se usa React.createElement a través del ayudante h().
   NO necesita Babel: index.html lo carga como <script> clásico.
   Secciones: Inicio (landing), Películas y Series (tabs + filtros).
   ============================================================ */

const { useState, useEffect } = React;
const h = React.createElement;

const BRAND = "CineAIros";
const SLOGAN = "Descubre, explora y guarda tus películas y series favoritas.";

// Contenido por defecto para que cada apartado no se vea vacío antes de buscar.
const DEFAULTS = {
    movie: { label: "Películas", query: "Batman" },
    series: { label: "Series", query: "Star Wars" }
};

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

function mediaLabel(mediaType) {
    return mediaType === "series" ? "Series" : "Películas";
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
    const serieCount = props.serieCount || 0;
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
                    "Películas",
                    peliCount > 0 ? h("span", { className: "badge" }, String(peliCount)) : null
                ),
                h("button",
                    { className: "nav-link" + (page === "series" ? " active" : ""), onClick: () => go("series") },
                    "Series",
                    serieCount > 0 ? h("span", { className: "badge" }, String(serieCount)) : null
                ),
                user
                    ? h("button", { className: "user-chip", title: "Mi cuenta", onClick: () => go("cuenta") }, user.name)
                    : null,
                user
                    ? h("button", { className: "nav-link", onClick: () => { setOpen(false); onLogout(); } }, "Salir")
                    : h("button",
                        {
                            className: "nav-link nav-cta" + ((page === "login" || page === "register" || page === "auth") ? " active" : ""),
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
                h("button", { className: "footer-link", onClick: () => onNavigate("series") }, "Series")
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
    const typeLabel = movie.type === "series" ? "Serie" : (movie.type === "movie" ? "Película" : null);

    return h("article",
        { className: "movie-card", onClick: () => { if (onDetail) onDetail(movie); } },
        h("div", { className: "movie-card-poster" },
            h("img", { src: movie.poster || PLACEHOLDER_POSTER, alt: movie.title, loading: "lazy" }),
            movie.rating ? h("span", { className: "rating-badge" }, "★ " + movie.rating) : null
        ),
        h("div", { className: "movie-card-body" },
            h("h3", { title: movie.title }, movie.title),
            h("p", { className: "movie-meta" }, (movie.year || "----") + (typeLabel ? " · " + typeLabel : "")),
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
    const preview = (movies || []).slice(0, 10);
    const heroPosters = (preview.length > 0
        ? preview
        : [{ title: "Inception", poster: null }, { title: "Dune", poster: null }, { title: "Breaking Bad", poster: null }]
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
                h("p", null, "Busca entre miles de películas y series por su título.")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "02"),
                h("h3", null, "Desliza y descubre"),
                h("p", null, "Explora las cards cómodamente, en el móvil o en el ordenador.")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "03"),
                h("h3", null, "Guarda tu colección"),
                h("p", null, "Guarda las que te gusten y tenlas siempre a mano.")
            )
        ),
        h("section", { className: "cta-band" },
            h("h2", null, "¿Empezamos?"),
            h("p", null, "Busca tu primera película o serie, guárdala y aparecerá en tu colección."),
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

/* ---------- LoginPage ---------- */
function LoginPage(props) {
    const onAuth = props.onAuth;
    const onSwitch = props.onSwitch;
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
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: cleanEmail, password: password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo entrar");
            onAuth(data.token, data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
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
                h("button", { className: "btn-primary", type: "submit", disabled: loading },
                    loading ? "Entrando..." : "Entrar"
                )
            ),
            h("p", { className: "auth-switch" }, "¿No tienes cuenta? ",
                h("button", { type: "button", onClick: onSwitch }, "Regístrate")
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

    // Paso 1: datos básicos | Paso 2: cuestionario
    const stepState = React.useState(1);
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
    const likesSeriesState = React.useState(null);
    const likesSeries = likesSeriesState[0];
    const setLikesSeries = likesSeriesState[1];
    const likesMoviesState = React.useState(null);
    const likesMovies = likesMoviesState[0];
    const setLikesMovies = likesMoviesState[1];
    const likesMiniseriesState = React.useState(null);
    const likesMiniseries = likesMiniseriesState[0];
    const setLikesMiniseries = likesMiniseriesState[1];

    const errorState = React.useState(null);
    const error = errorState[0];
    const setError = errorState[1];
    const loadingState = React.useState(false);
    const loading = loadingState[0];
    const setLoading = loadingState[1];

    const toggleGenre = (g) => {
        setSelectedGenres((prev) =>
            prev.includes(g)
                ? prev.filter((x) => x !== g)
                : prev.length < 3
                    ? [...prev, g]
                    : prev
        );
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
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: cleanName, email: cleanEmail, password: password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo registrar");
            // Usuario creado: guardamos token en localStorage y avanzamos al paso 2 (cuestionario)
            // NO llamamos a onAuth aquí para no navegar todavía.
            try {
                window.localStorage.setItem("cineairos_token", data.token);
            } catch (e) { /* sin almacenamiento */ }
            setStep(2);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleQuestionnaire = async (e) => {
        e.preventDefault();
        if (selectedGenres.length !== 3) {
            setError("Selecciona exactamente 3 géneros.");
            return;
        }
        if (likesSeries === null || likesMovies === null || likesMiniseries === null) {
            setError("Responde las 3 preguntas de Sí/No.");
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
                    likesSeries: likesSeries,
                    likesMovies: likesMovies,
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

    const renderStep1 = () => h("form", { onSubmit: handleStep1 },
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
        h("button", { className: "btn-primary", type: "submit", disabled: loading },
            loading ? "Creando cuenta..." : "Continuar"
        )
    );

    const renderStep2 = () => h("form", { onSubmit: handleQuestionnaire },
        h("p", { className: "muted" }, "Solo 4 preguntas rápidas para personalizar tu experiencia."),
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
        // Pregunta 2: Series
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "2"), " ¿Te gusta ver series?"),
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
        // Pregunta 3: Películas
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "3"), " ¿Te gusta ver películas?"),
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
        // Pregunta 4: Miniseries
        h("fieldset", { className: "question" },
            h("legend", null, h("span", { className: "q-num" }, "4"), " ¿Te gusta ver miniseries?"),
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

/* ---------- MediaPage: Películas o Series con tabs + filtros ----------
   Props: mediaType ("movie" | "series"), movies, loadingList,
   onRefresh(), onDelete(id), onNavigate(page) */
function MediaPage(props) {
    const mediaType = props.mediaType;
    const user = props.user || null;
    const movies = props.movies;
    const loadingList = props.loadingList;
    const onRefresh = props.onRefresh;
    const onDelete = props.onDelete;
    const onNavigate = props.onNavigate;
    const defaults = DEFAULTS[mediaType === "series" ? "series" : "movie"];
    const omdbType = mediaType === "series" ? "series" : "movie";

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
    // true cuando la búsqueda exacta devolvió algo del OTRO apartado (la API
    // ignora el filtro de tipo en ?t=): se muestra como aviso, sin guardar.
    const typeMismatchState = React.useState(false);
    const typeMismatch = typeMismatchState[0];
    const setTypeMismatch = typeMismatchState[1];
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

    // Colección filtrada por apartado: las series van a Series, el resto a Películas.
    const collection = (movies || []).filter((m) =>
        mediaType === "series" ? m.type === "series" : m.type !== "series"
    );

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
                            type: data.type || item.type
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

    // Modo descubrir: sin título, usa búsquedas amplias y filtra en el cliente
    // (la API de OMDb exige siempre un texto de búsqueda).
    const runDiscovery = async (year, min, genre) => {
        const baseQueries = ["the", "love", defaults.query];
        let pooled = [];
        const seen = {};
        let limited = false;
        for (const bq of baseQueries) {
            try {
                let url = "/api/movies/search-list?s=" + encodeURIComponent(bq) + "&type=" + omdbType;
                if (year) url += "&y=" + year;
                const res = await fetch(url);
                if (res.status === 429) {
                    limited = true;
                    break;
                }
                const data = await res.json();
                if (res.ok && Array.isArray(data.results)) {
                    data.results.forEach((item) => {
                        const key = item.imdbID || (item.title + item.year);
                        if (!seen[key]) {
                            seen[key] = true;
                            pooled.push(item);
                        }
                    });
                }
                // Si la búsqueda amplia falla (ej. "demasiados resultados") se sigue con la siguiente.
            } catch (e) {
                // Fallo de red: se sigue con la siguiente búsqueda amplia.
            }
            if (pooled.length >= 20) break;
        }
        if (limited) {
            throw rateLimitExceeded();
        }
        if (pooled.length === 0) {
            throw new Error("Sin resultados para esos filtros. Prueba con otros.");
        }
        pooled = pooled.slice(0, 20);
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

    // Contenido por defecto del apartado para que no se vea vacío antes de buscar.
    const loadDefaults = async () => {
        setLoadingDefaults(true);
        setError(null);
        try {
            const res = await fetch(
                "/api/movies/search-list?s=" + encodeURIComponent(defaults.query) + "&type=" + omdbType
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "No se pudo cargar el contenido");
            setExplore(Array.isArray(data.results) ? data.results : []);
            setExploreTitle("Popular ahora");
        } catch (e) {
            setExplore([]);
        } finally {
            setLoadingDefaults(false);
        }
    };

    // Al entrar o cambiar de apartado se carga su contenido por defecto.
    useEffect(() => {
        loadDefaults();
    }, [mediaType]);

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
            setError("Escribe un título o elige algún filtro para explorar.");
            return;
        }
        setLoading(true);
        setError(null);
        setSuccess(null);
        setResult(null);
        setResultWarning(null);
        setTypeMismatch(false);
        setExplore([]);
        try {
            // Sin título pero con filtros: modo descubrir.
            if (!q) {
                await runDiscovery(year, min, genre);
                return;
            }
            let exactUrl = "/api/movies/search?t=" + encodeURIComponent(q) + "&type=" + omdbType;
            let listUrl = "/api/movies/search-list?s=" + encodeURIComponent(q) + "&type=" + omdbType;
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
                const foundType = String(exactRes.data.type || "").toLowerCase();
                if (foundType && foundType !== omdbType) {
                    // Es del otro apartado: aviso + botón para ir allí, SIN guardar.
                    setResult(exactRes.data);
                    setResultWarning(null);
                    setTypeMismatch(true);
                } else {
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
                    setTypeMismatch(false);
                }
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
        setTypeMismatch(false);
        setError(null);
        setSuccess(null);
        setExploreTitle("Popular ahora");
        loadDefaults();
    };

    const handleSave = async () => {
        if (!result) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/movies", {
                method: "POST",
                headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
                body: JSON.stringify(result)
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
            h("h1", null, mediaLabel(mediaType)),
            h("p", { className: "muted" }, "Busca tus favoritas, guárdalas y vuelve a verlas cuando quieras.")
        ),
        h("div", { className: "tabs" },
            h("button", {
                className: "tab" + (mediaType === "movie" ? " active" : ""),
                onClick: () => onNavigate("peliculas")
            }, "Películas"),
            h("button", {
                className: "tab" + (mediaType === "series" ? " active" : ""),
                onClick: () => onNavigate("series")
            }, "Series")
        ),
        h("form", { onSubmit: handleSearch, className: "search-form" },
            h("input", {
                type: "text",
                value: query,
                onChange: (e) => setQuery(e.target.value),
                placeholder: mediaType === "series"
                    ? "Buscar series... (ej. Breaking Bad)"
                    : "Buscar películas... (ej. Inception)",
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
                    typeMismatch ? h("p", { className: "error" }, "«" + result.title + "» es " + (mediaType === "series" ? "una película" : "una serie") + ": está en el apartado " + (mediaType === "series" ? "Películas" : "Series") + ".") : null,
                    h("div", { className: "result-actions" },
                        typeMismatch
                            ? h("button", { onClick: () => onNavigate(mediaType === "series" ? "peliculas" : "series") }, "Ir a " + (mediaType === "series" ? "Películas" : "Series"))
                            : h("button", { onClick: handleSave, disabled: saving }, saving ? "Guardando..." : "Guardar en mi colección"),
                        h("button", { className: "btn-ghost", type: "button", onClick: () => { setResult(null); setResultWarning(null); setTypeMismatch(false); } }, "Descartar")
                    )
                )
            )
        ) : null,
        loadingDefaults
            ? h("p", { className: "muted" }, "Cargando " + mediaLabel(mediaType).toLowerCase() + "...")
            : h(MovieCarousel, {
                title: exploreTitle + (mediaType === "series" ? " · Series" : " · Películas"),
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
                        detail.plot ? h("p", null, detail.plot) : null
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
    const tabState = React.useState("movie");
    const tab = tabState[0];
    const setTab = tabState[1];

    const pelis = (movies || []).filter((m) => m.type !== "series");
    const series = (movies || []).filter((m) => m.type === "series");
    const shown = tab === "series" ? series : pelis;
    const recent = shown.slice(0, 10);

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
            h("p", { className: "muted" }, user.email)
        ),
        h("div", { className: "hero-stats account-stats" },
            h("div", null, h("strong", null, String((movies || []).length)), h("span", null, "guardadas")),
            h("div", null, h("strong", null, String(pelis.length)), h("span", null, "películas")),
            h("div", null, h("strong", null, String(series.length)), h("span", null, "series"))
        ),
        detailLoading ? h("p", { className: "muted" }, "Cargando detalle...") : null,
        h("div", { className: "tabs" },
            h("button", {
                className: "tab" + (tab === "movie" ? " active" : ""),
                onClick: () => setTab("movie")
            }, "Películas guardadas (" + pelis.length + ")"),
            h("button", {
                className: "tab" + (tab === "series" ? " active" : ""),
                onClick: () => setTab("series")
            }, "Series guardadas (" + series.length + ")")
        ),
        h(MovieCarousel, {
            title: "Guardadas recientemente",
            subtitle: tab === "series" ? "Tus últimas series" : "Tus últimas películas",
            movies: recent,
            onDelete: onDelete,
            onDetail: openDetail,
            showDelete: true,
            emptyText: tab === "series"
                ? "Aún no guardaste series. Explora Series y pulsa Guardar."
                : "Aún no guardaste películas. Explora Películas y pulsa Guardar."
        }),
        h("h2", null, tab === "series" ? "Todas tus series" : "Todas tus películas"),
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

/* ---------- App raíz ---------- */
function App() {
    const pageState = useState("home");
    const page = pageState[0];
    const setPage = pageState[1];
    const moviesState = useState([]);
    const movies = moviesState[0];
    const setMovies = moviesState[1];
    const loadingListState = useState(true);
    const loadingList = loadingListState[0];
    const setLoadingList = loadingListState[1];
    const toastState = useState(null);
    const toast = toastState[0];
    const setToast = toastState[1];
    const userState = useState(null);
    const user = userState[0];
    const setUser = userState[1];

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
        try {
            window.localStorage.removeItem("cineairos_token");
        } catch (e) {
            /* sin almacenamiento */
        }
        setUser(null);
        setMovies([]);
        navigate("home");
    };

    const peliCount = (movies || []).filter((m) => m.type !== "series").length;
    const serieCount = (movies || []).filter((m) => m.type === "series").length;

    return h("div", { className: "layout" },
        h(SiteHeader, { page: page, onNavigate: navigate, peliCount: peliCount, serieCount: serieCount, user: user, onLogout: handleLogout }),
        toast ? h("div", { className: "toast " + toast.type },
            h("span", null, toast.text),
            h("button", { onClick: () => setToast(null), "aria-label": "Cerrar" }, "✕")
        ) : null,
        h("main", { className: "main" },
            page === "home"
                ? h(LandingPage, { onExplore: () => navigate("peliculas"), movies: movies })
                : page === "auth"
                ? h(AuthChoice, { onLogin: () => navigate("login"), onRegister: () => navigate("register") })
                : page === "login"
                ? h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth") })
                : page === "register"
                ? h(RegisterPage, { onAuth: handleAuth, onSwitch: () => navigate("auth") })
                : page === "cuenta"
                ? (user
                    ? h(MiCuenta, { user: user, movies: movies, loadingList: loadingList, onDelete: handleDelete })
                    : h(LoginPage, { onAuth: handleAuth, onSwitch: () => navigate("auth") }))
                : h(MediaPage, {
                    key: page,
                    mediaType: page === "series" ? "series" : "movie",
                    user: user,
                    movies: movies,
                    loadingList: loadingList,
                    onRefresh: fetchMovies,
                    onDelete: handleDelete,
                    onNavigate: navigate
                })
        ),
        h(SiteFooter, { onNavigate: navigate })
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App, null));
