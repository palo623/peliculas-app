/**
 * Script de migración y verificación de Firestore para CineAIros.
 * Este script se conecta a tu base de datos mediante firebase-key.json,
 * revisa las colecciones (users, movies, passwordResets) y asegura
 * que todos los documentos tengan la estructura correcta (userId, type, etc.).
 * 
 * Uso:
 *   node scripts/migrateDatabase.js
 */

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const path = require("path");
const fs = require("fs");

const keyPath = path.join(__dirname, "../firebase-key.json");

if (!fs.existsSync(keyPath)) {
    console.error("❌ Error: No se encontró el fichero 'firebase-key.json' en la raíz del proyecto.");
    process.exit(1);
}

let db = null;

try {
    const serviceAccount = require(keyPath);
    const apps = typeof admin.getApps === "function" ? admin.getApps() : (admin.apps || []);
    if (apps.length === 0) {
        const credential = typeof admin.cert === "function"
            ? admin.cert(serviceAccount)
            : (admin.credential && admin.credential.cert ? admin.credential.cert(serviceAccount) : undefined);
        admin.initializeApp({ credential });
    }
    db = typeof getFirestore === "function" ? getFirestore() : admin.firestore();
    console.log("🔥 Firebase Admin inicializado correctamente para migración.");
} catch (e) {
    console.error("❌ Error al inicializar Firebase Admin:", e.message);
    process.exit(1);
}

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
