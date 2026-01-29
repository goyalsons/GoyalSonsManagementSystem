import { prisma } from "./prisma";

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

export interface UserWithRoles {
  id: string;
  name: string;
  email: string;
  orgUnitId: string | null;
  roles: { id: string; name: string }[];
}

export async function getOrgSubtreeIds(orgUnitId: string): Promise<string[]> {
  const result = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE org_tree AS (
      SELECT id FROM "OrgUnit" WHERE id = ${orgUnitId}
      UNION ALL
      SELECT o.id FROM "OrgUnit" o
      INNER JOIN org_tree t ON o."parentId" = t.id
    )
    SELECT id FROM org_tree
  `;

  return result.map((row) => row.id);
}

// In-memory org subtree cache keyed by orgUnitId.
// Invalidate explicitly when org structure changes.
const orgSubtreeCache = new Map<string, string[]>();

export function invalidateOrgSubtreeCache(orgUnitId?: string): void {
  if (!orgUnitId) {
    orgSubtreeCache.clear();
    return;
  }
  orgSubtreeCache.delete(orgUnitId);
}

export async function getUserWithRoles(userId: string): Promise<UserWithRoles | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      orgUnitId: true,
      roles: {
        include: {
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgUnitId: user.orgUnitId,
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
    })),
  };
}

export async function getUserPolicies(userId: string): Promise<string[]> {
  /**
   * Performance goals:
   * - Normal users (few roles/policies): keep JS work tiny (map/filter only).
   * - Large role/policy graphs: offload dedupe to Postgres with DISTINCT.
   *
   * Note on worker threads:
   * - Building a Set for ~1k strings is already sub-millisecond.
   * - A worker hop typically costs more than it saves for this workload.
   * - We therefore prefer DB-side DISTINCT for large sets instead of CPU offload.
   */

  // Fetch roleIds first (small, indexed join via UserRole)
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });

  if (userRoles.length === 0) return [];

  const roleIds = userRoles.map((ur) => ur.roleId);

  // If the user has many roles, avoid building a huge IN() list and let Postgres do DISTINCT.
  const rawSqlRoleThreshold = Math.max(
    1,
    Number(process.env.USER_POLICIES_RAW_SQL_ROLE_THRESHOLD || "200"),
  );

  if (roleIds.length >= rawSqlRoleThreshold) {
    const rows = await prisma.$queryRaw<{ key: string }[]>`
      SELECT DISTINCT p.key
      FROM "UserRole" ur
      INNER JOIN "RolePolicy" rp ON rp."roleId" = ur."roleId"
      INNER JOIN "Policy" p ON p.id = rp."policyId"
      WHERE ur."userId" = ${userId}
    `;
    return rows.map((r) => r.key);
  }

  // Small/normal case: Prisma query with DB-side distinct to minimize duplicates and JS work.
  const rolePolicies = await prisma.rolePolicy.findMany({
    where: { roleId: { in: roleIds } },
    distinct: ["policyId"],
    select: {
      policy: {
        select: { key: true },
      },
    },
  });

  return rolePolicies
    .map((rp) => rp.policy?.key)
    .filter((k): k is string => Boolean(k));
}

export async function hasPolicy(userId: string, policyKey: string): Promise<boolean> {
  const policies = await getUserPolicies(userId);
  return policies.includes(policyKey);
}

export async function authorize(params: {
  userId: string;
  actionKey: string;
  targetOrgUnitId?: string;
  targetUserId?: string;
}): Promise<AuthorizationResult> {
  const { userId, actionKey, targetOrgUnitId, targetUserId } = params;

  // Load user with policies
  const user = await getUserWithRoles(userId);
  if (!user) {
    return { allowed: false, reason: "user_not_found" };
  }

  // Check if user has the required policy
  const policies = await getUserPolicies(userId);
  if (!policies.includes(actionKey)) {
    return { allowed: false, reason: "missing_policy" };
  }

  // Check org scope if targetOrgUnitId is provided
  if (targetOrgUnitId && user.orgUnitId) {
    const subtreeIds = await getOrgSubtreeIds(user.orgUnitId);
    if (!subtreeIds.includes(targetOrgUnitId)) {
      return { allowed: false, reason: "org_out_of_scope" };
    }
  }

  // Check org scope if targetUserId is provided (for user operations)
  if (targetUserId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { orgUnitId: true },
    });

    if (!targetUser) {
      return { allowed: false, reason: "target_user_not_found" };
    }

    if (targetUser.orgUnitId && user.orgUnitId) {
      const subtreeIds = await getOrgSubtreeIds(user.orgUnitId);
      if (!subtreeIds.includes(targetUser.orgUnitId)) {
        return { allowed: false, reason: "org_out_of_scope" };
      }
    }
  }

  return { allowed: true };
}

export async function getAccessibleOrgUnitIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      orgUnitId: true,
    },
  });

  if (!user) return [];

  if (!user.orgUnitId) return [];

  const cached = orgSubtreeCache.get(user.orgUnitId);
  if (cached) return cached;

  const subtreeIds = await getOrgSubtreeIds(user.orgUnitId);
  orgSubtreeCache.set(user.orgUnitId, subtreeIds);
  return subtreeIds;
}

export async function getUserAuthInfo(userId: string) {
  const user = await getUserWithRoles(userId);
  if (!user) return null;

  const policies = await getUserPolicies(userId);
  const accessibleOrgUnitIds = await getAccessibleOrgUnitIds(userId);

  const fullUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      employeeId: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          gender: true,
          cardNumber: true,
          designation: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    orgUnitId: user.orgUnitId,
    employeeId: fullUser?.employeeId || null,
    roles: user.roles.map((ur) => ({
      id: ur.id,
      name: ur.name,
    })),
    policies,
    accessibleOrgUnitIds,
    employee: fullUser?.employee ? {
      firstName: fullUser.employee.firstName,
      lastName: fullUser.employee.lastName,
      gender: fullUser.employee.gender,
      designationCode: fullUser.employee.designation?.code || null,
      designationName: fullUser.employee.designation?.name || null,
    } : null,
  };
}
