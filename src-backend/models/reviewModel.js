// Modelo de reseñas para películas y series.
// Colecciones Firestore:
//   reviews/{reviewId}                      -> reseña (una por usuario y obra)
//   reviews/{reviewId}/replies/{replyId}    -> respuestas a la reseña
//   review_votes/{reviewId__userSlug}       -> voto único por usuario y reseña
// Soporta modo local en memoria (sin Firestore), igual que movieModel/seriesModel.
//
// mediaKey: identificador estable de la obra:
//   - si hay imdbID -> "movie:tt1234567" (tipo + id en minúsculas)
//   - si no -> "movie:slug-titulo-yyyy", ej. "movie:inception-2010"
const crypto = require("crypto");
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

// ---------- Memoria (modo local) ----------
const localReviews = []; // { id, ...doc }
const localVotes = new Map(); // voteId -> { reviewId, userId, value }
const localReplies = new Map(); // reviewId -> [ replies ]

// ---------- Utilidades ----------
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

// Quita caracteres de control pero conserva saltos de línea y texto UTF-8.
function sanitizeText(raw) {
    return String(raw == null ? "" : raw)
        .replace(/\r\n/g, "\n")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim();
}

function buildMediaKey({ mediaType, imdbID, title, year }) {
    if (imdbID) return `${mediaType}:${imdbID}`;
    const base = slugify(title);
    const y = year ? `-${year}` : "";
    return `${mediaType}:${base}${y}`;
}

function validateReviewInput(input) {
    if (!input || typeof input !== "object") throw new Error("Cuerpo de petición inválido");
    const mediaType = normalizeMediaType(input.mediaType);
    const imdbID = normalizeImdbId(input.imdbID);
    const title = sanitizeText(input.mediaTitle || input.title);
    if (!title) throw new Error("La reseña necesita 'mediaTitle' (título de la obra)");
    if (title.length > 200) throw new Error("El título de la obra es demasiado largo");
    const year = input.mediaYear != null || input.year != null
        ? normalizeYear(input.mediaYear != null ? input.mediaYear : input.year)
        : null;
    if (!imdbID && !title) throw new Error("Falta identificar la obra (imdbID o mediaTitle)");
    const text = sanitizeText(input.text);
    if (text.length < 50) {
        const err = new Error("La reseña debe tener al menos 50 caracteres");
        err.code = "REVIEW_TOO_SHORT";
        throw err;
    }
    if (text.length > 2000) throw new Error("La reseña no puede superar 2000 caracteres");
    let rating = null;
    if (input.rating !== undefined && input.rating !== null && String(input.rating).trim() !== "") {
        const n = Number(input.rating);
        if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("rating inválido (entero 1-10 o vacío)");
        rating = n;
    }
    const mediaKey = buildMediaKey({ mediaType, imdbID, title, year });
    return { mediaType, mediaKey, imdbID, mediaTitle: title, mediaYear: year, text, rating };
}

function validateReplyInput(input) {
    if (!input || typeof input !== "object") throw new Error("Cuerpo de petición inválido");
    const text = sanitizeText(input.text);
    if (text.length < 1) throw new Error("La respuesta no puede estar vacía");
    if (text.length > 1000) throw new Error("La respuesta no puede superar 1000 caracteres");
    return { text };
}

function sortReviews(list, sort) {
    const arr = [...list];
    if (sort === "recent") {
        arr.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    } else if (sort === "votes") {
        arr.sort((a, b) => (Number(b.score) - Number(a.score)) || (Number(b.upvotes) - Number(a.upvotes)) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    } else {
        // relevance (por defecto, igual que el front actual: votos netos + respuestas)
        arr.sort((a, b) => ((Number(b.score) + Number(b.replyCount || 0)) - (Number(a.score) + Number(a.replyCount || 0))) ||
            String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    }
    return arr;
}

function publicReview(doc, userVote) {
    return {
        id: doc.id,
        mediaType: doc.mediaType,
        mediaKey: doc.mediaKey,
        imdbID: doc.imdbID || null,
        mediaTitle: doc.mediaTitle,
        mediaYear: doc.mediaYear || null,
        userId: doc.userId,
        userName: doc.userName,
        text: doc.text,
        rating: doc.rating != null ? doc.rating : null,
        upvotes: Number(doc.upvotes) || 0,
        downvotes: Number(doc.downvotes) || 0,
        score: Number(doc.score) || 0,
        replyCount: Number(doc.replyCount) || 0,
        userVote: userVote === 1 || userVote === -1 ? userVote : 0,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt || doc.createdAt
    };
}

function voteDocId(reviewId, userId) {
    return `${reviewId}__${slugify(String(userId))}`;
}

async function deleteQueryInBatches(query) {
    let pageQuery = query;
    while (true) {
        const snapshot = await pageQuery.limit(500).get();
        if (snapshot.empty) return;
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        if (snapshot.size < 500) return;
        pageQuery = query.startAfter(snapshot.docs[snapshot.docs.length - 1]);
    }
}

const ReviewModel = {
    isFirestoreConnected: () => firebaseConn.isFirestoreConnected(),

    buildMediaKey,
    normalizeMediaType,

    // ---- Lectura ----
    listByMedia: async ({ mediaType, imdbID, title, year, sort, page, limit, voterUserId }) => {
        const type = normalizeMediaType(mediaType);
        const cleanImdb = imdbID != null && String(imdbID).trim() !== "" ? normalizeImdbId(imdbID) : null;
        const cleanTitle = title != null ? sanitizeText(title) : "";
        const cleanYear = year != null && String(year).trim() !== "" ? normalizeYear(year) : null;
        if (!cleanImdb && !cleanTitle) throw new Error("Falta identificar la obra (imdbID o title)");
        const key = buildMediaKey({ mediaType: type, imdbID: cleanImdb, title: cleanTitle || "untitled", year: cleanYear });
        const sortMode = sort === "votes" || sort === "recent" ? sort : "relevance";
        const pageNum = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 1000);
        const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);

        let docs;
        if (!db) {
            docs = localReviews.filter((r) => r.mediaKey === key).map((r) => ({ ...r }));
        } else {
            // where() de un solo campo: sin índice compuesto; orden y paginación en memoria
            // (hay pocas reseñas por obra y así no se exigen índices manuales).
            const snap = await db.collection("reviews").where("mediaKey", "==", key).get();
            docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        const sorted = sortReviews(docs, sortMode);
        const total = sorted.length;
        const start = (pageNum - 1) * pageSize;
        const slice = sorted.slice(start, start + pageSize);

        // userVote del lector (si viene autenticado): un get por reseña en página (máx 50).
        let votesByReview = {};
        if (voterUserId) {
            if (!db) {
                for (const r of slice) {
                    const v = localVotes.get(voteDocId(r.id, voterUserId));
                    votesByReview[r.id] = v ? v.value : 0;
                }
            } else {
                const reads = await Promise.all(slice.map((r) =>
                    db.collection("review_votes").doc(voteDocId(r.id, voterUserId)).get()
                ));
                reads.forEach((d, i) => {
                    votesByReview[slice[i].id] = d.exists ? (d.data().value || 0) : 0;
                });
            }
        }
        return {
            mediaKey: key,
            results: slice.map((r) => publicReview(r, votesByReview[r.id] || 0)),
            total,
            page: pageNum,
            limit: pageSize,
            sort: sortMode
        };
    },

    getById: async (id, voterUserId) => {
        if (!id || typeof id !== "string") throw new Error("Falta el id de la reseña");
        let doc = null;
        if (!db) {
            doc = localReviews.find((r) => r.id === id) || null;
        } else {
            const snap = await db.collection("reviews").doc(id).get();
            if (snap.exists) doc = { id: snap.id, ...snap.data() };
        }
        if (!doc) return null;
        let userVote = 0;
        if (voterUserId) {
            if (!db) {
                const v = localVotes.get(voteDocId(id, voterUserId));
                userVote = v ? v.value : 0;
            } else {
                const v = await db.collection("review_votes").doc(voteDocId(id, voterUserId)).get();
                userVote = v.exists ? (v.data().value || 0) : 0;
            }
        }
        return publicReview(doc, userVote);
    },

    summaryByMedia: async ({ mediaType, imdbID, title, year }) => {
        const type = normalizeMediaType(mediaType);
        const cleanImdb = imdbID != null && String(imdbID).trim() !== "" ? normalizeImdbId(imdbID) : null;
        const cleanTitle = title != null ? sanitizeText(title) : "";
        const cleanYear = year != null && String(year).trim() !== "" ? normalizeYear(year) : null;
        if (!cleanImdb && !cleanTitle) throw new Error("Falta identificar la obra (imdbID o title)");
        const key = buildMediaKey({ mediaType: type, imdbID: cleanImdb, title: cleanTitle || "untitled", year: cleanYear });
        let docs;
        if (!db) {
            docs = localReviews.filter((r) => r.mediaKey === key);
        } else {
            const snap = await db.collection("reviews").where("mediaKey", "==", key).get();
            docs = snap.docs.map((d) => d.data());
        }
        const ratings = docs.map((d) => d.rating).filter((n) => Number.isInteger(n));
        return {
            mediaKey: key,
            count: docs.length,
            avgRating: ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null,
            ratingsCount: ratings.length,
            score: docs.reduce((a, d) => a + (Number(d.score) || 0), 0)
        };
    },

    listByUser: async ({ userId, sort, page, limit }) => {
        if (!userId) throw new Error("Falta userId");
        const sortMode = sort === "votes" || sort === "recent" ? sort : "recent";
        const pageNum = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 1000);
        const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
        let docs;
        if (!db) {
            docs = localReviews.filter((r) => r.userId === userId).map((r) => ({ ...r }));
        } else {
            const snap = await db.collection("reviews").where("userId", "==", userId).get();
            docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        const sorted = sortReviews(docs, sortMode);
        const total = sorted.length;
        const start = (pageNum - 1) * pageSize;
        return { results: sorted.slice(start, start + pageSize).map((r) => publicReview(r, 0)), total, page: pageNum, limit: pageSize };
    },

    // ---- Escritura ----
    create: async ({ userId, userName }, input) => {
        if (!userId) throw new Error("Requiere iniciar sesión");
        const clean = validateReviewInput(input);
        const now = new Date().toISOString();
        const displayName = sanitizeText(userName).slice(0, 80) || String(userId).split("@")[0] || "Usuario";

        if (!db) {
            const dup = localReviews.find((r) => r.mediaKey === clean.mediaKey && r.userId === userId);
            if (dup) {
                const err = new Error("Ya publicaste una reseña de esta obra (puedes editarla)");
                err.code = "REVIEW_DUPLICATE";
                throw err;
            }
            const id = crypto.randomBytes(12).toString("hex");
            const doc = {
                id, ...clean, userId, userName: displayName,
                upvotes: 0, downvotes: 0, score: 0, replyCount: 0,
                createdAt: now, updatedAt: now
            };
            localReviews.unshift(doc);
            localReplies.set(id, []);
            return publicReview(doc, 0);
        }

        const ref = db.collection("reviews").doc();
        const doc = {
            ...clean, userId, userName: displayName,
            upvotes: 0, downvotes: 0, score: 0, replyCount: 0,
            createdAt: now, updatedAt: now
        };
        await db.runTransaction(async (tx) => {
            const dupSnap = await tx.get(db.collection("reviews").where("mediaKey", "==", clean.mediaKey));
            if (dupSnap.docs.some((d) => (d.data() || {}).userId === userId)) {
                const err = new Error("Ya publicaste una reseña de esta obra (puedes editarla)");
                err.code = "REVIEW_DUPLICATE";
                throw err;
            }
            tx.create(ref, doc);
        });
        return publicReview({ id: ref.id, ...doc }, 0);
    },

    update: async (id, userId, input) => {
        if (!id) throw new Error("Falta el id de la reseña");
        if (!userId) throw new Error("Requiere iniciar sesión");
        const text = input.text !== undefined ? sanitizeText(input.text) : undefined;
        if (text !== undefined && (text.length < 50 || text.length > 2000)) {
            throw new Error("La reseña debe tener entre 50 y 2000 caracteres");
        }
        let rating;
        if (input.rating !== undefined) {
            if (input.rating === null || String(input.rating).trim() === "") rating = null;
            else {
                const n = Number(input.rating);
                if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("rating inválido (entero 1-10 o vacío)");
                rating = n;
            }
        }
        const now = new Date().toISOString();
        if (!db) {
            const doc = localReviews.find((r) => r.id === id);
            if (!doc) return null;
            if (doc.userId !== userId) {
                const err = new Error("No puedes editar una reseña ajena");
                err.code = "FORBIDDEN";
                throw err;
            }
            if (text !== undefined) doc.text = text;
            if (rating !== undefined) doc.rating = rating;
            doc.updatedAt = now;
            return publicReview(doc, 0);
        }
        const ref = db.collection("reviews").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return null;
        const data = snap.data() || {};
        if (data.userId !== userId) {
            const err = new Error("No puedes editar una reseña ajena");
            err.code = "FORBIDDEN";
            throw err;
        }
        const patch = { updatedAt: now };
        if (text !== undefined) patch.text = text;
        if (rating !== undefined) patch.rating = rating;
        await ref.set(patch, { merge: true });
        return publicReview({ id: ref.id, ...data, ...patch }, 0);
    },

    remove: async (id, userId) => {
        if (!id) throw new Error("Falta el id de la reseña");
        if (!userId) throw new Error("Requiere iniciar sesión");
        if (!db) {
            const idx = localReviews.findIndex((r) => r.id === id);
            if (idx === -1) return false;
            if (localReviews[idx].userId !== userId) {
                const err = new Error("No puedes borrar una reseña ajena");
                err.code = "FORBIDDEN";
                throw err;
            }
            localReviews.splice(idx, 1);
            localReplies.delete(id);
            for (const [k, v] of localVotes) if (v.reviewId === id) localVotes.delete(k);
            return true;
        }
        const ref = db.collection("reviews").doc(id);
        const snap = await ref.get();
        if (!snap.exists) return false;
        if ((snap.data() || {}).userId !== userId) {
            const err = new Error("No puedes borrar una reseña ajena");
            err.code = "FORBIDDEN";
            throw err;
        }
        await deleteQueryInBatches(db.collection("review_votes").where("reviewId", "==", id));
        await deleteQueryInBatches(ref.collection("replies"));
        await ref.delete();
        return true;
    },

    // value: 1 (me gusta) | -1 (no me gusta) | 0 (retirar voto)
    vote: async (reviewId, userId, value) => {
        if (!reviewId) throw new Error("Falta el id de la reseña");
        if (!userId) throw new Error("Requiere iniciar sesión");
        const v = Number(value);
        if (v !== 1 && v !== -1 && v !== 0) throw new Error("Voto inválido (usa 1, -1 o 0)");
        const voteId = voteDocId(reviewId, userId);

        if (!db) {
            const doc = localReviews.find((r) => r.id === reviewId);
            if (!doc) return null;
            const prev = localVotes.get(voteId);
            const prevVal = prev ? prev.value : 0;
            if (prevVal === v) return publicReview(doc, v); // idempotente
            if (prevVal === 1) doc.upvotes = Math.max(0, doc.upvotes - 1);
            if (prevVal === -1) doc.downvotes = Math.max(0, doc.downvotes - 1);
            if (v === 1) doc.upvotes += 1;
            if (v === -1) doc.downvotes += 1;
            doc.score = doc.upvotes - doc.downvotes;
            if (v === 0) localVotes.delete(voteId);
            else localVotes.set(voteId, { reviewId, userId, value: v });
            return publicReview(doc, v);
        }

        const ref = db.collection("reviews").doc(reviewId);
        const voteRef = db.collection("review_votes").doc(voteId);
        // Transacción: el contador nunca se descuadra aunque voten a la vez.
        const result = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists) return null;
            const data = snap.data() || {};
            const prevSnap = await tx.get(voteRef);
            const prevVal = prevSnap.exists ? (prevSnap.data().value || 0) : 0;
            if (prevVal === v) return { data, userVote: v };
            let up = Number(data.upvotes) || 0;
            let down = Number(data.downvotes) || 0;
            if (prevVal === 1) up = Math.max(0, up - 1);
            if (prevVal === -1) down = Math.max(0, down - 1);
            if (v === 1) up += 1;
            if (v === -1) down += 1;
            tx.set(ref, { upvotes: up, downvotes: down, score: up - down }, { merge: true });
            if (v === 0) tx.delete(voteRef);
            else tx.set(voteRef, { reviewId, userId, value: v, updatedAt: new Date().toISOString() });
            return { data: { ...data, upvotes: up, downvotes: down, score: up - down }, userVote: v };
        });
        if (!result) return null;
        return publicReview({ id: reviewId, ...result.data }, result.userVote);
    },

    // ---- Respuestas ----
    listReplies: async (reviewId, { page, limit } = {}) => {
        if (!reviewId) throw new Error("Falta el id de la reseña");
        const pageNum = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 1000);
        const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);
        let items;
        if (!db) {
            items = [...(localReplies.get(reviewId) || [])];
        } else {
            const snap = await db.collection("reviews").doc(reviewId).collection("replies").get();
            items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        items.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        const total = items.length;
        const start = (pageNum - 1) * pageSize;
        return { results: items.slice(start, start + pageSize), total, page: pageNum, limit: pageSize };
    },

    addReply: async (reviewId, { userId, userName }, input) => {
        if (!reviewId) throw new Error("Falta el id de la reseña");
        if (!userId) throw new Error("Requiere iniciar sesión");
        const { text } = validateReplyInput(input);
        const now = new Date().toISOString();
        const displayName = sanitizeText(userName).slice(0, 80) || String(userId).split("@")[0] || "Usuario";
        if (!db) {
            const doc = localReviews.find((r) => r.id === reviewId);
            if (!doc) return null;
            const reply = { id: crypto.randomBytes(8).toString("hex"), userId, userName: displayName, text, createdAt: now };
            const arr = localReplies.get(reviewId) || [];
            arr.push(reply);
            localReplies.set(reviewId, arr);
            doc.replyCount = arr.length;
            return reply;
        }
        const ref = db.collection("reviews").doc(reviewId);
        const snap = await ref.get();
        if (!snap.exists) return null;
        const replyRef = ref.collection("replies").doc();
        const reply = { userId, userName: displayName, text, createdAt: now };
        await replyRef.set(reply);
        // replyCount desnormalizado para ordenar por relevancia sin leer la subcolección.
        const all = await ref.collection("replies").get();
        await ref.set({ replyCount: all.size }, { merge: true });
        return { id: replyRef.id, ...reply };
    },

    removeReply: async (reviewId, replyId, userId) => {
        if (!reviewId || !replyId) throw new Error("Falta el id de la reseña o de la respuesta");
        if (!userId) throw new Error("Requiere iniciar sesión");
        if (!db) {
            const arr = localReplies.get(reviewId) || [];
            const idx = arr.findIndex((r) => r.id === replyId);
            if (idx === -1) return false;
            if (arr[idx].userId !== userId) {
                const err = new Error("No puedes borrar una respuesta ajena");
                err.code = "FORBIDDEN";
                throw err;
            }
            arr.splice(idx, 1);
            localReplies.set(reviewId, arr);
            const doc = localReviews.find((r) => r.id === reviewId);
            if (doc) doc.replyCount = arr.length;
            return true;
        }
        const ref = db.collection("reviews").doc(reviewId).collection("replies").doc(replyId);
        const snap = await ref.get();
        if (!snap.exists) return false;
        if ((snap.data() || {}).userId !== userId) {
            const err = new Error("No puedes borrar una respuesta ajena");
            err.code = "FORBIDDEN";
            throw err;
        }
        await ref.delete();
        const parent = db.collection("reviews").doc(reviewId);
        const all = await parent.collection("replies").get();
        await parent.set({ replyCount: all.size }, { merge: true });
        return true;
    }
};

module.exports = { ReviewModel };
