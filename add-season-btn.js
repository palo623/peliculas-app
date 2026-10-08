const fs = require('fs');
let c = fs.readFileSync('public/js/bundle.js', 'utf8');

// Exact match for SeriesPage result-actions (occurrence 3) - with \r\n line endings
const oldStr = '                        h("button", { onClick: handleSave, disabled: saving }, saving ? "Guardando..." : "Guardar en mi colección"),\r\n                        h("button", { className: "btn-ghost", type: "button", onClick: () => { setResult(null); setResultWarning(null); } }, "Descartar")';

const newStr = '                        h("button", { onClick: handleSave, disabled: saving }, saving ? "Guardando..." : "Guardar en mi colección"),\r\n                        result.imdbID ? h("button", { className: "btn-ghost", type: "button", onClick: () => loadSeasons(result.imdbID) }, "📺 Ver temporadas") : null,\r\n                        h("button", { className: "btn-ghost", type: "button", onClick: () => { setResult(null); setResultWarning(null); } }, "Descartar")';

if (c.includes(oldStr)) {
    c = c.replace(oldStr, newStr);
    fs.writeFileSync('public/js/bundle.js', c, 'utf8');
    console.log('Replaced button successfully');
} else {
    console.log('Old string not found');
    // Debug
    const idx = c.indexOf('Guardar en mi colección');
    if (idx !== -1) {
        const context = c.substring(idx - 50, idx + 150);
        console.log('Context:', JSON.stringify(context));
    }
}