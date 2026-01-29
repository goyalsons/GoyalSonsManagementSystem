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
 * - Run `prisma migrate deploy`
 * - If it fails and output references `20260119114801_init`, run:
 *     `prisma migrate resolve --applied 20260119114801_init`
 *   then retry `prisma migrate deploy`
 * - Start the server (`node dist/index.cjs`)
 */
const { spawn, spawnSync } = require("child_process");
const path = require("path");

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
        process.exit(resolve.status || 1);
      }

      console.log("[start] Retrying prisma migrate deploy...");
      const deploy2 = run("npx", ["prisma", "migrate", "deploy"]);
      if (deploy2.status !== 0) {
        console.error("[start] prisma migrate deploy still failing; aborting start.");
        process.exit(deploy2.status || 1);
      }
    } else {
      console.error("[start] prisma migrate deploy failed; aborting start.");
      process.exit(deploy1.status || 1);
    }
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

