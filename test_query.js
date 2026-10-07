const { agentService } = require("C:\\Users\\carlos-eduardo.perei\\Desktop\\proyecto series-peliculas\\series-peliculas-app\\src-backend\\services\\agentService.js");

(async () => {
    console.log("Testing query 'The Godfather'...");
    const result = await agentService.processQuery("The Godfather");
    console.log("Result:", JSON.stringify(result, null, 2));
    
    console.log("\nTesting query 'Inception'...");
    const result2 = await agentService.processQuery("Inception");
    console.log("Result2:", JSON.stringify(result2, null, 2));
})().catch(err => {
    console.error("Error:", err.message);
});