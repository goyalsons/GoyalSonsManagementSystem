/**
 * Resilient database connectivity for startup and schedulers.
 * - waitForDatabase: retry with backoff until DB responds (no crash loops).
 * - isConnectionError: detect DB/connection errors for pausing schedulers.
 */
import { prisma } from "./prisma";

const DEFAULT_MAX_ATTEMPTS = 30;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

export function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = "message" in err ? String((err as { message: unknown }).message) : "";
  const code = "code" in err ? (err as { code?: string }).code : "";
  return (
    code === "P1001" ||
    code === "P1008" ||
    /connection reset by peer|connection closed|unexpected eof|ECONNRESET|ECONNREFUSED|Connection terminated/i.test(msg)
  );
}

/**
 * Run a lightweight query to verify DB is reachable.
 * Does not retry; throws on failure.
 */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

/**
 * Wait for database to become reachable with exponential backoff.
 * Use at startup before starting schedulers. Does not crash the process.
 */
export async function waitForDatabase(options?: {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let delayMs = options?.initialDelayMs ?? INITIAL_DELAY_MS;
  const maxDelayMs = options?.maxDelayMs ?? MAX_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        console.log(`[DB] Connection OK on attempt ${attempt}`);
      }
      return true;
    } catch (err: any) {
      const msg = err?.message ?? "unknown";
      console.warn(`[DB] Connection check failed (attempt ${attempt}/${maxAttempts}):`, msg);
      if (attempt === maxAttempts) {
        console.error("[DB] Max attempts reached. Schedulers will not start. Fix DB and restart.");
        return false;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, maxDelayMs);
    }
  }
  return false;
}
