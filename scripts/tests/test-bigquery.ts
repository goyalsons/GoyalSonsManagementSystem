import "dotenv/config";
import fs from "fs";
import path from "path";

function loadCredentials(): any {
  const envValue = process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envValue) return null;

  let raw = envValue.trim();
  const asPath = path.resolve(raw);
  if (!raw.startsWith("{") && fs.existsSync(asPath)) {
    raw = fs.readFileSync(asPath, "utf8").trim();
  }

  const credentials = JSON.parse(raw);
  if (typeof credentials.private_key === "string") {
    if (credentials.private_key.includes("\\r\\n")) {
      credentials.private_key = credentials.private_key.replace(/\\r\\n/g, "\n");
    } else if (credentials.private_key.includes("\\n")) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    credentials.private_key = credentials.private_key.replace(/\r\n/g, "\n");
  }
  return credentials;
}

const BIGQUERY_CREDENTIALS = loadCredentials();

async function testBigQueryConnection() {
  console.log("\n========================================");
  console.log("  BIGQUERY CONNECTION TEST");
  console.log("========================================\n");

  if (!BIGQUERY_CREDENTIALS) {
    console.log("⚠️ BIGQUERY_CREDENTIALS not set");
    console.log("   BigQuery attendance history will not be available.\n");
    console.log("   To enable BigQuery:");
    console.log("   1. Create a Google Cloud service account");
    console.log("   2. Grant BigQuery access");
    console.log("   3. Download the JSON key file");
    console.log("   4. Set BIGQUERY_CREDENTIALS to the JSON content\n");
    console.log("========================================");
    console.log("  ⚠️ BIGQUERY TEST SKIPPED (No credentials)");
    console.log("========================================\n");
    process.exit(0);
  }

  try {
    console.log("🔍 Parsing credentials...");
    const credentials = JSON.parse(BIGQUERY_CREDENTIALS);
    if (typeof credentials.private_key === "string") {
      if (credentials.private_key.includes("\\r\\n")) {
        credentials.private_key = credentials.private_key.replace(/\\r\\n/g, "\n");
      } else if (credentials.private_key.includes("\\n")) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
      }
      credentials.private_key = credentials.private_key.replace(/\r\n/g, "\n");
    }
    
    if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
      throw new Error("Invalid credentials format - missing required fields");
    }
    
    console.log(`✅ Project ID: ${credentials.project_id}`);
    console.log(`✅ Service Account: ${credentials.client_email}`);
    console.log("✅ Private key: Present\n");

    console.log("🔍 Importing BigQuery client...");
    const { BigQuery } = await import("@google-cloud/bigquery");
    
    console.log("🔍 Initializing BigQuery client...");
    const bigquery = new BigQuery({
      projectId: credentials.project_id,
      credentials: credentials,
    });

    console.log("🔍 Running test query (fetching available months)...\n");
    
    const query = `
      SELECT DISTINCT 
        EXTRACT(YEAR FROM dt) as year,
        EXTRACT(MONTH FROM dt) as month
      FROM \`quickstart-1587217624038.hrms.ATTENDENCE_SUMMARY\`
      ORDER BY year DESC, month DESC
      LIMIT 5
    `;

    const [rows] = await bigquery.query({ query, location: "us-central1" });
    
    console.log("✅ Query executed successfully");
    console.log(`✅ Found ${rows.length} months of data:\n`);
    
    rows.forEach((row: any, i: number) => {
      const monthName = new Date(row.year, row.month - 1).toLocaleString('default', { month: 'long' });
      console.log(`   ${i + 1}. ${monthName} ${row.year}`);
    });

    console.log("\n========================================");
    console.log("  ✅ BIGQUERY TEST PASSED");
    console.log("========================================\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ BigQuery test failed:");
    
    if (error instanceof SyntaxError) {
      console.error("   Invalid JSON in BIGQUERY_CREDENTIALS");
    } else {
      console.error("   ", error instanceof Error ? error.message : error);
    }
    
    console.log("\nTroubleshooting:");
    console.log("  1. Verify BIGQUERY_CREDENTIALS contains valid JSON");
    console.log("  2. Check service account has BigQuery Data Viewer role");
    console.log("  3. Ensure the dataset 'quickstart-1587217624038.hrms' exists");
    console.log("  4. Verify the table 'ATTENDENCE_SUMMARY' exists\n");
    
    console.log("========================================");
    console.log("  ❌ BIGQUERY TEST FAILED");
    console.log("========================================\n");
    
    process.exit(1);
  }
}

testBigQueryConnection();
