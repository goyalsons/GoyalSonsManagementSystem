/**
 * Load test environment. Call once at the start of test setup (e.g. in vitest config or globalSetup).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = typeof import.meta.dirname !== "undefined"
  ? import.meta.dirname
  : path.dirname(fileURLToPath(import.meta.url));

export function loadTestEnv() {
  const root = path.resolve(__dirname, "../..");
  dotenv.config({ path: path.join(root, ".env.test") });
  dotenv.config({ path: path.join(root, ".env") }); // .env overrides for local
  process.env.NODE_ENV = "test";
}
