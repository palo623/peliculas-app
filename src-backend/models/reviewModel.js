// src-backend/models/reviewModel.js
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

function codedError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

function mediaKey(mediaType, imdbID, title, year) {
    if (imdbID) return mediaType + ":" + imdbID;
    const slug = (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return mediaType + ":" + slug + (year ? "-" + year : "");
}

async function runTransaction(fn) {
    if (!db) return fn(null);
    return db.runTransaction(fn);
}

const ReviewModel = {
    isFirestoreConnected: () => firebaseConn.isFirestoreConnected(),

    // Create review (one per user per media)
    async create({ userId, mediaType, imdbID, mediaTitle, mediaYear, text, rating }) {
        const key = mediaKey(mediaType, imdbID, mediaTitle, mediaYear);
        const now = new Date().toISOString();

        const reviewDoc = {
            mediaType,
            mediaKey: key,
            imdbID: imdbID || null,
            mediaTitle,
            mediaYear: mediaYear || null,
            userId,
            text,
            rating: rating !== undefined ? Number(rating) : null,
            visibility: "public",
            votes: { up: 0, down: 0 },
            score: 0,
            createdAt: now,
            updatedAt: now
        };

        await runTransaction(async (tx) => {
            const reviewsRef = db
                ? db.collection("reviews").doc()
                : null;
            const id = reviewsRef ? reviewsRef.id : "rev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

            // Check duplicate
            const existingQuery = db
                ? db.collection("reviews")
                    .where("mediaKey", "==", key)
                    .where("userId", "==", userId)
                    .limit(1)
                : null;

            if (existingQuery) {
                const snap = await existingQuery.get();
                if (!snap.empty) {
                    throw codedError("CONFLICT", "Ya has reseñado esta obra");
                }
            }

            if (tx && reviewsRef) {
                tx.set(reviewsRef, { ...reviewDoc, id });
            }
            return id;
        });
        return { ok: true };
    },

    // List reviews with filters
    async list({ mediaType, imdbID, mediaTitle, mediaYear, sort = "relevance", page = 1, limit = 20, userId }) {
        if (!db) return [];

        const key = mediaKey(mediaType, imdbID, mediaTitle, mediaYear);
        // No orderBy in query to avoid composite index requirement
        // Fetch all matching reviews and sort in memory
        const query = db.collection("reviews").where("mediaKey", "==", key);

        const snap = await query.get();
        let results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));

        // Sort in memory
        if (sort === "recent") {
            results.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        } else {
            // relevance / votes: sort by score desc, then createdAt desc
            results.sort((a, b) => {
                const scoreDiff = (b.score || 0) - (a.score || 0);
                if (scoreDiff !== 0) return scoreDiff;
                return (b.createdAt || "").localeCompare(a.createdAt || "");
            });
        }

        const offset = (page - 1) * limit;
        results = results.slice(offset, offset + limit);

        // Add userVote if userId provided
        if (userId && results.length) {
            const votePromises = results.map(async r => {
                const voteSnap = await db.collection("review_votes")
                    .where("reviewId", "==", r.id)
                    .where("userId", "==", userId)
                    .limit(1)
                    .get();
                return { reviewId: r.id, value: voteSnap.empty ? 0 : voteSnap.docs[0].data().value };
            });
            const votes = await Promise.all(votePromises);
            const voteMap = Object.fromEntries(votes.map(v => [v.reviewId, v.value]));
            results = results.map(r => ({ ...r, userVote: voteMap[r.id] || 0 }));
        }

        return results;
    },

    // Get review summary
    async summary({ mediaType, imdbID, mediaTitle, mediaYear }) {
        const key = mediaKey(mediaType, imdbID, mediaTitle, mediaYear);
        const snap = await db.collection("reviews")
            .where("mediaKey", "==", key)
            .get();

        let count = 0;
        let totalRating = 0;
        let ratedCount = 0;
        const ratingsCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };

        snap.forEach(doc => {
            count++;
            const d = doc.data();
            if (d.rating !== null && d.rating !== undefined) {
                totalRating += d.rating;
                ratedCount++;
                if (d.rating >= 1 && d.rating <= 10) ratingsCount[d.rating]++;
            }
        });

        return {
            count,
            avgRating: ratedCount > 0 ? (totalRating / ratedCount) : null,
            ratingsCount,
            score: snap.docs.reduce((sum, d) => sum + (d.data().score || 0), 0)
        };
    },

    // Get single review
    async getById(id) {
        const snap = await db.collection("reviews").doc(id).get();
        if (!snap.exists) return null;
        return { id: snap.id, ...snap.data() };
    },

    // Update review (owner only)
    async update(id, userId, { text, rating, visibility }) {
        const ref = db.collection("reviews").doc(id);
        const snap = await ref.get();
        if (!snap.exists) throw codedError("NOT_FOUND", "Reseña no encontrada");
        const data = snap.data();
        if (data.userId !== userId) throw codedError("FORBIDDEN", "No autorizado");

        const update = { updatedAt: new Date().toISOString() };
        if (text !== undefined) update.text = text;
        if (rating !== undefined) update.rating = rating !== null ? Number(rating) : null;
        if (visibility !== undefined) update.visibility = visibility;
        await ref.update(update);
        return { ok: true };
    },

    // Delete review (owner only) - cascades votes & replies
    async delete(id, userId) {
        const ref = db.collection("reviews").doc(id);
        const snap = await ref.get();
        if (!snap.exists) throw codedError("NOT_FOUND", "Reseña no encontrada");
        const data = snap.data();
        if (data.userId !== userId) throw codedError("FORBIDDEN", "No autorizado");

        await runTransaction(async (tx) => {
            // Delete review
            tx.delete(ref);
            // Delete votes
            const votesSnap = await db.collection("review_votes").where("reviewId", "==", id).get();
            votesSnap.forEach(doc => tx.delete(doc.ref));
            // Delete replies
            const repliesSnap = await db.collection("review_replies").where("reviewId", "==", id).get();
            repliesSnap.forEach(doc => tx.delete(doc.ref));
        });
        return { ok: true };
    },

    // Vote on review (1, -1, 0 to remove)
    async vote(reviewId, userId, value) {
        value = Number(value);
        if (![1, -1, 0].includes(value)) throw codedError("BAD_REQUEST", "Valor de voto inválido");

        const ref = db.collection("reviews").doc(reviewId);
        const voteRef = db.collection("review_votes").doc(`${reviewId}_${userId}`);

        return runTransaction(async (tx) => {
            const reviewSnap = await tx.get(ref);
            if (!reviewSnap.exists) throw codedError("NOT_FOUND", "Reseña no encontrada");
            const review = reviewSnap.data();

            const voteSnap = await tx.get(voteRef);
            const previous = voteSnap.exists ? voteSnap.data().value : 0;
            if (previous === value) return { ok: true, score: review.score };

            const delta = value - previous;
            let up = review.votes?.up || 0;
            let down = review.votes?.down || 0;
            if (value === 1) up++;
            else if (value === -1) down++;
            if (previous === 1) up--;
            else if (previous === -1) down--;

            tx.update(ref, { votes: { up, down }, score: up - down, updatedAt: new Date().toISOString() });
            if (value === 0) {
                tx.delete(voteRef);
            } else {
                tx.set(voteRef, { reviewId, userId, value, createdAt: new Date().toISOString() });
            }
        });
        return { ok: true };
    },

    // Get user's vote for reviews
    async getUserVotes(userId, reviewIds) {
        if (!reviewIds.length) return {};
        const snap = await db.collection("review_votes")
            .where("userId", "==", userId)
            .where("reviewId", "in", reviewIds)
            .get();
        const votes = {};
        snap.forEach(doc => votes[doc.data().reviewId] = doc.data().value);
        return votes;
    },

    // Replies
    async addReply(reviewId, userId, text) {
        const reviewSnap = await db.collection("reviews").doc(reviewId).get();
        if (!reviewSnap.exists) throw codedError("NOT_FOUND", "Reseña no encontrada");

        const replyRef = db.collection("review_replies").doc();
        const reply = {
            id: replyRef.id,
            reviewId,
            userId,
            text,
            createdAt: new Date().toISOString()
        };
        await replyRef.set(reply);
        return { ok: true, reply };
    },

    async getReplies(reviewId, userId) {
        const snap = await db.collection("review_replies")
            .where("reviewId", "==", reviewId)
            .orderBy("createdAt", "asc")
            .get();
        const replies = [];
        snap.forEach(doc => replies.push({ id: doc.id, ...doc.data() }));
        return replies;
    },

    async deleteReply(replyId, userId) {
        const ref = db.collection("review_replies").doc(replyId);
        const snap = await ref.get();
        if (!snap.exists) throw codedError("NOT_FOUND", "Respuesta no encontrada");
        const data = snap.data();
        if (data.userId !== userId) throw codedError("FORBIDDEN", "No autorizado");
        await ref.delete();
        return { ok: true };
    },

    // List user's reviews
    async listByUser(userId, page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        let query = db.collection("reviews")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(limit + offset);
        const snap = await query.get();
        let results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return results.slice(offset, offset + limit);
    }
};

module.exports = { ReviewModel };