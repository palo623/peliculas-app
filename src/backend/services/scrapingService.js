const cheerio = require("cheerio");

const SCRAPE_TIMEOUT_MS = 10000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Caché simple en memoria para evitar scraping repetido del mismo título
const scrapeCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

function getCached(key) {
    const entry = scrapeCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
        scrapeCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    if (scrapeCache.size >= 200) {
        const oldest = scrapeCache.keys().next().value;
        scrapeCache.delete(oldest);
    }
    scrapeCache.set(key, { at: Date.now(), data });
}

let puppeteer = null;
async function getPuppeteer() {
    if (!puppeteer) {
        try {
            puppeteer = require("puppeteer");
        } catch (e) {
            console.warn("[scrapingService] Puppeteer no disponible:", e.message);
            return null;
        }
    }
    return puppeteer;
}

function buildSearchUrl(title, type) {
    const encodedTitle = encodeURIComponent(title.trim());
    if (type === "series") {
        return `https://www.imdb.com/find?q=${encodedTitle}&s=tt&ttype=tv`;
    }
    return `https://www.imdb.com/find?q=${encodedTitle}&s=tt&ttype=ft`;
}

function buildDetailUrl(imdbId) {
    return `https://www.imdb.com/title/${imdbId}/`;
}

async function fetchHtml(url, usePuppeteer = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
    try {
        if (usePuppeteer) {
            const pptr = await getPuppeteer();
            if (!pptr) throw new Error("Puppeteer no instalado");
            const browser = await pptr.launch({
                headless: "new",
                args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            });
            try {
                const page = await browser.newPage();
                await page.setUserAgent(USER_AGENT);
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: SCRAPE_TIMEOUT_MS });
                const html = await page.content();
                return html;
            } finally {
                await browser.close();
            }
        } else {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8" }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        }
    } catch (err) {
        if (err.name === "AbortError") throw new Error("Timeout en scraping");
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function extractImdbIdFromSearch($) {
    // Selectores múltiples para compatibilidad con cambios en IMDb
    const selectors = [
        "a.ipc-lockup-overlay[href*='/title/tt']",
        "a[href*='/title/tt']",
        ".findResult a[href*='/title/tt']",
        ".ipc-metadata-list-summary-item__t a[href*='/title/tt']"
    ];
    for (const sel of selectors) {
        const href = $(sel).first().attr("href");
        if (href) {
            const match = href.match(/\/title\/(tt\d+)/);
            if (match) return match[1];
        }
    }
    return null;
}

function parseDetailPage($) {
    const data = {};

    // Título - múltiples selectores de respaldo
    const titleSelectors = [
        "h1[data-testid='hero__pageTitle']",
        "h1.ipc-title__text",
        "h1[data-testid='hero-title-block__title']",
        "h1.title",
        ".hero__primary-text"
    ];
    for (const sel of titleSelectors) {
        const text = $(sel).first().text().trim();
        if (text) { data.title = text; break; }
    }

    // Año - múltiples estrategias
    const yearSelectors = [
        "[data-testid='hero-title-block__metadata'] a[href*='releaseinfo']",
        ".ipc-link--baseAlt[href*='releaseinfo']",
        "a[href*='releaseinfo']",
        "[data-testid='title-details-releasedate'] a",
        ".sc-8c396aa2-2 a[href*='releaseinfo']"
    ];
    for (const sel of yearSelectors) {
        const text = $(sel).first().text().trim();
        const match = text.match(/\b(19|20)\d{2}\b/);
        if (match) { data.year = match[0]; break; }
    }
    // Fallback: buscar año en cualquier texto visible
    if (!data.year) {
        const allText = $("body").text();
        const match = allText.match(/\b(19|20)\d{2}\b/);
        if (match) data.year = match[0];
    }

    // Rating - múltiples selectores
    const ratingSelectors = [
        "[data-testid='hero-rating-bar__aggregate-rating__score']",
        "[data-testid='hero-rating-bar__aggregate-rating'] .sc-bde20123-1",
        ".sc-bde20123-1",
        "[itemprop='ratingValue']",
        ".ratingValue strong span"
    ];
    for (const sel of ratingSelectors) {
        const text = $(sel).first().text().trim();
        if (text && /^\d+(\.\d+)?$/.test(text.replace(",", "."))) {
            data.rating = text.replace(",", ".");
            break;
        }
    }

    // Poster - múltiples selectores
    const posterSelectors = [
        "div.ipc-poster img",
        ".ipc-poster img",
        "[data-testid='hero-media__poster'] img",
        ".poster img",
        "img.ipc-image",
        "[data-testid='hero-image'] img"
    ];
    for (const sel of posterSelectors) {
        const src = $(sel).first().attr("src") || $(sel).first().attr("data-src");
        if (src && src.startsWith("http")) { data.poster = src; break; }
    }

    // Géneros - múltiples selectores
    const genreSelectors = [
        "[data-testid='genres'] a",
        ".ipc-chip-list a[href*='/genre/']",
        "a[href*='/genre/']",
        "[data-testid='title-techspec_genre'] a",
        ".genres a"
    ];
    const genres = [];
    for (const sel of genreSelectors) {
        $(sel).each((i, el) => {
            const text = $(el).text().trim();
            if (text && !text.match(/^(Back to|More|Ver m|Ver todo|See all)/i) && !genres.includes(text)) {
                genres.push(text);
            }
        });
        if (genres.length > 0) break;
    }
    data.genre = genres.length > 0 ? genres.join(", ") : null;

    // Plot/Sinopsis - múltiples selectores
    const plotSelectors = [
        "[data-testid='plot-xl']",
        "[data-testid='plot']",
        ".sc-16ede01-2",
        "[data-testid='storyline-plot']",
        ".ipc-html-content-inner-div",
        "[itemprop='description']"
    ];
    for (const sel of plotSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 20) { data.plot = text; break; }
    }

    // Director - múltiples selectores
    const directorSelectors = [
        "[data-testid='title-pc-principal-credit']:first a[href*='/name/']",
        "[data-testid='title-pc-principal-credit']:first .ipc-metadata-list-item__list-content-item a",
        "li[data-testid='title-pc-principal-credit']:first a[href*='/name/']",
        "[data-testid='title-pc-wide-screen'] [data-testid='title-pc-principal-credit']:first a[href*='/name/']"
    ];
    const directors = [];
    for (const sel of directorSelectors) {
        $(sel).each((i, el) => {
            const text = $(el).text().trim();
            if (text && !directors.includes(text)) directors.push(text);
        });
        if (directors.length > 0) break;
    }
    data.director = directors.length > 0 ? directors.join(", ") : null;

    // Actores - múltiples selectores
    const actorSelectors = [
        "[data-testid='title-cast-item'] a[href*='/name/']",
        "[data-testid='title-cast-item__actor'] a[href*='/name/']",
        ".sc-bfec09a1-1 a[href*='/name/']",
        "[data-testid='title-cast-item'] .ipc-metadata-list-item__list-content-item a"
    ];
    const actors = [];
    for (const sel of actorSelectors) {
        $(sel).each((i, el) => {
            const text = $(el).text().trim();
            if (text && actors.length < 6 && !actors.includes(text)) actors.push(text);
        });
        if (actors.length > 0) break;
    }
    data.actors = actors.length > 0 ? actors.join(", ") : null;

    // Runtime - múltiples selectores
    const runtimeSelectors = [
        "[data-testid='title-techspec_runtime']",
        "[data-testid='title-techspec_runtime'] div",
        "li[data-testid='title-techspec_runtime']",
        "[itemprop='duration']"
    ];
    for (const sel of runtimeSelectors) {
        const text = $(sel).first().text().trim();
        if (text && /\d+h/.test(text) || /\d+m/.test(text) || /\d+\s*min/.test(text)) {
            data.runtime = text;
            break;
        }
    }

    return data;
}

async function scrapeImdb(title, type, usePuppeteerForSearch = false) {
    try {
        const searchUrl = buildSearchUrl(title, type);
        let html = await fetchHtml(searchUrl, usePuppeteerForSearch);
        let $ = cheerio.load(html);

        let imdbId = extractImdbIdFromSearch($);

        if (!imdbId && !usePuppeteerForSearch) {
            html = await fetchHtml(searchUrl, true);
            $ = cheerio.load(html);
            imdbId = extractImdbIdFromSearch($);
        }

        if (!imdbId) {
            throw new Error("No se encontró IMDb ID en búsqueda");
        }

        const detailUrl = buildDetailUrl(imdbId);
        html = await fetchHtml(detailUrl, false);
        $ = cheerio.load(html);

        let data = parseDetailPage($);
        data.imdbID = imdbId;
        data.type = type;

        if (!data.title || !data.year) {
            html = await fetchHtml(detailUrl, true);
            $ = cheerio.load(html);
            const fallbackData = parseDetailPage($);
            data = { ...data, ...fallbackData };
        }

        return data;
    } catch (err) {
        console.error(`[scrapingService] Error scraping IMDb para "${title}":`, err.message);
        throw err;
    }
}

async function scrapeTmdb(title, type) {
    try {
        const searchUrl = `https://www.themoviedb.org/search?query=${encodeURIComponent(title)}`;
        let html = await fetchHtml(searchUrl, false);
        let $ = cheerio.load(html);

        // Buscar primer resultado de película o serie
        const resultSelectors = [
            ".card.v4.tight a[href*='/movie/'], .card.v4.tight a[href*='/tv/']",
            ".result a[href*='/movie/'], .result a[href*='/tv/']",
            "a[href*='/movie/'], a[href*='/tv/']"
        ];
        let detailLink = null;
        for (const sel of resultSelectors) {
            detailLink = $(sel).first().attr("href");
            if (detailLink) break;
        }
        if (!detailLink) throw new Error("No se encontró resultado en TMDB");

        const detailUrl = `https://www.themoviedb.org${detailLink}`;
        html = await fetchHtml(detailUrl, false);
        $ = cheerio.load(html);

        const data = { type };

        // Título
        const titleSelectors = ["h2[data-testid='title']", "h1.title", ".title h2", "h1[data-testid='title']"];
        for (const sel of titleSelectors) {
            const text = $(sel).first().text().trim();
            if (text) { data.title = text; break; }
        }

        // Año
        const yearSelectors = [".release_date", ".tagline", "[data-testid='release_date']", ".release-info"];
        for (const sel of yearSelectors) {
            const text = $(sel).first().text();
            const match = text.match(/\b(19|20)\d{2}\b/);
            if (match) { data.year = match[0]; break; }
        }

        // Rating
        const ratingSelectors = [
            "[data-testid='rating']",
            ".user_score_chart",
            ".percentage",
            "[data-percent]"
        ];
        for (const sel of ratingSelectors) {
            let val = $(sel).attr("data-percent") || $(sel).text().trim();
            if (val) {
                val = val.replace("%", "").trim();
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    data.rating = (num / 10).toFixed(1);
                    break;
                }
            }
        }

        // Poster
        const posterSelectors = ["img.poster", ".poster img", "[data-testid='poster'] img", "img[alt*='Poster']"];
        for (const sel of posterSelectors) {
            const src = $(sel).first().attr("src") || $(sel).first().attr("data-src");
            if (src && src.startsWith("http")) { data.poster = src; break; }
        }

        // Géneros
        const genreSelectors = [
            "[data-testid='genres'] a",
            ".genres a",
            "a[href*='/genre/']",
            ".genres li a"
        ];
        const genres = [];
        for (const sel of genreSelectors) {
            $(sel).each((i, el) => {
                const text = $(el).text().trim();
                if (text && !genres.includes(text)) genres.push(text);
            });
            if (genres.length > 0) break;
        }
        data.genre = genres.length > 0 ? genres.join(", ") : null;

        // Plot
        const plotSelectors = [
            "[data-testid='overview']",
            ".overview p",
            "[data-testid='overview'] p",
            ".overview",
            "[itemprop='description']"
        ];
        for (const sel of plotSelectors) {
            const text = $(sel).first().text().trim();
            if (text && text.length > 20) { data.plot = text; break; }
        }

        return data;
    } catch (err) {
        console.error(`[scrapingService] Error scraping TMDB para "${title}":`, err.message);
        throw err;
    }
}

const CRITICAL_FIELDS = ["poster", "genre", "plot", "year", "rating", "director", "actors", "runtime"];

function isFieldMissing(data, field) {
    const value = data[field];
    return value === null || value === undefined || value === "N/A" || value === "Sin género" ||
           value === "Sin sinopsis disponible." || value === "Desconocido" || value === "----" ||
           (typeof value === "string" && value.trim() === "");
}

function getMissingFields(data) {
    return CRITICAL_FIELDS.filter(field => isFieldMissing(data, field));
}

async function enrichWithScraping(omdbData, title, type) {
    const cacheKey = `${type}:${title.toLowerCase().trim()}`;
    const cached = getCached(cacheKey);
    if (cached) {
        console.log(`[scrapingService] Cache hit para "${title}"`);
        return { ...omdbData, ...cached };
    }

    const missingFields = getMissingFields(omdbData);
    if (missingFields.length === 0) {
        console.log(`[scrapingService] "${title}" ya tiene todos los datos críticos.`);
        return omdbData;
    }

    console.log(`[scrapingService] "${title}" (${type}) - campos faltantes: ${missingFields.join(", ")}. Iniciando scraping...`);

    const scrapers = [
        { name: "IMDb (Cheerio)", fn: () => scrapeImdb(title, type) },
        { name: "IMDb (Puppeteer)", fn: () => scrapeImdb(title, type, true) },
        { name: "TMDB", fn: () => scrapeTmdb(title, type) }
    ];

    let scrapedData = null;
    for (const scraper of scrapers) {
        try {
            scrapedData = await scraper.fn();
            console.log(`[scrapingService] Scraping exitoso con ${scraper.name} para "${title}"`);
            break;
        } catch (err) {
            console.warn(`[scrapingService] ${scraper.name} falló para "${title}": ${err.message}`);
        }
    }

    if (!scrapedData) {
        console.warn(`[scrapingService] Todos los scrapers fallaron para "${title}". Devolviendo datos OMDb.`);
        return omdbData;
    }

    const enrichedData = { ...omdbData };
    for (const field of missingFields) {
        if (scrapedData[field] && !isFieldMissing(scrapedData, field)) {
            enrichedData[field] = scrapedData[field];
            console.log(`[scrapingService] Campo "${field}" completado para "${title}": ${scrapedData[field]}`);
        }
    }

    if (scrapedData.imdbID && isFieldMissing(enrichedData, "imdbID")) {
        enrichedData.imdbID = scrapedData.imdbID;
    }

    // Guardar en caché solo los campos que se obtuvieron por scraping
    const scrapedOnly = {};
    for (const field of missingFields) {
        if (scrapedData[field] && !isFieldMissing(scrapedData, field)) {
            scrapedOnly[field] = scrapedData[field];
        }
    }
    if (Object.keys(scrapedOnly).length > 0) {
        setCache(cacheKey, scrapedOnly);
    }

    return enrichedData;
}

module.exports = {
    enrichWithScraping,
    scrapeImdb,
    scrapeTmdb,
    getMissingFields,
    isFieldMissing
};