/**
 * Role Assignment Security
 * 
 * Prevents privilege escalation by enforcing strict rules:
 * 
 * 1. Assigner must have admin.panel policy
 * 2. Assigner must own ALL non-org-scoped policies in the role being assigned
 * 3. Cannot assign roles to users outside org scope
 * 
 * Org-scoped policies are those that filter data by orgUnit.
 * Non-org-scoped policies are global system permissions.
 * 
 * Rationale:
 * - A user cannot grant permissions they don't have
 * - Prevents creating "super users" by accident
 * - Maintains principle of least privilege
 */

import { prisma } from "./prisma";
import { getUserPolicies } from "./authorization";
import { getAccessibleOrgUnitIds } from "./authorization";

export interface RoleAssignmentCheckResult {
  allowed: boolean;
  reason?: string;
  missingPolicies?: string[];
}

/**
 * List of policies that are NOT org-scoped (global permissions)
 * These policies must be owned by the assigner before they can grant them.
 */
const NON_ORG_SCOPED_POLICIES = [
  "dashboard.view",
  "roles-assigned.view",
  "employees.view",
  "attendance.history.view",
  "staff-sales.view",
  "sales-staff.view",
  "admin.panel",
  "admin.routing.view",
  "admin.master-settings.view",
  "integrations.fetched-data.view",
  "trainings.view",
  "requests.view",
  "salary.view",
  "settings.view",
  "assigned-manager.view",
  "help_tickets.view",
  "help_tickets.create",
  "help_tickets.update",
  "help_tickets.assign",
  "help_tickets.close",
  "no_policy.view",
] as const;

/**
 * Check if a policy is org-scoped
 * 
 * Org-scoped policies filter data by organizational unit.
 * Non-org-scoped policies are global system permissions.
 */
function isOrgScopedPolicy(policyKey: string): boolean {
  return !NON_ORG_SCOPED_POLICIES.includes(policyKey as any);
}

/**
 * Check if a user can assign a role to another user
 * 
 * Security Rules:
 * 1. Assigner must have admin.panel policy
 * 2. Assigner must own all non-org-scoped policies in the role
 * 3. Target user must be within assigner's org scope
 * 
 * @param assignerUserId - User ID of the person assigning the role
 * @param targetUserId - User ID of the person receiving the role
 * @param roleId - Role ID being assigned
 * @returns Check result with allowed status and reason if denied
 */
export async function canAssignRole(params: {
  assignerUserId: string;
  targetUserId: string;
  roleId: string;
}): Promise<RoleAssignmentCheckResult> {
  const { assignerUserId, targetUserId, roleId } = params;

  // Load assigner user
  const assigner = await prisma.user.findUnique({
    where: { id: assignerUserId },
    select: {
      id: true,
      orgUnitId: true,
    },
  });

  if (!assigner) {
    return { allowed: false, reason: "assigner_not_found" };
  }

  // Rule 1: Check if assigner has admin.panel policy
  const assignerPolicies = await getUserPolicies(assignerUserId);
  if (!assignerPolicies.includes("admin.panel")) {
    return { allowed: false, reason: "missing_assign_role_policy" };
  }

  // Load target user
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      orgUnitId: true,
    },
  });

  if (!targetUser) {
    return { allowed: false, reason: "target_user_not_found" };
  }

  // Rule 3: Check org scope
  if (targetUser.orgUnitId && assigner.orgUnitId) {
    const accessibleOrgUnitIds = await getAccessibleOrgUnitIds(assignerUserId);
    if (!accessibleOrgUnitIds.includes(targetUser.orgUnitId)) {
      return { allowed: false, reason: "target_user_out_of_scope" };
    }
  }

  // Load role with its policies
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: {
      policies: {
        include: {
          policy: {
            select: {
              key: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!role) {
    return { allowed: false, reason: "role_not_found" };
  }

  // Rule 2: Check if assigner owns all non-org-scoped policies in the role
  const rolePolicies = role.policies
    .filter((rp) => rp.policy.isActive) // Only active policies
    .map((rp) => rp.policy.key);

  const nonOrgScopedPoliciesInRole = rolePolicies.filter((key) => !isOrgScopedPolicy(key));
  const missingPolicies = nonOrgScopedPoliciesInRole.filter(
    (policyKey) => !assignerPolicies.includes(policyKey)
  );

  if (missingPolicies.length > 0) {
    return {
      allowed: false,
      reason: "privilege_escalation_prevention",
      missingPolicies,
    };
  }

  return { allowed: true };
}

/**
 * Check if a user can remove a role from another user
 * 
 * Same security rules as assignment, but slightly relaxed:
 * - Still requires admin.panel policy
 * - Still requires org scope check
 * - No need to check policy ownership (removal is less dangerous)
 */
export async function canRemoveRole(params: {
  assignerUserId: string;
  targetUserId: string;
  roleId: string;
}): Promise<RoleAssignmentCheckResult> {
  const { assignerUserId, targetUserId } = params;

  const assigner = await prisma.user.findUnique({
    where: { id: assignerUserId },
    select: {
      id: true,
      orgUnitId: true,
    },
  });

  if (!assigner) {
    return { allowed: false, reason: "assigner_not_found" };
  }

  // Must have admin.panel policy
  const assignerPolicies = await getUserPolicies(assignerUserId);
  if (!assignerPolicies.includes("admin.panel")) {
    return { allowed: false, reason: "missing_assign_role_policy" };
  }

  // Check org scope
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      orgUnitId: true,
    },
  });

  if (!targetUser) {
    return { allowed: false, reason: "target_user_not_found" };
  }

  if (targetUser.orgUnitId && assigner.orgUnitId) {
    const accessibleOrgUnitIds = await getAccessibleOrgUnitIds(assignerUserId);
    if (!accessibleOrgUnitIds.includes(targetUser.orgUnitId)) {
      return { allowed: false, reason: "target_user_out_of_scope" };
    }
  }

  return { allowed: true };
}
