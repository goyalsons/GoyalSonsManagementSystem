#!/usr/bin/env node
/**
 * Set up BigQuery credentials for local dev using a file (avoids .env newline corruption).
 *
 * Usage:
 *   npx tsx scripts/setup-bigquery-local.ts                    # Use existing bigquery-credentials.json or BIGQUERY_CREDENTIALS
 *   npx tsx scripts/setup-bigquery-local.ts path/to/key.json    # Copy from a credentials file
 */
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const TARGET_FILE = path.resolve(process.cwd(), "bigquery-credentials.json");
const SOURCE_ARG = process.argv[2];

function main() {
  console.log("\n========================================");
  console.log("  BigQuery credentials for local dev");
  console.log("========================================\n");

  // Case 1: User provides a source file path
  if (SOURCE_ARG) {
    const srcPath = path.isAbsolute(SOURCE_ARG) ? SOURCE_ARG : path.resolve(process.cwd(), SOURCE_ARG);
    if (!fs.existsSync(srcPath)) {
      console.error(`❌ File not found: ${srcPath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(srcPath, "utf8");
    try {
      JSON.parse(content);
    } catch {
      console.error("❌ Invalid JSON in source file");
      process.exit(1);
    }
    fs.writeFileSync(TARGET_FILE, content, "utf8");
    console.log(`✅ Copied credentials to: ${TARGET_FILE}`);
    printEnvInstruction();
    return;
  }

  // Case 2: bigquery-credentials.json already exists
  if (fs.existsSync(TARGET_FILE)) {
    try {
      const content = fs.readFileSync(TARGET_FILE, "utf8");
      const creds = JSON.parse(content);
      if (creds.project_id && creds.private_key && creds.client_email) {
        console.log("✅ bigquery-credentials.json already exists and looks valid.");
        printEnvInstruction();
        return;
      }
    } catch {
      console.error("❌ bigquery-credentials.json exists but is invalid JSON.");
      process.exit(1);
    }
  }

  // Case 3: Try BIGQUERY_CREDENTIALS from env (may be corrupted)
  const envCreds = process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envCreds && envCreds.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(envCreds.trim());
      if (parsed.private_key) {
        // Normalize newlines (common fix for corruption)
        let pk = parsed.private_key;
        pk = pk.replace(/\\n/g, "\n").replace(/\\r/g, "");
        parsed.private_key = pk;
      }
      fs.writeFileSync(TARGET_FILE, JSON.stringify(parsed, null, 2), "utf8");
      console.log("✅ Wrote credentials from env to bigquery-credentials.json");
      console.log("   (If you still get errors, download a fresh JSON from Google Cloud Console)");
      printEnvInstruction();
      return;
    } catch (e) {
      console.error("❌ BIGQUERY_CREDENTIALS in env appears corrupted or invalid JSON.");
      console.error("   Download a fresh service account JSON from Google Cloud Console,");
      console.error("   save it as bigquery-key.json, then run:");
      console.error("   npx tsx scripts/setup-bigquery-local.ts bigquery-key.json");
      process.exit(1);
    }
  }

  // Case 4: No credentials found
  console.error("❌ No BigQuery credentials found.");
  console.error("\nTo fix:");
  console.error("  1. Go to Google Cloud Console → IAM → Service Accounts");
  console.error("  2. Create/download a JSON key for your service account");
  console.error("  3. Run: npx tsx scripts/setup-bigquery-local.ts path/to/your-key.json");
  console.error("  4. Add to .env: GOOGLE_APPLICATION_CREDENTIALS=./bigquery-credentials.json");
  process.exit(1);
}

function printEnvInstruction() {
  console.log("\nAdd to your .env:");
  console.log("  GOOGLE_APPLICATION_CREDENTIALS=./bigquery-credentials.json");
  console.log("\nThen restart the server.\n");
}

main();
