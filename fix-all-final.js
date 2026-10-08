const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// 1. Remove duplicate mainTabState declaration
// ============================================================
const idx1 = content.indexOf('const mainTabState = React.useState("movies");');
const idx2 = content.indexOf('const mainTabState = React.useState("movies");', idx1 + 1);

if (idx2 !== -1) {
    // Remove the second declaration
    const before = content.substring(0, idx2);
    const after = content.substring(idx2);
    content = before + after.replace('const mainTabState = React.useState("movies");', '');
    console.log('Fixed duplicate mainTabState declaration');
}

// ============================================================
// 2. Remove duplicate mainTab declaration
// ============================================================
const idxMainTab1 = content.indexOf('const mainTab = mainTabState[0];');
const idxMainTab2 = content.indexOf('const mainTab = mainTabState[0];', idxMainTab1 + 1);

if (idxMainTab2 !== -1) {
    const before = content.substring(0, idxMainTab2);
    const after = content.substring(idxMainTab2);
    content = before + after.replace('const mainTab = mainTabState[0];', '');
    console.log('Fixed duplicate mainTab declaration');
}

// ============================================================
// 3. Remove the erroneous mainTabState("movies"); line
// ============================================================
const idx = content.indexOf('mainTabState("movies");');
if (idx !== -1) {
    const before = content.substring(0, idx);
    const after = content.substring(idx);
    content = before + after.replace('mainTabState("movies");', '');
    console.log('Fixed mainTabState("movies") call');
}

// ============================================================
// 2. Add ChatWidget to App component
// ============================================================
const appChatWidgetOld = `h(SiteFooter, { onNavigate: navigate }),
        h(CookieConsentBanner, null)
    );
}
`;

const appChatWidgetNew = `h(SiteFooter, { onNavigate: navigate }),
        h(CookieConsentBanner, null),
        user ? h(ChatWidget, { currentUser: user, onNavigate: navigate }) : null
    );
}
`;

content = content.replace(appChatWidgetOld, appChatWidgetNew);

// ============================================================
// 2. Add mainTab state to MiCuenta
// ============================================================
const miCuentaOld = `function MiCuenta(props) {
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
    const shown = movies || [];
    const recent = shown.slice(0, 10);
`;

const miCuentaNew = `function MiCuenta(props) {
    const user = props.user;
    const movies = props.movies;
    const loadingList = props.loadingList;
    const onDelete = props.onDelete;
    const mainTabState = React.useState("movies");
    const mainTab = mainTabState[0];
    const setMainTab = mainTabState[1];
    const detailState = React.useState(null);
    const detail = detailState[0];
    const setDetail = detailState[1];
    const detailLoadingState = React.useState(false);
    const detailLoading = detailLoadingState[0];
    const setDetailLoading = detailLoadingState[1];
    const shown = movies || [];
    const recent = shown.slice(0, 10);
`;

content = content.replace(miCuentaOld, miCuentaNew);

// ============================================================
// 2b. Update MiCuenta return to use tabs
// ============================================================
const miCuentaReturnOld = `return h("div", { className: "movies-page" },
        h("div", { className: "page-head" },
            h("h1", null, "Hola, " + user.name),
            h("p", { className: "muted" }, user.email)
        ),
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
                        detail.plot ? h("p", null, detail.plot) : null
                    )
                )
            )
        ) : null
    );
`;

const miCuentaReturnNew = `const mainTabState = React.useState("movies");
    const mainTab = mainTabState[0];
    const setMainTab = mainTabState[1];

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
            h("button", { className: "tab-btn" + (mainTab === "friends" ? " active" : ""), onClick: () => setMainTab("friends") }, "👥 Amigos")
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
                        detail.plot ? h("p", null, detail.plot) : null
                    )
                )
            )
        ) : null
    );
`;

const fs = require('fs');
const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(miCuentaReturnOld, miCuentaReturnNew);
content = content.replace(appChatWidgetOld, appChatWidgetNew);
content = content.replace(miCuentaOld, miCuentaNew);

fs.writeFileSync('public/js/bundle.js', content, 'utf8');
console.log('All changes applied successfully!');