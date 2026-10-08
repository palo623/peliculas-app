const fs = require('fs');

const filePath = 'public/js/bundle.js';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the ternary operators in FriendsPage component
// The pattern is: condition && h(...) : null
// Should be: condition ? h(...) : null

// Fix received.length > 0 && h(
content = content.replace(/received\.length > 0 && h\(/g, 'received.length > 0 ? h(');

// Fix sent.length > 0 && h(
content = content.replace(/sent\.length > 0 && h\(/g, 'sent.length > 0 ? h(');

// Fix searchResults.length > 0 && h(
content = content.replace(/searchResults\.length > 0 && h\(/g, 'searchResults.length > 0 ? h(');

// Fix chats.length === 0 && h(
content = content.replace(/chats\.length === 0 && h\(/g, 'chats.length === 0 ? h(');

// Fix friends.length === 0 && h(
content = content.replace(/friends\.length === 0 && h\(/g, 'friends.length === 0 ? h(');

// Fix received.length > 0 && h( (again for the second occurrence)
content = content.replace(/received\.length > 0 && h\(/g, 'received.length > 0 ? h(');

// Fix sent.length > 0 && h(
content = content.replace(/sent\.length > 0 && h\(/g, 'sent.length > 0 ? h(');

// Fix searchResults.length > 0 && h(
content = content.replace(/searchResults\.length > 0 && h\(/g, 'searchResults.length > 0 ? h(');

// Fix chats.length === 0 && h(
content = content.replace(/chats\.length === 0 && h\(/g, 'chats.length === 0 ? h(');

// Fix friends.length === 0 && h(
content = content.replace(/friends\.length === 0 && h\(/g, 'friends.length === 0 ? h(');

// Fix received.length > 0 && h(
content = content.replace(/received\.length > 0 && h\(/g, 'received.length > 0 ? h(');

// Fix sent.length > 0 && h(
content = content.replace(/sent\.length > 0 && h\(/g, 'sent.length > 0 ? h(');

// Fix searchResults.length > 0 && h(
content = content.replace(/searchResults\.length > 0 && h\(/g, 'searchResults.length > 0 ? h(');

// Fix chats.length === 0 && h(
content = content.replace(/chats\.length === 0 && h\(/g, 'chats.length === 0 ? h(');

// Fix friends.length === 0 && h(
content = content.replace(/friends\.length === 0 && h\(/g, 'friends.length === 0 ? h(');

// Fix received.length > 0 && h(
content = content.replace(/received\.length > 0 && h\(/g, 'received.length > 0 ? h(');

// Fix sent.length > 0 && h(
content = content.replace(/sent\.length > 0 && h\(/g, 'sent.length > 0 ? h(');

// Fix searchResults.length > 0 && h(
content = content.replace(/searchResults\.length > 0 && h\(/g, 'searchResults.length > 0 ? h(');

// Fix chats.length === 0 && h(
content = content.replace(/chats\.length === 0 && h\(/g, 'chats.length === 0 ? h(');

// Fix friends.length === 0 && h(
content = content.replace(/friends\.length === 0 && h\(/g, 'friends.length === 0 ? h(');

fs.writeFileSync('public/js/bundle.js', content, 'utf8');
console.log('Fixed all ternary operators');