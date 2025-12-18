import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface EnvVar {
  key: string;
  value: string;
  isSet: boolean;
  isRequired: boolean;
  description: string;
}

const projectRoot = join(__dirname, "../..");
const envExamplePath = join(projectRoot, ".env.example");

const requiredVars = [
  { key: "DATABASE_URL", description: "PostgreSQL connection string" },
  { key: "SESSION_SECRET", description: "Session encryption key" },
  { key: "BIGQUERY_CREDENTIALS", description: "Google Cloud service account JSON" },
  { key: "SMS_API_KEY", description: "InstaAlerts API key" },
];

const optionalVars = [
  { key: "SMS_SENDER_ID", description: "SMS sender ID (default: GOYLSN)" },
  { key: "SMS_DLT_ENTITY_ID", description: "DLT entity ID" },
  { key: "SMS_DLT_TEMPLATE_ID", description: "DLT template ID" },
  { key: "GOOGLE_CLIENT_ID", description: "Google OAuth client ID" },
  { key: "GOOGLE_CLIENT_SECRET", description: "Google OAuth client secret" },
  { key: "OPENAI_API_KEY", description: "OpenAI API key for AI features" },
];

function parseEnvExample(): Map<string, string> {
  const envMap = new Map<string, string>();
  
  if (!existsSync(envExamplePath)) {
    console.log("⚠️ .env.example not found");
    return envMap;
  }

  const content = readFileSync(envExamplePath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key] = trimmed.split("=");
      if (key) {
        envMap.set(key.trim(), trimmed);
      }
    }
  }

  return envMap;
}

async function repairEnvironment() {
  console.log("\n========================================");
  console.log("  ENVIRONMENT VARIABLE CHECK");
  console.log("========================================\n");

  const envExample = parseEnvExample();
  const missing: EnvVar[] = [];
  const present: EnvVar[] = [];

  console.log("🔍 Checking required variables...\n");

  for (const { key, description } of requiredVars) {
    const value = process.env[key];
    const envVar: EnvVar = {
      key,
      value: value || "",
      isSet: !!value,
      isRequired: true,
      description,
    };

    if (value) {
      present.push(envVar);
      const displayValue = key.includes("KEY") || key.includes("SECRET") || key.includes("PASSWORD") || key.includes("CREDENTIALS")
        ? `${"*".repeat(Math.min(value.length, 20))}...`
        : value.length > 50 ? `${value.slice(0, 50)}...` : value;
      console.log(`   ✅ ${key}`);
      console.log(`      Value: ${displayValue}\n`);
    } else {
      missing.push(envVar);
      console.log(`   ❌ ${key} - MISSING`);
      console.log(`      Description: ${description}\n`);
    }
  }

  console.log("🔍 Checking optional variables...\n");

  for (const { key, description } of optionalVars) {
    const value = process.env[key];
    const envVar: EnvVar = {
      key,
      value: value || "",
      isSet: !!value,
      isRequired: false,
      description,
    };

    if (value) {
      present.push(envVar);
      console.log(`   ✅ ${key} - Set`);
    } else {
      missing.push(envVar);
      console.log(`   ⚠️ ${key} - Not set (optional)`);
      console.log(`      Description: ${description}`);
    }
  }

  console.log("\n========================================");
  console.log("  SUMMARY");
  console.log("========================================\n");

  const requiredMissing = missing.filter(v => v.isRequired);
  const optionalMissing = missing.filter(v => !v.isRequired);

  console.log(`📊 Required: ${requiredVars.length - requiredMissing.length}/${requiredVars.length} set`);
  console.log(`📊 Optional: ${optionalVars.length - optionalMissing.length}/${optionalVars.length} set\n`);

  if (requiredMissing.length > 0) {
    console.log("❌ Missing required variables:\n");
    for (const env of requiredMissing) {
      console.log(`   • ${env.key}`);
      console.log(`     ${env.description}\n`);
    }

    console.log("\n📝 To fix, add these environment variables:\n");
    console.log("   In Replit: Use the Secrets tab");
    console.log("   Locally: Add to .env file\n");

    console.log("========================================");
    console.log("  ❌ ENVIRONMENT CHECK FAILED");
    console.log("========================================\n");
    process.exit(1);
  } else {
    console.log("✅ All required environment variables are set!\n");

    if (optionalMissing.length > 0) {
      console.log("💡 Optional variables not set:");
      for (const env of optionalMissing) {
        console.log(`   • ${env.key} - ${env.description}`);
      }
      console.log("");
    }

    console.log("========================================");
    console.log("  ✅ ENVIRONMENT CHECK PASSED");
    console.log("========================================\n");
    process.exit(0);
  }
}

repairEnvironment();
