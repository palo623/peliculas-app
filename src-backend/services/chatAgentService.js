const { MovieModel } = require("../models/movieModel");
const { SeriesModel } = require("../models/seriesModel");
const firebaseConn = require("../models/firebase");

const db = firebaseConn.getDb();

const SYSTEM_PROMPT = `Eres CineBot, el asistente virtual especializado de CineAIros, una web de películas y series.
Tu misión es ayudar al usuario a:
1. Navegar por la aplicación (explicar cómo buscar, guardar, ver su colección, etc.)
2. Recomendar películas y series basándote en sus gustos
3. Responder preguntas sobre películas/series concretas (año, género, director, actores, sinopsis, nota IMDb)
4. Ayudar con funcionalidades de la cuenta (Top 5, amigos, reseñas, etc.)

REGLAS IMPORTANTES:
- Responde SIEMPRE en español, de forma amable, cercana y útil.
- NO inventes datos: si no sabes algo, dilo honestamente y sugiere buscar en la app.
- Usa las herramientas disponibles (buscar en catálogo, obtener populares, ver colección del usuario) cuando sea relevante.
- Sé conciso pero completo. Máximo 3-4 párrafos por respuesta.
- Si el usuario pide una recomendación, pregunta sus gustos si no los conoces.
- Conoce la estructura de la app: Inicio, Películas, Series, Mi Cuenta (con Top 5, colección, amigos, reseñas).
- El usuario puede estar logueado o no. Adapta tus respuestas.
- Puedes sugerir acciones concretas: "Ve a la pestaña Películas y busca...", "En tu colección verás...", etc.

HERRAMIENTAS DISPONIBLES (las invoca el backend, tú solo pides que se usen):
- searchMovie(title, year?): busca película exacta en catálogo
- searchSeries(title, year?): busca serie exacta en catálogo
- listMovies(query, page?, year?): lista de películas por búsqueda
- listSeries(query, page?, year?): lista de series por búsqueda
- getPopularMovies(limit?, year?): películas populares aleatorias
- getPopularSeries(limit?, year?): series populares aleatorias
- getUserMovies(userId): películas guardadas del usuario
- getUserSeries(userId): series guardadas del usuario
- getUserPrefs(userId): preferencias del usuario (géneros favoritos, etc.)`;

async function callAI(messages, tools) {
    const isGemini = !!process.env.GEMINI_API_KEY;
    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || (isGemini ? "https://generativelanguage.googleapis.com/v1beta/openai/" : "https://api.openai.com/v1");
    const model = process.env.CHAT_MODEL || (isGemini ? "gemini-1.5-flash" : "gpt-4o-mini");

    if (!apiKey) {
        return {
            content: "Mi cerebro de IA no está configurado aún. Puedo ayudarte con info básica de la app: busca en Películas o Series, guarda favoritos en tu colección, crea tu Top 5, añade amigos y escribe reseñas. ¿En qué te echo una mano?",
            toolCalls: []
        };
    }

    const payload = {
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools,
        tool_choice: "auto",
        temperature: 0.7,
        max_tokens: 800
    };

    try {
        const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error("[ChatAgent] AI error:", res.status, err);
            return { content: "Ups, mi cerebro ha fallado momentáneamente. Inténtalo de nuevo en unos segundos.", toolCalls: [] };
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        if (!choice?.message) {
            return { content: "No he podido generar respuesta. Prueba de nuevo.", toolCalls: [] };
        }

        return {
            content: choice.message.content || "",
            toolCalls: choice.message.tool_calls || []
        };
    } catch (e) {
        console.error("[ChatAgent] Network error:", e);
        return { content: "Problema de conexión con mi cerebro. Revisa tu internet e inténtalo de nuevo.", toolCalls: [] };
    }
}

const TOOLS = [
    {
        type: "function",
        function: {
            name: "searchMovie",
            description: "Busca una película exacta por título (y opcionalmente año) en el catálogo",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Título de la película" },
                    year: { type: "string", description: "Año (opcional)" }
                },
                required: ["title"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "searchSeries",
            description: "Busca una serie exacta por título (y opcionalmente año) en el catálogo",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Título de la serie" },
                    year: { type: "string", description: "Año (opcional)" }
                },
                required: ["title"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "listMovies",
            description: "Lista películas por búsqueda de texto (búsqueda difusa)",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Texto de búsqueda" },
                    page: { type: "number", description: "Página (default 1)" },
                    year: { type: "string", description: "Año (opcional)" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "listSeries",
            description: "Lista series por búsqueda de texto (búsqueda difusa)",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Texto de búsqueda" },
                    page: { type: "number", description: "Página (default 1)" },
                    year: { type: "string", description: "Año (opcional)" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getPopularMovies",
            description: "Obtiene una muestra aleatoria de películas populares del catálogo",
            parameters: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Cantidad (default 5, max 10)" },
                    year: { type: "string", description: "Año (opcional)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getPopularSeries",
            description: "Obtiene una muestra aleatoria de series populares del catálogo",
            parameters: {
                type: "object",
                properties: {
                    limit: { type: "number", description: "Cantidad (default 5, max 10)" },
                    year: { type: "string", description: "Año (opcional)" }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getUserMovies",
            description: "Obtiene las películas guardadas en la colección del usuario (requiere userId)",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "ID del usuario" }
                },
                required: ["userId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getUserSeries",
            description: "Obtiene las series guardadas en la colección del usuario (requiere userId)",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "ID del usuario" }
                },
                required: ["userId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getUserPrefs",
            description: "Obtiene las preferencias del usuario (géneros favoritos, etc.)",
            parameters: {
                type: "object",
                properties: {
                    userId: { type: "string", description: "ID del usuario" }
                },
                required: ["userId"]
            }
        }
    }
];

async function executeTool(name, args, userId) {
    try {
        switch (name) {
            case "searchMovie": {
                const movie = await MovieModel.findCatalogMovie({ title: args.title, year: args.year });
                return movie ? { found: true, movie } : { found: false, message: "Película no encontrada en catálogo" };
            }
            case "searchSeries": {
                const serie = await SeriesModel.findCatalogSeries({ title: args.title, year: args.year });
                return serie ? { found: true, serie } : { found: false, message: "Serie no encontrada en catálogo" };
            }
            case "listMovies": {
                const data = await MovieModel.searchCatalog({ query: args.query, page: args.page, year: args.year });
                return { results: data.results || [], totalResults: data.totalResults };
            }
            case "listSeries": {
                const data = await SeriesModel.searchCatalog({ query: args.query, page: args.page, year: args.year });
                return { results: data.results || [], totalResults: data.totalResults };
            }
            case "getPopularMovies": {
                const limit = Math.min(args.limit || 5, 10);
                const movies = await MovieModel.getPopularFromDb({ year: args.year, limit });
                return { movies };
            }
            case "getPopularSeries": {
                const limit = Math.min(args.limit || 5, 10);
                const series = await SeriesModel.getPopularFromDb({ year: args.year, limit });
                return { series };
            }
            case "getUserMovies": {
                if (!userId) return { error: "Usuario no autenticado" };
                const movies = await MovieModel.getAllMovies(userId);
                return { movies: movies || [] };
            }
            case "getUserSeries": {
                if (!userId) return { error: "Usuario no autenticado" };
                const series = await SeriesModel.getAllSeries(userId);
                return { series: series || [] };
            }
            case "getUserPrefs": {
                if (!userId) return { error: "Usuario no autenticado" };
                const userDoc = await db.collection("users").doc(userId).get();
                if (!userDoc.exists) return { error: "Usuario no encontrado" };
                const data = userDoc.data() || {};
                return { prefs: data.prefs || {} };
            }
            default:
                return { error: `Herramienta desconocida: ${name}` };
        }
    } catch (e) {
        console.error(`[ChatAgent] Tool ${name} error:`, e);
        return { error: e.message || "Error ejecutando herramienta" };
    }
}

async function processChat(messages, userId) {
    let currentMessages = [...messages];
    let iterations = 0;
    const maxIterations = 3;

    while (iterations < maxIterations) {
        iterations++;
        const response = await callAI(currentMessages, TOOLS);

        if (response.toolCalls && response.toolCalls.length > 0) {
            currentMessages.push({
                role: "assistant",
                content: response.content || null,
                tool_calls: response.toolCalls
            });

            for (const toolCall of response.toolCalls) {
                const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments), userId);
                currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }
            continue;
        }

        return response.content || "No he podido generar respuesta.";
    }

    return "He llegado al límite de herramientas. ¿Puedes reformular tu pregunta?";
}

module.exports = { processChat };