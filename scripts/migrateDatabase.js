/**
 * Script de migración y verificación de Firestore para CineAIros.
 * Usa la conexión centralizada (src-backend/models/firebase.js):
 * variables de entorno del .env o firebase-key.json como fallback.
 *
 * Uso:
 *   node scripts/migrateDatabase.js
 */

const firebaseConn = require("../src-backend/models/firebase");
const db = firebaseConn.getDb();

if (!db) {
    console.error("❌ Sin conexión a Firestore. Revisa tu .env (FIREBASE_*) o firebase-key.json.");
    process.exit(1);
}
console.log("🔥 Firebase Admin inicializado correctamente para migración (" + firebaseConn.getMode() + ").");

async function migrateDatabase() {
    console.log("\n--- INICIANDO VERIFICACIÓN Y MIGRACIÓN DE FIRESTORE ---\n");

    try {
        // 1. Revisar colección "users"
        const usersSnapshot = await db.collection("users").get();
        console.log(`👤 Usuarios encontrados: ${usersSnapshot.size}`);
        
        for (const doc of usersSnapshot.docs) {
            const data = doc.data();
            let needsUpdate = false;
            const updateFields = {};

            if (!data.prefs) {
                updateFields.prefs = {
                    favoriteGenres: [],
                    likesSeries: true,
                    likesMovies: true,
                    likesMiniseries: false,
                    onboardingDone: false
                };
                needsUpdate = true;
            }

            if (needsUpdate) {
                await doc.ref.update(updateFields);
                console.log(`  ✔ Usuario migrado: ${doc.id} (${data.email || "sin email"})`);
            }
        }

        // 2. Revisar colección "movies" (Películas y Series)
        const moviesSnapshot = await db.collection("movies").get();
        console.log(`\n🎬 Elementos en colección 'movies': ${moviesSnapshot.size}`);

        let migratedMovies = 0;
        for (const doc of moviesSnapshot.docs) {
            const data = doc.data();
            let needsUpdate = false;
            const updateFields = {};

            // Asegurar campo type ("movie" o "series")
            if (!data.type) {
                updateFields.type = "movie";
                needsUpdate = true;
            }

            // Asegurar campo title
            if (!data.title && data.Title) {
                updateFields.title = data.Title;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await doc.ref.update(updateFields);
                migratedMovies++;
                console.log(`  ✔ Película/Serie migrada: ${doc.id} (Tipo: ${updateFields.type || data.type})`);
            }
        }

        console.log(`\n✨ Migración completada con éxito.`);
        console.log(`   - Usuarios revisados: ${usersSnapshot.size}`);
        console.log(`   - Películas/Series revisadas/actualizadas: ${moviesSnapshot.size} (${migratedMovies} actualizadas).`);
        
    } catch (error) {
        console.error("❌ Error durante la migración de la base de datos:", error);
    } finally {
        process.exit(0);
    }
}

migrateDatabase();
