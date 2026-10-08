cd 'C:\Users\carlos-eduardo.perei\Desktop\proyecto series-peliculas\series-peliculas-app'
node -e "
const { agentService } = require('./src-backend/services/agentService');
(async () => {
    console.log('Testing agent service (AI_API_KEY not set)...');
    
    const result = await agentService.processQuery('Inception');
    console.log('Process query result:', JSON.stringify(result, null, 2));
    
    const catalog = await agentService.searchCatalog('The Matrix');
    console.log('Catalog search result:', catalog ? 'Found ' + catalog.items.length + ' items' : 'No results');
    
    const detail = await agentService.getDetailById('tt1375666');
    console.log('Detail for tt1375666:', detail ? 'Found - ' + detail.title : 'Not found');
    
    console.log('\nAll tests passed!');
})().catch(err => {
    console.error('Error:', err.message);
});
"