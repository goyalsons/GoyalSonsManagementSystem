import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validateUUID } from "../lib/validation";
import { canAssignRole } from "../lib/role-assignment-security";
import { logUserRoleAssignment } from "../lib/audit-log";

export function registerUserAssignmentRoutes(app: Express): void {
  // POST /api/users/assign-role - Assign role to user
  app.post("/api/users/assign-role", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { userId, roleId } = req.body;

      if (!userId || !roleId) {
        return res.status(400).json({ message: "User ID and Role ID are required" });
      }

      // Validate UUIDs
      const userIdValidation = validateUUID(userId);
      if (!userIdValidation.valid) {
        return res.status(400).json({ message: `Invalid user ID: ${userIdValidation.error}` });
      }

      const roleIdValidation = validateUUID(roleId);
      if (!roleIdValidation.valid) {
        return res.status(400).json({ message: `Invalid role ID: ${roleIdValidation.error}` });
      }

      // Security check: can assigner assign this role to this user?
      const securityCheck = await canAssignRole({
        assignerUserId: req.user!.id,
        targetUserId: userId,
        roleId: roleId,
      });

      if (!securityCheck.allowed) {
        return res.status(403).json({
          message: "Access denied",
          reason: securityCheck.reason
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const role = await prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const existing = await prisma.userRole.findUnique({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      if (existing) {
        return res.status(400).json({ message: "Role is already assigned to this user" });
      }

      await prisma.userRole.create({
        data: {
          userId,
          roleId,
        },
      });

      // Log role assignment
      await logUserRoleAssignment(req.user!.id, userId, roleId, role.name, "assign");

      res.json({
        message: "Role assigned successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        role: {
          id: role.id,
          name: role.name,
        },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ message: "Role is already assigned to this user" });
      }
      console.error("Assign role error:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  // DELETE /api/users/:userId/roles/:roleId - Remove role from user
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { userId, roleId } = req.params;

      // Validate UUIDs
      const userIdValidation = validateUUID(userId);
      if (!userIdValidation.valid) {
        return res.status(400).json({ message: `Invalid user ID: ${userIdValidation.error}` });
      }

      const roleIdValidation = validateUUID(roleId);
      if (!roleIdValidation.valid) {
        return res.status(400).json({ message: `Invalid role ID: ${roleIdValidation.error}` });
      }

      // Security check: can assigner remove role from this user?
      // Same rules as assignment - must be in org scope
      const securityCheck = await canAssignRole({
        assignerUserId: req.user!.id,
        targetUserId: userId,
        roleId: roleId,
      });

      if (!securityCheck.allowed) {
        return res.status(403).json({
          message: "Access denied",
          reason: securityCheck.reason
        });
      }

      // Get role name for audit log
      const role = await prisma.role.findUnique({
        where: { id: roleId },
        select: { name: true }
      });

      await prisma.userRole.delete({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      // Log role removal
      if (role) {
        await logUserRoleAssignment(req.user!.id, userId, roleId, role.name, "remove");
      }

      res.json({ message: "Role removed successfully" });
    } catch (error: any) {
      if (error.code === "P2025") {
        return res.status(404).json({ message: "Role assignment not found" });
      }
      console.error("Remove role error:", error);
      res.status(500).json({ message: "Failed to remove role" });
    }
  });

  // POST /api/users/update-role-permissions - Update role's policies (affects all users with that role)
  // NOTE: This endpoint name is misleading - it updates the role, not user permissions
  // Consider deprecating in favor of PUT /api/roles/:id
  app.post("/api/users/update-role-permissions", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { roleId, policyIds } = req.body;

      if (!roleId || !Array.isArray(policyIds)) {
        return res.status(400).json({ message: "Role ID and policy IDs array are required" });
      }

      // Validate role ID
      const roleIdValidation = validateUUID(roleId);
      if (!roleIdValidation.valid) {
        return res.status(400).json({ message: `Invalid role ID: ${roleIdValidation.error}` });
      }

      // Validate policy IDs
      const policyValidation = validatePolicyIds(policyIds);
      if (!policyValidation.valid) {
        return res.status(400).json({ message: policyValidation.error });
      }

      const role = await prisma.role.findUnique({
        where: { id: roleId },
        include: {
          policies: {
            include: {
              policy: true
            }
          }
        }
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const oldPolicyIds = role.policies.map((rp) => rp.policyId);
      const newPolicyIds = policyValidation.ids!;
      const addedPolicies = newPolicyIds.filter((id) => !oldPolicyIds.includes(id));
      const removedPolicies = oldPolicyIds.filter((id) => !newPolicyIds.includes(id));

      await prisma.$transaction(async (tx) => {
        await tx.rolePolicy.deleteMany({
          where: { roleId },
        });

        if (newPolicyIds.length > 0) {
          await tx.rolePolicy.createMany({
            data: newPolicyIds.map((policyId) => ({
              roleId,
              policyId,
            })),
          });
        }
      });

      // Log role-policy changes
      if (addedPolicies.length > 0 || removedPolicies.length > 0) {
        await logRolePolicyChange(
          req.user!.id,
          roleId,
          role.name,
          addedPolicies,
          removedPolicies
        );
      }

      res.json({ message: "Role permissions updated successfully" });
    } catch (error) {
      console.error("Update permissions error:", error);
      res.status(500).json({ message: "Failed to update permissions" });
    }
  });
}

