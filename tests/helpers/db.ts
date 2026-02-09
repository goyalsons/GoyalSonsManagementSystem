/**
 * Test DB helpers: use DATABASE_URL from .env.test for integration tests.
 * For isolated runs, use a separate test DB (e.g. gms_test) and run migrations.
 */
import { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    });
  }
  return _prisma;
}

export async function disconnectTestPrisma() {
  if (_prisma) {
    await _prisma.$disconnect();
    _prisma = null;
  }
}
