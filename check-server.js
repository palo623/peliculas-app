const fs = require('fs');
const c = fs.readFileSync('server.js', 'utf8');
console.log(c.substring(c.indexOf('app.use("/api", friendsRoutes)'), c.indexOf('app.use("/api", friendsRoutes)') + 200));