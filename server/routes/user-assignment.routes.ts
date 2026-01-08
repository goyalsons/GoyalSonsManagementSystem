import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerUserAssignmentRoutes(app: Express): void {
  // POST /api/users/assign-role - Assign role to user
  app.post("/api/users/assign-role", requireAuth, requirePolicy("users.assign_role"), async (req, res) => {
    try {
      const { userId, roleId, policyIds } = req.body;

      if (!userId || !roleId) {
        return res.status(400).json({ message: "User ID and Role ID are required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const role = await (prisma as any).role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const existing = await (prisma as any).userRole.findUnique({
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

      await (prisma as any).userRole.create({
        data: {
          userId,
          roleId,
        },
      });

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
  app.delete("/api/users/:userId/roles/:roleId", requireAuth, requirePolicy("users.assign_role"), async (req, res) => {
    try {
      const { userId, roleId } = req.params;

      await (prisma as any).userRole.delete({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      res.json({ message: "Role removed successfully" });
    } catch (error: any) {
      if (error.code === "P2025") {
        return res.status(404).json({ message: "Role assignment not found" });
      }
      console.error("Remove role error:", error);
      res.status(500).json({ message: "Failed to remove role" });
    }
  });

  // POST /api/users/update-role-permissions - Update role's policies
  app.post("/api/users/update-role-permissions", requireAuth, requirePolicy("users.assign_role"), async (req, res) => {
    try {
      const { userId, roleId, policyIds } = req.body;

      if (!userId || !roleId || !Array.isArray(policyIds)) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      const userRole = await (prisma as any).userRole.findUnique({
        where: {
          userId_roleId: {
            userId,
            roleId,
          },
        },
      });

      if (!userRole) {
        return res.status(404).json({ message: "User does not have this role" });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.rolePolicy.deleteMany({
          where: { roleId },
        });

        if (policyIds.length > 0) {
          await tx.rolePolicy.createMany({
            data: policyIds.map((policyId: string) => ({
              roleId,
              policyId,
            })),
          });
        }
      });

      res.json({ message: "Permissions updated successfully" });
    } catch (error) {
      console.error("Update permissions error:", error);
      res.status(500).json({ message: "Failed to update permissions" });
    }
  });
}

