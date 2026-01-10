#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";

/**
 * Script to format BigQuery credentials JSON file for Railway environment variable
 * Usage: npx tsx scripts/format-bigquery-credentials.ts [path-to-json-file]
 */

function formatCredentialsForRailway() {
  // Default to bigquery-key.json in root
  const jsonFilePath = process.argv[2] || path.resolve(process.cwd(), "bigquery-key.json");
  
  console.log("\n========================================");
  console.log("  BIGQUERY CREDENTIALS FORMATTER");
  console.log("  For Railway Environment Variables");
  console.log("========================================\n");
  
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ File not found: ${jsonFilePath}`);
    console.error("\nUsage: npx tsx scripts/format-bigquery-credentials.ts [path-to-json-file]");
    process.exit(1);
  }
  
  try {
    console.log(`📖 Reading credentials from: ${jsonFilePath}\n`);
    const jsonContent = fs.readFileSync(jsonFilePath, "utf8");
    const credentials = JSON.parse(jsonContent);
    
    // Validate required fields
    if (!credentials.project_id) {
      throw new Error("Missing 'project_id' field");
    }
    if (!credentials.private_key) {
      throw new Error("Missing 'private_key' field");
    }
    if (!credentials.client_email) {
      throw new Error("Missing 'client_email' field");
    }
    
    console.log("✅ Credentials validated:");
    console.log(`   Project ID: ${credentials.project_id}`);
    console.log(`   Service Account: ${credentials.client_email}\n`);
    
    // Convert to single-line JSON string (properly escaped for Railway)
    // Railway expects the entire JSON as a string value
    const formatted = JSON.stringify(credentials);
    
    console.log("========================================");
    console.log("  COPY THIS TO RAILWAY:");
    console.log("========================================\n");
    console.log("Variable Name: BIGQUERY_CREDENTIALS");
    console.log("\nValue:");
    console.log(formatted);
    console.log("\n========================================\n");
    
    // Also save to a file for easy copy-paste
    const outputFile = path.resolve(process.cwd(), "bigquery-credentials-railway.txt");
    fs.writeFileSync(outputFile, formatted, "utf8");
    console.log(`💾 Also saved to: ${outputFile}`);
    console.log("   You can copy from there if needed.\n");
    
    console.log("📋 Steps to add to Railway:");
    console.log("   1. Go to Railway Dashboard → Your Project → Variables");
    console.log("   2. Click 'New Variable'");
    console.log("   3. Name: BIGQUERY_CREDENTIALS");
    console.log("   4. Value: (paste the JSON string above)");
    console.log("   5. Click 'Add'");
    console.log("   6. Redeploy your service\n");
    
  } catch (error: any) {
    console.error("❌ Error processing credentials:");
    if (error instanceof SyntaxError) {
      console.error("   Invalid JSON format");
      console.error(`   ${error.message}`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

formatCredentialsForRailway();
