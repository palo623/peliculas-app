// Clasificación automática de sentimiento de las reseñas.
//
// Estrategia (tarea 7 del proyecto: "Integrar análisis de sentimiento con IA"):
//   1. Se analiza el texto y se etiqueta como positive | negative | neutral.
//      Se guarda `score` en [-1, 1] y `magnitude`, la misma forma que usa el
//      panel de administración del equipo (positivas / negativas / neutras).
//   2. Por defecto se usa un analizador léxico ES/EN, que funciona sin clave ni
//      conexión y es instantáneo (se ejecuta al guardar la reseña).
//   3. Si hay una IA configurada (Gemini o OpenAI) se puede refinar la
//      clasificación con analyzeSentimentAI(), usado por el endpoint de
//      administración y por el script de dataset.
//
// Variables de entorno (todas opcionales):
//   SENTIMENT_PROVIDER = auto | lexicon | gemini | openai   (por defecto auto)
//   GEMINI_API_KEY  (o GOOGLE_API_KEY)   + GEMINI_MODEL      (por defecto gemini-2.0-flash)
//   OPENAI_API_KEY                        + OPENAI_MODEL      (por defecto gpt-4o-mini)
//   SENTIMENT_AI_TIMEOUT_MS                                  (por defecto 8000)
//
// El módulo NUNCA expone las claves en las respuestas: solo el nombre del
// proveedor utilizado y, si falla, un motivo genérico.

const VERSION = "lexicon-es-en-v1";
const LABELS = ["positive", "negative", "neutral"];

// ---- Léxico (sin acentos: el texto se normaliza antes de comparar) ----
// Peso 2 = términos muy fuertes ("obra maestra", "horrible").
const POSITIVE = {
    // Español
    bueno: 1, buena: 1, buenisimo: 1, buenisima: 1, excelente: 2, increible: 2,
    genial: 2, maravilloso: 2, maravillosa: 2, fantastico: 2, fantastica: 2,
    espectacular: 2, perfecto: 2, perfecta: 2, impresionante: 2, magistral: 2,
    sublime: 2, magnifico: 2, magnifica: 2, sobresaliente: 2, notable: 1,
    encanta: 2, encanto: 2, amo: 1, ame: 1, gustado: 1, gusto: 1, disfrute: 1,
    divertido: 1, divertida: 1, emocionante: 2, conmovedor: 2, conmovedora: 2,
    brillante: 2, solido: 1, solida: 1, entretenido: 1, entretenida: 1,
    original: 1, fresca: 1, fresco: 1, precioso: 1, preciosa: 1, hermoso: 1,
    hermosa: 1, interesante: 1, sorprendente: 2, cautivador: 2, cautivadora: 2,
    adictivo: 1, adictiva: 1, recomendable: 1, recomendada: 1, recomendado: 1,
    mejor: 1, favorita: 1, favorito: 1,    gratamente: 1, sorprendido: 1,
    inolvidable: 2, memorable: 1, redonda: 1, redondo: 1,
    // Inglés
    good: 1, great: 2, excellent: 2, amazing: 2, awesome: 2, incredible: 2,
    fantastic: 2, wonderful: 2, brilliant: 2, masterpiece: 2, love: 2,
    loved: 2, enjoy: 1, enjoyed: 1, entertaining: 1,
    compelling: 2, moving: 1, touching: 1, beautiful: 2,
    stunning: 2, impressive: 2, recommend: 1, recommended: 1, best: 2,
    favorite: 1, favourite: 1, superb: 2, outstanding: 2, refreshing: 1,
    clever: 1, witty: 1, charming: 2, delightful: 2, gripping: 2,
    heartwarming: 2, funny: 1, hilarious: 2, perfect: 2, well: 1, solid: 1
};

const NEGATIVE = {
    // Español
    malo: 1, mala: 1, malisimo: 2, malisima: 2, pesimo: 2, pesima: 2,
    horrible: 2, terrible: 2, aburrido: 2, aburrida: 2, aburridisimo: 2,
    decepcionante: 2, decepcion: 2, decepcionado: 2, decepcionada: 2,
    flojo: 1, floja: 1, predecible: 1, lento: 1, lenta: 1, pesado: 1,
    pesada: 1, tedioso: 2, tediosa: 2, insufrible: 2, desastre: 2,
    desastroso: 2, desperdicio: 2, basura: 2, espantoso: 2, espantosa: 2,
    patetico: 2, patetica: 2, ridiculo: 2, ridicula: 2, incoherente: 2,
    confuso: 1, confusa: 1, sinsentido: 2, vacio: 1, vacia: 1, soso: 1,
    sosa: 1, mediocre: 1, innecesario: 1, innecesaria: 1, vergonzoso: 2,
    lamentable: 2, pobre: 1, fallido: 1, fallida: 1, olvidable: 1,
    forzado: 1, forzada: 1, desperdiciado: 2, insultante: 2, cutre: 2,
    // Inglés
    bad: 1, awful: 2, terrible: 2, horrible: 2, boring: 2, bored: 1,
    disappointing: 2, disappointed: 2, disappointment: 2, dull: 1, slow: 1,
    predictable: 1, tedious: 2, waste: 2, wasted: 2, garbage: 2, trash: 2,
    ridiculous: 2, nonsense: 2, incoherent: 2, confusing: 1, confused: 1,
    messy: 1, weak: 1, lame: 2, mediocre: 1, forgettable: 1, pointless: 2,
    cringeworthy: 2, poor: 1, annoying: 2, frustrating: 2, worst: 2,
    hate: 2, hated: 2, overrated: 2, unnecessary: 1, bland: 1, cheesy: 1,
    flat: 1, cliche: 1, flawed: 1
};

const NEGATIONS = new Set([
    "no", "ni", "nunca", "jamas", "tampoco", "sin", "nada", "apenas",
    "ningun", "ninguna", "ninguno",
    "not", "never", "none", "nothing", "hardly", "barely", "without",
    "isnt", "wasnt", "dont", "doesnt", "didnt", "cant", "couldnt",
    "wont", "wouldnt", "arent", "aint"
]);

const INTENSIFIERS = new Set([
    "muy", "super", "extremadamente", "demasiado", "increiblemente",
    "realmente", "tan", "bastante", "totalmente",
    "very", "really", "extremely", "incredibly", "so", "too", "totally",
    "absolutely", "highly"
]);

const NEGATION_WINDOW = 3; // cuántas palabras atrás se busca una negación

function normalizeForMatch(text) {
    return String(text == null ? "" : text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text) {
    return normalizeForMatch(text)
        .split(/[^a-z0-9']+/)
        .filter(Boolean);
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}

// Analizador léxico: instantáneo, determinista y sin red.
// Umbral de la banda neutra. Coincide con el que usa el equipo para pintar la
// distribución (|score| <= 0.2 es neutro).
const NEUTRAL_BAND = 0.2;

function analyzeLexicon(text) {
    const tokens = tokenize(text);
    let raw = 0;   // suma de pesos con signo
    let mass = 0;  // suma de pesos en valor absoluto (magnitud)
    let positives = 0;
    let negatives = 0;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const isPositive = Object.prototype.hasOwnProperty.call(POSITIVE, token);
        const isNegative = Object.prototype.hasOwnProperty.call(NEGATIVE, token);
        if (!isPositive && !isNegative) continue;

        let weight = isPositive ? POSITIVE[token] : -NEGATIVE[token];

        // Intensificador inmediatamente anterior.
        if (INTENSIFIERS.has(tokens[i - 1])) weight *= 1.5;

        // Negación en la ventana anterior: invierte la polaridad.
        let negated = false;
        for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
            if (NEGATIONS.has(tokens[j])) {
                negated = true;
                break;
            }
        }
        if (negated) weight *= -1;

        raw += weight;
        mass += Math.abs(weight);
        if (weight > 0) positives += 1;
        else if (weight < 0) negatives += 1;
    }

    // `score` normalizado a [-1, 1] con tanh, igual que la forma que espera el
    // panel del equipo (bandas 0.2 / 0.6). `magnitude` es la intensidad total.
    const score = clamp(Math.tanh(raw / 3), -1, 1);
    const label = score >= NEUTRAL_BAND ? "positive" : score <= -NEUTRAL_BAND ? "negative" : "neutral";

    let confidence;
    if (label === "neutral") {
        confidence = clamp(0.75 - Math.abs(score) * 1.5, 0.35, 0.9);
    } else {
        confidence = clamp(0.55 + (Math.abs(score) - NEUTRAL_BAND) * 0.5, 0.55, 0.97);
    }

    return {
        label,
        score: round2(score),
        magnitude: round2(mass),
        confidence: round2(confidence),
        rawScore: round2(raw),
        provider: "lexicon",
        version: VERSION,
        tokens: tokens.length,
        positiveMatches: positives,
        negativeMatches: negatives,
        analyzedAt: new Date().toISOString()
    };
}

// Analizador por defecto (síncrono): se usa al crear/editar una reseña.
function analyzeSentiment(text) {
    return analyzeLexicon(text);
}

// ---- IA externa opcional ----
function aiConfig() {
    const requested = String(process.env.SENTIMENT_PROVIDER || "auto").trim().toLowerCase();
    const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
    const timeoutMs = Math.min(Math.max(Number.parseInt(process.env.SENTIMENT_AI_TIMEOUT_MS, 10) || 8000, 1000), 30000);

    if (requested === "lexicon") return null;
    if (requested === "gemini") {
        return geminiKey ? { provider: "gemini", apiKey: geminiKey, model: process.env.GEMINI_MODEL || "gemini-2.0-flash", timeoutMs } : null;
    }
    if (requested === "openai") {
        return openaiKey ? { provider: "openai", apiKey: openaiKey, model: process.env.OPENAI_MODEL || "gpt-4o-mini", timeoutMs } : null;
    }
    // auto: prefiere Gemini (mismo ecosistema que Firebase), luego OpenAI.
    if (geminiKey) return { provider: "gemini", apiKey: geminiKey, model: process.env.GEMINI_MODEL || "gemini-2.0-flash", timeoutMs };
    if (openaiKey) return { provider: "openai", apiKey: openaiKey, model: process.env.OPENAI_MODEL || "gpt-4o-mini", timeoutMs };
    return null;
}

function labelFromRaw(raw) {
    const v = normalizeForMatch(raw);
    if (/\bpositiv|positive\b/.test(v)) return "positive";
    if (/\bnegativ|negative\b/.test(v)) return "negative";
    if (/\bneutral|neutro|neutra\b/.test(v)) return "neutral";
    return null;
}

const PROMPT = "Clasifica el sentimiento de esta reseña de cine o series como exactamente una palabra: positive, negative o neutral. Responde solo con la palabra.";

async function callAi(text, cfg) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
        let url;
        let body;
        const headers = { "Content-Type": "application/json" };
        if (cfg.provider === "gemini") {
            url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
            body = {
                contents: [{ parts: [{ text: `${PROMPT}\n\nReseña:\n"""${String(text).slice(0, 2000)}"""` }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 8 }
            };
        } else {
            url = "https://api.openai.com/v1/chat/completions";
            headers.Authorization = `Bearer ${cfg.apiKey}`;
            body = {
                model: cfg.model,
                temperature: 0,
                max_tokens: 4,
                messages: [
                    { role: "system", content: PROMPT },
                    { role: "user", content: String(text).slice(0, 2000) }
                ]
            };
        }

        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = cfg.provider === "gemini"
            ? (((data.candidates || [])[0] || {}).content || {}).parts?.[0]?.text
            : (((data.choices || [])[0] || {}).message || {}).content;
        const label = labelFromRaw(raw || "");
        if (!label) throw new Error("respuesta sin etiqueta válida");
        return label;
    } finally {
        clearTimeout(timer);
    }
}

// Clasificación con IA (asíncrona). Si no hay clave o la llamada falla,
// devuelve la clasificación léxica indicando que hubo un fallback.
async function analyzeSentimentAI(text) {
    const cfg = aiConfig();
    if (!cfg) return analyzeSentiment(text);
    try {
        const label = await callAi(text, cfg);
        const base = analyzeLexicon(text);
        return {
            ...base,
            label,
            provider: cfg.provider,
            model: cfg.model,
            version: `${VERSION}+${cfg.provider}`,
            analyzedAt: new Date().toISOString()
        };
    } catch (error) {
        const fallback = analyzeLexicon(text);
        return {
            ...fallback,
            aiFallbackFrom: cfg.provider,
            aiError: String((error && error.message) || "error").slice(0, 120)
        };
    }
}

// Información pública (sin claves) para /api/admin/health y la documentación.
function getSentimentProviderInfo() {
    const cfg = aiConfig();
    return {
        provider: cfg ? cfg.provider : "lexicon",
        aiEnabled: Boolean(cfg),
        model: cfg ? cfg.model : null,
        version: VERSION,
        labels: LABELS.slice()
    };
}

module.exports = {
    analyzeSentiment,
    analyzeSentimentAI,
    getSentimentProviderInfo,
    LABELS
};
