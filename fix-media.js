const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the MediaPage's useEffect section (second occurrence)
const marker = '// Ticker de la cuenta atrás del límite (nunca sube, solo baja).';
const idx1 = content.indexOf(marker);
if (idx1 === -1) { console.log('Marker 1 not found'); process.exit(1); }

const idx2 = content.indexOf(marker, idx1 + 1);
if (idx2 === -1) { console.log('Marker 2 not found'); process.exit(1); }

// Find the rateLimitExceeded function after this marker
const rateLimitIdx = content.indexOf('const rateLimitExceeded = () => {', idx2);
if (rateLimitIdx === -1) { console.log('rateLimitExceeded not found'); process.exit(1); }

// Insert the new useEffect before rateLimitExceeded
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