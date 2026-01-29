import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set!");
  console.log("\nPlease set DATABASE_URL in your .env file or environment.");
  process.exit(1);
}

// Parse DATABASE_URL
const urlMatch = DATABASE_URL.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!urlMatch) {
  console.error("❌ Invalid DATABASE_URL format!");
  process.exit(1);
}

const [, username, password, host, port, database] = urlMatch;

console.log("\n========================================");
console.log("  DATABASE RESTORE UTILITY");
console.log("========================================\n");
console.log(`Database: ${database}`);
console.log(`Host: ${host}:${port}`);
console.log(`User: ${username}\n`);

// Do not ship a production DB dump in the repo. Provide a path at runtime.
// Usage:
//   npx tsx scripts/restore-database.ts path/to/backup.sql
// or
//   RESTORE_SQL_FILE=path/to/backup.sql npx tsx scripts/restore-database.ts
const sqlFile = process.argv[2] || process.env.RESTORE_SQL_FILE;

if (!sqlFile) {
  console.error("❌ No SQL backup file specified.");
  console.log("\nProvide the file path as an argument or set RESTORE_SQL_FILE.");
  console.log('Example: npx tsx scripts/restore-database.ts "backup.sql"');
  process.exit(1);
}

if (!existsSync(sqlFile)) {
  console.error(`❌ Backup file not found: ${sqlFile}`);
  console.log("\nPlease ensure the SQL backup file exists at the provided path.");
  process.exit(1);
}

console.log(`📁 Backup file: ${sqlFile}`);
console.log(`📊 File size: ${(readFileSync(sqlFile).length / 1024 / 1024).toFixed(2)} MB\n`);

console.log("⚠️  WARNING: This will RESTORE data to the database!");
console.log("   This may OVERWRITE existing data.\n");

// Set PGPASSWORD environment variable for psql
process.env.PGPASSWORD = password;

try {
  console.log("🔄 Starting database restore...\n");
  
  // Use psql to restore
  const command = `psql -h ${host} -p ${port} -U ${username} -d ${database} -f "${sqlFile}"`;
  
  console.log("Running restore command...");
  execSync(command, { 
    stdio: 'inherit',
    env: { ...process.env, PGPASSWORD: password }
  });
  
  console.log("\n========================================");
  console.log("  ✅ DATABASE RESTORE COMPLETE");
  console.log("========================================\n");
  
} catch (error: any) {
  console.error("\n❌ Restore failed!");
  console.error(error.message);
  console.log("\nTroubleshooting:");
  console.log("1. Ensure PostgreSQL client (psql) is installed");
  console.log("2. Check DATABASE_URL is correct");
  console.log("3. Verify database connection");
  console.log("4. Check file permissions\n");
  process.exit(1);
}

