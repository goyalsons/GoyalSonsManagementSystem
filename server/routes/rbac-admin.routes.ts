/**
 * RBAC Admin APIs
 * 
 * These endpoints allow admin users to manage:
 * - Roles (CRUD)
 * - Policies (CRUD, enable/disable)
 * - User-Role assignments
 * 
 * All operations are:
 * - Protected by requireAuth
 * - Protected by requirePolicy (admin.panel or specific policies)
 * - Audited (logged to AuditLog)
 * - Validated (input validation)
 * 
 * Changes take effect immediately:
 * - Policy changes: User's policyVersion is incremented, forcing JWT refresh
 * - Role changes: Affected users' policyVersion is incremented
 * - User-role assignments: Target user's policyVersion is incremented
 */

import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import {
  validatePolicyKey,
  validateRoleName,
  validatePolicyIds,
  validateUUID,
} from "../lib/validation";
import {
  logRoleCreation,
  logRoleUpdate,
  logRoleDeletion,
  logPolicyCreation,
  logRolePolicyChange,
  logUserRoleAssignment,
} from "../lib/audit-log";
import { canAssignRole, canRemoveRole } from "../lib/role-assignment-security";

/**
 * Increment policy version for a user
 * This forces them to re-login to get fresh policies
 */
async function incrementUserPolicyVersion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      policyVersion: { increment: 1 },
    },
  });
}

/**
 * Increment policy version for all users with a specific role
 * Used when role's policies change
 */
async function incrementPolicyVersionForRoleUsers(roleId: string): Promise<void> {
  const usersWithRole = await prisma.userRole.findMany({
    where: { roleId },
    select: { userId: true },
  });

  const userIds = usersWithRole.map((ur) => ur.userId);
  if (userIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: {
        policyVersion: { increment: 1 },
      },
    });
  }
}

export function registerRBACAdminRoutes(app: Express): void {
  // ==================== POLICIES ====================

  /**
   * GET /api/admin/policies
   * List all policies (for admin UI)
   */
  app.get("/api/admin/policies", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const policies = await prisma.policy.findMany({
        orderBy: { key: "asc" },
      });
      res.json(policies);
    } catch (error) {
      console.error("Get policies error:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  /**
   * POST /api/admin/policies
   * Create new policy
   */
  app.post("/api/admin/policies", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { key, description, category } = req.body;

      // Validate policy key
      const keyValidation = validatePolicyKey(key);
      if (!keyValidation.valid) {
        return res.status(400).json({ message: keyValidation.error });
      }

      // Check if policy already exists
      const existing = await prisma.policy.findUnique({
        where: { key },
      });

      if (existing) {
        return res.status(409).json({ message: "Policy with this key already exists" });
      }

      // Create policy
      const policy = await prisma.policy.create({
        data: {
          key,
          description: description || null,
          category: category || null,
          isActive: true,
        },
      });

      // Audit log
      await logPolicyCreation(req.user!.id, policy.id, policy.key);

      res.status(201).json(policy);
    } catch (error: any) {
      console.error("Create policy error:", error);
      res.status(500).json({ message: error.message || "Failed to create policy" });
    }
  });

  /**
   * PUT /api/admin/policies/:id
   * Update policy (enable/disable, description, category)
   */
  app.put("/api/admin/policies/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;
      const { description, category, isActive } = req.body;

      const validation = validateUUID(id);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid policy ID" });
      }

      const policy = await prisma.policy.findUnique({
        where: { id },
      });

      if (!policy) {
        return res.status(404).json({ message: "Policy not found" });
      }

      const updated = await prisma.policy.update({
        where: { id },
        data: {
          description: description !== undefined ? description : policy.description,
          category: category !== undefined ? category : policy.category,
          isActive: isActive !== undefined ? isActive : policy.isActive,
        },
      });

      // If policy was disabled, increment version for all users with roles containing this policy
      if (isActive === false && policy.isActive === true) {
        const rolesWithPolicy = await prisma.rolePolicy.findMany({
          where: { policyId: id },
          select: { roleId: true },
        });

        for (const rp of rolesWithPolicy) {
          await incrementPolicyVersionForRoleUsers(rp.roleId);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Update policy error:", error);
      res.status(500).json({ message: error.message || "Failed to update policy" });
    }
  });

  // ==================== ROLES ====================

  /**
   * GET /api/admin/roles
   * List all roles with their policies
   */
  app.get("/api/admin/roles", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const roles = await prisma.role.findMany({
        include: {
          policies: {
            include: {
              policy: true,
            },
          },
          users: {
            select: {
              userId: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      res.json(
        roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          policies: role.policies.map((rp) => ({
            id: rp.policy.id,
            key: rp.policy.key,
            description: rp.policy.description,
            category: rp.policy.category,
            isActive: rp.policy.isActive,
          })),
          userCount: role.users.length,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        }))
      );
    } catch (error) {
      console.error("Get roles error:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  /**
   * GET /api/admin/roles/:id
   * Get single role with details
   */
  app.get("/api/admin/roles/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;

      const validation = validateUUID(id);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          policies: {
            include: {
              policy: true,
            },
          },
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      res.json({
        id: role.id,
        name: role.name,
        description: role.description,
        policies: role.policies.map((rp) => ({
          id: rp.policy.id,
          key: rp.policy.key,
          description: rp.policy.description,
          category: rp.policy.category,
          isActive: rp.policy.isActive,
        })),
        users: role.users.map((ur) => ({
          id: ur.user.id,
          name: ur.user.name,
          email: ur.user.email,
        })),
        createdAt: role.createdAt,
        updatedAt: role.updatedAt,
      });
    } catch (error) {
      console.error("Get role error:", error);
      res.status(500).json({ message: "Failed to fetch role" });
    }
  });

  /**
   * POST /api/admin/roles
   * Create new role
   */
  app.post("/api/admin/roles", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { name, description, policyIds } = req.body;

      // Validate role name
      const nameValidation = validateRoleName(name);
      if (!nameValidation.valid) {
        return res.status(400).json({ message: nameValidation.error });
      }

      // Validate policy IDs
      const policyValidation = validatePolicyIds(policyIds);
      if (!policyValidation.valid) {
        return res.status(400).json({ message: policyValidation.error });
      }

      // Check if role name already exists
      const existing = await prisma.role.findUnique({
        where: { name },
      });

      if (existing) {
        return res.status(409).json({ message: "Role with this name already exists" });
      }

      // Verify all policy IDs exist and are active
      if (policyValidation.ids && policyValidation.ids.length > 0) {
        const policies = await prisma.policy.findMany({
          where: {
            id: { in: policyValidation.ids },
            isActive: true,
          },
        });

        if (policies.length !== policyValidation.ids.length) {
          return res.status(400).json({ message: "One or more policy IDs are invalid or inactive" });
        }
      }

      // Create role with policies
      const role = await prisma.role.create({
        data: {
          name,
          description: description || null,
          policies: {
            create: (policyValidation.ids || []).map((policyId) => ({
              policyId,
            })),
          },
        },
        include: {
          policies: {
            include: {
              policy: true,
            },
          },
        },
      });

      // Audit log
      await logRoleCreation(req.user!.id, role.id, role.name);

      res.status(201).json({
        id: role.id,
        name: role.name,
        description: role.description,
        policies: role.policies.map((rp) => ({
          id: rp.policy.id,
          key: rp.policy.key,
          description: rp.policy.description,
        })),
      });
    } catch (error: any) {
      console.error("Create role error:", error);
      res.status(500).json({ message: error.message || "Failed to create role" });
    }
  });

  /**
   * PUT /api/admin/roles/:id
   * Update role (name, description, policies)
   */
  app.put("/api/admin/roles/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, policyIds } = req.body;

      const validation = validateUUID(id);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          policies: true,
        },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Track changes for audit
      const changes: Record<string, any> = {};

      // Update basic fields
      const updateData: any = {};
      if (name !== undefined) {
        const nameValidation = validateRoleName(name);
        if (!nameValidation.valid) {
          return res.status(400).json({ message: nameValidation.error });
        }
        if (name !== role.name) {
          // Check if new name already exists
          const existing = await prisma.role.findUnique({
            where: { name },
          });
          if (existing && existing.id !== id) {
            return res.status(409).json({ message: "Role with this name already exists" });
          }
          updateData.name = name;
          changes.name = { from: role.name, to: name };
        }
      }

      if (description !== undefined) {
        updateData.description = description;
        if (description !== role.description) {
          changes.description = { from: role.description, to: description };
        }
      }

      // Update policies if provided
      if (policyIds !== undefined) {
        const policyValidation = validatePolicyIds(policyIds);
        if (!policyValidation.valid) {
          return res.status(400).json({ message: policyValidation.error });
        }

        // Verify all policy IDs exist and are active
        if (policyValidation.ids && policyValidation.ids.length > 0) {
          const policies = await prisma.policy.findMany({
            where: {
              id: { in: policyValidation.ids },
              isActive: true,
            },
          });

          if (policies.length !== policyValidation.ids.length) {
            return res.status(400).json({ message: "One or more policy IDs are invalid or inactive" });
          }
        }

        // Get current policy IDs
        const currentPolicyIds = role.policies.map((rp) => rp.policyId);
        const newPolicyIds = policyValidation.ids || [];

        // Find added and removed policies
        const addedPolicies = newPolicyIds.filter((id) => !currentPolicyIds.includes(id));
        const removedPolicies = currentPolicyIds.filter((id) => !newPolicyIds.includes(id));

        if (addedPolicies.length > 0 || removedPolicies.length > 0) {
          // Delete all existing role-policy relationships
          await prisma.rolePolicy.deleteMany({
            where: { roleId: id },
          });

          // Create new relationships
          if (newPolicyIds.length > 0) {
            await prisma.rolePolicy.createMany({
              data: newPolicyIds.map((policyId) => ({
                roleId: id,
                policyId,
              })),
            });
          }

          changes.policies = {
            added: addedPolicies,
            removed: removedPolicies,
          };

          // Increment policy version for all users with this role
          await incrementPolicyVersionForRoleUsers(id);
        }
      }

      // Update role if there are changes
      if (Object.keys(updateData).length > 0) {
        await prisma.role.update({
          where: { id },
          data: updateData,
        });
      }

      // Audit log
      if (Object.keys(changes).length > 0) {
        await logRoleUpdate(req.user!.id, id, role.name, changes);
      }

      // Return updated role
      const updatedRole = await prisma.role.findUnique({
        where: { id },
        include: {
          policies: {
            include: {
              policy: true,
            },
          },
        },
      });

      res.json({
        id: updatedRole!.id,
        name: updatedRole!.name,
        description: updatedRole!.description,
        policies: updatedRole!.policies.map((rp) => ({
          id: rp.policy.id,
          key: rp.policy.key,
          description: rp.policy.description,
        })),
      });
    } catch (error: any) {
      console.error("Update role error:", error);
      res.status(500).json({ message: error.message || "Failed to update role" });
    }
  });

  /**
   * DELETE /api/admin/roles/:id
   * Delete role (cascades to user-role and role-policy relationships)
   */
  app.delete("/api/admin/roles/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;

      const validation = validateUUID(id);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          users: {
            select: { userId: true },
          },
        },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Get user IDs before deletion (for policy version increment)
      const userIds = role.users.map((ur) => ur.userId);

      // Delete role (cascades to UserRole and RolePolicy)
      await prisma.role.delete({
        where: { id },
      });

      // Increment policy version for all users who had this role
      if (userIds.length > 0) {
        await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: {
            policyVersion: { increment: 1 },
          },
        });
      }

      // Audit log
      await logRoleDeletion(req.user!.id, id, role.name);

      res.json({ message: "Role deleted successfully" });
    } catch (error: any) {
      console.error("Delete role error:", error);
      res.status(500).json({ message: error.message || "Failed to delete role" });
    }
  });

  // ==================== USER-ROLE ASSIGNMENTS ====================

  /**
   * POST /api/admin/users/:userId/roles/:roleId
   * Assign role to user
   */
  app.post(
    "/api/admin/users/:userId/roles/:roleId",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const { userId, roleId } = req.params;

        const userIdValidation = validateUUID(userId);
        const roleIdValidation = validateUUID(roleId);

        if (!userIdValidation.valid || !roleIdValidation.valid) {
          return res.status(400).json({ message: "Invalid user ID or role ID" });
        }

        // Security check: prevent privilege escalation
        const securityCheck = await canAssignRole({
          assignerUserId: req.user!.id,
          targetUserId: userId,
          roleId,
        });

        if (!securityCheck.allowed) {
          return res.status(403).json({
            message: "Cannot assign role",
            reason: securityCheck.reason,
            missingPolicies: securityCheck.missingPolicies,
          });
        }

        // Check if assignment already exists
        const existing = await prisma.userRole.findUnique({
          where: {
            userId_roleId: {
              userId,
              roleId,
            },
          },
        });

        if (existing) {
          return res.status(409).json({ message: "Role already assigned to user" });
        }

        // Verify role exists
        const role = await prisma.role.findUnique({
          where: { id: roleId },
        });

        if (!role) {
          return res.status(404).json({ message: "Role not found" });
        }

        // Create assignment
        await prisma.userRole.create({
          data: {
            userId,
            roleId,
          },
        });

        // Increment target user's policy version (forces re-login)
        await incrementUserPolicyVersion(userId);

        // Audit log
        await logUserRoleAssignment(req.user!.id, userId, roleId, role.name, "assign");

        res.status(201).json({ message: "Role assigned successfully" });
      } catch (error: any) {
        console.error("Assign role error:", error);
        res.status(500).json({ message: error.message || "Failed to assign role" });
      }
    }
  );

  /**
   * DELETE /api/admin/users/:userId/roles/:roleId
   * Remove role from user
   */
  app.delete(
    "/api/admin/users/:userId/roles/:roleId",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const { userId, roleId } = req.params;

        const userIdValidation = validateUUID(userId);
        const roleIdValidation = validateUUID(roleId);

        if (!userIdValidation.valid || !roleIdValidation.valid) {
          return res.status(400).json({ message: "Invalid user ID or role ID" });
        }

        // Security check
        const securityCheck = await canRemoveRole({
          assignerUserId: req.user!.id,
          targetUserId: userId,
          roleId,
        });

        if (!securityCheck.allowed) {
          return res.status(403).json({
            message: "Cannot remove role",
            reason: securityCheck.reason,
          });
        }

        // Get role name for audit log
        const role = await prisma.role.findUnique({
          where: { id: roleId },
        });

        if (!role) {
          return res.status(404).json({ message: "Role not found" });
        }

        // Delete assignment
        const deleted = await prisma.userRole.delete({
          where: {
            userId_roleId: {
              userId,
              roleId,
            },
          },
        }).catch(() => null);

        if (!deleted) {
          return res.status(404).json({ message: "Role assignment not found" });
        }

        // Increment target user's policy version
        await incrementUserPolicyVersion(userId);

        // Audit log
        await logUserRoleAssignment(req.user!.id, userId, roleId, role.name, "remove");

        res.json({ message: "Role removed successfully" });
      } catch (error: any) {
        console.error("Remove role error:", error);
        res.status(500).json({ message: error.message || "Failed to remove role" });
      }
    }
  );

  /**
   * GET /api/admin/users/:userId/roles
   * Get all roles assigned to a user
   */
  app.get("/api/admin/users/:userId/roles", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { userId } = req.params;

      const validation = validateUUID(userId);
      if (!validation.valid) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const userRoles = await prisma.userRole.findMany({
        where: { userId },
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
      });

      res.json(
        userRoles.map((ur) => ({
          id: ur.role.id,
          name: ur.role.name,
          description: ur.role.description,
          policies: ur.role.policies.map((rp) => ({
            id: rp.policy.id,
            key: rp.policy.key,
            description: rp.policy.description,
            isActive: rp.policy.isActive,
          })),
          assignedAt: ur.createdAt,
        }))
      );
    } catch (error) {
      console.error("Get user roles error:", error);
      res.status(500).json({ message: "Failed to fetch user roles" });
    }
  });
}
