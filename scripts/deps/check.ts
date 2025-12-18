import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  required: boolean;
}

const results: CheckResult[] = [];

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function checkCommand(command: string): string | null {
  try {
    return execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function getVersion(output: string | null): string | null {
  if (!output) return null;
  const match = output.match(/(\d+\.\d+(\.\d+)?)/);
  return match ? match[1] : null;
}

function compareVersions(current: string, required: string): boolean {
  const currentParts = current.split(".").map(Number);
  const requiredParts = required.split(".").map(Number);
  
  for (let i = 0; i < requiredParts.length; i++) {
    if ((currentParts[i] || 0) > requiredParts[i]) return true;
    if ((currentParts[i] || 0) < requiredParts[i]) return false;
  }
  return true;
}

console.log("\n========================================");
console.log("  DEPENDENCY CHECK - GMS Setup");
console.log("========================================\n");

log("🔍", "Checking Node.js...");
const nodeVersion = getVersion(checkCommand("node --version"));
if (nodeVersion && compareVersions(nodeVersion, "20.0")) {
  results.push({ name: "Node.js", status: "pass", message: `v${nodeVersion} (>= 20.0 required)`, required: true });
  log("✅", `Node.js v${nodeVersion} - OK`);
} else {
  results.push({ name: "Node.js", status: "fail", message: nodeVersion ? `v${nodeVersion} is too old` : "Not installed", required: true });
  log("❌", `Node.js ${nodeVersion ? `v${nodeVersion} is too old` : "not found"}. Please install Node.js 20+`);
}

log("🔍", "Checking npm...");
const npmVersion = getVersion(checkCommand("npm --version"));
if (npmVersion && compareVersions(npmVersion, "10.0")) {
  results.push({ name: "npm", status: "pass", message: `v${npmVersion} (>= 10.0 required)`, required: true });
  log("✅", `npm v${npmVersion} - OK`);
} else {
  results.push({ name: "npm", status: "fail", message: npmVersion ? `v${npmVersion} is too old` : "Not installed", required: true });
  log("❌", `npm ${npmVersion ? `v${npmVersion} is too old` : "not found"}. Please update npm`);
}

log("🔍", "Checking PostgreSQL client...");
const psqlVersion = getVersion(checkCommand("psql --version"));
if (psqlVersion) {
  results.push({ name: "PostgreSQL", status: "pass", message: `v${psqlVersion}`, required: true });
  log("✅", `PostgreSQL client v${psqlVersion} - OK`);
} else {
  results.push({ name: "PostgreSQL", status: "warn", message: "psql not found (optional for local dev)", required: false });
  log("⚠️", "PostgreSQL client not found (optional if using remote database)");
}

log("🔍", "Checking Prisma CLI...");
const prismaVersion = getVersion(checkCommand("npx prisma --version"));
if (prismaVersion) {
  results.push({ name: "Prisma", status: "pass", message: `v${prismaVersion}`, required: true });
  log("✅", `Prisma v${prismaVersion} - OK`);
} else {
  results.push({ name: "Prisma", status: "warn", message: "Will be installed with npm install", required: true });
  log("⚠️", "Prisma not found (will be installed with npm install)");
}

console.log("\n----------------------------------------");
log("🔍", "Checking Environment Variables...\n");

const requiredEnvVars = [
  { key: "DATABASE_URL", description: "PostgreSQL connection string", required: true },
  { key: "SESSION_SECRET", description: "Session encryption key", required: true },
  { key: "BIGQUERY_CREDENTIALS", description: "Google Cloud service account JSON", required: true },
  { key: "SMS_API_KEY", description: "InstaAlerts API key", required: true },
];

const optionalEnvVars = [
  { key: "SMS_SENDER_ID", description: "SMS sender ID", required: false },
  { key: "GOOGLE_CLIENT_ID", description: "Google OAuth client ID", required: false },
  { key: "GOOGLE_CLIENT_SECRET", description: "Google OAuth client secret", required: false },
  { key: "OPENAI_API_KEY", description: "OpenAI API key for AI features", required: false },
];

for (const env of requiredEnvVars) {
  if (process.env[env.key]) {
    results.push({ name: env.key, status: "pass", message: "Set", required: true });
    log("✅", `${env.key} - Set`);
  } else {
    results.push({ name: env.key, status: "fail", message: `Missing - ${env.description}`, required: true });
    log("❌", `${env.key} - Missing (${env.description})`);
  }
}

console.log("\nOptional environment variables:");
for (const env of optionalEnvVars) {
  if (process.env[env.key]) {
    results.push({ name: env.key, status: "pass", message: "Set", required: false });
    log("✅", `${env.key} - Set`);
  } else {
    results.push({ name: env.key, status: "warn", message: `Not set - ${env.description}`, required: false });
    log("⚠️", `${env.key} - Not set (${env.description})`);
  }
}

console.log("\n----------------------------------------");
log("🔍", "Checking Project Files...\n");

const projectRoot = join(__dirname, "../..");
const requiredFiles = [
  { path: "package.json", description: "Package configuration" },
  { path: "prisma/schema.prisma", description: "Database schema" },
  { path: "server/index.ts", description: "Server entry point" },
  { path: "client/index.html", description: "Client entry point" },
];

for (const file of requiredFiles) {
  const fullPath = join(projectRoot, file.path);
  if (existsSync(fullPath)) {
    results.push({ name: file.path, status: "pass", message: "Found", required: true });
    log("✅", `${file.path} - Found`);
  } else {
    results.push({ name: file.path, status: "fail", message: "Missing", required: true });
    log("❌", `${file.path} - Missing`);
  }
}

console.log("\n========================================");
console.log("  SUMMARY");
console.log("========================================\n");

const passed = results.filter(r => r.status === "pass").length;
const failed = results.filter(r => r.status === "fail" && r.required).length;
const warnings = results.filter(r => r.status === "warn" || (r.status === "fail" && !r.required)).length;

log("📊", `Passed: ${passed} | Failed: ${failed} | Warnings: ${warnings}`);

if (failed > 0) {
  console.log("\n❌ Some required checks failed. Please fix the issues above before proceeding.");
  console.log("\nTo fix missing environment variables:");
  console.log("  1. Copy .env.example to .env");
  console.log("  2. Fill in the required values");
  console.log("  3. Run this check again: npm run scripts:deps\n");
  process.exit(1);
} else {
  console.log("\n✅ All required checks passed! You can proceed with setup.\n");
  console.log("Next steps:");
  console.log("  1. Run: npm install");
  console.log("  2. Run: npm run db:migrate");
  console.log("  3. Run: npm run db:seed");
  console.log("  4. Run: npm run dev\n");
  process.exit(0);
}
