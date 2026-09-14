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

    saveToDatabase: async (movieData) => {
        const clean = validateMovieData(movieData);
        const movieId = buildId(clean.title, clean.year);
        const doc = {
            ...clean,
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

    getAllMovies: async () => {
        if (!db) {
            return sortByDateDesc(localMovies);
        }

        try {
            const snapshot = await db.collection("movies").orderBy("createdAt", "desc").get();
            const movies = [];
            snapshot.forEach((doc) => {
                movies.push({ id: doc.id, ...doc.data() });
            });
            return movies;
        } catch (error) {
            console.error("Error al listar películas:", error.message || error);
            throw new Error("No se pudo listar la base de datos");
        }
    },

    getMovieById: async (id) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            return localMovies.find((m) => m.id === id) || null;
        }
        const doc = await db.collection("movies").doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    },

    deleteMovie: async (id) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            const idx = localMovies.findIndex((m) => m.id === id);
            if (idx === -1) return false;
            localMovies.splice(idx, 1);
            return true;
        }
        const docRef = db.collection("movies").doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return false;
        await docRef.delete();
        return true;
    }
};

module.exports = { MovieModel };
