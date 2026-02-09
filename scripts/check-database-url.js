/**
 * One-time diagnostic: print DATABASE_URL with password redacted.
 * Run from project root: node scripts/check-database-url.js
 * Helps verify .env is loaded and the URL format (user, host, database name).
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL is not set in .env (or .env not loaded).");
  process.exit(1);
}

// Redact password: postgresql://user:PASSWORD@host:port/db -> postgresql://user:***@host:port/db
const redacted = url.replace(
  /^(postgresql:\/\/[^:]+:)([^@]+)(@.*)$/,
  (_, before, _pass, after) => before + "***" + after
);
console.log("DATABASE_URL (password hidden):", redacted);

// Parse and print parts so user can verify
const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?\s]+)/);
if (match) {
  const [, user, , host, port, db] = match;
  console.log("  User:", user);
  console.log("  Host:", host);
  console.log("  Port:", port || "5432");
  console.log("  Database:", db);
} else {
  console.log("  (Could not parse URL - check format)");
}
