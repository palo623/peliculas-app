/**
 * Borra todos los documentos de la colección series de Firestore (solo series).
 * Las películas viven en su propia colección "movies" y no se ven afectadas.
 * No toca users, sessions ni Firebase Authentication.
 *
 * Uso:
 *   node scripts/deleteAllSeries.js --confirm
 *   node scripts/deleteAllSeries.js --confirm --dry-run
 */

const firebaseConn = require("../src-backend/models/firebase");
const db = firebaseConn.getDb();
const args = process.argv.slice(2);

if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

if (!args.includes("--confirm")) {
    console.error("Operación cancelada: añade --confirm para borrar la colección series.");
    process.exit(1);
}

async function deleteAllSeries() {
    const snapshot = await db.collection("series").get();
    console.log(`Series encontradas en Firestore: ${snapshot.size}`);

    if (args.includes("--dry-run")) {
        console.log(`Dry-run: se borrarían ${snapshot.size} series.`);
        return;
    }

    for (let index = 0; index < snapshot.docs.length; index += 450) {
        const batch = db.batch();
        snapshot.docs.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }

    console.log(`Colección series vaciada. Series borradas: ${snapshot.size}.`);
}

deleteAllSeries().catch((error) => {
    console.error("Error al borrar las series:", error.message || error);
    process.exitCode = 1;
});