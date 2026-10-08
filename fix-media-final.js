const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the MediaPage's rateLimitExceeded (second occurrence is the one we want)
const rateLimitIdx1 = content.indexOf('const rateLimitExceeded = () => {');
const rateLimitIdx2 = content.indexOf('const rateLimitExceeded = () => {', content.indexOf('const rateLimitExceeded = () => {') + 1);

if (rateLimitIdx1 === -1 || rateLimitIdx2 === -1) {
    console.error('rateLimitExceeded not found twice');
    process.exit(1);
}

// Use the second one (MediaPage)
const rateLimitIdx = rateLimitIdx2;

const newUseEffect = `
    // Si venimos de una portada del Hero, buscar automáticamente esa película.
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('cineairos_hero_detail');
            if (raw) {
                const movie = JSON.parse(raw);
                sessionStorage.removeItem('cineairos_hero_detail');
                if (movie && (movie.imdbID || movie.title)) {
                    setQuery(movie.title);
                    setTimeout(() => {
                        const form = document.querySelector('.search-form');
                        if (form) form.requestSubmit();
                    }, 0);
                }
            }
        } catch (e) {
            /* ignora errores de storage/parseo */
        }
    }, []);\n\n`;

const before = content.substring(0, rateLimitIdx);
const after = content.substring(rateLimitIdx);
const newContent = before + newUseEffect + '\n' + after;

fs.writeFileSync('public/js/bundle.js', newContent, 'utf8');
console.log('Done! Added useEffect for hero detail auto-search in MediaPage.');