const fs = require('fs');
let c = fs.readFileSync('src-backend/models/reviewModel.js', 'utf8');

// Find the LAST occurrence of }; (the main object closing)
const closingBracePos = c.lastIndexOf('};');
if (closingBracePos === -1) {
    console.error('Could not find closing brace');
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

        // Filter reviews with sentiment data
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

        // Aggregate sentiment stats
        const totalScore = reviewsWithSentiment.reduce((sum, r) => sum + (r.sentiment.score || 0), 0);
        const totalMagnitude = reviewsWithSentiment.reduce((sum, r) => sum + (r.sentiment.magnitude || 0), 0);

        const avgScore = totalScore / reviewsWithSentiment.length;
        const avgMagnitude = totalMagnitude / reviewsWithSentiment.length;

        // Count labels
        const labelCounts = { positive: 0, negative: 0, neutral: 0 };
        reviewsWithSentiment.forEach(r => {
            const label = r.sentiment.label || "neutral";
            if (labelCounts[label] !== undefined) labelCounts[label]++;
        });

        // Distribution by score ranges
        const distribution = {
            veryNegative: 0, // -1 to -0.6
            negative: 0,     // -0.6 to -0.2
            neutral: 0,      // -0.2 to 0.2
            positive: 0,     // 0.2 to 0.6
            veryPositive: 0  // 0.6 to 1
        };

        reviewsWithSentiment.forEach(r => {
            const s = r.sentiment.score || 0;
            if (s <= -0.6) distribution.veryNegative++;
            else if (s <= -0.2) distribution.negative++;
            else if (s <= 0.2) distribution.neutral++;
            else if (s <= 0.6) distribution.positive++;
            else distribution.veryPositive++;
        });

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

    // Update sentiment for a specific review (for batch processing)
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

const before = c.substring(0, closingBracePos);
const after = c.substring(closingBracePos);
c = before + newMethods + after;
fs.writeFileSync('src-backend/models/reviewModel.js', c, 'utf8');
console.log('Added sentiment methods correctly inside the object');