const fs = require('fs');
const c = fs.readFileSync('public/js/bundle.js', 'utf8');
console.log('ChatWidget in App:', c.includes('h(ChatWidget'));
console.log('FriendsPage tab:', c.includes('mainTab === "friends"'));
console.log('mainTab state:', c.includes('mainTabState'));
console.log('ChatWidget function:', c.includes('function ChatWidget'));
console.log('FriendsPage function:', c.includes('function FriendsPage'));