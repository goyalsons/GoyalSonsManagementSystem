import { describe, it, expect } from "vitest";
import { getTestPrisma } from "../helpers/db.js";

describe("Prisma integration", () => {
  it("connects to test database", async () => {
    const prisma = getTestPrisma();
    await expect(prisma.$queryRaw`SELECT 1 as n`).resolves.toEqual([{ n: 1 }]);
  });

  it("can count roles (read-only)", async () => {
    const prisma = getTestPrisma();
    const count = await prisma.role.count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can list roles with names", async () => {
    const prisma = getTestPrisma();
    const roles = await prisma.role.findMany({
      take: 5,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    expect(Array.isArray(roles)).toBe(true);
    roles.forEach((r) => {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
    });
  });

  it("can fetch a role with policies", async () => {
    const prisma = getTestPrisma();
    const role = await prisma.role.findFirst({
      include: {
        policies: { include: { policy: { select: { id: true, key: true } } } },
      },
    });
    if (!role) return; // no roles in DB
    expect(role).toHaveProperty("id");
    expect(role).toHaveProperty("name");
    expect(Array.isArray(role.policies)).toBe(true);
  });

  it("can count policies (read-only)", async () => {
    const prisma = getTestPrisma();
    const count = await prisma.policy.count();
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can list policies with key and category", async () => {
    const prisma = getTestPrisma();
    const policies = await prisma.policy.findMany({
      take: 5,
      orderBy: { key: "asc" },
      select: { id: true, key: true, category: true },
    });
    expect(Array.isArray(policies)).toBe(true);
    policies.forEach((p) => {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("key");
    });
  });
});
