import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const projectRoot = join(__dirname, "../..");

interface StepResult {
  name: string;
  status: "pass" | "fail" | "skip";
  message: string;
  duration: number;
}

const results: StepResult[] = [];

function log(emoji: string, message: string) {
  console.log(`${emoji} ${message}`);
}

function runCommand(command: string, description: string): boolean {
  log("🔄", `${description}...`);
  const startTime = Date.now();
  
  try {
    execSync(command, { 
      cwd: projectRoot, 
      stdio: "inherit",
      encoding: "utf-8"
    });
    const duration = Date.now() - startTime;
    results.push({ name: description, status: "pass", message: "Success", duration });
    log("✅", `${description} completed (${duration}ms)\n`);
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    results.push({ 
      name: description, 
      status: "fail", 
      message: error instanceof Error ? error.message : "Unknown error",
      duration 
    });
    log("❌", `${description} failed\n`);
    return false;
  }
}

function runCommandSilent(command: string): { success: boolean; output: string } {
  try {
    const output = execSync(command, { 
      cwd: projectRoot, 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : "" };
  }
}

async function masterSetup() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       GOYALSONS MANAGEMENT SYSTEM - MASTER SETUP            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const startTime = Date.now();

  console.log("Step 1/7: Checking Dependencies");
  console.log("─".repeat(50) + "\n");

  const nodeResult = runCommandSilent("node --version");
  if (nodeResult.success) {
    log("✅", `Node.js ${nodeResult.output.trim()}`);
    results.push({ name: "Node.js check", status: "pass", message: nodeResult.output.trim(), duration: 0 });
  } else {
    log("❌", "Node.js not found. Please install Node.js 20+");
    results.push({ name: "Node.js check", status: "fail", message: "Not installed", duration: 0 });
    process.exit(1);
  }

  const npmResult = runCommandSilent("npm --version");
  if (npmResult.success) {
    log("✅", `npm ${npmResult.output.trim()}`);
    results.push({ name: "npm check", status: "pass", message: npmResult.output.trim(), duration: 0 });
  }

  console.log("\nStep 2/7: Checking Environment Variables");
  console.log("─".repeat(50) + "\n");

  const requiredEnv = ["DATABASE_URL", "SESSION_SECRET", "BIGQUERY_CREDENTIALS", "SMS_API_KEY"];
  let envMissing = false;

  for (const key of requiredEnv) {
    if (process.env[key]) {
      log("✅", `${key} is set`);
    } else {
      log("❌", `${key} is missing`);
      envMissing = true;
    }
  }

  if (envMissing) {
    console.log("\n⚠️ Some environment variables are missing.");
    console.log("   Add them to continue:\n");
    console.log("   In Replit: Use the Secrets tab");
    console.log("   Locally: Copy .env.example to .env and fill in values\n");
    results.push({ name: "Environment check", status: "fail", message: "Missing variables", duration: 0 });
  } else {
    results.push({ name: "Environment check", status: "pass", message: "All set", duration: 0 });
  }

  console.log("\nStep 3/7: Installing Dependencies");
  console.log("─".repeat(50) + "\n");

  if (!existsSync(join(projectRoot, "node_modules"))) {
    if (!runCommand("npm install", "Installing npm packages")) {
      console.log("\n❌ Failed to install dependencies. Please check npm logs.\n");
      process.exit(1);
    }
  } else {
    log("✅", "node_modules already exists");
    results.push({ name: "npm install", status: "skip", message: "Already installed", duration: 0 });
    console.log("");
  }

  console.log("\nStep 4/7: Database Migration");
  console.log("─".repeat(50) + "\n");

  if (!runCommand("npx prisma generate", "Generating Prisma client")) {
    console.log("⚠️ Prisma generate failed, but continuing...\n");
  }

  if (!runCommand("npx prisma db push --skip-generate", "Pushing database schema")) {
    console.log("⚠️ Database push failed. Check DATABASE_URL.\n");
  }

  console.log("\nStep 5/7: Testing Database Connection");
  console.log("─".repeat(50) + "\n");

  runCommand("npx tsx scripts/tests/test-db-connection.ts", "Database connection test");

  console.log("\nStep 6/7: Testing External Services");
  console.log("─".repeat(50) + "\n");

  if (process.env.BIGQUERY_CREDENTIALS) {
    runCommand("npx tsx scripts/tests/test-bigquery.ts", "BigQuery connection test");
  } else {
    log("⚠️", "Skipping BigQuery test (BIGQUERY_CREDENTIALS not set)");
    results.push({ name: "BigQuery test", status: "skip", message: "No credentials", duration: 0 });
    console.log("");
  }

  if (process.env.SMS_API_KEY) {
    runCommand("npx tsx scripts/tests/test-sms.ts", "SMS service test");
  } else {
    log("⚠️", "Skipping SMS test (SMS_API_KEY not set)");
    results.push({ name: "SMS test", status: "skip", message: "No API key", duration: 0 });
    console.log("");
  }

  console.log("\nStep 7/7: Setup Complete!");
  console.log("─".repeat(50) + "\n");

  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  const skipped = results.filter(r => r.status === "skip").length;

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                      SETUP SUMMARY                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  console.log(`   ✅ Passed:  ${passed}`);
  console.log(`   ❌ Failed:  ${failed}`);
  console.log(`   ⚪ Skipped: ${skipped}`);
  console.log(`   ⏱️  Time:    ${(totalDuration / 1000).toFixed(1)}s\n`);

  if (failed === 0) {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ SETUP SUCCESSFUL - Ready to start development!          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    console.log("🚀 To start the application:\n");
    console.log("   npm run dev\n");
    console.log("   Then open: http://localhost:5000\n");

    console.log("📚 Login credentials:\n");
    console.log("   This repo does not ship with hardcoded company emails.");
    console.log("   Use the credentials printed by the seed script (or create a user via admin/OTP flows).\n");
  } else {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ⚠️ SETUP COMPLETED WITH ISSUES                              ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    console.log("Please fix the failed steps above and run setup again:\n");
    console.log("   npm run setup:all\n");
    
    process.exit(1);
  }
}

masterSetup().catch(console.error);
