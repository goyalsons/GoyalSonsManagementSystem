import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { loadUserFromSession } from "../lib/auth-middleware";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { prisma } from "../lib/prisma";
import { registerSalesRoutes } from "./sales.routes";
import { registerSalesStaffRoutes } from "./sales-staff.routes";
import { registerLookupRoutes } from "./lookup.routes";
import { registerEmpManagerRoutes } from "./emp-manager.routes";
import { registerAttendanceVerificationRoutes } from "./attendance-verification.routes";
import { registerHelpTicketsRoutes } from "./help-tickets.routes";
import { registerAuthRoutes } from "./auth.routes";
import { registerOtpRoutes } from "./otp.routes";
import { registerLegacyRoutes } from "../routes-legacy";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health: /healthz and /api/health are registered in server/index.ts (no auth, no DB).
  // Initialize passport BEFORE registering strategies
  app.use(passport.initialize());
  
  app.use(loadUserFromSession);

  const hrDeleteBatch = async (req: any, res: any) => {
    try {
      const batchId = req.params.batchId;
      const batch = await prisma.attendanceVerificationBatch.findUnique({ where: { id: batchId } });
      if (!batch) return res.status(404).json({ message: "Batch not found" });
      await prisma.attendanceVerificationBatch.delete({ where: { id: batchId } });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[HR Query Batch] DELETE error:", err);
      return res.status(500).json({ message: err?.message || "Failed to delete" });
    }
  };

  // DELETE /api/attendance/hr/queries/batch/:batchId - HR delete submission
  app.delete("/api/attendance/hr/queries/batch/:batchId", requireAuth, requirePolicy("attendance.hr.resolve"), hrDeleteBatch);
  // POST fallback (some proxies don't forward DELETE)
  app.post("/api/attendance/hr/queries/batch/:batchId/delete", requireAuth, requirePolicy("attendance.hr.resolve"), hrDeleteBatch);
  
  // Register authentication and OTP routes
  registerAuthRoutes(app);
  registerOtpRoutes(app);

  // Register all route modules
  registerSalesRoutes(app);
  registerSalesStaffRoutes(app);
  registerLookupRoutes(app);
  registerEmpManagerRoutes(app);
  registerAttendanceVerificationRoutes(app);
  registerHelpTicketsRoutes(app);
  
  // Register RBAC routes
  const { registerRolesRoutes } = await import("./roles.routes");
  const { registerPoliciesRoutes } = await import("./policies.routes");
  const { registerUsersRoutes } = await import("./users.routes");
  const { registerUserAssignmentRoutes } = await import("./user-assignment.routes");
  const { registerRBACAdminRoutes } = await import("./rbac-admin.routes");
  const { registerPagesRoutes } = await import("./pages.routes");
  const { registerSystemRoutes } = await import("./system.routes");
  const { registerAuditLogsRoutes } = await import("./audit-logs.routes");

  registerRolesRoutes(app);
  registerPoliciesRoutes(app);
  registerUsersRoutes(app);
  registerUserAssignmentRoutes(app);
  registerRBACAdminRoutes(app);
  registerPagesRoutes(app);
  registerSystemRoutes(app);
  registerAuditLogsRoutes(app);

  // For now, import the rest from the legacy routes file
  // This allows incremental migration - routes will be moved to separate files gradually
  // TODO: As routes are extracted to separate files, remove them from routes-legacy.ts
  // and register them here instead
  // Note: Sales routes (lines 4270-4799 in legacy) are already moved to sales.routes.ts
  // Note: Role/Policy/User assignment routes are now in separate files - remove from legacy
  await registerLegacyRoutes(httpServer, app);

  return httpServer;
}

