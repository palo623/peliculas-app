const { useState, useEffect } = React;

const PLACEHOLDER_POSTER = "https://via.placeholder.com/300x450?text=Sin+imagen";

function App() {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState(null);
    const [movies, setMovies] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingList, setLoadingList] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchMovies();
    }, []);

    const fetchMovies = async () => {
        setLoadingList(true);
        try {
            const res = await fetch("/api/movies");
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error al cargar películas");
            }
            // El back puede devolver objeto de error: garantizamos array.
            setMovies(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error("Error al cargar películas:", e);
            setMovies([]);
            setError(e.message);
        } finally {
            setLoadingList(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setSuccess(null);
        setResult(null);

        try {
            const res = await fetch(`/api/movies/search?t=${encodeURIComponent(query.trim())}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error al buscar");
            }

            // El back devuelve formato limpio en minúsculas: title, year, poster...
            setResult(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!result) return;

        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch("/api/movies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(result)
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Error al guardar");
            }

            setResult(null);
            setQuery("");
            setSuccess(`Guardada con id: ${data.id}`);
            await fetchMovies();
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Eliminar esta película?")) return;
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(`/api/movies/${encodeURIComponent(id)}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Error al eliminar");
            }
            setSuccess("Película eliminada");
            await fetchMovies();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <div className="app">
            <h1>Películas y Series</h1>

            <form onSubmit={handleSearch} className="search-form">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar película... (ej. Inception)"
                    maxLength={100}
                />
                <button type="submit" disabled={loading}>
                    {loading ? "Buscando..." : "Buscar"}
                </button>
            </form>

            {error && <p className="error">{error}</p>}
            {success && <p className="success">{success}</p>}

            {result && (
                <div className="result">
                    <div className="result-content">
                        <img
                            src={result.poster || PLACEHOLDER_POSTER}
                            alt={result.title}
                            className="poster"
                            loading="lazy"
                        />
                        <div className="result-info">
                            <h2>{result.title} ({result.year})</h2>
                            <p><strong>Director:</strong> {result.director}</p>
                            <p><strong>Género:</strong> {result.genre}</p>
                            {result.actors && <p><strong>Actores:</strong> {result.actors}</p>}
                            {result.rating && <p><strong>Nota IMDb:</strong> {result.rating}</p>}
                            <p><strong>Sinopsis:</strong> {result.plot}</p>
                            <button onClick={handleSave} disabled={saving}>
                                {saving ? "Guardando..." : "Guardar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <h2>Películas guardadas ({movies.length})</h2>
            {loadingList && <p className="muted">Cargando lista...</p>}
            {!loadingList && movies.length === 0 && (
                <p className="muted">Aún no hay películas guardadas. Busca una y pulsa Guardar.</p>
            )}
            <div className="movies-grid">
                {movies.map((movie) => (
                    <div key={movie.id} className="movie-card">
                        <img
                            src={movie.poster || PLACEHOLDER_POSTER}
                            alt={movie.title}
                            loading="lazy"
                        />
                        <div className="movie-card-body">
                            <h3>{movie.title} ({movie.year})</h3>
                            <p>{movie.genre}</p>
                            <button
                                className="delete-btn"
                                onClick={() => handleDelete(movie.id)}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
