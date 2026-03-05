import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy, hashPassword } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validateUUID } from "../lib/validation";
import { replaceUserRoles } from "../lib/role-replacement";
import { ensureNotLastDirector } from "../lib/role-assignment-security";
import { invalidateSessionsForUser } from "../lib/auth-cache";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function registerUsersRoutes(app: Express): void {
  /**
   * GET /api/users
   * List users with pagination and search (email/name).
   * Requires VIEW_USERS or Director.
   */
  app.get("/api/users", requireAuth, requirePolicy(POLICIES.VIEW_USERS), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE));
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const credentialsOnly = req.query.credentialsOnly === "true";
      const skip = (page - 1) * limit;

      const where: any = {};
      if (credentialsOnly) {
        where.email = { not: null };
        where.passwordHash = { not: null, notIn: ["otp-only-user"] };
      }
      if (search) {
        where.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
          { employee: { cardNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            createdAt: true,
            employee: { select: { cardNumber: true } },
            roles: {
              select: {
                role: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          status: u.status,
          createdAt: u.createdAt,
          cardNumber: u.employee?.cardNumber ?? null,
          role: u.roles[0]?.role ?? null,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("List users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  /**
   * PATCH /api/users/:id
   * Update user display name and/or status.
   * Requires EDIT_USER or Director.
   */
  app.patch("/api/users/:id", requireAuth, requirePolicy(POLICIES.EDIT_USER), async (req, res) => {
    try {
      const { id } = req.params;
      const v = validateUUID(id);
      if (!v.valid) return res.status(400).json({ message: v.error });

      const { name, status } = req.body;
      const data: { name?: string; status?: string } = {};
      if (name !== undefined) {
        const trimmed = typeof name === "string" ? name.trim() : "";
        if (!trimmed) return res.status(400).json({ message: "Name cannot be empty" });
        data.name = trimmed;
      }
      if (status !== undefined) {
        if (status !== "active" && status !== "disabled")
          return res.status(400).json({ message: "Status must be active or disabled" });
        data.status = status;
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ message: "Provide name and/or status to update" });
      }

      const selfId = req.user!.id;
      if (id === selfId && data.status === "disabled") {
        return res.status(400).json({ message: "You cannot disable your own account" });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      await prisma.user.update({
        where: { id },
        data: { ...data, policyVersion: data.status ? { increment: 1 } : undefined },
      });
      if (data.status) await invalidateSessionsForUser(id);

      const updated = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, status: true },
      });
      res.json(updated);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  /**
   * PATCH /api/users/:id/password
   * Reset user password (min 8 chars).
   * Requires RESET_PASSWORD or Director.
   */
  app.patch("/api/users/:id/password", requireAuth, requirePolicy(POLICIES.RESET_PASSWORD), async (req, res) => {
    try {
      const { id } = req.params;
      const v = validateUUID(id);
      if (!v.valid) return res.status(400).json({ message: v.error });

      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== "string") {
        return res.status(400).json({ message: "newPassword is required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      await prisma.user.update({
        where: { id },
        data: {
          passwordHash: hashPassword(newPassword),
          policyVersion: { increment: 1 },
        },
      });
      await invalidateSessionsForUser(id);

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  /**
   * PATCH /api/users/:id/role
   * Replace user's role (single-role).
   * Requires ASSIGN_ROLE or Director.
   */
  app.patch("/api/users/:id/role", requireAuth, requirePolicy(POLICIES.ASSIGN_ROLE), async (req, res) => {
    try {
      const { id } = req.params;
      const userIdValidation = validateUUID(id);
      if (!userIdValidation.valid) {
        return res.status(400).json({ message: userIdValidation.error });
      }

      const { roleId } = req.body;
      if (!roleId) return res.status(400).json({ message: "roleId is required" });
      const roleIdValidation = validateUUID(roleId);
      if (!roleIdValidation.valid) {
        return res.status(400).json({ message: roleIdValidation.error });
      }

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) return res.status(404).json({ message: "Role not found" });

      const lastDirectorCheck = await ensureNotLastDirector({ userId: id, newRoleId: roleId });
      if (!lastDirectorCheck.allowed) {
        return res.status(400).json({ message: lastDirectorCheck.message });
      }

      await replaceUserRoles(prisma, id, roleId);
      await invalidateSessionsForUser(id);

      res.json({
        message: "Role assigned successfully",
        user: { id: user.id, name: user.name, email: user.email },
        role: { id: role.id, name: role.name },
      });
    } catch (error) {
      console.error("Assign role error:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });
}
