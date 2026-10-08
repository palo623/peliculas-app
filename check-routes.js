const r = require('./src-backend/routes/friendsRoutes');
console.log('Stack:', r.stack.map(l => l.route ? l.route.path : l.name).filter(Boolean));