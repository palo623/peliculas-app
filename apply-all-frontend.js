const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// ============================================================
// 1. LandingPage: Hero posters como botones clicables
// ============================================================
const heroPosterOld = `h("div", { className: "hero-visual", "aria-hidden": "true" },
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
            )`;

const heroPosterNew = `h("div", { className: "hero-visual", "aria-hidden": "true" },
                h("div", { className: "hero-posters" },
                    heroPosters.map((m, i) =>
                        h("button", {
                            className: "hero-poster-card tilt-" + i,
                            key: m.id || (m.title + i),
                            onClick: () => {
                                try { sessionStorage.setItem("cineairos_hero_detail", JSON.stringify(m)); } catch (e) {}
                                onExplore();
                            },
                            onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); try { sessionStorage.setItem("cineairos_hero_detail", JSON.stringify(m)); } catch (e) {} onExplore(); } },
                            tabIndex: 0,
                            "aria-label": "Ver ficha de " + m.title,
                            style: { background: "none", border: "none", padding: 0, cursor: "pointer" }
                        },
                            h("img", {
                                src: m.poster || ("https://via.placeholder.com/300x450?text=" + encodeURIComponent(m.title)),
                                alt: m.title,
                                loading: "lazy"
                            })
                        )
                    )
                )
            )`;

content = content.replace(heroPosterOld, heroPosterNew);

// ============================================================
// 2. LandingPage: Feature cards como botones
// ============================================================
const featureOld = `h("section", { className: "features" },
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
            )`;

const featureNew = `h("section", { className: "features" },
            h("button", {
                className: "feature",
                onClick: onExplore,
                onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExplore(); } },
                tabIndex: 0,
                "aria-label": "Encuentra tu próxima favorita: navega a Películas"
            },
                h("span", { className: "feature-icon" }, "01"),
                h("h3", null, "Encuentra tu próxima favorita"),
                h("p", null, "Busca entre miles de películas por su título")
            ),
            h("button", {
                className: "feature",
                onClick: () => {
                    onExplore();
                    setTimeout(() => {
                        const yearInput = document.querySelector(".filters input[placeholder='Ej. 2010']");
                        const genreSelect = document.querySelector(".filters select");
                        if (yearInput) yearInput.focus();
                    }, 100);
                },
                onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExplore(); } },
                tabIndex: 0,
                "aria-label": "Desliza y descubre: explora contenido con filtros"
            },
                h("span", { className: "feature-icon" }, "02"),
                h("h3", null, "Desliza y descubre"),
                h("p", null, "Explora las cards cómodamente")
            ),
            h("div", { className: "feature" },
                h("span", { className: "feature-icon" }, "03"),
                h("h3", null, "Guarda tu colección"),
                h("p", null, "Guarda las que te gusten y tenlas siempre a mano.")
            )`;

content = content.replace(featureOld, featureNew);

// ============================================================
// 3. MediaPage: useEffect para auto-búsqueda desde Hero
// ============================================================
const mediaPageMarker = '// Ticker de la cuenta atrás del límite (nunca sube, solo baja).';
const idx1 = content.indexOf(mediaPageMarker);
const idx2 = content.indexOf(mediaPageMarker, idx1 + 1);

if (idx1 === -1 || idx2 === -1) {
    console.error('MediaPage marker not found');
    process.exit(1);
}

const rateLimitIdx = content.indexOf('const rateLimitExceeded = () => {', idx2);
if (rateLimitIdx === -1) {
    console.error('rateLimitExceeded not found in MediaPage');
    process.exit(1);
}

const newUseEffect = `
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
    }, []);\n\n`;

const before = content.substring(0, rateLimitIdx);
const after = content.substring(rateLimitIdx);
content = content.substring(0, rateLimitIdx) + newUseEffect + '\n' + content.substring(rateLimitIdx);

// ============================================================
// 4. SeriesPage: añadir runtime en enrichWithDetails
// ============================================================
const seriesEnrichOld = `return {
                        item: Object.assign({}, item, {
                            genre: data.genre || item.genre,
                            rating: data.rating || null,
                            plot: data.plot,
                            director: data.director,
                            actors: data.actors,
                            type: data.type || item.type,
                        }),
                        limited: false
                    };`;

const seriesEnrichNew = `return {
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
                    };`;

content = content.replace(seriesEnrichOld, seriesEnrichNew);

// ============================================================
// 5. SeriesPage: añadir runtime en tarjeta de resultado
// ============================================================
const seriesResultOld = `h("div", { className: "result-info" },
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
                )`;

const seriesResultNew = `h("div", { className: "result-info" },
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
                )`;

content = content.replace(seriesResultOld, seriesResultNew);

// ============================================================
// 5. Escribir archivo
// ============================================================
fs.writeFileSync('public/js/bundle.js', content, 'utf8');
console.log('All frontend changes applied successfully!');