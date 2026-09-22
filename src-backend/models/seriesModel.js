// Este modelo separa dos usos de la colección movies:
// catálogo público (búsqueda y populares) y colección personal (userId).
// La conexión se centraliza en ./firebase.js.
// Soporta credenciales por .env o por firebase-key.json (legacy).
const firebaseConn = require("./firebase");
const db = firebaseConn.getDb();

// Almacén en memoria para que el modo local sí persista mientras el servidor corre.
const localSeries = [];

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
    return cleanYear && /\d{4}/.test(cleanYear) ? `${base}-${cleanYear}` : base;
}

function validateSeriesData(seriesData) {
    if (!seriesData || typeof seriesData !== "object") {
        throw new Error("Datos de serie inválidos");
    }
    const title = (seriesData.title || "").toString().trim();
    if (!title) {
        throw new Error("La serie necesita un 'title' no vacío");
    }
    if (title.length > 200) {
        throw new Error("El título es demasiado largo");
    }
    if (String(seriesData.type || "series").toLowerCase() !== "series") {
        throw new Error("Solo se pueden guardar series");
    }
    return { ...seriesData, title };
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
        rating: doc.rating || null,
        genre: doc.genre || null,
        plot: doc.plot || null,
        runtime: doc.runtime || null
    };
}

const SeriesModel = {
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

    getCatalogSeries: async () => {
        if (!db) return [];
        try {
            const snapshot = await db.collection("movies").where("type", "==", "series").limit(5000).get();
            return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error al leer el catálogo de series:", error.message || error);
            throw new Error("No se pudo leer el catálogo de series");
        }
    },

    findCatalogSeries: async ({ title, year, imdbID }) => {
        const series = await SeriesModel.getCatalogSeries();
        const wantedId = String(imdbID || "").trim().toLowerCase();
        const wantedTitle = String(title || "").trim().toLowerCase();
        const wantedYear = String(year || "").trim();
        return series.find((serie) => {
            if (wantedId && String(serie.imdbID || "").toLowerCase() !== wantedId) return false;
            if (!wantedId && String(serie.title || "").trim().toLowerCase() !== wantedTitle) return false;
            return !wantedYear || String(serie.year || "").includes(wantedYear);
        }) || null;
    },

    searchCatalog: async ({ query, year, page }) => {
        const series = await SeriesModel.getCatalogSeries();
        const wanted = String(query || "").trim().toLowerCase();
        const wantedYear = String(year || "").trim();
        const pageNumber = Math.min(Math.max(Number.parseInt(page, 10) || 1, 1), 100);
        const matches = series.filter((serie) => {
            if (!String(serie.title || "").toLowerCase().includes(wanted)) return false;
            return !wantedYear || String(serie.year || "").includes(wantedYear);
        });
        const unique = [];
        const seen = new Set();
        for (const serie of matches) {
            const key = String(serie.imdbID || `${serie.title}|${serie.year}`).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(serie);
        }
        const pageSize = 10;
        const start = (pageNumber - 1) * pageSize;
        return { results: unique.slice(start, start + pageSize), totalResults: unique.length };
    },

    saveToDatabase: async (seriesData, userId) => {
        if (!userId) {
            throw new Error("Requiere iniciar sesión");
        }
        const clean = validateSeriesData(seriesData);
        const ownerSuffix = slugifyTitle(String(userId));
        const seriesId = buildId(clean.title, clean.year) + "__" + ownerSuffix;
        const doc = {
            ...clean,
            userId,
            createdAt: clean.createdAt || new Date().toISOString()
        };

        if (!db) {
            const existing = localSeries.find((m) => m.id === seriesId);
            if (existing) {
                console.log(`La serie "${clean.title}" ya está guardada (modo local).`);
                return seriesId;
            }
            localSeries.unshift({ id: seriesId, ...doc });
            console.log("Guardado local con ID:", seriesId);
            return seriesId;
        }

        try {
            const docRef = db.collection("movies").doc(seriesId);
            const existing = await docRef.get();

            if (existing.exists) {
                console.log(`La serie "${clean.title}" ya existe en Firestore.`);
                return seriesId;
            }

            await docRef.set(doc);
            console.log("Guardado con ID:", seriesId);
            return seriesId;
        } catch (error) {
            console.error("Error en Firestore:", error.message || error);
            throw new Error("No se pudo guardar en la base de datos");
        }
    },

    getAllSeries: async (userId) => {
        if (!userId) {
            return [];
        }
        if (!db) {
            return sortByDateDesc(localSeries.filter((m) => m.userId === userId && String(m.type || "series").toLowerCase() === "series"));
        }

        try {
            const snapshot = await db.collection("movies").where("userId", "==", userId).get();
            const series = [];
            snapshot.forEach((doc) => {
                const data = doc.data() || {};
                if (String(data.type || "series").toLowerCase() === "series") {
                    series.push({ id: doc.id, ...data });
                }
            });
            return sortByDateDesc(series);
        } catch (error) {
            console.error("Error al listar series:", error.message || error);
            throw new Error("No se pudo listar la base de datos");
        }
    },

    claimOrphanSeries: async (userId) => {
        if (!userId) return 0;
        if (!db) {
            let claimed = 0;
            localSeries.forEach((m) => {
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
                if (!data.userId && String(data.type || "").toLowerCase() === "series") {
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
            console.error("Error al reclamar series:", error.message || error);
            return 0;
        }
    },

    getSeriesById: async (id, userId) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            return localSeries.find((m) => m.id === id && m.userId === userId) || null;
        }
        const doc = await db.collection("movies").doc(id).get();
        if (!doc.exists) return null;
        const data = doc.data() || {};
        if (data.userId !== userId) return null;
        return { id: doc.id, ...data };
    },

    deleteSeries: async (id, userId) => {
        if (!id) throw new Error("Falta el id");
        if (!db) {
            const idx = localSeries.findIndex((m) => m.id === id && m.userId === userId);
            if (idx === -1) return false;
            localSeries.splice(idx, 1);
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

    getPopularFromDb: async ({ year, limit }) => {
        const want = Math.min(Math.max(Number.parseInt(limit, 10) || 12, 1), 30);
        const yearStr = year ? String(year).trim() : "";

        let docs = [];
        if (!db) {
            return [];
        } else {
            try {
                const snapshot = await db
                    .collection("movies")
                    .where("type", "==", "series")
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

        let filtered = docs.filter((m) => {
            const t = String(m.type || "").toLowerCase();
            if (t && t !== "series") return false;
            if (!m.title) return false;
            if (yearStr) {
                const yField = String(m.year || "");
                if (!yField.includes(yearStr)) return false;
            }
            return true;
        });

        if (filtered.length === 0 && db && !yearStr) {
            try {
                const fallback = await db.collection("movies").limit(500).get();
                const all = [];
                fallback.forEach((d) => {
                    all.push({ id: d.id, ...d.data() });
                });
                filtered = all.filter((m) => {
                    const t = String(m.type || "").toLowerCase();
                    if (!t) return !!m.title;
                    return t === "series" && !!m.title;
                });
            } catch (e) {
                return [];
            }
        }

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

        const withPoster = unique.filter((m) => !!m.poster);
        const pool = withPoster.length >= want ? withPoster : unique;

        return shuffleInPlace([...pool]).slice(0, want).map(toPopularItem);
    }
};

module.exports = { SeriesModel };