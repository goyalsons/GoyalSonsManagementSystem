import { prisma } from "./prisma";

/**
 * Audit logging for RBAC operations
 * All role, policy, and user-role assignment changes are logged
 */

export interface AuditLogData {
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, any>;
}

/**
 * Create audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        meta: data.meta || {},
      },
    });
  } catch (error) {
    // Don't throw - audit logging should not break the main operation
    console.error("[AuditLog] Failed to create audit log:", error);
  }
}

/**
 * Log role creation
 */
export async function logRoleCreation(userId: string, roleId: string, roleName: string): Promise<void> {
  await createAuditLog({
    userId,
    action: "create",
    entity: "role",
    entityId: roleId,
    meta: { roleName },
  });
}

/**
 * Log role update
 */
export async function logRoleUpdate(
  userId: string,
  roleId: string,
  roleName: string,
  changes: Record<string, any>
): Promise<void> {
  await createAuditLog({
    userId,
    action: "update",
    entity: "role",
    entityId: roleId,
    meta: { roleName, changes },
  });
}

/**
 * Log role deletion
 */
export async function logRoleDeletion(userId: string, roleId: string, roleName: string): Promise<void> {
  await createAuditLog({
    userId,
    action: "delete",
    entity: "role",
    entityId: roleId,
    meta: { roleName },
  });
}

/**
 * Log policy creation
 */
export async function logPolicyCreation(userId: string, policyId: string, policyKey: string): Promise<void> {
  await createAuditLog({
    userId,
    action: "create",
    entity: "policy",
    entityId: policyId,
    meta: { policyKey },
  });
}

/**
 * Log role-policy assignment changes
 */
export async function logRolePolicyChange(
  userId: string,
  roleId: string,
  roleName: string,
  addedPolicies: string[],
  removedPolicies: string[]
): Promise<void> {
  await createAuditLog({
    userId,
    action: "update",
    entity: "role_policy",
    entityId: roleId,
    meta: {
      roleName,
      addedPolicies,
      removedPolicies,
    },
  });
}

/**
 * Log user-role assignment
 */
export async function logUserRoleAssignment(
  userId: string,
  targetUserId: string,
  roleId: string,
  roleName: string,
  action: "assign" | "remove"
): Promise<void> {
  await createAuditLog({
    userId,
    action,
    entity: "user_role",
    entityId: targetUserId,
    meta: {
      roleId,
      roleName,
      targetUserId,
    },
  });
}
