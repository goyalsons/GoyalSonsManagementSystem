import { PrismaClient } from "@prisma/client";

/**
 * Dedicated Prisma client for background sync jobs.
 *
 * Purpose:
 * - Keep long-running/batch sync queries from starving user-facing requests.
 * - Use a smaller connection limit for sync work.
 *
 * Notes:
 * - Connection limiting is best-effort and depends on Prisma URL params support.
 * - This client is intentionally NOT cached on globalThis to keep it isolated
 *   from the main request Prisma client.
 */

function withUrlParams(baseUrl: string, params: Record<string, string>): string {
  try {
    const u = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    // If parsing fails, fall back to raw URL.
    return baseUrl;
  }
}

const baseUrl = process.env.DATABASE_URL || "";
const limitedUrl = baseUrl
  ? withUrlParams(baseUrl, {
      // Prisma supports these for Postgres in connection strings.
      // Keep sync pool small to reduce contention with API traffic.
      connection_limit: process.env.SYNC_DB_CONNECTION_LIMIT || "2",
      pool_timeout: process.env.SYNC_DB_POOL_TIMEOUT || "10",
    })
  : baseUrl;

export const syncPrisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  datasources: {
    db: {
      url: limitedUrl,
    },
  },
});

