import { prisma } from "./prisma";

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

export interface UserWithRoles {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  orgUnitId: string | null;
  roles: { id: string; name: string }[];
}

export async function isCEO(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
    },
  });

  if (!user) return false;
  return user.isSuperAdmin;
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

export async function getUserWithRoles(userId: string): Promise<UserWithRoles | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
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
    isSuperAdmin: user.isSuperAdmin,
    orgUnitId: user.orgUnitId,
    roles: user.roles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
    })),
  };
}

export async function getUserPolicies(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      roles: {
        include: {
          role: {
            include: {
              policies: {
                include: {
                  policy: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return [];

  // SuperAdmin gets all policies
  if (user.isSuperAdmin) {
    const allPolicies = await prisma.policy.findMany({
      select: { key: true },
    });
    return allPolicies.map((p) => p.key);
  }

  // Get all policies from user's roles
  const policyKeys = new Set<string>();
  for (const userRole of user.roles) {
    for (const rolePolicy of userRole.role.policies) {
      policyKeys.add(rolePolicy.policy.key);
    }
  }

  return Array.from(policyKeys);
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

  // SuperAdmin bypasses all checks
  if (user.isSuperAdmin) {
    return { allowed: true };
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
      isSuperAdmin: true,
      orgUnitId: true,
    },
  });

  if (!user) return [];

  if (user.isSuperAdmin) {
    const allOrgs = await prisma.orgUnit.findMany({ select: { id: true } });
    return allOrgs.map((o) => o.id);
  }

  if (!user.orgUnitId) return [];

  return getOrgSubtreeIds(user.orgUnitId);
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

  // Check if user is a manager
  let isManager = false;
  let managerScopes = null;
  // Get card number from the employee record (it's selected in the query above)
  const employeeCardNo = fullUser?.employee?.cardNumber || null;
  
  console.log(`[getUserAuthInfo] Checking manager status for userId=${userId}, employeeCardNo=${employeeCardNo}`);
  
  if (employeeCardNo) {
    const managerAssignments = await prisma.$queryRaw<Array<{
      mid: string;
      mcardno: string;
      mdepartmentId: string | null;
      mdesignationId: string | null;
      morgUnitId: string | null;
      mis_extinct: boolean;
    }>>`
      SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
      FROM "emp_manager"
      WHERE "mcardno" = ${employeeCardNo} AND "mis_extinct" = false
    `;
    
    if (managerAssignments.length > 0) {
      isManager = true;
      const departmentIds = Array.from(new Set(managerAssignments.map(m => m.mdepartmentId).filter((id): id is string => id !== null)));
      const designationIds = Array.from(new Set(managerAssignments.map(m => m.mdesignationId).filter((id): id is string => id !== null)));
      const orgUnitIds = Array.from(new Set(managerAssignments.map(m => m.morgUnitId).filter((id): id is string => id !== null)));
      managerScopes = {
        departmentIds: departmentIds.length > 0 ? departmentIds : null,
        designationIds: designationIds.length > 0 ? designationIds : null,
        orgUnitIds: orgUnitIds.length > 0 ? orgUnitIds : null,
      };
      console.log(`[getUserAuthInfo] ✅ User is a manager with ${managerAssignments.length} assignment(s)`);
    } else {
      console.log(`[getUserAuthInfo] ❌ User is NOT a manager (no assignments found for card ${employeeCardNo})`);
    }
  } else {
    console.log(`[getUserAuthInfo] ❌ User is NOT a manager (no employee card number)`);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
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
    isManager,
    managerScopes,
  };
}
