const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Remove old UserSearch (from line with "/* ---------- UserSearch: buscar y seguir usuarios ---------- */" to before "/* ---------- FriendsPage: mis amigos (following/followers) ---------- */")
const userSearchRegex = /\/\* ---------- UserSearch: buscar y seguir usuarios ---------- \*\/[\s\S]*?(?=\/\* ---------- FriendsPage: mis amigos \(following\/followers\) ---------- \*\/)/;
content = content.replace(userSearchRegex, '');

// Remove old FriendsPage (from "/* ---------- FriendsPage: mis amigos (following/followers) ---------- */" to before "/* ---------- ProfileSettings: configuración de perfil ---------- */")
const friendsPageRegex = /\/\* ---------- FriendsPage: mis amigos \(following\/followers\) ---------- \*\/[\s\S]*?(?=\/\* ---------- ProfileSettings: configuraci.n de perfil ---------- \*\/)/;
content = content.replace(friendsPageRegex, '');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done! Old UserSearch and old FriendsPage removed.');