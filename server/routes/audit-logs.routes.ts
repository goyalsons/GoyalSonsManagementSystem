/**
 * Audit logs read-only API.
 * GET /api/audit-logs - Pagination and filters (date, actor, action, entity). Protected by audit.view.
 */

import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export function registerAuditLogsRoutes(app: Express): void {
  app.get("/api/audit-logs", requireAuth, requirePolicy(POLICIES.AUDIT_VIEW), async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(String(req.query.pageSize), 10) || DEFAULT_PAGE_SIZE),
      );
      const actorId = typeof req.query.actorId === "string" ? req.query.actorId.trim() || undefined : undefined;
      const action = typeof req.query.action === "string" ? req.query.action.trim() || undefined : undefined;
      const entity = typeof req.query.entity === "string" ? req.query.entity.trim() || undefined : undefined;
      const fromDate = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
      const toDate = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

      const where: Record<string, unknown> = {};
      if (actorId) where.userId = actorId;
      if (action) where.action = action;
      if (entity) where.entity = entity;
      if ((fromDate && !isNaN(fromDate.getTime())) || (toDate && !isNaN(toDate.getTime()))) {
        where.createdAt = {};
        if (fromDate && !isNaN(fromDate.getTime())) (where.createdAt as Record<string, Date>).gte = fromDate;
        if (toDate && !isNaN(toDate.getTime())) (where.createdAt as Record<string, Date>).lte = toDate;
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        data: logs.map((log) => ({
          id: log.id,
          userId: log.userId,
          actor: log.user ? { id: log.user.id, name: log.user.name, email: log.user.email } : null,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          meta: log.meta,
          createdAt: log.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (error: any) {
      console.error("Audit logs list error:", error);
      res.status(500).json({ message: error?.message ?? "Failed to fetch audit logs" });
    }
  });
}
