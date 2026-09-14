let db = null;

try {
    const admin = require("firebase-admin");
    const path = require("path");
    const fs = require("fs");
    const keyPath = path.join(__dirname, "../../firebase-key.json");

    if (fs.existsSync(keyPath)) {
        try {
            const serviceAccount = require(keyPath);
            if (admin.apps.length === 0) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
            }
            db = admin.firestore();
            console.log("Firestore conectado");
        } catch (e) {
            console.warn("firebase-key.json inválido. Modo local (memoria). Detalle:", e.message);
        }
    } else {
        console.warn("firebase-key.json no encontrado. Modo local (memoria).");
    }
} catch (e) {
    console.warn("firebase-admin no disponible. Modo local (memoria).");
}

// Almacén en memoria para que el modo local sí persista mientras el servidor corre.
// (Sin Firestore antes se devolvía [] siempre y lo guardado "desaparecía".)
const localMovies = [];

function slugifyTitle(value) {
    if (typeof value !== "string") return "untitled";
    return (
        value
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "untitled"
    );
}

function buildId(title, year) {
    const base = slugifyTitle(title);
    const cleanYear = (year || "").toString().trim().slice(0, 4);
    // Añadimos el año para no confundir remakes con el mismo título.
    return cleanYear && /\d{4}/.test(cleanYear) ? `${base}-${cleanYear}` : base;
}

function validateMovieData(movieData) {
    if (!movieData || typeof movieData !== "object") {
        throw new Error("Datos de película inválidos");
    }
    const title = (movieData.title || "").toString().trim();
    if (!title) {
        throw new Error("La película necesita un 'title' no vacío");
    }
    if (title.length > 200) {
        throw new Error("El título es demasiado largo");
    }
    return { ...movieData, title };
}

function sortByDateDesc(list) {
    return [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

const MovieModel = {
    isFirestoreConnected: () => db !== null,

    formatData: (rawJson) => ({
        title: rawJson.Title || "Sin título",
        year: rawJson.Year || "----",
        director: rawJson.Director && rawJson.Director !== "N/A" ? rawJson.Director : "Desconocido",
        genre: rawJson.Genre && rawJson.Genre !== "N/A" ? rawJson.Genre : "Sin género",
        plot: rawJson.Plot && rawJson.Plot !== "N/A" ? rawJson.Plot : "Sin sinopsis disponible.",
        poster: rawJson.Poster && rawJson.Poster !== "N/A" ? rawJson.Poster : null,
        actors: rawJson.Actors && rawJson.Actors !== "N/A" ? rawJson.Actors : null,
        runtime: rawJson.Runtime && rawJson.Runtime !== "N/A" ? rawJson.Runtime : null,
        rating: rawJson.imdbRating && rawJson.imdbRating !== "N/A" ? rawJson.imdbRating : null,
        type: rawJson.Type || null,
        imdbID: rawJson.imdbID || null,
        createdAt: new Date().toISOString()
    }),

    saveToDatabase: async (movieData, userId) => {
        if (!userId) {
            throw new Error("Requiere iniciar sesión");
        }
        const clean = validateMovieData(movieData);
        // El dueño forma parte del id: dos usuarios pueden guardar la misma peli.
        const ownerSuffix = slugifyTitle(String(userId));
        const movieId = buildId(clean.title, clean.year) + "__" + ownerSuffix;
        const doc = {
            ...clean,
            userId,
            createdAt: clean.createdAt || new Date().toISOString()
        };

        if (!db) {
            const existing = localMovies.find((m) => m.id === movieId);
            if (existing) {
                console.log(`La película "${clean.title}" ya está guardada (modo local).`);
                return movieId;
            }
            localMovies.unshift({ id: movieId, ...doc });
            console.log("Guardado local con ID:", movieId);
            return movieId;
        }

        try {
            const docRef = db.collection("movies").doc(movieId);
            const existing = await docRef.get();

            if (existing.exists) {
                console.log(`La película "${clean.title}" ya existe en Firestore.`);
                return movieId;
            }

            await docRef.set(doc);
            console.log("Guardado con ID:", movieId);
            return movieId;
        } catch (error) {
            console.error("Error en Firestore:", error.message || error);
            throw new Error("No se pudo guardar en la base de datos");
        }
    },

    getAllMovies: async (userId) => {
        // Sin sesión no hay colección personal.
        if (!userId) {
            return [];
        }
        if (!db) {
            return sortByDateDesc(localMovies.filter((m) => m.userId === userId));
        }

        try {
            // where() de un solo campo no necesita índice compuesto; se ordena en memoria.
            const snapshot = await db.collection("movies").where("userId", "==", userId).get();
            const movies = [];
            snapshot.forEach((doc) => {
                movies.push({ id: doc.id, ...doc.data() });
            });
            return sortByDateDesc(movies);
        } catch (error) {
            console.error("Error al listar películas:", error.message || error);
            throw new Error("No se pudo listar la base de datos");
        }
    },

    // Reclama las guardadas de antes de existir usuarios (sin dueño) para quien entra.
    // Así no se pierde lo guardado en la época sin login.
    claimOrphanMovies: async (userId) => {
        if (!userId) return 0;
        if (!db) {
            let claimed = 0;
            localMovies.forEach((m) => {
                if (!m.userId) {
                    m.userId = userId;
                    claimed++;
                }
            });
            if (claimed) console.log(`Reclamadas ${claimed} locales para ${userId}`);
            return claimed;
        }
        try {
            const snapshot = await db.collection("movies").get();
            const batch = db.batch();
            let claimed = 0;
            snapshot.forEach((doc) => {
                const data = doc.data() || {};
                if (!data.userId) {
                    batch.update(doc.ref, { userId });
                    claimed++;
                }
            });
            if (claimed) {
                await batch.commit();
                console.log(`Reclamadas ${claimed} en Firestore para ${userId}`);
            }
            return claimed;
        } catch (error) {
            console.error("Error al reclamar películas:", error.message || error);
            return 0;
        }
    },

    getMovieById: async (id, userId) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            return localMovies.find((m) => m.id === id && m.userId === userId) || null;
        }
        const doc = await db.collection("movies").doc(id).get();
        if (!doc.exists) return null;
        const data = doc.data() || {};
        if (data.userId !== userId) return null;
        return { id: doc.id, ...data };
    },

    deleteMovie: async (id, userId) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            const idx = localMovies.findIndex((m) => m.id === id && m.userId === userId);
            if (idx === -1) return false;
            localMovies.splice(idx, 1);
            return true;
        }
        const docRef = db.collection("movies").doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        const data = doc.data() || {};
        if (data.userId !== userId) return false;
        await docRef.delete();
        return true;
    }
};

module.exports = { MovieModel };
