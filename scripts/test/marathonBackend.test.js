// Pruebas del backend de Maratones.
//
// Se ejecutan en modo local (memoria), sin tocar Firestore: DISABLE_FIREBASE=1
// evita cualquier conexión con la base de datos real. El catálogo sale del
// fichero curado (src-backend/data/marathonCatalog.js), así que las pruebas no
// dependen de OMDb ni de haber lanzado el script de carga.
//
// Lo que se comprueba aquí es la mecánica del juego: que no se pueda ver la
// segunda sin marcar la primera, que sólo se desmarque la última, que el
// progreso sea independiente por usuario y que los logros se desbloqueen.
//
//   npm test

process.env.DISABLE_FIREBASE = "1";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const app = require("../../server");
const { authService } = require("../../src-backend/services/authService");
const { FriendshipModel } = require("../../src-backend/models/friendshipModel");
const { MARATHON_CATALOG } = require("../../src-backend/data/marathonCatalog");

const SAGA_ID = "saga-el-padrino";
const SAGA_ITEMS = MARATHON_CATALOG.find((m) => m.id === SAGA_ID).items.map((item) => item.imdbID);
const LOCKED_MESSAGE = /primero tienes que ver/i;
const EMAIL_ONE = "maraton.uno@example.com";
const EMAIL_TWO = "maraton.dos@example.com";
const EMAIL_THREE = "maraton.tres@example.com";

let server;
let baseUrl;
let userOne;
let userTwo;

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

function watch(token, marathonId, itemId) {
    return api("POST", `/api/marathons/${marathonId}/items/${itemId}/watched`, { token });
}

function unwatch(token, marathonId, itemId) {
    return api("DELETE", `/api/marathons/${marathonId}/items/${itemId}/watched`, { token });
}

function itemOf(detail, itemId) {
    return detail.marathon.items.find((item) => item.itemId === itemId);
}

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    userOne = await authService.seedLocalUser({ email: EMAIL_ONE, name: "Maraton Uno", role: "user" });
    userTwo = await authService.seedLocalUser({ email: EMAIL_TWO, name: "Maraton Dos", role: "user" });
});

after(() => {
    if (server) server.close();
});

test("el catálogo curado se sirve entero y ordenado, con el progreso vacío sin sesión", async () => {
    const res = await api("GET", "/api/marathons");
    assert.equal(res.status, 200);

    const marathons = res.body.marathons;
    assert.equal(marathons.length, MARATHON_CATALOG.length, "deberían salir los 12 maratones del catálogo");
    assert.equal(marathons.filter((m) => m.kind === "saga").length, 6);
    assert.equal(marathons.filter((m) => m.kind === "actor").length, 6);
    assert.equal(res.body.me, null, "sin sesión no hay progreso ni logros");

    marathons.forEach((marathon) => {
        assert.equal(marathon.progress, null, `${marathon.id} no debería traer progreso sin sesión`);
        assert.ok(marathon.items.length > 0, `${marathon.id} debería tener obras`);
        assert.equal(marathon.itemCount, marathon.items.length);
    });

    // Los maratones de actores van de la película más antigua a la más reciente.
    marathons
        .filter((m) => m.kind === "actor")
        .forEach((marathon) => {
            const years = marathon.items.map((item) => Number.parseInt(item.year, 10));
            const sorted = [...years].sort((a, b) => a - b);
            assert.deepEqual(years, sorted, `${marathon.id} debería estar ordenado por año ascendente`);
        });
});

test("un maratón concreto trae sus obras con el estado bloqueada/desbloqueada", async () => {
    const res = await api("GET", `/api/marathons/${SAGA_ID}`, { token: userOne.token });
    assert.equal(res.status, 200);

    const items = res.body.marathon.items;
    assert.deepEqual(items.map((item) => item.itemId), SAGA_ITEMS, "las obras deben ir en el orden del catálogo");

    assert.equal(items[0].locked, false, "la primera obra siempre está disponible");
    assert.equal(items[0].unlockable, true);
    items.slice(1).forEach((item, index) => {
        assert.equal(item.locked, true, `la obra ${index + 2} debería estar bloqueada al empezar`);
        assert.equal(item.unlockable, false);
    });

    assert.equal(res.body.progress.watchedCount, 0);
    assert.equal(res.body.progress.percent, 0);
    assert.equal(res.body.progress.completed, false);
    assert.equal(res.body.progress.nextItemId, SAGA_ITEMS[0]);
});

test("no se puede ver la segunda obra sin marcar la primera", async () => {
    const res = await watch(userOne.token, SAGA_ID, SAGA_ITEMS[1]);
    assert.equal(res.status, 403, "debería rechazarse por el candado secuencial");
    assert.equal(res.body.code, "MARATHON_LOCKED");
    assert.match(res.body.error, LOCKED_MESSAGE);

    const third = await watch(userOne.token, SAGA_ID, SAGA_ITEMS[2]);
    assert.equal(third.status, 403, "tampoco se puede saltar a la tercera");

    const detail = await api("GET", `/api/marathons/${SAGA_ID}`, { token: userOne.token });
    assert.equal(detail.body.progress.watchedCount, 0, "un intento bloqueado no debe marcar nada");
});

test("marcar la primera desbloquea la segunda pero no la tercera", async () => {
    const res = await watch(userOne.token, SAGA_ID, SAGA_ITEMS[0]);
    assert.equal(res.status, 200);
    assert.equal(res.body.progress.watchedCount, 1);
    assert.equal(res.body.progress.nextItemId, SAGA_ITEMS[1]);

    assert.equal(itemOf(res.body, SAGA_ITEMS[0]).watched, true);
    assert.equal(itemOf(res.body, SAGA_ITEMS[0]).canUnmark, true, "la última vista se puede desmarcar");
    assert.equal(itemOf(res.body, SAGA_ITEMS[1]).locked, false, "la segunda queda desbloqueada");
    assert.equal(itemOf(res.body, SAGA_ITEMS[2]).locked, true, "la tercera sigue bloqueada");

    // Marcar dos veces la misma obra es idempotente, no rompe el progreso.
    const again = await watch(userOne.token, SAGA_ID, SAGA_ITEMS[0]);
    assert.equal(again.status, 200);
    assert.equal(again.body.progress.watchedCount, 1, "no debería contar dos veces la misma obra");
});

test("sólo se puede desmarcar la última obra vista", async () => {
    await watch(userOne.token, SAGA_ID, SAGA_ITEMS[1]);

    const notLast = await unwatch(userOne.token, SAGA_ID, SAGA_ITEMS[0]);
    assert.equal(notLast.status, 403);
    assert.equal(notLast.body.code, "NOT_LAST_WATCHED");

    const last = await unwatch(userOne.token, SAGA_ID, SAGA_ITEMS[1]);
    assert.equal(last.status, 200);
    assert.equal(last.body.progress.watchedCount, 1);
    // Al desmarcarla deja de estar vista, pero vuelve a ser la siguiente
    // disponible (no queda bloqueada por sí misma).
    assert.equal(itemOf(last.body, SAGA_ITEMS[1]).watched, false);
    assert.equal(itemOf(last.body, SAGA_ITEMS[1]).unlockable, true);
    assert.equal(itemOf(last.body, SAGA_ITEMS[2]).locked, true, "la tercera sigue bloqueada");
});

test("completar el maratón al 100% desbloquea los logros correspondientes", async () => {
    for (const itemId of SAGA_ITEMS) {
        const res = await watch(userOne.token, SAGA_ID, itemId);
        assert.equal(res.status, 200, `no se pudo marcar ${itemId}`);
    }

    const list = await api("GET", "/api/marathons", { token: userOne.token });
    const saga = list.body.marathons.find((m) => m.id === SAGA_ID);
    assert.equal(saga.progress.watchedCount, SAGA_ITEMS.length);
    assert.equal(saga.progress.percent, 100);
    assert.equal(saga.progress.completed, true);

    const achievements = list.body.me.achievements;
    const byId = Object.fromEntries(achievements.map((a) => [a.id, a]));
    assert.equal(byId["primer-paso"].unlocked, true, "«Primer paso» debería estar desbloqueado");
    assert.equal(byId["maratonista"].unlocked, true, "«Maratonista» tras completar un maratón");
    assert.equal(byId["triple-sesion"].unlocked, false, "«Triple sesión» necesita 3 maratones");
    assert.equal(byId["leyenda-del-cine"].unlocked, false, "«Leyenda» necesita todos los maratones");
    assert.equal(byId["fan-de-actor"].unlocked, false, "«Fan de actor» es sólo para maratones de actores");

    assert.equal(list.body.me.stats.completed, 1);
    assert.equal(list.body.me.stats.totalWatched, SAGA_ITEMS.length);
    assert.equal(list.body.me.stats.percent, Math.round((SAGA_ITEMS.length / list.body.me.stats.totalItems) * 100));
});

test("reiniciar el maratón borra su progreso sin tocar los logros globales", async () => {
    const res = await api("DELETE", `/api/marathons/${SAGA_ID}/progress`, { token: userOne.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.progress.watchedCount, 0);
    assert.equal(res.body.progress.percent, 0);
    assert.equal(itemOf(res.body, SAGA_ITEMS[1]).locked, true, "todo vuelve a bloquearse");

    // El progreso vivo vuelve a cero, pero el logro ya conseguido es permanente.
    const list = await api("GET", "/api/marathons", { token: userOne.token });
    assert.equal(list.body.me.stats.totalWatched, 0);
    assert.equal(list.body.me.stats.completed, 0, "ya no hay ningún maratón en curso completado");
    assert.equal(list.body.me.stats.completedEver, 1, "pero sí se completó uno alguna vez");
    const byId = Object.fromEntries(list.body.me.achievements.map((a) => [a.id, a]));
    assert.equal(byId["maratonista"].unlocked, true, "el logro conseguido no se pierde al reiniciar");
    assert.equal(byId["primer-paso"].unlocked, true);

    const saga = list.body.marathons.find((m) => m.id === SAGA_ID);
    assert.equal(saga.progress.completed, false);
    assert.equal(saga.progress.watchedCount, 0);
});

test("el progreso es independiente por usuario", async () => {
    await watch(userOne.token, SAGA_ID, SAGA_ITEMS[0]);

    const other = await api("GET", `/api/marathons/${SAGA_ID}`, { token: userTwo.token });
    assert.equal(other.body.progress.watchedCount, 0, "el progreso de uno no se filtra al otro");
    assert.equal(itemOf(other.body, SAGA_ITEMS[0]).watched, false);

    const mine = await api("GET", "/api/marathons", { token: userOne.token });
    assert.equal(mine.body.marathons.find((m) => m.id === SAGA_ID).progress.watchedCount, 1);
});

test("errores: sin sesión 401, maratón y obra inexistentes 404", async () => {
    const anonymous = await watch(null, SAGA_ID, SAGA_ITEMS[0]);
    assert.equal(anonymous.status, 401);

    const anonymousDetail = await api("GET", `/api/marathons/${SAGA_ID}`);
    assert.equal(anonymousDetail.status, 401, "el detalle exige sesión");

    const unknownMarathon = await api("GET", "/api/marathons/no-existe", { token: userOne.token });
    assert.equal(unknownMarathon.status, 404);

    const unknownItem = await watch(userOne.token, SAGA_ID, "tt0000000");
    assert.equal(unknownItem.status, 404);
    assert.equal(unknownItem.body.code, "ITEM_NOT_FOUND");

    const unknownWatch = await watch(userOne.token, "no-existe", SAGA_ITEMS[0]);
    assert.equal(unknownWatch.status, 404);
});

// ---- Perfil público (bloque social) ----
// Al llegar aquí, userOne ha visto la primera obra de la saga del Padrino.
test("el perfil público muestra las maratones que un usuario ha empezado", async () => {
    const res = await api("GET", `/api/users/${encodeURIComponent(EMAIL_ONE)}/marathons`);
    assert.equal(res.status, 200, "el resumen es público, como las películas guardadas");

    assert.equal(res.body.marathons.length, 1, "sólo debe salir la maratón que ha empezado");
    const saga = res.body.marathons[0];
    assert.equal(saga.id, SAGA_ID);
    assert.equal(saga.watchedCount, 1);
    assert.equal(saga.total, SAGA_ITEMS.length);
    assert.equal(saga.percent, Math.round((1 / SAGA_ITEMS.length) * 100));
    assert.equal(saga.completed, false);
    assert.equal(saga.lastWatched.itemId, SAGA_ITEMS[0], "debe decir cuál fue la última vista");
    assert.equal(saga.nextItem.itemId, SAGA_ITEMS[1], "y cuál le toca ahora");
    assert.ok(saga.lastWatchedAt, "con la fecha en que la vio");

    assert.equal(res.body.stats.totalWatched, 1);
    assert.equal(res.body.stats.started, 1);

    const byId = Object.fromEntries(res.body.achievements.map((a) => [a.id, a]));
    assert.equal(byId["primer-paso"].unlocked, true, "las insignias también se comparten");
    assert.equal(byId["maratonista"].unlocked, true, "y siguen siendo permanentes");
});

test("un usuario sin maratones empezadas comparte un perfil vacío, no un error", async () => {
    const res = await api("GET", `/api/users/${encodeURIComponent(EMAIL_TWO)}/marathons`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.marathons, []);
    assert.equal(res.body.stats.totalWatched, 0);
    assert.equal(res.body.achievements.every((a) => a.unlocked === false), true);

    // Mismo criterio que /api/users/:id/movies: un id desconocido no es un 404.
    const unknown = await api("GET", "/api/users/nadie@example.com/marathons");
    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body.marathons, []);
});

// La gracia del bloque en el perfil es que lo vean los amigos, así que se
// comprueba también la frontera: un desconocido no lo ve.
test("el perfil de amigo incluye las maratones y un desconocido no las ve", async () => {
    const outsider = await authService.seedLocalUser({ email: EMAIL_THREE, name: "Maraton Tres", role: "user" });

    const stranger = await api(
        "GET",
        `/api/friends/${encodeURIComponent(EMAIL_ONE)}/profile`,
        { token: outsider.token }
    );
    assert.ok(
        stranger.status === 403 || stranger.status === 404,
        `un desconocido no debería ver el perfil ajeno (status ${stranger.status})`
    );

    // Se hacen amigos y entonces sí se comparte el progreso.
    const request = await FriendshipModel.sendRequest({ from: EMAIL_TWO, to: EMAIL_ONE });
    await FriendshipModel.acceptRequest(request.id, EMAIL_ONE);

    const profile = await api(
        "GET",
        `/api/friends/${encodeURIComponent(EMAIL_ONE)}/profile`,
        { token: userTwo.token }
    );
    assert.equal(profile.status, 200);
    assert.equal(profile.body.marathons.marathons[0].id, SAGA_ID, "el amigo ve la maratón en curso");
    assert.equal(profile.body.marathons.stats.totalWatched, 1);
    assert.ok(profile.body.marathons.achievements.some((a) => a.unlocked));

    const full = await api(
        "GET",
        `/api/friends/${encodeURIComponent(EMAIL_ONE)}/full-profile`,
        { token: userTwo.token }
    );
    assert.equal(full.status, 200);
    assert.equal(full.body.marathons.marathons[0].id, SAGA_ID, "y también en el perfil completo");
});
