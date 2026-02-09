/**
 * Railway-safe production start wrapper.
 *
 * Why:
 * - Railway healthchecks fail if `npm start` exits before the server listens.
 * - Our `npm start` runs `prisma migrate deploy` first; if Prisma detects a previously
 *   failed migration, it will refuse to continue until it is resolved.
 * - In this repo, migration `20260119114801_init` only creates indexes. If it was
 *   previously marked as failed due to duplicate indexes, we can safely mark it
 *   as applied after making it idempotent.
 *
 * Behavior:
 * - Log sanitized DATABASE_URL (host/user only; never password).
 * - Run `prisma migrate deploy`. On failure: exit(1) with clear message (no hang).
 * - If it fails and output references `20260119114801_init`, run migrate resolve then retry.
 * - Run `prisma db seed` only if RUN_SEED_ON_START=1.
 * - Start the server (`node dist/index.cjs`). Server must listen on process.env.PORT and 0.0.0.0.
 *
 * Railway healthcheck: set healthcheckPath to /healthz.
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");

function sanitizeDatabaseUrl(url) {
  if (!url || typeof url !== "string") return "(not set)";
  try {
    const u = new URL(url);
    const user = u.username ? `${u.username}@` : "";
    return `${u.protocol}//${user}${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname || ""}`;
  } catch {
    return "(invalid url)";
  }
}

function hasPasswordInUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return Boolean(u.password && u.password.length > 0);
  } catch {
    return false;
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    shell: true,
    env: process.env,
    encoding: "utf8",
    ...options,
  });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return { status: result.status ?? 1, stdout, stderr };
}

function shouldAutoResolveInitMigration(output) {
  const text = String(output || "");
  // Heuristic: Prisma refusing deploy due to a previously failed migration.
  // We only auto-resolve the known safe migration id.
  return (
    text.includes("20260119114801_init") &&
    (text.includes("Following migration") ||
      text.includes("have failed") ||
      text.includes("failed migration") ||
      text.includes("P3009") ||
      text.includes("P3018") ||
      text.includes("migrate resolve"))
  );
}

function main() {
  const dbUrl = process.env.DATABASE_URL;
  const sanitized = sanitizeDatabaseUrl(dbUrl);
  const passwordSet = hasPasswordInUrl(dbUrl);

  console.log("[start] DATABASE_URL (sanitized):", sanitized);
  console.log("[start] DATABASE_URL has password:", passwordSet);
  console.log("[start] PORT:", process.env.PORT ?? "(not set, app will use default)");

  if (!dbUrl || typeof dbUrl !== "string" || dbUrl.trim() === "") {
    console.error("[start] FATAL: DATABASE_URL is not set. Set it in Railway Variables (e.g. reference Postgres DATABASE_URL).");
    process.exit(1);
  }

  console.log("[start] Running prisma migrate deploy...");
  const deploy1 = run("npx", ["prisma", "migrate", "deploy"]);

  if (deploy1.status !== 0) {
    const combined = `${deploy1.stdout}\n${deploy1.stderr}`;
    if (shouldAutoResolveInitMigration(combined)) {
      console.warn(
        "[start] Detected blocked migration `20260119114801_init`. Auto-resolving as applied and retrying deploy...",
      );
      const resolve = run("npx", [
        "prisma",
        "migrate",
        "resolve",
        "--applied",
        "20260119114801_init",
      ]);
      if (resolve.status !== 0) {
        console.error("[start] migrate resolve failed; aborting start.");
        process.exit(1);
      }

      console.log("[start] Retrying prisma migrate deploy...");
      const deploy2 = run("npx", ["prisma", "migrate", "deploy"]);
      if (deploy2.status !== 0) {
        console.error("[start] prisma migrate deploy failed after retry. Aborting. Check logs above.");
        process.exit(1);
      }
    } else {
      console.error("[start] prisma migrate deploy failed (e.g. P1000 auth, network, or migration error). Aborting. Check logs above.");
      process.exit(1);
    }
  }
  console.log("[start] prisma migrate deploy completed.");

  // Seed only when explicitly requested (e.g. first-time deploy). Prevents production data reset on restart.
  if (process.env.RUN_SEED_ON_START === "1") {
    console.log("[start] RUN_SEED_ON_START=1 — running prisma db seed...");
    const seedResult = run("npx", ["prisma", "db", "seed"]);
    if (seedResult.status !== 0) {
      console.warn("[start] prisma db seed failed (non-fatal). Server will still start.", seedResult.stderr || "");
    } else {
      console.log("[start] Seed completed.");
    }
  } else {
    console.log("[start] Seed skipped (set RUN_SEED_ON_START=1 to run seed on start).");
  }

  console.log("[start] Starting server...");
  const serverPath = path.join(process.cwd(), "dist", "index.cjs");
  const child = spawn("node", [serverPath], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });

  // Forward termination signals so Railway can stop the service cleanly.
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      try {
        child.kill(sig);
      } catch {}
    });
  }
}

main();

