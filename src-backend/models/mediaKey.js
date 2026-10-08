// Utilidades compartidas para identificar una obra (película o serie).
// Se extraen de reviewModel para que catalogo (catálogo/admin) y reseñas usen
// exactamente la misma clave: si dos sitios construyen `mediaKey` igual, las
// estadísticas por obra no se separan por casualidad.
//
// mediaKey: identificador estable de la obra:
//   - si hay imdbID -> "movie:tt1234567" (tipo + id en minúsculas)
//   - si no -> "movie:slug-titulo-yyyy", ej. "movie:inception-2010"

function slugify(value) {
    if (typeof value !== "string") return "untitled";
    const out = value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return out || "untitled";
}

function normalizeMediaType(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === "movie" || v === "movies" || v === "film") return "movie";
    if (v === "series" || v === "serie" || v === "tv" || v === "show") return "series";
    throw new Error("mediaType inválido (usa 'movie' o 'series')");
}

function normalizeImdbId(raw) {
    const v = String(raw || "").trim();
    if (!v) return null;
    if (!/^tt\d{1,12}$/i.test(v)) throw new Error("imdbID inválido (formato tt1234567)");
    return v.toLowerCase();
}

function normalizeYear(raw) {
    const v = String(raw == null ? "" : raw).trim().slice(0, 4);
    if (!v) return null;
    if (!/^\d{4}$/.test(v)) throw new Error("Año inválido (4 cifras)");
    const n = Number.parseInt(v, 10);
    if (n < 1900 || n > 2100) throw new Error("Año fuera de rango (1900-2100)");
    return String(n);
}

function buildMediaKey({ mediaType, imdbID, title, year }) {
    if (imdbID) return `${mediaType}:${imdbID}`;
    const base = slugify(title);
    const y = year ? `-${year}` : "";
    return `${mediaType}:${base}${y}`;
}

// Algunos documentos antiguos guardan solo `type` ("movie"/"series") o el título
// en `Title`. Normaliza sin lanzar error para lecturas best-effort.
function safeMediaType(raw, fallback = "movie") {
    try {
        return normalizeMediaType(raw);
    } catch (e) {
        return fallback;
    }
}

module.exports = {
    slugify,
    normalizeMediaType,
    normalizeImdbId,
    normalizeYear,
    buildMediaKey,
    safeMediaType
};
