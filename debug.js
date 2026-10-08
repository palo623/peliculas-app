const fs = require('fs');
const c = fs.readFileSync('public/js/bundle.js', 'utf8');

console.log('AppChatWidgetOld:', c.includes('h(SiteFooter, { onNavigate: navigate }),'));
console.log('AppChatWidgetNew:', c.includes('user ? h(ChatWidget'));
console.log('MiCuentaOld:', c.includes('detailState = React.useState(null);'));
console.log('miCuentaNew:', c.includes('const mainTabState = React.useState("movies");'));
console.log('miCuentaReturnOld:', c.includes('return h("div", { className: "movies-page" }'));
console.log('miCuentaReturnNew:', c.includes('const mainTabState = React.useState("movies");'));
console.log('AppChatWidgetNew in file:', c.includes('user ? h(ChatWidget'));
console.log('miCuentaReturnNew:', c.includes('const mainTabState = React.useState("movies");'));
console.log('miCuentaNew:', c.includes('const mainTabState = React.useState("movies");'));
console.log('AppChatWidgetOld exact:', c.substring(c.indexOf('h(SiteFooter, { onNavigate: navigate }),') - 10, c.indexOf('h(SiteFooter, { onNavigate: navigate }),') + 40));
console.log('AppChatWidgetNew exact:', c.substring(c.indexOf('user ? h(ChatWidget'), c.indexOf('user ? h(ChatWidget')) + 50));
console.log('miCuentaNew exact:', c.substring(c.indexOf('const mainTabState = React.useState'), c.indexOf('const mainTabState = React.useState') + 50));