/**
 * Borra todos los documentos de la colección movies de Firestore (solo películas).
 * Las series viven en su propia colección "series" y no se ven afectadas.
 * No toca users, sessions ni Firebase Authentication.
 *
 * Uso:
 *   node scripts/deleteAllMovies.js --confirm
 *   node scripts/deleteAllMovies.js --confirm --dry-run
 */

const firebaseConn = require("../src-backend/models/firebase");
const db = firebaseConn.getDb();
const args = process.argv.slice(2);

if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

if (!args.includes("--confirm")) {
    console.error("Operación cancelada: añade --confirm para borrar la colección movies.");
    process.exit(1);
}

async function deleteAllMovies() {
    const snapshot = await db.collection("movies").get();
    console.log(`Películas encontradas en Firestore: ${snapshot.size}`);

    if (args.includes("--dry-run")) {
        console.log(`Dry-run: se borrarían ${snapshot.size} películas.`);
        return;
    }

    for (let index = 0; index < snapshot.docs.length; index += 450) {
        const batch = db.batch();
        snapshot.docs.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }

    console.log(`Colección movies vaciada. Películas borradas: ${snapshot.size}.`);
}

deleteAllMovies().catch((error) => {
    console.error("Error al borrar las películas:", error.message || error);
    process.exitCode = 1;
});
