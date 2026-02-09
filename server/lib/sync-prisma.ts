/**
 * Use the shared Prisma singleton for sync jobs to avoid multiple connection pools
 * and intermittent "connection closed" issues in production.
 */
import { prisma } from "./prisma";

export const syncPrisma = prisma;

