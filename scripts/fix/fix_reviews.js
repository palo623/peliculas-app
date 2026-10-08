// Fix reviews sorting to prioritize friends' reviews
const fs = require('fs');

const filePath = 'C:/Users/pablo.lozano.ext/Desktop/proyecto series-pelis/series-peliculas-app/public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find MediaPage function start
const mediaPageStart = content.indexOf('function MediaPage(props)');
const seriesPageStart = content.indexOf('function SeriesPage(props)');
const miCuentaStart = content.indexOf('function MiCuenta(props)');

// Function to replace sort in a specific component
function replaceSortInComponent(content, componentStart, componentName) {
    // Find the sort function within this component
    const searchStart = componentStart;
    const sortIdx = content.indexOf('.sort((a, b) => {', searchStart);
    
    if (sortIdx === -1) {
        console.log(`No sort found in ${componentName}`);
        return content;
    }
    
    // Find the end of the sort function (look for the closing brace of the sort callback)
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    let endIdx = sortIdx;
    
    for (let i = sortIdx; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (!inString && (char === '"' || char === "'" || char === '`')) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && content[i - 1] !== '\\') {
            inString = false;
        } else if (!inString) {
            if (char === '{') braceCount++;
            else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endIdx = i + 1;
                    break;
                }
            }
        }
    }
    
    const oldSort = content.substring(sortIdx, endIdx);
    const newSort = `.sort((a, b) => {
                                    const friendIds = new Set(friends.map(f => f.id));
                                    const aIsFriend = friendIds.has(a.userId);
                                    const bIsFriend = friendIds.has(b.userId);
                                    if (aIsFriend !== bIsFriend) return aIsFriend ? -1 : 1;
                                    if (reviewsSort === "votes") return (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes);
                                    if (reviewsSort === "recent") return new Date(b.createdAt) - new Date(a.createdAt);
                                    return (b.upvotes - b.downvotes + (b.replies?.length || 0)) - (a.upvotes - a.downvotes + (a.replies?.length || 0));
                                })`;
    
    const newContent = content.substring(0, sortIdx) + newSort + content.substring(endIdx);
    console.log(`Replaced sort in ${componentName} at index ${sortIdx}`);
    return newContent;
}

content = replaceSortInComponent(content, mediaPageStart, 'MediaPage');
content = replaceSortInComponent(content, seriesPageStart, 'SeriesPage');
content = replaceSortInComponent(content, miCuentaStart, 'MiCuenta');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done');