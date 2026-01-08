import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerRolesRoutes(app: Express): void {
  // GET /api/roles - Get all roles with user count
  app.get("/api/roles", requireAuth, async (req, res) => {
    try {
      const roles = await (prisma as any).role.findMany({
        orderBy: { level: "desc" },
        include: {
          _count: {
            select: { users: true }
          }
        }
      });

      const rolesWithCount = roles.map((role: any) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        level: role.level,
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
  app.get("/api/roles/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const role = await (prisma as any).role.findUnique({
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
        level: role.level,
        userCount: role._count.users,
        policies: (role.policies as any[]).map((rp: any) => rp.policy),
        createdAt: role.createdAt
      });
    } catch (error) {
      console.error("Role error:", error);
      res.status(500).json({ message: "Failed to fetch role" });
    }
  });

  // POST /api/roles - Create new role
  app.post("/api/roles", requireAuth, requirePolicy("admin.roles"), async (req, res) => {
    try {
      const { name, description, level, policyIds } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Role name is required" });
      }

      const role = await prisma.$transaction(async (tx: any) => {
        const newRole = await tx.role.create({
          data: {
            name,
            description: description || null,
            level: level || 0
          }
        });

        if (policyIds && Array.isArray(policyIds) && policyIds.length > 0) {
          await tx.rolePolicy.createMany({
            data: policyIds.map((policyId: string) => ({
              roleId: newRole.id,
              policyId
            }))
          });
        }

        return newRole;
      });

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
  app.put("/api/roles/:id", requireAuth, requirePolicy("admin.roles"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, level, policyIds } = req.body;

      const existingRole = await (prisma as any).role.findUnique({
        where: { id }
      });

      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.role.update({
          where: { id },
          data: {
            name: name || existingRole.name,
            description: description !== undefined ? description : existingRole.description,
            level: level !== undefined ? level : existingRole.level
          }
        });

        if (policyIds && Array.isArray(policyIds)) {
          await tx.rolePolicy.deleteMany({
            where: { roleId: id }
          });

          if (policyIds.length > 0) {
            await tx.rolePolicy.createMany({
              data: policyIds.map((policyId: string) => ({
                roleId: id,
                policyId
              }))
            });
          }
        }
      });

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
  app.delete("/api/roles/:id", requireAuth, requirePolicy("admin.roles"), async (req, res) => {
    try {
      const { id } = req.params;

      const userCount = await (prisma as any).userRole.count({
        where: { roleId: id }
      });

      if (userCount > 0) {
        return res.status(400).json({ 
          message: `Cannot delete role. ${userCount} user(s) are assigned to this role.` 
        });
      }

      await (prisma as any).role.delete({
        where: { id }
      });

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      console.error("Delete role error:", error);
      res.status(500).json({ message: "Failed to delete role" });
    }
  });
}

