// Este modelo separa dos usos de la colección movies:
// catálogo público (búsqueda y populares) y colección personal (userId).
// La conexión se centraliza en ./firebase.js.
// Soporta credenciales por .env o por firebase-key.json (legacy).
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

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
    if (String(movieData.type || "movie").toLowerCase() !== "movie") {
        throw new Error("Solo se pueden guardar películas");
    }
    return { ...movieData, title };
}

function sortByDateDesc(list) {
    return [...list].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function toPopularItem(doc) {
    return {
        title: doc.title || "Sin título",
        year: doc.year || "----",
        imdbID: doc.imdbID || null,
        type: doc.type || null,
        poster: doc.poster || null,
        // Extras si existen en Firestore (el front los ignora si no los usa).
        rating: doc.rating || null,
        genre: doc.genre || null,
        plot: doc.plot || null
    };
}

const MovieModel = {
    isFirestoreConnected: () => firebaseConn.isFirestoreConnected(),

    formatData: (rawJson) => {
        return {
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
        };
    },

    // El catálogo público nunca usa el modo local: si Firestore no está
    // disponible, la web debe mostrar vacío en lugar de inventar resultados.
    getCatalogMovies: async () => {
        if (!db) return [];
        try {
            const snapshot = await db.collection("movies").where("type", "==", "movie").limit(5000).get();
            return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error al leer el catálogo de películas:", error.message || error);
            throw new Error("No se pudo leer el catálogo de películas");
        }
    },

    // La API externa solo se usa por los scripts de carga, nunca desde la web.
    findCatalogMovie: async ({ title, year, imdbID }) => {
        const movies = await MovieModel.getCatalogMovies();
        const wantedId = String(imdbID || "").trim().toLowerCase();
        const wantedTitle = String(title || "").trim().toLowerCase();
        const wantedYear = String(year || "").trim();
        return movies.find((movie) => {
            if (wantedId && String(movie.imdbID || "").toLowerCase() !== wantedId) return false;
            if (!wantedId && String(movie.title || "").trim().toLowerCase() !== wantedTitle) return false;
            return !wantedYear || String(movie.year || "").includes(wantedYear);
        }) || null;
    },

    searchCatalog: async ({ query, year, page }) => {
        const movies = await MovieModel.getCatalogMovies();
        const wanted = String(query || "").trim().toLowerCase();
        const wantedYear = String(year || "").trim();
        const pageNumber = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 100);
        const matches = movies.filter((movie) => {
            if (!String(movie.title || "").toLowerCase().includes(wanted)) return false;
            return !wantedYear || String(movie.year || "").includes(wantedYear);
        });
        const unique = [];
        const seen = new Set();
        for (const movie of matches) {
            const key = String(movie.imdbID || `${movie.title}|${movie.year}`).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(movie);
        }
        const pageSize = 10;
        const start = (pageNumber - 1) * pageSize;
        return { results: unique.slice(start, start + pageSize), totalResults: unique.length };
    },

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
            return sortByDateDesc(localMovies.filter((m) => m.userId === userId && String(m.type || "movie").toLowerCase() === "movie"));
        }

        try {
            // where() de un solo campo no necesita índice compuesto; se ordena en memoria.
            const snapshot = await db.collection("movies").where("userId", "==", userId).get();
            const movies = [];
            snapshot.forEach((doc) => {
                const data = doc.data() || {};
                if (String(data.type || "movie").toLowerCase() === "movie") {
                    movies.push({ id: doc.id, ...data });
                }
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
    },

    // Popular aleatorio desde Firestore (no desde la API externa).
    // Lee el catálogo de películas, elimina duplicados entre usuarios
    // (misma peli guardada por varios) y devuelve una muestra al azar.
    getPopularFromDb: async ({ year, limit }) => {
        const want = Math.min(Math.max(Number.parseInt(limit, 10) || 12, 1), 30);
        const yearStr = year ? String(year).trim() : "";

        let docs = [];
        if (!db) {
            return [];
        } else {
            try {
                // Lectura acotada para no disparar los costes de Firestore.
                const snapshot = await db
                    .collection("movies")
                    .where("type", "==", "movie")
                    .limit(500)
                    .get();
                snapshot.forEach((d) => {
                    docs.push({ id: d.id, ...d.data() });
                });
            } catch (error) {
                console.error("Error al leer populares desde Firestore:", error.message || error);
                return [];
            }
        }

        // Filtro por año en memoria: cubre "2010", "2010–2013", "2008-2012", etc.
        let filtered = docs.filter((m) => {
            const t = String(m.type || "").toLowerCase();
            if (t && t !== "movie") return false;
            if (!m.title) return false;
            if (yearStr) {
                const yField = String(m.year || "");
                if (!yField.includes(yearStr)) return false;
            }
            return true;
        });

        // Sin tipo en docs antiguos: si el where() no trajo nada, probar sin filtro
        // (por si hay docs sin campo type). Solo en Firestore.
        if (filtered.length === 0 && db && !yearStr) {
            try {
                const fallback = await db.collection("movies").limit(500).get();
                const all = [];
                fallback.forEach((d) => {
                    all.push({ id: d.id, ...d.data() });
                });
                filtered = all.filter((m) => {
                    const t = String(m.type || "").toLowerCase();
                    // Acepta docs sin type como películas para no dejar vacío "Popular ahora".
                    if (!t) return !!m.title;
                    return t === "movie" && !!m.title;
                });
            } catch (e) {
                return [];
            }
        }

        // Deduplicar: la colección es personal (mismo título guardado por N usuarios).
        const seen = new Set();
        const unique = [];
        for (const m of filtered) {
            const imdb = String(m.imdbID || "").trim().toLowerCase();
            const key = imdb || ((String(m.title || "").toLowerCase().trim()) + "__" + String(m.year || "").trim());
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(m);
        }

        if (unique.length === 0) return [];

        // Preferir fichas con póster para que el carrusel no salga vacío de imágenes,
        // pero sin excluir las que no lo tienen si no hay suficientes.
        const withPoster = unique.filter((m) => !!m.poster);
        const pool = withPoster.length >= want ? withPoster : unique;

        return shuffleInPlace([...pool]).slice(0, want).map(toPopularItem);
    }
};

module.exports = { MovieModel };
