import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = globalThis.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Handle connection errors gracefully
prisma.$on('error' as never, (e: any) => {
  console.error('[Prisma] Database error:', e);
});

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
