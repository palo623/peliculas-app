/**
 * Mueve las series (type: "series") de la colección movies a su propia
 * colección series de Firestore. Conserva el mismo ID del documento y
 * elimina el campo 'id' si quedó guardado como dato dentro del documento.
 *
 * Uso:
 *   node scripts/migrateSeriesToCollection.js --dry-run
 *   node scripts/migrateSeriesToCollection.js
 */

const firebaseConn = require("../src-backend/models/firebase");
const db = firebaseConn.getDb();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

if (!db) {
    console.error("Sin conexión a Firestore. Revisa FIREBASE_* en .env.");
    process.exit(1);
}

async function main() {
    const snapshot = await db.collection("movies").where("type", "==", "series").get();
    const series = snapshot.docs.filter((doc) => String(doc.data().type || "").toLowerCase() === "series");
    console.log(`Series encontradas en 'movies': ${series.length}`);

    if (dryRun) {
        console.log("Dry-run: no se escribirá nada en Firestore.");
        return;
    }

    // 1) Copiar a la colección "series" (mismos IDs, sin el campo id interno).
    for (let index = 0; index < series.length; index += 450) {
        const batch = db.batch();
        series.slice(index, index + 450).forEach((doc) => {
            const data = { ...doc.data() };
            delete data.id;
            batch.set(db.collection("series").doc(doc.id), data);
        });
        await batch.commit();
    }
    console.log(`Series copiadas a 'series': ${series.length}`);

    // 2) Eliminar los originales de "movies".
    for (let index = 0; index < series.length; index += 450) {
        const batch = db.batch();
        series.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
    }
    console.log(`Series eliminadas de 'movies': ${series.length}`);
    console.log("Migración completada.");
}

main().catch((error) => {
    console.error("Error en la migración:", error.message || error);
    process.exitCode = 1;
});