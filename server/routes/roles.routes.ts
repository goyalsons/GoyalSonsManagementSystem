import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validateRoleName, validatePolicyIds } from "../lib/validation";
import { logRoleCreation, logRoleUpdate, logRoleDeletion, logRolePolicyChange } from "../lib/audit-log";

export function registerRolesRoutes(app: Express): void {
  // GET /api/roles - Get all roles with user count
  app.get("/api/roles", requireAuth, requirePolicy(POLICIES.ROLES_ASSIGNED_VIEW), async (req, res) => {
    try {
      const roles = await prisma.role.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { users: true }
          }
        }
      });

      const rolesWithCount = roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        userCount: role._count.users,
        createdAt: role.createdAt
      }));

      res.json(rolesWithCount);
    } catch (error) {
      console.error("Roles error:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  // GET /api/roles/:id - Get single role with policies
  app.get("/api/roles/:id", requireAuth, requirePolicy(POLICIES.ROLES_ASSIGNED_VIEW), async (req, res) => {
    try {
      const { id } = req.params;
      
      const role = await prisma.role.findUnique({
        where: { id },
        include: {
          policies: {
            include: {
              policy: true
            }
          },
          _count: {
            select: { users: true }
          }
        }
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      res.json({
        id: role.id,
        name: role.name,
        description: role.description,
        userCount: role._count.users,
        policies: role.policies.map((rp) => rp.policy),
        createdAt: role.createdAt
      });
    } catch (error) {
      console.error("Role error:", error);
      res.status(500).json({ message: "Failed to fetch role" });
    }
  });

  // POST /api/roles - Create new role
  app.post("/api/roles", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { name, description, policyIds } = req.body;

      // Validate role name
      const nameValidation = validateRoleName(name);
      if (!nameValidation.valid) {
        return res.status(400).json({ message: nameValidation.error });
      }

      // Validate policy IDs if provided
      let validatedPolicyIds: string[] = [];
      if (policyIds && Array.isArray(policyIds) && policyIds.length > 0) {
        const policyValidation = validatePolicyIds(policyIds);
        if (!policyValidation.valid) {
          return res.status(400).json({ message: policyValidation.error });
        }
        validatedPolicyIds = policyValidation.ids!;
      }

      const role = await prisma.$transaction(async (tx) => {
        const newRole = await tx.role.create({
          data: {
            name: name.trim(),
            description: description?.trim() || null
          }
        });

        if (validatedPolicyIds.length > 0) {
          await tx.rolePolicy.createMany({
            data: validatedPolicyIds.map((policyId) => ({
              roleId: newRole.id,
              policyId
            }))
          });
        }

        return newRole;
      });

      // Log role creation
      await logRoleCreation(req.user!.id, role.id, role.name);

      res.status(201).json(role);
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ message: "Role with this name already exists" });
      }
      console.error("Create role error:", error);
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  // PUT /api/roles/:id - Update role and policies
  app.put("/api/roles/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, policyIds } = req.body;

      const existingRole = await prisma.role.findUnique({
        where: { id },
        include: {
          policies: {
            include: {
              policy: true
            }
          }
        }
      });

      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Track changes for audit log
      const changes: Record<string, any> = {};
      const oldPolicyIds = existingRole.policies.map((rp) => rp.policyId);

      // Validate name if provided
      if (name !== undefined) {
        const nameValidation = validateRoleName(name);
        if (!nameValidation.valid) {
          return res.status(400).json({ message: nameValidation.error });
        }
        if (name.trim() !== existingRole.name) {
          changes.name = { from: existingRole.name, to: name.trim() };
        }
      }

      // Validate policy IDs if provided
      let validatedPolicyIds: string[] = [];
      if (policyIds !== undefined) {
        if (!Array.isArray(policyIds)) {
          return res.status(400).json({ message: "Policy IDs must be an array" });
        }
        if (policyIds.length > 0) {
          const policyValidation = validatePolicyIds(policyIds);
          if (!policyValidation.valid) {
            return res.status(400).json({ message: policyValidation.error });
          }
          validatedPolicyIds = policyValidation.ids!;
        }
      }

      await prisma.$transaction(async (tx) => {
        // Update role fields
        if (Object.keys(changes).length > 0 || description !== undefined) {
          await tx.role.update({
            where: { id },
            data: {
              ...(name !== undefined && { name: name.trim() }),
              ...(description !== undefined && { description: description?.trim() || null })
            }
          });
        }

        // Update policies if provided
        if (policyIds !== undefined) {
          await tx.rolePolicy.deleteMany({
            where: { roleId: id }
          });

          if (validatedPolicyIds.length > 0) {
            await tx.rolePolicy.createMany({
              data: validatedPolicyIds.map((policyId) => ({
                roleId: id,
                policyId
              }))
            });
          }
        }
      });

      // Log role update
      if (Object.keys(changes).length > 0 || policyIds !== undefined) {
        const newPolicyIds = policyIds !== undefined ? validatedPolicyIds : oldPolicyIds;
        const addedPolicies = newPolicyIds.filter((id) => !oldPolicyIds.includes(id));
        const removedPolicies = oldPolicyIds.filter((id) => !newPolicyIds.includes(id));

        if (policyIds !== undefined && (addedPolicies.length > 0 || removedPolicies.length > 0)) {
          await logRolePolicyChange(
            req.user!.id,
            id,
            existingRole.name,
            addedPolicies,
            removedPolicies
          );
        }

        if (Object.keys(changes).length > 0) {
          await logRoleUpdate(req.user!.id, id, existingRole.name, changes);
        }
      }

      res.json({ message: "Role updated successfully" });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ message: "Role with this name already exists" });
      }
      console.error("Update role error:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  // DELETE /api/roles/:id - Delete role
  app.delete("/api/roles/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;

      const role = await prisma.role.findUnique({
        where: { id }
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const userCount = await prisma.userRole.count({
        where: { roleId: id }
      });

      if (userCount > 0) {
        return res.status(400).json({ 
          message: `Cannot delete role. ${userCount} user(s) are assigned to this role.` 
        });
      }

      await prisma.role.delete({
        where: { id }
      });

      // Log role deletion
      await logRoleDeletion(req.user!.id, id, role.name);

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      console.error("Delete role error:", error);
      res.status(500).json({ message: "Failed to delete role" });
    }
  });
}

