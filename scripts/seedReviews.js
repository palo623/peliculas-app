/**
 * Crea 100 reseñas para Avatar (película) y 100 para The Walking Dead (serie).
 * Las reseñas se guardan en Firestore.
 *
 * Uso:
 *   node scripts/seedReviews.js
 *   node scripts/seedReviews.js --count=100
 *   node scripts/seedReviews.js --count=50 --dry-run
 *
 * Requiere credenciales Firebase Admin en .env.
 */

const firebaseConn = require("../src-backend/models/firebase");
const { ReviewModel, buildMediaKey, normalizeMediaType, normalizeImdbId, normalizeYear } = require("../src-backend/models/reviewModel");

const db = firebaseConn.getDb();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const countArg = args.find((arg) => arg.startsWith("--count="));
const reviewsPerMedia = countArg ? Number.parseInt(countArg.split("=")[1], 10) : 100;

if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

// IMDb IDs conocidos
const MEDIA = [
    {
        mediaType: "movie",
        imdbID: "tt0499549",
        title: "Avatar",
        year: 2009
    },
    {
        mediaType: "series",
        imdbID: "tt1520211",
        title: "The Walking Dead",
        year: 2010
    }
];

// Textos de reseñas variadas (mezcla de positivas, negativas y neutras)
const REVIEW_TEXTS = [
    // Positivas
    "Una obra maestra absoluta. La dirección, la fotografía y los efectos visuales están a otro nivel. Me dejó sin palabras.",
    "De las mejores películas/series que he visto en años. La historia te atrapa desde el primer minuto y no te suelta.",
    "Increíble construcción de mundo y personajes memorables. El guion es inteligente y respeta al espectador.",
    "Visual y narrativamente impresionante. Cada escena está cuidada al detalle. Un 10/10 sin duda.",
    "Me encantó cómo desarrolla sus temas sin ser pretenciosa. Entretenida, profunda y emocionante a la vez.",
    "Los efectos especiales son revolucionarios, pero lo mejor es el corazón de la historia. Muy recomendable.",
    "Una experiencia cinematográfica/televisiva única. Se nota el cariño y el trabajo detrás de cada decisión creativa.",
    "Superó todas mis expectativas. El reparto está perfecto y la banda sonora eleva cada escena.",
    "Pocas veces se ve algo tan ambicioso y bien ejecutado. Un referente en su género para las próximas décadas.",
    "Emocionante, visualmente espectacular y con una historia que resuena. Cine/TV de la buena.",

    // Neutras/equilibradas
    "Entretenida y bien hecha, aunque no me cambió la vida. Cumple lo que promete sin más.",
    "Tiene momentos brillantes y otros que se sienten de relleno. En conjunto, una experiencia correcta.",
    "Buena producción y actuaciones sólidas, pero el guion a veces cae en tópicos conocidos.",
    "Visualmente impresionante, aunque la historia me resultó predecible en varios puntos.",
    "Me gustó, pero esperaba más profundidad en los personajes secundarios. Aun así, se deja ver bien.",
    "Correcta, con buen ritmo y producción de calidad. No es nada del otro mundo pero entretiene.",
    "Tiene sus altibajos. Cuando brilla, brilla mucho; cuando falla, se nota. Promedio alto.",
    "Una propuesta sólida que sabe a qué juega. No innova pero ejecuta bien sus ideas.",
    "Disfrutable sin ser memorable. Buena para una tarde de desconexión total.",
    "Bien hecha técnicamente, aunque le falta ese 'algo' que la haga especial. Aprobada.",

    // Negativas/críticas
    "Visualmente bonita pero vacía de contenido. Mucho ruido y pocas nueces. Me aburrió a ratos.",
    "Sobrevalorada. Los efectos no pueden salvar un guion plano y personajes de cartón.",
    "Se arrastra demasiado. Podrían haber contado lo mismo en la mitad de tiempo sin perder nada.",
    "Prometía mucho y decepciona. Los giros de guion son forzados y el final no convence.",
    "Demasiado estilo, poca sustancia. Parece hecha para impresionar técnicamente, no para contar una historia.",
    "Los personajes toman decisiones ilógicas solo para avanzar la trama. Me saca de la inmersión.",
    "Empezó fuerte pero se desinfló rápido. La segunda mitad se siente como relleno innecesario.",
    "No entendí la fama. Para mí es un producto correcto pero sin alma ni riesgo creativo.",
    "Abusa de los clichés del género sin aportar nada nuevo. Una oportunidad perdida.",
    "Bonita envoltorio, regalo decepcionante. No la recomendaría salvo para ver efectos visuales."
];

// Nombres de usuarios falsos
const FAKE_USERS = [
    { id: "user_cinefilo_01", name: "CinefiloMax" },
    { id: "user_series_adder_02", name: "SeriesAdicto" },
    { id: "user_critico_03", name: "CriticoSevero" },
    { id: "user_fan_scifi_04", name: "FanSciFi" },
    { id: "user_maratoniano_05", name: "MaratonianoPro" },
    { id: "user_opinador_06", name: "OpinadorNato" },
    { id: "user_reviewer_07", name: "ReviewerHonesto" },
    { id: "user_peliculero_08", name: "PeliculeroTotal" },
    { id: "user_seriefilo_09", name: "SeriefiloEmpeñado" },
    { id: "user_cineclub_10", name: "CineClubAdmin" },
    { id: "user_taquillero_11", name: "TaquilleroFan" },
    { id: "user_streamer_12", name: "StreamerNocturno" },
    { id: "user_guionista_13", name: "GuionistaFrustrado" },
    { id: "user_director_14", name: "DirectorAmateur" },
    { id: "user_fotograma_15", name: "FotogramaHunter" },
    { id: "user_espectador_16", name: "EspectadorCasual" },
    { id: "user_fanboy_17", name: "FanboyLeal" },
    { id: "user_hater_18", name: "HaterProfesional" },
    { id: "user_equilibrado_19", name: "EquilibradoJusto" },
    { id: "user_apasionado_20", name: "ApasionadoCine" }
];

function getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getRandomRating(sentimentLabel) {
    if (sentimentLabel === "positive") return Math.floor(Math.random() * 3) + 8; // 8-10
    if (sentimentLabel === "negative") return Math.floor(Math.random() * 4) + 1; // 1-4
    return Math.floor(Math.random() * 3) + 5; // 5-7 neutral
}

function shuffleArray(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

async function createReviewsForMedia(media, count) {
    const mediaKey = buildMediaKey({
        mediaType: media.mediaType,
        imdbID: media.imdbID,
        title: media.title,
        year: media.year
    });

    console.log(`\n=== Creando ${count} reseñas para ${media.title} (${mediaKey}) ===`);

    const shuffledTexts = shuffleArray(REVIEW_TEXTS);
    const shuffledUsers = shuffleArray(FAKE_USERS);

    let created = 0;
    let skipped = 0;

    for (let i = 0; i < count; i++) {
        const user = shuffledUsers[i % shuffledUsers.length];
        const text = shuffledTexts[i % shuffledTexts.length];
        const sentiment = ReviewModel.classify ? ReviewModel.classify(text) : null;
        const rating = getRandomRating(sentiment?.label || "neutral");

        const reviewInput = {
            mediaType: media.mediaType,
            imdbID: media.imdbID,
            mediaTitle: media.title,
            mediaYear: media.year,
            text: text,
            rating: rating
        };

        if (dryRun) {
            console.log(`[DRY-RUN] Usuario: ${user.name} | Rating: ${rating} | Texto: ${text.slice(0, 60)}...`);
            created++;
            continue;
        }

        try {
            const review = await ReviewModel.create(
                { userId: user.id, userName: user.name },
                reviewInput
            );
            created++;
            if (created % 10 === 0) {
                console.log(`  Creadas ${created}/${count}...`);
            }
        } catch (error) {
            if (error.code === "REVIEW_DUPLICATE") {
                skipped++;
                console.log(`  Saltada (duplicado para ${user.name}): ${error.message}`);
            } else {
                console.error(`  Error con ${user.name}: ${error.message}`);
            }
        }

        // Pequeña pausa para no saturar Firestore
        await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`  Resultado: ${created} creadas, ${skipped} duplicadas saltadas`);
    return { created, skipped };
}

async function main() {
    console.log("=== Seed de Reseñas ===");
    console.log(`Objetivo: ${reviewsPerMedia} reseñas por obra`);
    console.log(`Modo: ${dryRun ? "DRY-RUN (sin escribir)" : "ESCRITURA REAL"}`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const media of MEDIA) {
        const result = await createReviewsForMedia(media, reviewsPerMedia);
        totalCreated += result.created;
        totalSkipped += result.skipped;
    }

    console.log("\n=== RESUMEN ===");
    console.log(`Total creadas: ${totalCreated}`);
    console.log(`Total saltadas (duplicados): ${totalSkipped}`);

    if (dryRun) {
        console.log("\nDRY-RUN completado. No se escribió nada en la base de datos.");
        console.log("Ejecuta sin --dry-run para guardar realmente.");
    }
}

main().catch((error) => {
    console.error("Error fatal:", error.message || error);
    process.exitCode = 1;
});