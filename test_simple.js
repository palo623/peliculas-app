require('module').init;

const { agentService } = require("./src-backend/services/agentService");

(async () => {
    console.log("Testing agent service with AI_API_KEY...");
    try {
        const result = await agentService.processQuery("Inception");
        console.log("Process query result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error in processQuery:", e.message);
    }
    try {
        const catalog = await agentService.searchCatalog("The Matrix");
        console.log("Catalog search result:", catalog ? "Found " + catalog.items.length + " items" : "No results");
    } catch (e) {
        console.error("Error in searchCatalog:", e.message);
    }
    try {
        const detail = await agentService.getDetailById("tt1375666");
        console.log("Detail for tt1375666:", detail ? "Found - " + detail.title : "Not found");
    } catch (e) {
        console.error("Error in getDetailById:", e.message);
    }
    console.log("\nAll tests completed!");
})();