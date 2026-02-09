/**
 * One-off: print DATABASE_URL parts (password hidden). Run: node scripts/check-db-url.cjs
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const u = process.env.DATABASE_URL || "";
if (!u) {
  console.log("DATABASE_URL is not set");
  process.exit(1);
}
const redacted = u.replace(/^(postgresql:\/\/[^:]+:)([^@]+)(@.*)$/, (_, pre, _p, post) => pre + "***" + post);
console.log("URL (password hidden):", redacted);
const match = u.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?\s]+)/);
if (match) {
  const [, user, , host, port, db] = match;
  console.log("User:", user, "| Host:", host, "| Port:", port || "5432", "| DB:", db);
}
