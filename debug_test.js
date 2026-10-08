#!/usr/bin/env node
"use strict";

console.log("=== Debug test ===\n");

// Try requiring agentService
try {
    const agentService = require("./src-backend/services/agentService");
    console.log("agentService loaded successfully");
    console.log("Keys:", Object.keys(agentService));
    console.log("processQuery type:", typeof agentService.processQuery);
    
    // Try calling processQuery
    console.log("\nCalling processQuery('Inception')...");
    agentService.processQuery("Inception").then(result => {
        console.log("Success! Result:", JSON.stringify(result, null, 2));
    }).catch(err => {
        console.error("Error calling processQuery:", err.message);
        console.error(err.stack);
    });
} catch (e) {
    console.error("Error requiring agentService:", e.message);
    console.error(e.stack);
}