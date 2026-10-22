/**
 * Script para crear usuarios de prueba en Firebase Authentication + Firestore.
 * Ejecutar: node scripts/create-test-users.js
 * 
 * Requiere: firebase-key.json en la raíz (recomendado) o variables FIREBASE_* en .env
 */

const fs = require("fs");
const path = require("path");

// Cargar .env manualmente (sin dependencia dotenv)
function loadEnvFile() {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

loadEnvFile();

// Imports modulares de Firebase Admin v14+
const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Inicializar Firebase Admin
function initFirebaseAdmin() {
    if (getApps().length > 0) return getApp();

    // Opción 1: firebase-key.json (recomendado para local)
    const keyPath = path.join(__dirname, "..", "firebase-key.json");
    if (fs.existsSync(keyPath)) {
        const serviceAccount = require(keyPath);
        return initializeApp({
            credential: cert(serviceAccount)
        });
    }

    // Opción 2: Variables de entorno (.env)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
        return initializeApp({
            credential: cert({ projectId, clientEmail, privateKey })
        });
    }

    throw new Error("No se encontraron credenciales Firebase Admin. Necesitas firebase-key.json o variables FIREBASE_* en .env");
}

async function createTestUsers() {
    try {
        const app = initFirebaseAdmin();
        const auth = getAuth(app);
        const db = getFirestore(app);

        console.log("🔥 Firebase Admin inicializado correctamente");
        console.log("📋 Proyecto:", app.options.projectId);

        const users = [
            {
                email: "testuser@example.com",
                password: "TestPass123!",
                displayName: "Usuario Test",
                nickname: "testuser",
                role: "user"
            },
            {
                email: "admin@example.com",
                password: "AdminPass123!",
                displayName: "Admin Test",
                nickname: "admintest",
                role: "admin"
            }
        ];

        for (const userData of users) {
            console.log(`\n👤 Procesando: ${userData.email} (${userData.role})`);

            // 1. Crear o actualizar en Firebase Auth
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(userData.email);
                console.log(`   ✅ Usuario ya existe en Auth (UID: ${userRecord.uid})`);
                
                await auth.updateUser(userRecord.uid, {
                    password: userData.password,
                    emailVerified: true,
                    displayName: userData.displayName
                });
                console.log(`   🔄 Contraseña actualizada y emailVerified = true`);
            } catch (err) {
                if (err.code === "auth/user-not-found") {
                    userRecord = await auth.createUser({
                        email: userData.email,
                        password: userData.password,
                        displayName: userData.displayName,
                        emailVerified: true
                    });
                    console.log(`   ✨ Usuario creado en Auth (UID: ${userRecord.uid})`);
                } else {
                    throw err;
                }
            }

            // 2. Crear/actualizar documento en Firestore (colección users)
            const userRef = db.collection("users").doc(userData.email.toLowerCase());
            const userDoc = await userRef.get();

            const firestoreData = {
                id: userData.email.toLowerCase(),
                name: userData.displayName,
                email: userData.email.toLowerCase(),
                nickname: userData.nickname,
                provider: "password",
                firebaseUid: userRecord.uid,
                emailVerified: true,
                role: userData.role,
                isAdmin: userData.role === "admin",
                prefs: {
                    favoriteGenres: ["Action", "Drama", "Sci-Fi"],
                    likesMovies: true,
                    likesSeries: true,
                    likesMiniseries: true,
                    onboardingDone: true,
                    colorTheme: "default"
                },
                createdAt: userDoc.exists ? userDoc.data().createdAt : new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await userRef.set(firestoreData, { merge: true });
            console.log(`   💾 Documento Firestore actualizado (users/${userData.email})`);
        }

        console.log("\n✅ ¡Usuarios de prueba creados/actualizados correctamente!");
        console.log("\n📝 Credenciales para tests Selenium:");
        console.log("   👤 Usuario normal: testuser@example.com / TestPass123!");
        console.log("   👑 Admin:          admin@example.com / AdminPass123!");

    } catch (error) {
        console.error("\n❌ Error:", error.message);
        if (error.code) console.error("   Código:", error.code);
        if (error.stack) console.error("   Stack:", error.stack);
        process.exit(1);
    }
}

createTestUsers();