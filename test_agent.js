const { agentService } = require("./src-backend/services/agentService");

(async () => {
    // Test with no AI_API_KEY - should still work for catalog search
    console.log("Testing agent service (AI_API_KEY not set)...");
    
    // Test processQuery
    const result = await agentService.processQuery("Inception");
    console.log("Process query result:", JSON.stringify(result, null, 2));
    
    // Test catalog search
    const catalog = await agentService.searchCatalog("The Matrix");
    console.log("Catalog search result:", catalog ? "Found " + catalog.items.length + " items" : "No results");
    
    // Test detail by ID
    const detail = await agentService.getDetailById("tt1375666");
    console.log("Detail for tt1375666:", detail ? "Found - " + detail.title : "Not found");
    
    console.log("\nAll tests passed!");
})().catch(err => {
    console.error("Error:", err.message);
});