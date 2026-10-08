const fs = require('fs');
let c = fs.readFileSync('src-backend/models/reviewModel.js', 'utf8');

// Find the exact marker: '    }\n};' at the end of the ReviewModel object
const marker = '    }\n};';
const idx = c.lastIndexOf(marker);
if (idx === -1) {
    console.error('Marker not found');
    process.exit(1);
}

const newMethods = `
    // Get sentiment analysis for a specific media (admin only)
    // Returns aggregated sentiment stats for all reviews of a media
    async getSentimentAnalysis({ mediaType, imdbID, mediaTitle, mediaYear }) {
        if (!db) return { error: "Firestore no disponible" };

        const key = mediaKey(mediaType, imdbID, mediaTitle, mediaYear);
        const snap = await db.collection("reviews")
            .where("mediaKey", "==", key)
            .get();

        const reviews = [];
        snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));

        if (reviews.length === 0) {
            return {
                mediaKey: key,
                totalReviews: 0,
                sentiment: null,
                message: "No hay reseñas para esta obra"
            };
        }

        const reviewsWithSentiment = reviews.filter(r => r.sentiment && r.sentiment.score !== undefined);

        if (reviewsWithSentiment.length === 0) {
            return {
                mediaKey: key,
                totalReviews: reviews.length,
                analyzedReviews: 0,
                sentiment: null,
                message: "No hay análisis de sentimientos disponibles aún"
            };
        }

        const totalScore = reviewsWithSentiment.reduce((sum, r) => sum + (r.sentiment.score || 0), 0);
        const totalMagnitude = reviewsWithSentiment.reduce((sum, r) => sum + (r.sentiment.magnitude || 0), 0);

        const avgScore = totalScore / reviewsWithSentiment.length;
        const avgMagnitude = totalMagnitude / reviewsWithSentiment.length;

        const labelCounts = { positive: 0, negative: 0, neutral: 0 };
        reviewsWithSentiment.forEach(r => {
            const label = r.sentiment.label || "neutral";
            if (labelCounts[label] !== undefined) labelCounts[label]++;
        });

        const distribution = {
            veryNegative: 0, negative: 0, neutral: 0, positive: 0, veryPositive: 0
        };

        reviewsWithSentiment.forEach(r => {
            const s = r.sentiment.score || 0;
            if (s <= -0.6) distribution.veryNegative++;
            else if (s <= -0.2) distribution.negative++;
            else if (s <= 0.2) distribution.neutral++;
            else if (s <= 0.6) distribution.positive++;
            else distribution.veryPositive++;
        };

        return {
            mediaKey: key,
            totalReviews: reviews.length,
            analyzedReviews: reviewsWithSentiment.length,
            sentiment: {
                avgScore: Number(avgScore.toFixed(3)),
                avgMagnitude: Number(avgMagnitude.toFixed(3)),
                label: avgScore > 0.1 ? "positive" : avgScore < -0.1 ? "negative" : "neutral",
                labelCounts,
                distribution
            },
            reviews: reviewsWithSentiment.map(r => ({
                reviewId: r.id,
                userId: r.userId,
                score: r.sentiment.score,
                magnitude: r.sentiment.magnitude,
                label: r.sentiment.label,
                analyzedAt: r.sentiment.analyzedAt
            }))
        };
    },

    async updateSentiment(reviewId, sentiment) {
        if (!db) return { ok: false, error: "Firestore no disponible" };
        const ref = db.collection("reviews").doc(reviewId);
        const snap = await ref.get();
        if (!snap.exists) throw codedError("NOT_FOUND", "Reseña no encontrada");

        const sentimentData = {
            sentiment: {
                score: Number(sentiment.score),
                magnitude: Number(sentiment.magnitude),
                label: sentiment.label,
                analyzedAt: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        };

        await ref.update(sentimentData);
        return { ok: true };
    },

`;

const marker = '    }\n};';
const idx = c.lastIndexOf(marker);
if (idx === -1) {
    console.error('Marker not found');
    process.exit(1);
}

const before = c.substring(0, idx + marker.length);
const after = c.substring(idx + marker.length);
c = before + newMethods + after;
fs.writeFileSync('src-backend/models/reviewModel.js', c, 'utf8');
console.log('Added sentiment methods correctly');