// Pruebas del backend de administración (tarea 15 del proyecto).
//
// Se ejecutan en modo local (memoria), sin tocar Firestore: DISABLE_FIREBASE=1
// evita cualquier conexión con la base de datos real aunque .env tenga
// credenciales. Se levanta la app real en un puerto libre y se llama por HTTP,
// de forma que se prueban rutas, permisos y respuestas tal y como las usará el
// frontend.
//
//   npm test

process.env.DISABLE_FIREBASE = "1";
process.env.SENTIMENT_PROVIDER = "lexicon";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const app = require("../../server");
const { authService, isAdminUser } = require("../../src-backend/services/authService");
const { ReviewModel } = require("../../src-backend/models/reviewModel");
const { adminService } = require("../../src-backend/services/adminService");
const catalog = require("../../src-backend/services/catalogService");
const { analyzeSentiment } = require("../../src-backend/services/sentimentService");

const POSITIVE_REVIEW = "Me ha parecido excelente y muy entretenida, con una actuación brillante y un final perfecto.";
const NEGATIVE_REVIEW = "Me ha parecido aburrida y muy predecible, con un guion flojo y unas actuaciones mediocres.";
const NEUTRAL_REVIEW = "Es una serie correcta sin más: cumple con lo que promete y se deja ver un rato, aunque no aporta nada nuevo.";

let server;
let baseUrl;
let admin;
let normalUser;
let createdReviewIds = {};

async function api(method, path, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let parsed = null;
    try {
        parsed = await res.json();
    } catch (e) {
        parsed = null;
    }
    return { status: res.status, body: parsed };
}

async function createReview(token, { mediaType, imdbID, title, year, text, rating, genre }) {
    return api("POST", "/api/reviews", {
        token,
        body: {
            mediaType,
            imdbID,
            mediaTitle: title,
            mediaYear: year,
            text,
            rating,
            mediaGenre: genre
        }
    });
}

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    admin = await authService.seedLocalUser({ email: "admin.test@example.com", name: "Admin Test", role: "admin" });
    normalUser = await authService.seedLocalUser({ email: "user.test@example.com", name: "User Test", role: "user" });
    const u2 = await authService.seedLocalUser({ email: "user2.test@example.com", name: "User Two", role: "user" });
    const u3 = await authService.seedLocalUser({ email: "user3.test@example.com", name: "User Three", role: "user" });
    const u4 = await authService.seedLocalUser({ email: "user4.test@example.com", name: "User Four", role: "user" });

    const r1 = await createReview(u2.token, { mediaType: "movie", imdbID: "tt1375666", title: "Inception", year: "2010", text: POSITIVE_REVIEW, rating: 9, genre: "Sci-Fi, Action" });
    const r2 = await createReview(u3.token, { mediaType: "movie", imdbID: "tt0468569", title: "The Dark Knight", year: "2008", text: NEGATIVE_REVIEW, rating: 3, genre: "Action, Crime" });
    const r3 = await createReview(u4.token, { mediaType: "series", imdbID: "tt0903747", title: "Breaking Bad", year: "2008", text: NEUTRAL_REVIEW, rating: 6, genre: "Crime, Drama" });
    createdReviewIds = { inception: r1.body && r1.body.id, darkKnight: r2.body && r2.body.id, breakingBad: r3.body && r3.body.id };

    assert.equal(r1.status, 201, "la reseña positiva debería crearse");
    assert.equal(r2.status, 201, "la reseña negativa debería crearse");
    assert.equal(r3.status, 201, "la reseña neutra debería crearse");
});

after(() => {
    if (server) server.close();
});

// ---- Análisis de sentimiento (tarea 7) ----

test("el analizador léxico detecta sentimiento positivo, negativo y neutro", () => {
    assert.equal(analyzeSentiment(POSITIVE_REVIEW).label, "positive");
    assert.equal(analyzeSentiment(NEGATIVE_REVIEW).label, "negative");
    assert.equal(analyzeSentiment(NEUTRAL_REVIEW).label, "neutral");
});

test("la negación invierte la polaridad", () => {
    assert.equal(analyzeSentiment("No es buena, la verdad, me pareció bastante mala.").label, "negative");
});

test("las reseñas se guardan ya clasificadas y con su género", async () => {
    const res = await api("GET", "/api/reviews?mediaType=movie&imdbID=tt1375666");
    assert.equal(res.status, 200);
    const review = res.body.results[0];
    assert.ok(review, "debería existir la reseña de Inception");
    assert.equal(review.sentimentLabel, "positive");
    assert.equal(review.genre, "Sci-Fi, Action");
    assert.ok(review.sentiment && review.sentiment.provider === "lexicon");
});

// ---- Permisos (tarea 1 y 15) ----

test("las rutas de administración exigen sesión (401)", async () => {
    const res = await api("GET", "/api/admin/summary");
    assert.equal(res.status, 401);
});

test("un usuario normal recibe 403 en las rutas de administración", async () => {
    const res = await api("GET", "/api/admin/summary", { token: normalUser.token });
    assert.equal(res.status, 403);
});

test("un administrador accede al panel resumen", async () => {
    const res = await api("GET", "/api/admin/summary", { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.users.total >= 5, true);
    assert.equal(res.body.reviews.total >= 3, true);
    assert.equal(res.body.sentiments.positive >= 1, true);
    assert.equal(res.body.sentiments.negative >= 1, true);
    assert.equal(res.body.sentiments.neutral >= 1, true);
    assert.equal(Array.isArray(res.body.latestReviews), true);
});

// ---- Roles ----

test("solo los administradores pueden cambiar el rol de un usuario", async () => {
    const forbidden = await api("PUT", `/api/admin/users/${encodeURIComponent(normalUser.user.email)}/role`, {
        token: normalUser.token,
        body: { role: "admin" }
    });
    assert.equal(forbidden.status, 403);
});

test("un administrador puede promover a otro usuario", async () => {
    const email = normalUser.user.email;
    const res = await api("PUT", `/api/admin/users/${encodeURIComponent(email)}/role`, {
        token: admin.token,
        body: { role: "admin" }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, "admin");

    const me = await authService.getById(email);
    assert.equal(isAdminUser(me), true);
});

test("un administrador no puede quitarse su propio rol", async () => {
    const res = await api("PUT", `/api/admin/users/${encodeURIComponent(admin.user.email)}/role`, {
        token: admin.token,
        body: { role: "user" }
    });
    assert.equal(res.status, 409);
});

test("el listado de usuarios filtra por rol", async () => {
    const res = await api("GET", "/api/admin/users?role=admin", { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.results.every((u) => u.role === "admin"), true);
    assert.equal(res.body.byRole.admin >= 2, true);
});

// ---- Reseñas: listar, filtrar y borrar (tareas 6 y 10) ----

test("se pueden filtrar reseñas por género y por sentimiento", async () => {
    const byGenre = await api("GET", "/api/admin/reviews?genre=Crime", { token: admin.token });
    assert.equal(byGenre.status, 200);
    assert.equal(byGenre.body.results.length >= 2, true);
    assert.equal(byGenre.body.results.every((r) => (r.genres || []).includes("Crime")), true);

    const bySentiment = await api("GET", "/api/admin/reviews?sentiment=negative", { token: admin.token });
    assert.equal(bySentiment.status, 200);
    assert.equal(bySentiment.body.results.length >= 1, true);
    assert.equal(bySentiment.body.results.every((r) => r.sentimentLabel === "negative"), true);
});

test("el administrador puede borrar la reseña de otro usuario", async () => {
    const target = await createReview(normalUser.token, {
        mediaType: "movie",
        imdbID: "tt6751668",
        title: "Parasite",
        year: "2019",
        text: POSITIVE_REVIEW,
        rating: 10,
        genre: "Comedy, Drama"
    });
    assert.equal(target.status, 201);

    const before = await api("GET", "/api/admin/reviews?mediaKey=movie:tt6751668", { token: admin.token });
    assert.equal(before.body.total, 1);

    const removed = await api("DELETE", `/api/admin/reviews/${target.body.id}`, { token: admin.token });
    assert.equal(removed.status, 200);

    const afterDelete = await api("GET", "/api/admin/reviews?mediaKey=movie:tt6751668", { token: admin.token });
    assert.equal(afterDelete.body.total, 0);

    const missing = await api("DELETE", `/api/admin/reviews/${target.body.id}`, { token: admin.token });
    assert.equal(missing.status, 404);
});

// ---- Estadísticas (tareas 8, 11 y 14) ----

test("las estadísticas de una obra cuentan los sentimientos", async () => {
    const res = await api("GET", "/api/admin/stats/media?mediaType=movie&imdbID=tt1375666", { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.sentiments.total, 1);
    assert.equal(res.body.sentiments.positive, 1);
    assert.equal(res.body.media.title, "Inception");
    assert.equal(res.body.media.genres.includes("Sci-Fi"), true);
    assert.equal(res.body.avgRating, 9);
});

test("las estadísticas por género agrupan las reseñas", async () => {
    const res = await api("GET", "/api/admin/stats/genres", { token: admin.token });
    assert.equal(res.status, 200);
    const genres = res.body.results.map((r) => r.genre);
    assert.equal(genres.includes("Sci-Fi"), true);
    assert.equal(genres.includes("Drama"), true);

    const onlySciFi = await api("GET", "/api/admin/stats/genres?genre=Sci-Fi", { token: admin.token });
    assert.equal(onlySciFi.body.results.length, 1);
    assert.equal(onlySciFi.body.results[0].genre, "Sci-Fi");
    assert.equal(onlySciFi.body.results[0].positive, 1);
});

test("al filtrar por género el informe muestra el agregado de ese género (INFO x GEN)", async () => {
    const res = await api("GET", "/api/admin/stats/genres?genre=Sci-Fi", { token: admin.token });
    assert.equal(res.status, 200);

    const selection = res.body.selection;
    assert.equal(selection.genre, "Sci-Fi");
    assert.equal(selection.genres.includes("Sci-Fi"), true);
    // Los conteos del género cuadran entre sí y con sus porcentajes.
    assert.equal(
        selection.reviews.positive + selection.reviews.negative +
        selection.reviews.neutral + selection.reviews.unclassified,
        selection.reviews.total
    );
    assert.equal(selection.reviews.positive >= 1, true);
    assert.equal(selection.reviews.percent.positive > 0, true);
    // El género no puede tener más reseñas que el total global.
    assert.equal(selection.reviews.total <= res.body.totals.total, true);
    // Desglose por obra: aparece Inception con su nota media.
    assert.equal(selection.works.length >= 1, true);
    const inception = selection.works.find((w) => w.title === "Inception");
    assert.equal(Boolean(inception), true);
    assert.equal(inception.total >= 1, true);
    assert.equal(inception.avgRating, 9);

    // Sin filtro no hay selección: el informe global sigue disponible.
    const all = await api("GET", "/api/admin/stats/genres", { token: admin.token });
    assert.equal(all.status, 200);
    assert.equal(all.body.selection, null);
});

test("el análisis masivo clasifica las reseñas pendientes", async () => {
    // Se fuerza el recálculo y se comprueba que se analizan todas.
    const res = await api("POST", "/api/admin/reviews/analyze", {
        token: admin.token,
        body: { force: true, useAI: false }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.analyzed >= 3, true);
    assert.equal(res.body.failed, 0);
});

// ---- Catálogo (tareas 4, 5 y 10) ----

test("el buscador de catálogo responde aunque el catálogo esté vacío", async () => {
    const res = await api("GET", "/api/admin/catalog/search?s=inc", { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(Array.isArray(res.body.results), true);
});

test("los géneros se normalizan y se combinan sin duplicados", () => {
    assert.deepEqual(catalog.normalizeGenres("Action, Crime, Action"), ["Action", "Crime"]);
    assert.deepEqual(catalog.normalizeGenres(["Drama", "N/A", "", "Drama"]), ["Drama"]);
    assert.equal(catalog.toGenreString(""), null);
    assert.equal(catalog.toGenreString("Comedy, Family"), "Comedy, Family");
});

test("el servicio de administración filtra por obra", async () => {
    const created = await createReview(normalUser.token, {
        mediaType: "movie",
        imdbID: "tt0111161",
        title: "The Shawshank Redemption",
        year: "1994",
        text: POSITIVE_REVIEW,
        rating: 10,
        genre: "Drama"
    });
    assert.equal(created.status, 201);

    const data = await adminService.listReviews({ mediaKey: "movie:tt0111161", page: 1, limit: 10 });
    assert.equal(data.total, 1);
    assert.equal(data.results[0].sentimentLabel, "positive");
});

// ---- Compatibilidad con el panel del equipo (Rama-Dani) ----

test("el sentimiento se guarda con score normalizado, magnitud y etiqueta", () => {
    const pos = analyzeSentiment(POSITIVE_REVIEW);
    assert.equal(pos.label, "positive");
    assert.equal(pos.score > 0 && pos.score <= 1, true, "score normalizado entre 0 y 1");
    assert.equal(typeof pos.magnitude === "number" && pos.magnitude >= 0, true);

    const neg = analyzeSentiment(NEGATIVE_REVIEW);
    assert.equal(neg.label, "negative");
    assert.equal(neg.score < 0 && neg.score >= -1, true);
});

test("isAdminUser acepta el campo isAdmin del compañero", () => {
    assert.equal(isAdminUser({ isAdmin: true }), true);
    assert.equal(isAdminUser({ role: "admin" }), true);
    assert.equal(isAdminUser({ role: "user", isAdmin: false }), false);
    assert.equal(isAdminUser(null), false);
});

test("cambiar el rol escribe role e isAdmin a la vez", async () => {
    const created = await authService.seedLocalUser({ email: "role.test@example.com", name: "Role Test", role: "user" });
    assert.equal(created.user.role, "user");
    const updated = await authService.setRole("role.test@example.com", "admin");
    assert.equal(updated.role, "admin");
    assert.equal(updated.isAdmin, true);
    const stored = await authService.getById("role.test@example.com");
    assert.equal(stored.role, "admin");
    assert.equal(stored.isAdmin, true);
});

test("los endpoints de sentimiento del equipo funcionan y el servidor ignora la etiqueta del cliente", async () => {
    const res = await api("GET", "/api/admin/reviews/sentiment?mediaType=movie&imdbID=tt0468569", { token: admin.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.mediaKey, "movie:tt0468569");
    assert.equal(res.body.totalReviews, 1);
    assert.equal(res.body.sentiment.labelCounts.negative, 1);
    assert.equal(res.body.sentiment.avgScore < 0, true);

    // El cliente manda una etiqueta falsa: el servidor debe recalcularla.
    const batch = await api("POST", "/api/admin/reviews/sentiment/batch", {
        token: admin.token,
        body: { reviews: [{ reviewId: createdReviewIds.darkKnight, sentiment: { label: "positive", score: 0.9, magnitude: 5 } }] }
    });
    assert.equal(batch.status, 200);
    assert.equal(batch.body.results[0].ok, true);
    assert.equal(batch.body.results[0].sentiment.label, "negative");

    const after = await api("GET", "/api/admin/reviews?mediaKey=movie:tt0468569", { token: admin.token });
    assert.equal(after.body.results[0].sentimentLabel, "negative");
});

test("el administrador puede borrar reseñas por la ruta pública", async () => {
    const created = await createReview(normalUser.token, {
        mediaType: "movie", imdbID: "tt0109830", title: "Forrest Gump", year: "1994", text: POSITIVE_REVIEW, rating: 9
    });
    assert.equal(created.status, 201);
    const removed = await api("DELETE", `/api/reviews/${created.body.id}`, { token: admin.token });
    assert.equal(removed.status, 200);
    const check = await api("GET", "/api/admin/reviews?mediaKey=movie:tt0109830", { token: admin.token });
    assert.equal(check.body.total, 0);
});

test("validateSentiment rechaza etiquetas y puntuaciones inválidas", () => {
    const { validateSentiment } = require("../../src-backend/models/reviewModel");
    assert.throws(() => validateSentiment({ label: "regular" }), /label de sentimiento inválido/);
    assert.throws(() => validateSentiment({ label: "positive", score: 3 }), /score de sentimiento inválido/);
    assert.throws(() => validateSentiment({ label: "positive", magnitude: -1 }), /magnitude de sentimiento inválida/);
    const ok = validateSentiment({ label: "POSITIVE", score: 0.5, magnitude: 2 });
    assert.equal(ok.label, "positive");
    assert.equal(ok.score, 0.5);
});

// ---- Generador de dataset (tarea 13) ----
// Va al final: añade reseñas y no debe alterar las comprobaciones anteriores.
test("el generador de dataset produce usuarios y reseñas válidas sin tocar la base de datos", async () => {
    const { buildUsers, buildReviews, FALLBACK_MEDIA } = require("../seedAdminDataset");
    const users = buildUsers(10, ["cineairos.user003@example.com"]);
    assert.equal(users.length, 10);
    assert.equal(users[2].role, "admin");
    assert.equal(users[0].role, "user");

    const { reviews, sentimentCounts } = await buildReviews({ users, media: FALLBACK_MEDIA, count: 9, seed: 42, useAI: false });
    assert.equal(reviews.length, 9);
    assert.equal(reviews.every((r) => r.text.length >= 50), true, "todas las reseñas deben tener al menos 50 caracteres");
    assert.equal(reviews.every((r) => ["positive", "negative", "neutral"].includes(r.sentimentLabel)), true);
    assert.equal(reviews.every((r) => Boolean(r.mediaKey && r.mediaTitle)), true);
    assert.equal(sentimentCounts.positive + sentimentCounts.negative + sentimentCounts.neutral, 9);

    // El dataset debe poder insertarse con el propio validador de reseñas.
    for (const review of reviews.slice(0, 3)) {
        const created = await ReviewModel.create(
            { userId: `seedtest${review.userId}@example.com`, userName: "Seed Test" },
            {
                mediaType: review.mediaType,
                imdbID: review.imdbID,
                mediaTitle: review.mediaTitle,
                mediaYear: review.mediaYear,
                text: review.text,
                rating: review.rating,
                mediaGenre: review.genre
            }
        );
        assert.equal(created.sentimentLabel, review.sentimentLabel);
    }
});
