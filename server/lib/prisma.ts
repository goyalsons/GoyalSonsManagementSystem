import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * SINGLETON: This is the only place the server app creates PrismaClient.
 * All server code must import { prisma } from this file (or re-export like sync-prisma).
 * Prevents "connection reset by peer" / pool fragmentation from multiple clients.
 */
const prismaInstance =
  globalThis.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

if (!globalThis.prisma) {
  globalThis.prisma = prismaInstance;
}

export const prisma = globalThis.prisma;

// Log connection errors safely (no credentials or full env).
prisma.$on("error" as never, (e: unknown) => {
  const msg =
    e != null && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : "Database error";
  console.error("[Prisma] Database error:", msg);
});

// Transaction safety: keep $transaction blocks short. For heavy sync, use small batches
// and run work outside a single long transaction to avoid "unexpected EOF" / connection drops.
