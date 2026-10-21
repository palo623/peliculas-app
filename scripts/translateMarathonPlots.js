/**
 * Traduce al castellano las sinopsis (`items[].plot`) de los maratones, que se
 * guardan en inglés porque el catálogo las importa de OMDb.
 *
 * Por cada obra traducida guarda en el item:
 *   - plot:         la sinopsis en castellano (lo que muestra la web).
 *   - plotOriginal: la sinopsis original en inglés (para no perder el dato).
 *   - plotLang:     "es" (marca para no volver a traducirla).
 *
 * Además propaga la traducción al catálogo (`movies`/`series`) para que
 * `seedMarathons.js --sync-plots` no vuelva a copiar el inglés a los maratones.
 *
 * Es idempotente: las obras ya marcadas con plotLang "es" se omiten, y si el
 * catálogo ya tiene la sinopsis traducida se reaprovecha sin gastar cuota.
 *
 * Uso:
 *   node scripts/translateMarathonPlots.js                        # Gemini si hay clave; si no, Ollama
 *   node scripts/translateMarathonPlots.js --dry-run              # solo cuenta
 *   node scripts/translateMarathonPlots.js --limit=20             # máximo de sinopsis únicas
 *   node scripts/translateMarathonPlots.js --force                # retraduce desde plotOriginal
 *   node scripts/translateMarathonPlots.js --provider=ollama      # fuerza modelo local
 *   node scripts/translateMarathonPlots.js --provider=gemini      # fuerza Gemini
 *   node scripts/translateMarathonPlots.js --model=llama3.2:3b    # modelo de Ollama
 *
 * Requiere credenciales Firebase en .env. Gemini necesita GEMINI_API_KEY;
 * Ollama necesita el servidor local en marcha (por defecto 127.0.0.1:11434).
 */
// Carga mínima de .env (igual que server.js) ANTES de requerir los servicios,
// porque leen process.env al importarse.
const fs = require("fs");
const path = require("path");

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
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}
loadEnvFile();

const firebaseConn = require("../src-backend/models/firebase");
const geminiService = require("../src-backend/services/geminiService");

const db = firebaseConn.getDb();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
// --force vuelve a traducir todo lo que tenga plotOriginal (inglés), ignorando
// la marca plotLang. Sirve para corregir una tanda con calidad mejorable sin
// traducir por error un texto que ya está en castellano.
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const maxUnique = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) || 0 : 0;

// Proveedor de traducción:
//   gemini -> API de Gemini (requiere GEMINI_API_KEY).
//   ollama -> modelo local vía Ollama (no gasta cuota; útil si falta la clave).
// Por defecto usa Gemini si está configurado; si no, Ollama.
const providerArg = args.find((a) => a.startsWith("--provider="));
const requestedProvider = providerArg ? providerArg.split("=")[1].trim().toLowerCase() : null;
const provider = requestedProvider || (geminiService.isConfigured() ? "gemini" : "ollama");
const modelArg = args.find((a) => a.startsWith("--model="));
const ollamaModel = modelArg
    ? modelArg.split("=")[1].trim()
    : (process.env.OLLAMA_TRANSLATE_MODEL || "gemma4:e4b");
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

const PLACEHOLDER = "Sin sinopsis disponible.";
const SENTENCE_BATCH = 10;   // sinopsis únicas por llamada a la IA
const WRITE_BATCH = 400;     // escrituras por lote de Firestore
const PAUSE_MS = 4500;       // pausa entre llamadas (respeta el límite por minuto)
const OLLAMA_TIMEOUT_MS = 120000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanTranslation(value) {
    let out = String(value || "").trim();
    out = out.replace(/^```(?:json|text)?/i, "").replace(/```$/i, "").trim();
    out = out.replace(/^["'“”]+|["'“”]+$/g, "").trim();
    if (out.startsWith("{")) {
        try {
            const obj = JSON.parse(out);
            out = String(obj.t || obj.traduccion || obj.translation || "").trim();
        } catch (e) {
            /* no era JSON: se deja el texto tal cual */
        }
    }
    return out || null;
}

// Traduce una sinopsis con un modelo local de Ollama. Se hace de una en una
// para que el modelo no tenga que alinear índices y sea más fiable.
async function translateWithOllama(text) {
    const prompt = [
        "Eres un traductor profesional de inglés a español (castellano de España).",
        "Traduce la siguiente sinopsis de una película o serie para la ficha de una web española.",
        "Reglas:",
        "- Traduce también nombres de lugares, objetos, organizaciones, especies y conceptos a su forma habitual en español (Middle-earth = Tierra Media, The Shire = La Comarca, One Ring = el Anillo Único, Death Star = la Estrella de la Muerte).",
        "- Mantén sin traducir únicamente los nombres de personas y los títulos de obras.",
        "- Usa un castellano natural y cuidado; evita calcos del inglés y el voseo.",
        "- Traduce el texto completo, sin resumirlo ni añadir información.",
        "- Devuelve ÚNICAMENTE la traducción, sin comillas ni explicaciones.",
        "",
        "Sinopsis:",
        text
    ].join("\n");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: ollamaModel,
                prompt,
                stream: false,
                // Los modelos con capacidad de razonamiento (p. ej. gemma4)
                // invierten minutos en "pensar" cada sinopsis; para traducir
                // sólo hace falta la respuesta, así que se desactiva.
                think: false,
                options: { temperature: 0.2 }
            }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`Ollama respondió ${res.status}`);
        const data = await res.json();
        return cleanTranslation(data && data.response);
    } finally {
        clearTimeout(timer);
    }
}

(async () => {
    if (!db) {
        console.error("Firestore no está conectado. Revisa FIREBASE_* en .env.");
        process.exit(1);
    }
    if (provider !== "gemini" && provider !== "ollama") {
        console.error(`Proveedor no válido: "${provider}". Usa --provider=gemini o --provider=ollama.`);
        process.exit(1);
    }

    // 1) Catálogo: sirve para reaprovechar sinopsis ya traducidas y para
    //    propagar las nuevas traducciones a movies/series.
    const catalog = new Map(); // imdbID -> { ref, plot, plotOriginal, plotLang }
    for (const collection of ["movies", "series"]) {
        const snap = await db.collection(collection).limit(20000).get();
        snap.forEach((doc) => {
            const data = doc.data() || {};
            const imdbID = String(data.imdbID || "").toLowerCase();
            if (imdbID && !catalog.has(imdbID)) {
                catalog.set(imdbID, {
                    ref: doc.ref,
                    plot: data.plot || null,
                    plotOriginal: data.plotOriginal || null,
                    plotLang: data.plotLang || null
                });
            }
        });
        console.log(`  ${collection}: ${snap.size} documentos leídos`);
    }

    // 2) Maratones: localizamos las obras pendientes de traducir.
    const marathonSnap = await db.collection("marathons").get();
    const docs = marathonSnap.docs.map((doc) => ({ ref: doc.ref, data: doc.data() || {} }));
    const pending = docs.map(() => new Map()); // docIdx -> Map(itemIdx -> { translation, original })
    const aiTargets = []; // { docIdx, itemIdx, original, imdbID }
    let fromCatalog = 0;

    docs.forEach((entry, docIdx) => {
        const items = Array.isArray(entry.data.items) ? entry.data.items : [];
        items.forEach((item, itemIdx) => {
            const original = String(item.plot || "").trim();
            if (!original || original === PLACEHOLDER) return;
            const imdbID = String(item.imdbID || "").toLowerCase();

            if (force) {
                // Sólo se puede retraducir si conservamos el inglés original;
                // así nunca se le pasa a la IA un texto que ya está en castellano.
                const source = String(item.plotOriginal || "").trim();
                if (source) aiTargets.push({ docIdx, itemIdx, original: source, imdbID });
                return;
            }
            if (item.plotLang === "es") return;              // ya traducida

            const cat = imdbID ? catalog.get(imdbID) : null;
            if (cat && cat.plotLang === "es" && String(cat.plot || "").trim()) {
                pending[docIdx].set(itemIdx, {
                    translation: String(cat.plot).trim(),
                    original: String(cat.plotOriginal || original).trim()
                });
                fromCatalog++;
                return;
            }
            aiTargets.push({ docIdx, itemIdx, original, imdbID });
        });
    });

    const uniqueTexts = [...new Set(aiTargets.map((t) => t.original))];
    if (maxUnique > 0) uniqueTexts.length = Math.min(uniqueTexts.length, maxUnique);

    console.log(`Maratones: ${docs.length} · obras ya en castellano en el catálogo: ${fromCatalog}`);
    console.log(`Obras pendientes de traducir: ${aiTargets.length} · sinopsis únicas: ${uniqueTexts.length}`);
    if (uniqueTexts.length === 0 && fromCatalog === 0) {
        console.log("Nada que traducir. Todas las sinopsis de maratones ya están en castellano.");
        process.exit(0);
    }
    if (dryRun) {
        console.log(`Proveedor elegido: ${provider}${provider === "ollama" ? ` (${ollamaModel})` : ""}`);
        console.log("Dry-run: no se llamará a la IA ni se escribirá en Firestore.");
        process.exit(0);
    }

    if (provider === "gemini" && !geminiService.isConfigured()) {
        console.error("GEMINI_API_KEY no definida. Añádela a .env o usa --provider=ollama.");
        process.exit(1);
    }
    if (provider === "ollama") {
        console.log(`Proveedor: Ollama local (${ollamaModel})`);
    }

    // 3) Traducir las sinopsis únicas.
    const translations = new Map(); // inglés -> castellano
    const batchSize = provider === "ollama" ? 1 : SENTENCE_BATCH;
    for (let i = 0; i < uniqueTexts.length; i += batchSize) {
        const slice = uniqueTexts.slice(i, i + batchSize);
        const result = provider === "ollama"
            ? [await translateWithOllama(slice[0])]
            : await geminiService.translateTexts(slice);
        slice.forEach((text, j) => {
            const value = result && result[j];
            if (value) translations.set(text, value);
        });
        console.log(`  Traducidas ${translations.size}/${uniqueTexts.length}`);
        if (provider === "gemini" && i + batchSize < uniqueTexts.length) await delay(PAUSE_MS);
    }

    if (uniqueTexts.length > 0 && translations.size === 0) {
        console.error("La IA no devolvió ninguna traducción. Revisa GEMINI_API_KEY / cuota.");
        process.exitCode = 1;
        process.exit(1);
    }

    // 4) Volcar las traducciones a cada maratón y preparar las del catálogo.
    const catalogUpdates = new Map(); // imdbID -> { ref, plot, original }
    for (const target of aiTargets) {
        const translated = translations.get(target.original);
        if (!translated) continue;
        pending[target.docIdx].set(target.itemIdx, {
            translation: translated,
            original: target.original
        });
        const cat = target.imdbID ? catalog.get(target.imdbID) : null;
        if (cat && (force || cat.plotLang !== "es")) {
            catalogUpdates.set(target.imdbID, {
                ref: cat.ref,
                plot: translated,
                original: target.original
            });
        }
    }

    let itemsUpdated = 0;
    for (let docIdx = 0; docIdx < docs.length; docIdx++) {
        const ops = pending[docIdx];
        if (!ops || ops.size === 0) continue;
        const items = Array.isArray(docs[docIdx].data.items) ? docs[docIdx].data.items : [];
        const nextItems = items.map((item, itemIdx) => {
            const op = ops.get(itemIdx);
            if (!op) return item;
            itemsUpdated++;
            return {
                ...item,
                plot: op.translation,
                plotOriginal: op.original,
                plotLang: "es"
            };
        });
        await docs[docIdx].ref.set(
            { items: nextItems, updatedAt: new Date().toISOString() },
            { merge: true }
        );
    }

    // 5) Propagar al catálogo para que `seedMarathons --sync-plots` no vuelva
    //    a copiar el inglés.
    const updates = [...catalogUpdates.values()];
    let catalogUpdated = 0;
    for (let i = 0; i < updates.length; i += WRITE_BATCH) {
        const batch = db.batch();
        updates.slice(i, i + WRITE_BATCH).forEach((u) => {
            batch.update(u.ref, {
                plot: u.plot,
                plotOriginal: u.original,
                plotLang: "es"
            });
        });
        await batch.commit();
        catalogUpdated += Math.min(WRITE_BATCH, updates.length - i);
    }

    const totalPending = aiTargets.length + fromCatalog;
    const skipped = totalPending - itemsUpdated;
    console.log(`Hecho. Obras de maratón actualizadas: ${itemsUpdated}. Sinopsis únicas traducidas: ${translations.size}. Catálogo actualizado: ${catalogUpdated}.`);
    if (skipped > 0) {
        console.log(`Ojo: ${skipped} obras siguen en inglés (la IA no devolvió su traducción). Relanza el script.`);
    }
    process.exit(0);
})().catch((err) => {
    console.error("Error:", err.message || err);
    process.exit(1);
});
