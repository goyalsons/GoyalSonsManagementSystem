import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Single PrismaClient instance per process (singleton). Prevents connection pool fragmentation.
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
