import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy, hashPassword } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validateUUID } from "../lib/validation";
import { canAssignRole } from "../lib/role-assignment-security";
import { logUserRoleAssignment } from "../lib/audit-log";
import { replaceUserRoles } from "../lib/role-replacement";
import { invalidateSessionsForUser } from "../lib/auth-cache";

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

      // Single active role: remove all existing roles, add only the selected one
      await replaceUserRoles(prisma, userId, roleId);
      await invalidateSessionsForUser(userId);

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

  /**
   * POST /api/users/create-credentials
   * Director-only: Create or update ID/password user with role.
   * Body: { email, password, name?, roleId }
   * - If user exists: update passwordHash and replace role (single active role)
   * - If user does not exist: create User, set passwordHash, attach roleId
   */
  app.post("/api/users/create-credentials", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      if (!req.user!.roles?.some((r) => r.name === "Director")) {
        return res.status(403).json({ message: "Only Director can create credential users" });
      }

      const { email, password, name, roleId } = req.body;

      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }
      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      if (!roleId) {
        return res.status(400).json({ message: "Role is required" });
      }

      const roleIdValidation = validateUUID(roleId);
      if (!roleIdValidation.valid) {
        return res.status(400).json({ message: `Invalid role ID: ${roleIdValidation.error}` });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, name: true },
      });

      let userId: string;

      if (existingUser) {
        await replaceUserRoles(prisma, existingUser.id, roleId);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash: hashPassword(password),
            name: (name && String(name).trim()) || existingUser.name,
          },
        });
        userId = existingUser.id;
        await invalidateSessionsForUser(userId);
      } else {
        const displayName = (name && String(name).trim()) || normalizedEmail.split("@")[0] || "User";
        const user = await prisma.user.create({
          data: {
            name: displayName,
            email: normalizedEmail,
            passwordHash: hashPassword(password),
            status: "active",
          },
        });
        userId = user.id;
        await replaceUserRoles(prisma, userId, roleId);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      res.json({
        success: true,
        user: { id: user!.id, name: user!.name, email: user!.email },
        role: { id: role.id, name: role.name },
      });
    } catch (error) {
      console.error("Create credentials error:", error);
      res.status(500).json({ message: "Failed to create credentials" });
    }
  });

  /**
   * POST /api/admin/backfill-employee-users
   * Director-only: Create User + assign Employee role for all employees without a linked user.
   * Use when sync ran before auto-assign logic existed, or to fix role counts.
   */
  app.post("/api/admin/backfill-employee-users", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      if (!req.user!.roles?.some((r) => r.name === "Director")) {
        return res.status(403).json({ message: "Only Director can run backfill" });
      }

      const employeeRole = await prisma.role.findUnique({ where: { name: "Employee" }, select: { id: true } });
      if (!employeeRole) {
        return res.status(500).json({ message: "Employee role not found in database" });
      }

      const employeesWithoutUser = await prisma.employee.findMany({
        where: { user: null },
        select: { id: true, cardNumber: true, firstName: true, lastName: true, companyEmail: true, personalEmail: true, orgUnitId: true },
      });

      let created = 0;
      let failed = 0;

      for (const emp of employeesWithoutUser) {
        try {
          const fullName = [emp.firstName, emp.lastName].filter(Boolean).join(" ").trim() || "Employee";
          let email = emp.companyEmail || emp.personalEmail || `emp-${emp.cardNumber}@example.invalid`;
          const existingByEmail = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
          if (existingByEmail) {
            email = `emp-${emp.id}@example.invalid`;
          }
          const user = await prisma.user.create({
            data: {
              name: fullName,
              email: email.trim().toLowerCase(),
              passwordHash: hashPassword("sync-created"),
              employeeId: emp.id,
              orgUnitId: emp.orgUnitId,
              status: "active",
            },
          });
          await prisma.userRole.create({
            data: { userId: user.id, roleId: employeeRole.id },
          });
          created++;
        } catch (err: any) {
          console.error(`[Backfill] Failed for employee ${emp.cardNumber}:`, err.message);
          failed++;
        }
      }

      res.json({
        success: true,
        created,
        failed,
        total: employeesWithoutUser.length,
        message: `Created User + Employee role for ${created} employees.${failed > 0 ? ` ${failed} failed.` : ""}`,
      });
    } catch (error) {
      console.error("Backfill employee users error:", error);
      res.status(500).json({ message: "Failed to run backfill" });
    }
  });
}

