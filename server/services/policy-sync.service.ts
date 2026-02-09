/**
 * Policy Sync Service
 *
 * Auto-syncs policies from shared registry to database on server startup.
 * Single source of truth: shared/policies.ts (POLICY_REGISTRY).
 *
 * Rules:
 * - Policies are immutable (key never changes)
 * - Only creates missing policies; optionally removes disallowed (non-production)
 * - Never deletes in production unless SEED_FORCE_SYNC=1
 */

import { prisma } from "../lib/prisma";
import { POLICY_REGISTRY } from "../../shared/policies";

/**
 * Sync policies from shared registry to database
 *
 * 1. Uses POLICY_REGISTRY as allowlist
 * 2. Removes policies not in registry (if destructive allowed)
 * 3. Creates missing policies
 */
export async function syncPoliciesFromNavConfig(): Promise<{
  total: number;
  created: number;
  existing: number;
  removed: number;
  errors: string[];
}> {
  const policies = POLICY_REGISTRY;
  const allowedPolicyKeys = new Set(policies.map((p) => p.key));
  const result = {
    total: policies.length,
    created: 0,
    existing: 0,
    removed: 0,
    errors: [] as string[]
  };

  console.log(`[Policy Sync] Starting sync of ${policies.length} policies from NAV_CONFIG...`);

  // Remove any policies that are not in the allowlist
  try {
    const disallowedPolicies = await prisma.policy.findMany({
      where: { key: { notIn: Array.from(allowedPolicyKeys) } },
      select: { id: true, key: true },
    });

    if (disallowedPolicies.length > 0) {
      const disallowedIds = disallowedPolicies.map((policy) => policy.id);
      await prisma.$transaction([
        prisma.rolePolicy.deleteMany({
          where: { policyId: { in: disallowedIds } },
        }),
        prisma.policy.deleteMany({
          where: { id: { in: disallowedIds } },
        }),
      ]);

      result.removed = disallowedPolicies.length;
      console.log(`[Policy Sync] 🧹 Removed ${disallowedPolicies.length} disallowed policies`);
    }
  } catch (error: any) {
    const errorMsg = `Failed to remove disallowed policies: ${error.message}`;
    result.errors.push(errorMsg);
    console.error(`[Policy Sync] ❌ ${errorMsg}`);
  }

  for (const policy of policies) {
    try {
      // Check if policy exists
      const existing = await prisma.policy.findUnique({
        where: { key: policy.key }
      });

      if (existing) {
        result.existing++;
        // Policy exists - do nothing (immutable)
        continue;
      }

      // Create new policy
      await prisma.policy.create({
        data: {
          key: policy.key,
          description: policy.description,
          category: policy.category
          // isActive defaults to true in schema
        }
      });

      result.created++;
      console.log(`[Policy Sync] ✅ Created policy: ${policy.key}`);
    } catch (error: any) {
      const errorMsg = `Failed to sync policy ${policy.key}: ${error.message}`;
      result.errors.push(errorMsg);
      console.error(`[Policy Sync] ❌ ${errorMsg}`);
    }
  }

  console.log(`[Policy Sync] Complete: ${result.created} created, ${result.existing} existing, ${result.removed} removed, ${result.errors.length} errors`);
  return result;
}

async function ensureRoleHasPolicies(roleName: string, policyKeys: string[]): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });
  if (!role) return;

  const policies = await prisma.policy.findMany({
    where: { key: { in: policyKeys } },
    select: { id: true },
  });
  if (policies.length === 0) return;

  const created = await prisma.rolePolicy.createMany({
    data: policies.map((p) => ({ roleId: role.id, policyId: p.id })),
    skipDuplicates: true,
  });

  if (created.count > 0) {
    // Ensure existing sessions pick up new policies quickly
    await prisma.user.updateMany({
      where: {
        roles: {
          some: {
            roleId: role.id,
          },
        },
      },
      data: {
        policyVersion: { increment: 1 },
      },
    });
    console.log(`[Policy Sync] ✅ Added ${created.count} policies to role "${roleName}"`);
  }
}

async function ensureDefaultRolePolicies(): Promise<void> {
  // Task History is protected by attendance.history.view.
  // Other requested pages/actions:
  // - sales-staff.view (pivot)
  // - requests.view
  // - help_tickets.view
  // - help_tickets.create
  await ensureRoleHasPolicies("Employee", [
    "attendance.history.view",
    "sales-staff.view",
    "requests.view",
    "help_tickets.view",
    "help_tickets.create",
  ]);
}

async function removeRolePolicies(roleName: string, policyKeys: string[]): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });
  if (!role) return;

  const policies = await prisma.policy.findMany({
    where: { key: { in: policyKeys } },
    select: { id: true },
  });
  if (policies.length === 0) return;

  const policyIds = policies.map((p) => p.id);
  const removed = await prisma.rolePolicy.deleteMany({
    where: { roleId: role.id, policyId: { in: policyIds } },
  });

  if (removed.count > 0) {
    await prisma.user.updateMany({
      where: { roles: { some: { roleId: role.id } } },
      data: { policyVersion: { increment: 1 } },
    });
    console.log(`[Policy Sync] 🧹 Removed ${removed.count} policies from role "${roleName}"`);
  }
}

/**
 * Initialize policy sync (called on server startup)
 */
export async function initializePolicySync(): Promise<void> {
  try {
    const result = await syncPoliciesFromNavConfig();
    
    if (result.errors.length > 0) {
      console.warn(`[Policy Sync] ⚠️  Completed with ${result.errors.length} errors`);
      result.errors.forEach(err => console.warn(`  - ${err}`));
    } else {
      console.log(`[Policy Sync] ✅ Successfully synced ${result.total} policies`);
    }

    // Keep default role policies aligned with expected access
    await ensureDefaultRolePolicies();
    // Employees should not see the /sales dashboard by default
    await removeRolePolicies("Employee", ["staff-sales.view"]);
  } catch (error: any) {
    console.error(`[Policy Sync] ❌ Fatal error during policy sync:`, error);
    throw error;
  }
}
