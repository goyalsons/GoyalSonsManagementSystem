import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import { loadUserFromSession, requireMDO } from "../lib/auth-middleware";
import { registerSalesRoutes } from "./sales.routes";
import { registerSalesStaffRoutes } from "./sales-staff.routes";
import { registerLookupRoutes } from "./lookup.routes";
import { registerEmpManagerRoutes } from "./emp-manager.routes";
import { registerHelpTicketsRoutes } from "./help-tickets.routes";
import { registerAuthRoutes } from "./auth.routes";
import { registerOtpRoutes } from "./otp.routes";
import { registerLegacyRoutes } from "../routes-legacy";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint for Railway
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Initialize passport BEFORE registering strategies
  app.use(passport.initialize());
  
  app.use(loadUserFromSession);
  
  // Register authentication and OTP routes
  registerAuthRoutes(app);
  registerOtpRoutes(app);

  // Protect all /api/mdo/* routes with requireMDO middleware
  app.use("/api/mdo", requireMDO);

  // Register all route modules
  registerSalesRoutes(app);
  registerSalesStaffRoutes(app);
  registerLookupRoutes(app);
  registerEmpManagerRoutes(app);
  registerHelpTicketsRoutes(app);
  
  // Register RBAC routes
  const { registerRolesRoutes } = await import("./roles.routes");
  const { registerPoliciesRoutes } = await import("./policies.routes");
  const { registerUserAssignmentRoutes } = await import("./user-assignment.routes");
  const { registerRBACAdminRoutes } = await import("./rbac-admin.routes");
  const { registerPagesRoutes } = await import("./pages.routes");
  
  registerRolesRoutes(app);
  registerPoliciesRoutes(app);
  registerUserAssignmentRoutes(app);
  registerRBACAdminRoutes(app);
  registerPagesRoutes(app);

  // For now, import the rest from the legacy routes file
  // This allows incremental migration - routes will be moved to separate files gradually
  // TODO: As routes are extracted to separate files, remove them from routes-legacy.ts
  // and register them here instead
  // Note: Sales routes (lines 4270-4799 in legacy) are already moved to sales.routes.ts
  // Note: Role/Policy/User assignment routes are now in separate files - remove from legacy
  await registerLegacyRoutes(httpServer, app);

  return httpServer;
}

