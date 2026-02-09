/**
 * Director role: system role with immutable full access.
 * - Single canonical name: "Director"
 * - Must always have ALL policies from registry (enforced on boot/seed/login).
 * - Role and its policy assignments must not be modified via UI or API.
 */
import type { PrismaClient } from "@prisma/client";
import { POLICY_KEYS_FLAT } from "../../shared/policies";

export const DIRECTOR_ROLE_NAME = "Director";

export function isDirectorRoleName(name: string | null | undefined): boolean {
  return name === DIRECTOR_ROLE_NAME;
}

export async function getDirectorRoleId(prisma: PrismaClient): Promise<string | null> {
  const role = await prisma.role.findUnique({
    where: { name: DIRECTOR_ROLE_NAME },
    select: { id: true },
  });
  return role?.id ?? null;
}

export async function isDirectorRoleId(prisma: PrismaClient, roleId: string): Promise<boolean> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { name: true },
  });
  return role?.name === DIRECTOR_ROLE_NAME;
}

/**
 * Ensure Director role exists and has ALL policy keys from the registry.
 * Call on boot, after policy sync, and before assigning Director to a user.
 * Never removes policies from Director.
 */
export async function ensureDirectorHasAllPolicies(prisma: PrismaClient): Promise<void> {
  const role = await prisma.role.upsert({
    where: { name: DIRECTOR_ROLE_NAME },
    update: {},
    create: {
      name: DIRECTOR_ROLE_NAME,
      description: "System role with full access. Policies are immutable.",
    },
    select: { id: true },
  });

  const policies = await prisma.policy.findMany({
    where: { key: { in: POLICY_KEYS_FLAT } },
    select: { id: true },
  });

  if (policies.length === 0) return;

  const existing = await prisma.rolePolicy.findMany({
    where: { roleId: role.id },
    select: { policyId: true },
  });
  const existingSet = new Set(existing.map((rp) => rp.policyId));
  const policyIds = policies.map((p) => p.id);
  const missing = policyIds.filter((id) => !existingSet.has(id));

  if (missing.length > 0) {
    await prisma.rolePolicy.createMany({
      data: missing.map((policyId) => ({ roleId: role.id, policyId })),
      skipDuplicates: true,
    });
  }
}
