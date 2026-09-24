const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

const localReviews = [];

function normalizeMediaType(value) {
    const mediaType = String(value || "").trim().toLowerCase();
    if (mediaType !== "movie" && mediaType !== "series") {
        throw new Error("El tipo de contenido debe ser movie o series");
    }
    return mediaType;
}

function normalizeMediaId(value) {
    const mediaId = String(value || "").trim();
    if (!mediaId || mediaId.length > 100 || mediaId.includes("/")) {
        throw new Error("Falta un identificador de contenido válido");
    }
    return mediaId;
}

function validateReviewData(data) {
    if (!data || typeof data !== "object") {
        throw new Error("Datos de reseña inválidos");
    }
    const text = String(data.text || "").trim();
    if (text.length < 50) {
        throw new Error("La reseña debe tener al menos 50 caracteres");
    }
    if (text.length > 2000) {
        throw new Error("La reseña no puede superar 2000 caracteres");
    }
    return text;
}

function reviewId(mediaType, mediaId, userId) {
    return encodeURIComponent(`${mediaType}_${mediaId}_${userId}`);
}

function sortReviews(reviews) {
    return [...reviews].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

const ReviewModel = {
    getReviews: async (mediaTypeValue, mediaIdValue, userId) => {
        const mediaType = normalizeMediaType(mediaTypeValue);
        const mediaId = normalizeMediaId(mediaIdValue);
        if (!db) {
            return sortReviews(localReviews.filter((review) => review.mediaType === mediaType && review.mediaId === mediaId))
                .map((review) => ({ ...review, isMine: review.userId === userId }));
        }

        try {
            const snapshot = await db.collection("reviews").where("mediaId", "==", mediaId).get();
            return sortReviews(snapshot.docs.filter((doc) => doc.data().mediaType === mediaType).map((doc) => {
                const review = { id: doc.id, ...doc.data() };
                return { ...review, isMine: review.userId === userId };
            }));
        } catch (error) {
            console.error("Error al leer reseñas:", error.message || error);
            throw new Error("No se pudieron leer las reseñas");
        }
    },

    createReview: async ({ mediaType: mediaTypeValue, mediaId: mediaIdValue, text, userId, userName }) => {
        if (!userId) throw new Error("Requiere iniciar sesión");
        const mediaType = normalizeMediaType(mediaTypeValue);
        const mediaId = normalizeMediaId(mediaIdValue);
        const cleanText = validateReviewData({ text });
        const id = reviewId(mediaType, mediaId, userId);
        const review = {
            mediaType,
            mediaId,
            userId,
            userName: String(userName || "Usuario").trim().slice(0, 80) || "Usuario",
            text: cleanText,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!db) {
            const existing = localReviews.find((item) => item.id === id);
            if (existing) throw new Error("Ya has escrito una reseña para este contenido");
            localReviews.unshift({ id, ...review });
            return { id, ...review, isMine: true };
        }

        try {
            const ref = db.collection("reviews").doc(id);
            const existing = await ref.get();
            if (existing.exists) throw new Error("Ya has escrito una reseña para este contenido");
            await ref.set(review);
            return { id, ...review, isMine: true };
        } catch (error) {
            if (/Ya has escrito/.test(error.message || "")) throw error;
            console.error("Error al guardar reseña:", error.message || error);
            throw new Error("No se pudo guardar la reseña");
        }
    },

    deleteReview: async (id, userId) => {
        if (!id || !userId) return false;
        if (!db) {
            const index = localReviews.findIndex((review) => review.id === id && review.userId === userId);
            if (index === -1) return false;
            localReviews.splice(index, 1);
            return true;
        }
        const ref = db.collection("reviews").doc(id);
        const snapshot = await ref.get();
        if (!snapshot.exists || snapshot.data().userId !== userId) return false;
        await ref.delete();
        return true;
    }
};

module.exports = { ReviewModel };