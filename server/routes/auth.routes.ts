import type { Express } from "express";
import passport from "passport";
import { prisma } from "../lib/prisma";
import { authenticateUser, requireAuth } from "../lib/auth-middleware";
import { initializeGoogleOAuth, getCallbackUrl } from "./auth-utils";

export function registerAuthRoutes(app: Express): void {
  // Initialize Google OAuth Strategy
  const GOOGLE_OAUTH_ENABLED = initializeGoogleOAuth();
  
  // Google OAuth routes
  if (GOOGLE_OAUTH_ENABLED) {
    console.log("[Google OAuth] 📍 Registering OAuth routes:");
    console.log(`[Google OAuth]    GET /api/auth/google`);
    console.log(`[Google OAuth]    GET /api/auth/google/callback`);
    app.get("/api/auth/google", (req, res, next) => {
      console.log(`[Google OAuth] 🚀 OAuth initiation request received from ${req.ip}`);
      passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false,
      })(req, res, next);
    });
    
    app.get("/api/auth/google/callback", (req, res, next) => {
      console.log(`[Google OAuth] Callback received. Query params:`, Object.keys(req.query));
      passport.authenticate("google", { session: false }, async (err: any, user: any, info: any) => {
        try {
          if (err) {
            console.error("[Google OAuth] ❌ Authentication error:", err);
            if (err.message?.includes("invalid_client") || err.oauthError === "invalid_client") {
              console.error("[Google OAuth] ❌ Invalid client error detected!");
              console.error("[Google OAuth] This usually means:");
              console.error("  1. GOOGLE_CLIENT_ID is incorrect or not set");
              console.error("  2. GOOGLE_CLIENT_SECRET is incorrect or not set");
              console.error("  3. Callback URL doesn't match Google Cloud Console");
              console.error(`[Google OAuth] Current callback URL: ${getCallbackUrl()}`);
              return res.redirect("/login?error=invalid_client_config");
            }
            return res.redirect("/login?error=oauth_error");
          }
          
          if (!user) {
            const message = info?.message || "Authentication failed";
            console.error(`[Google OAuth] ❌ No user returned. Info:`, info);
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          
          const userEmail = user.email?.toLowerCase();
          const loginType = "mdo";
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: {
              userId: user.id,
              expiresAt,
              loginType: loginType,
            },
          });
          
          console.log(`[Google OAuth] ✅ User ${userEmail} logged in successfully`);
          console.log(`[Google OAuth]    loginType: ${loginType} (All Google OAuth users are MDO)`);
          
          res.redirect(`/auth-callback?token=${session.id}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          res.redirect("/login?error=session_error");
        }
      })(req, res, next);
    });
    
    console.log("[Google OAuth] ✅ OAuth routes registered successfully\n");
  } else {
    console.log("[Google OAuth] ⚠️  OAuth routes NOT registered - OAuth is disabled\n");
    app.get("/api/auth/google", (req, res) => {
      console.log(`[Google OAuth] ❌ OAuth request received but OAuth is not configured`);
      res.status(503).json({ message: "Google OAuth is not configured. Please contact administrator." });
    });
  }

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await authenticateUser(email, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
        },
      });

      // Get employee card number if user has employee linked
      let employeeCardNo = null;
      if (user.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { id: user.employeeId },
          select: { cardNumber: true },
        });
        employeeCardNo = employee?.cardNumber || null;
      }

      // Check if user is a manager
      let isManager = false;
      let managerScopes = null;
      if (employeeCardNo) {
        const managerAssignments = await prisma.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentId: string | null;
          mdesignationId: string | null;
          morgUnitId: string | null;
          mis_extinct: boolean;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
          FROM "emp_manager"
          WHERE "mcardno" = ${employeeCardNo} AND "mis_extinct" = false
        `;
        
        if (managerAssignments.length > 0) {
          isManager = true;
          const departmentIds = Array.from(new Set(managerAssignments.map(m => m.mdepartmentId).filter((id): id is string => id !== null)));
          const designationIds = Array.from(new Set(managerAssignments.map(m => m.mdesignationId).filter((id): id is string => id !== null)));
          const orgUnitIds = Array.from(new Set(managerAssignments.map(m => m.morgUnitId).filter((id): id is string => id !== null)));
          managerScopes = {
            departmentIds: departmentIds.length > 0 ? departmentIds : null,
            designationIds: designationIds.length > 0 ? designationIds : null,
            orgUnitIds: orgUnitIds.length > 0 ? orgUnitIds : null,
          };
        }
      }

      const userWithManager = {
        ...user,
        employeeCardNo,
        isManager,
        managerScopes,
      };

      res.json({
        token: session.id,
        user: userWithManager,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const userData = { ...req.user };
      
      console.log("[Auth Me] Checking manager status for user:", {
        userId: req.user!.id,
        employeeId: req.user!.employeeId,
        employeeCardNo: req.user!.employeeCardNo,
      });
      
      let employeeCardNo = req.user!.employeeCardNo;
      
      if (!employeeCardNo && req.user!.employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { id: req.user!.employeeId },
          select: { cardNumber: true },
        });
        if (employee?.cardNumber) {
          employeeCardNo = employee.cardNumber;
          (userData as any).employeeCardNo = employeeCardNo;
        }
      }
      
      if (employeeCardNo) {
        const managerAssignments = await prisma.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentId: string | null;
          mdesignationId: string | null;
          morgUnitId: string | null;
          mis_extinct: boolean;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
          FROM "emp_manager"
          WHERE "mcardno" = ${employeeCardNo} AND "mis_extinct" = false
          ORDER BY "mid" DESC
        `;
        
        if (managerAssignments.length > 0) {
          const departmentIds = Array.from(new Set(managerAssignments.map(m => m.mdepartmentId).filter((id): id is string => id !== null)));
          const designationIds = Array.from(new Set(managerAssignments.map(m => m.mdesignationId).filter((id): id is string => id !== null)));
          const orgUnitIds = Array.from(new Set(managerAssignments.map(m => m.morgUnitId).filter((id): id is string => id !== null)));
          
          (userData as any).isManager = true;
          (userData as any).managerScopes = {
            departmentIds: departmentIds.length > 0 ? departmentIds : null,
            designationIds: designationIds.length > 0 ? designationIds : null,
            orgUnitIds: orgUnitIds.length > 0 ? orgUnitIds : null,
          };
          
          console.log("[Auth Me] ✅ User is a manager:", {
            cardNo: employeeCardNo,
            assignments: managerAssignments.length,
            scopes: (userData as any).managerScopes,
          });
        } else {
          (userData as any).isManager = false;
          (userData as any).managerScopes = null;
          console.log("[Auth Me] ❌ User is NOT a manager (no assignments found)");
        }
      } else {
        (userData as any).isManager = false;
        (userData as any).managerScopes = null;
        console.log("[Auth Me] ❌ User is NOT a manager (no card number)");
      }
      
      console.log("[Auth Me] Returning user data:", {
        isManager: (userData as any).isManager,
        employeeCardNo: (userData as any).employeeCardNo,
      });
      
      res.json(userData);
    } catch (error) {
      console.error("Auth me error:", error);
      res.json(req.user);
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        await prisma.session.delete({ where: { id: token } }).catch(() => {});
      }
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ message: "Logout failed" });
    }
  });
}

