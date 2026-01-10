import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import https from "follow-redirects";
import { prisma } from "./lib/prisma";
import { format } from "date-fns";
import { 
  authenticateUser, 
  requireAuth, 
  requirePolicy, 
  loadUserFromSession,
  hashPassword,
  requireMDO
} from "./lib/auth-middleware";
import { getUserAuthInfo, getAccessibleOrgUnitIds } from "./lib/authorization";
import { getDepartmentName, getDesignationName, refreshSyncSchedules, triggerManualSync } from "./auto-sync";
import { getEmployeeAttendance, isBigQueryConfigured, getTodayAttendanceFromBigQuery, parseTimeToDateTime, parseTimeToDateTimeWithDate, normalizeCardNumber, getTodayDateIST, clearTodayAttendanceCache, getBigQueryClient } from "./bigquery-service";
import { sendOtpSms } from "./sms-service";
import multer from "multer";
import fs from "fs";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
// Import helper functions from sales-staff routes for team endpoints
import { 
  fetchBillSummaryFromAPI, 
  storeBillSummaryInDB, 
  getBillSummaryFromDB, 
  parseBillDate, 
  getEmployeeDesignations 
} from "./routes/sales-staff.routes";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [".csv", ".json", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, JSON, and Excel files are allowed"));
    }
  },
});

// MDO email whitelist - users with these emails can login via Google OAuth and get MDO role
// You can add more emails via ALLOWED_GOOGLE_EMAILS environment variable (comma-separated)
// Example: ALLOWED_GOOGLE_EMAILS=ankush@goyalsons.com,abhishek@goyalsons.com,mukesh@goyalsons.com,newuser@goyalsons.com
const getAllowedGoogleEmails = (): string[] => {
  if (process.env.ALLOWED_GOOGLE_EMAILS) {
    return process.env.ALLOWED_GOOGLE_EMAILS.split(",")
      .map(email => email.trim().toLowerCase())
      .filter(email => email.length > 0);
  }
  // Default whitelist (ankush, abhishek, mukesh)
  return [
  ];
};

const MDO_EMAIL_WHITELIST = getAllowedGoogleEmails();

// Helper functions for OAuth configuration
const getBaseUrl = () => {
  // Check if BASE_URL is explicitly set in environment
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  // Check if GOOGLE_CALLBACK_URL is set (full URL)
  if (process.env.GOOGLE_CALLBACK_URL) {
    // Extract base URL from full callback URL
    const url = new URL(process.env.GOOGLE_CALLBACK_URL);
    return `${url.protocol}//${url.host}`;
  }
  // For production, default to goyalsons.com
  if (process.env.NODE_ENV === "production") {
    return "https://goyalsons.com";
  }
  // For development, use localhost
  return "http://localhost:5000";
};

const getCallbackUrl = () => {
  // If full callback URL is provided, use it directly
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  // Otherwise, construct from base URL
  return `${getBaseUrl()}/api/auth/google/callback`;
};

// Initialize Google OAuth Strategy
function initializeGoogleOAuth(): boolean {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

  console.log("\n" + "=".repeat(60));
  console.log("[Google OAuth] 🔐 Initializing Google OAuth Strategy");
  console.log("=".repeat(60));

  // Check environment variables
  if (!GOOGLE_CLIENT_ID) {
    console.error("[Google OAuth] ❌ GOOGLE_CLIENT_ID is not set in environment variables");
  }
  if (!GOOGLE_CLIENT_SECRET) {
    console.error("[Google OAuth] ❌ GOOGLE_CLIENT_SECRET is not set in environment variables");
  }

  if (!GOOGLE_OAUTH_ENABLED) {
    console.warn("[Google OAuth] ⚠️  OAuth is DISABLED - Missing required environment variables");
    console.warn("[Google OAuth]    Required: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET");
    console.log("=".repeat(60) + "\n");
    return false;
  }

  // Log configuration (masked but with more detail for debugging)
  const maskedClientId = GOOGLE_CLIENT_ID.length > 30 
    ? `${GOOGLE_CLIENT_ID.substring(0, 25)}...${GOOGLE_CLIENT_ID.substring(GOOGLE_CLIENT_ID.length - 15)}`
    : GOOGLE_CLIENT_ID;
  const maskedSecret = GOOGLE_CLIENT_SECRET 
    ? `***${GOOGLE_CLIENT_SECRET.substring(GOOGLE_CLIENT_SECRET.length - 4)}`
    : "NOT SET";

  console.log(`[Google OAuth] ✅ OAuth is ENABLED`);
  console.log(`[Google OAuth]    Client ID: ${maskedClientId}`);
  console.log(`[Google OAuth]    Client ID Length: ${GOOGLE_CLIENT_ID.length} characters`);
  console.log(`[Google OAuth]    Client Secret: ${maskedSecret}`);
  console.log(`[Google OAuth]    Client Secret Length: ${GOOGLE_CLIENT_SECRET.length} characters`);

  const callbackURL = getCallbackUrl();
  console.log(`[Google OAuth]    Callback URL: ${callbackURL}`);
  console.log(`[Google OAuth]    Base URL: ${getBaseUrl()}`);
  console.log(`[Google OAuth]    NODE_ENV: ${process.env.NODE_ENV || "not set"}`);

  // Register Google Strategy
  try {
    // Register the Google Strategy
    // Note: Passport will handle duplicate registrations gracefully
    passport.use(new GoogleStrategy({
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: callbackURL,
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          console.error("[Google OAuth] ❌ No email found in Google profile");
          return done(null, false, { message: "No email found in Google profile" });
        }
        
        console.log(`[Google OAuth] 🔍 Authenticating user: ${email}`);
        
        // ✅ RESTRICT: Only whitelisted emails can login via Google OAuth
        const isAllowedEmail = MDO_EMAIL_WHITELIST.includes(email);
        if (!isAllowedEmail) {
          console.warn(`[Google OAuth] ❌ Access denied for email: ${email}. Email not in whitelist.`);
          console.warn(`[Google OAuth]    Allowed emails: ${MDO_EMAIL_WHITELIST.join(", ")}`);
          return done(null, false, { 
            message: "Access denied. Your email is not authorized to sign in with Google." 
          });
        }
        
        // Find or create user by email (only if email is whitelisted)
        let user = await prisma.user.findUnique({
          where: { email },
        });
        
        if (!user) {
          // Create user automatically for whitelisted Google OAuth login
          const passwordHash = hashPassword(`google_oauth_${Date.now()}_${Math.random()}`);
          user = await prisma.user.create({
            data: {
              email,
              name: profile.displayName || profile.name?.givenName || email.split("@")[0],
              passwordHash,
              status: "active",
              isSuperAdmin: false, // MDO users don't need to be super admin
            },
          });
          console.log(`[Google OAuth] ✅ Created new MDO user via Google OAuth: ${email}`);
        } else {
          console.log(`[Google OAuth] ✅ Found existing user: ${email}`);
        }
        
        return done(null, user);
      } catch (error) {
        console.error("[Google OAuth] ❌ Strategy callback error:", error);
        return done(error as Error);
      }
    }));
    
    passport.serializeUser((user: any, done: any) => {
      done(null, user.id);
    });
    
    passport.deserializeUser(async (id: any, done: any) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: String(id) } });
        done(null, user);
      } catch (error) {
        console.error("[Google OAuth] ❌ Deserialize user error:", error);
        done(error);
      }
    });

    console.log("[Google OAuth] ✅ Google Strategy registered successfully");
    console.log("=".repeat(60) + "\n");
    return true;
  } catch (error) {
    console.error("[Google OAuth] ❌ Failed to register Google Strategy:", error);
    console.log("=".repeat(60) + "\n");
    return false;
  }
}

export async function registerLegacyRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint for Railway
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Initialize passport BEFORE registering strategies
  app.use(passport.initialize());
  
  // Initialize Google OAuth Strategy
  const GOOGLE_OAUTH_ENABLED = initializeGoogleOAuth();
  
  app.use(loadUserFromSession);
  
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
            // Check for specific invalid_client error
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
          
          // ALL Google OAuth logins get MDO role
          const userEmail = user.email?.toLowerCase();
          
          // Create session for the user with MDO loginType
          // All Google OAuth logins are treated as MDO users
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
          
          // Redirect with token
          res.redirect(`/auth-callback?token=${session.id}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          res.redirect("/login?error=session_error");
        }
      })(req, res, next);
    });
    
    console.log("[Google OAuth] ✅ OAuth routes registered successfully\n");
  } else {
    // Fallback if Google OAuth is not configured
    console.log("[Google OAuth] ⚠️  OAuth routes NOT registered - OAuth is disabled\n");
    app.get("/api/auth/google", (req, res) => {
      console.log(`[Google OAuth] ❌ OAuth request received but OAuth is not configured`);
      res.status(503).json({ message: "Google OAuth is not configured. Please contact administrator." });
    });
  }

  // Protect all /api/mdo/* routes with requireMDO middleware
  // This must be placed after auth routes to avoid blocking authentication
  app.use("/api/mdo", requireAuth, requireMDO);

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
      
      // Get employee card number from session or from user's employee record
      let employeeCardNo = req.user!.employeeCardNo;
      
      // If not in session, try to get it from the user's employee record
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
      
      // If user has an employee card number, check if they're a manager
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
          // Get unique scopes (combine all manager assignments)
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
      // Fallback to basic user data if manager check fails
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

  app.get("/api/org-units", requireAuth, async (req, res) => {
    try {
      // Allowed unit codes - only these units will be shown
      const allowedUnitCodes = [
        "UNIT-1", "UNIT-2", "UNIT-3", "UNIT-4", 
        "UNIT-5", "UNIT-6", "UNIT-7", "UNIT-8", 
        "GSHO"
      ];
      
      const orgUnits = await prisma.orgUnit.findMany({
        where: {
          id: { in: req.user!.accessibleOrgUnitIds },
          code: { in: allowedUnitCodes }, // Filter by allowed codes
        },
        orderBy: [
          { code: "asc" }, // Sort by code to get Unit 1, Unit 2, etc. in order
        ],
      });
      res.json(orgUnits);
    } catch (error) {
      console.error("Org units error:", error);
      res.status(500).json({ message: "Failed to fetch org units" });
    }
  });

  app.get("/api/branches", requireAuth, async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      
      const branches = await prisma.orgUnit.findMany({
        where: {
          id: { in: accessibleOrgUnitIds },
          type: "branch",
        },
        orderBy: { code: "asc" },
      });

      const branchesWithCounts = await Promise.all(
        branches.map(async (branch) => {
          const employeeCount = await prisma.employee.count({
            where: { orgUnitId: branch.id },
          });
          return {
            ...branch,
            employeeCount,
          };
        })
      );

      res.json(branchesWithCounts);
    } catch (error) {
      console.error("Branches error:", error);
      res.status(500).json({ message: "Failed to fetch branches" });
    }
  });

  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const unitId = req.query.unitId as string | undefined;

      const departments = await prisma.department.findMany({
        orderBy: { name: "asc" },
      });

      const departmentsWithCounts = await Promise.all(
        departments.map(async (dept) => {
          const whereClause: any = { departmentId: dept.id };
          
          if (unitId) {
            whereClause.orgUnitId = unitId;
          } else {
            whereClause.orgUnitId = { in: accessibleOrgUnitIds };
          }

          const employeeCount = await prisma.employee.count({
            where: whereClause,
          });
          return {
            ...dept,
            employeeCount,
          };
        })
      );

      res.json(departmentsWithCounts);
    } catch (error) {
      console.error("Departments error:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const userId = req.user!.id;

      const [employeeCount, todayAttendance, pendingTasks, myPendingTasks] = await Promise.all([
        prisma.employee.count({
          where: { 
            orgUnitId: { in: accessibleOrgUnitIds },
            lastInterviewDate: null, // Only active employees
          },
        }),
        prisma.attendance.count({
          where: {
            date: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
            status: { in: ["present", "late"] },
            employee: { 
              orgUnitId: { in: accessibleOrgUnitIds },
              lastInterviewDate: null, // Only active employees
            },
          },
        }),
        prisma.task.count({
          where: {
            status: { in: ["open", "in_progress"] },
            assignee: { 
              orgUnitId: { in: accessibleOrgUnitIds },
              lastInterviewDate: null, // Only active employees
            },
          },
        }),
        prisma.task.count({
          where: {
            status: { in: ["open", "in_progress"] },
            assigneeId: userId,
          },
        }),
      ]);

      const attendanceRate = employeeCount > 0 
        ? Math.round((todayAttendance / employeeCount) * 100) 
        : 0;

      res.json({
        employees: employeeCount,
        todayAttendance,
        attendanceRate,
        pendingTasks,
        myPendingTasks,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/dashboard/recent-checkins", requireAuth, async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const recentCheckins = await prisma.attendance.findMany({
        where: {
          date: { gte: today },
          checkInAt: { not: null },
          employee: { 
            orgUnitId: { in: accessibleOrgUnitIds },
            lastInterviewDate: null, // Only active employees
          },
        },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
        orderBy: { checkInAt: "desc" },
        take: 5,
      });

      const formatted = recentCheckins.map((a) => ({
        id: a.id,
        name: `${a.employee.firstName} ${a.employee.lastName || ""}`.trim(),
        department: a.employee.department,
        time: a.checkInAt?.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        status: a.status === "late" ? "Late" : "On Time",
        initials: `${a.employee.firstName[0]}${(a.employee.lastName || "X")[0]}`.toUpperCase(),
      }));

      res.json(formatted);
    } catch (error) {
      console.error("Recent checkins error:", error);
      res.status(500).json({ message: "Failed to fetch recent checkins" });
    }
  });

  app.get("/api/employees", requireAuth, requireMDO, requirePolicy("employees.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { unitId, departmentId, designationId, search, page, limit: limitParam, statusFilter } = req.query;

      // MDO users (superadmin or ENV_LOGIN_EMAIL) should see all employees
      // Only filter by orgUnit if not superadmin and accessibleOrgUnitIds is not empty
      const where: any = {};
      
      // Filter: Only show employees fetched from API (have externalId or metadata with API fields)
      // This excludes demo/test employees that were created manually
      where.externalId = { not: null };
      
      if (!req.user!.isSuperAdmin && accessibleOrgUnitIds.length > 0) {
        where.orgUnitId = { in: accessibleOrgUnitIds };
      }
      
      if (unitId) {
        where.orgUnitId = unitId;
      }
      if (departmentId) {
        where.departmentId = departmentId;
      }
      if (designationId) {
        where.designationId = designationId;
      }
      
      // Filter by active/inactive status based on lastInterviewDate
      // Active = lastInterviewDate is null
      // Inactive = lastInterviewDate has a value
      // Default: Only show active employees (inactive employees are hidden everywhere)
      if (statusFilter === 'inactive') {
        where.lastInterviewDate = { not: null };
      } else {
        // Default behavior: Only active employees (statusFilter === 'active' or 'all' or not provided)
        where.lastInterviewDate = null;
      }
      
      // Search filter - Prisma ANDs top-level conditions automatically
      // So: externalId AND lastInterviewDate filter AND (search OR conditions)
      if (search && typeof search === 'string' && search.trim()) {
        where.OR = [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { cardNumber: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ];
      }

      const pageNum = Math.max(1, parseInt(page as string) || 1);
      const limit = parseInt(limitParam as string) || 10000;
      const skip = (pageNum - 1) * limit;

      const [employees, totalCount] = await Promise.all([
        prisma.employee.findMany({
          where,
          select: {
            id: true,
            cardNumber: true,
            firstName: true,
            lastName: true,
            phone: true,
            gender: true,
            status: true,
            profileImageUrl: true,
            weeklyOff: true,
            shiftStart: true,
            shiftEnd: true,
            interviewDate: true,
            lastInterviewDate: true,
            employeeCode: true,
            orgUnit: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, name: true, code: true } },
            user: {
              select: {
                id: true,
                roles: {
                  include: {
                    role: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                } as any,
              } as any,
            },
          },
          orderBy: { firstName: "asc" },
          skip,
          take: limit,
        }),
        prisma.employee.count({ where }),
      ]);

      res.json({
        data: employees,
        pagination: {
          page: pageNum,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: skip + employees.length < totalCount,
        },
      });
    } catch (error) {
      console.error("Employees error:", error);
      res.status(500).json({ message: "Failed to fetch employees" });
    }
  });

  app.get("/api/employees/:id", requireAuth, requirePolicy("employees.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      const employee = await prisma.employee.findFirst({
        where: { 
          id: req.params.id,
          orgUnitId: { in: accessibleOrgUnitIds },
        },
        include: {
          orgUnit: { select: { name: true, code: true } },
          attendance: { orderBy: { date: "desc" }, take: 10 },
          tasks: { orderBy: { createdAt: "desc" }, take: 5 },
          claims: { orderBy: { submittedAt: "desc" }, take: 5 },
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found or access denied" });
      }

      res.json(employee);
    } catch (error) {
      console.error("Employee detail error:", error);
      res.status(500).json({ message: "Failed to fetch employee" });
    }
  });

  app.post("/api/employees/assign-role", requireAuth, requirePolicy("users.create"), async (req, res) => {
    try {
      const { employeeId, roleId, tempPassword } = req.body;
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      if (!employeeId || !roleId || !tempPassword) {
        return res.status(400).json({ message: "Employee ID, role ID, and temporary password are required" });
      }

      if (tempPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const employee = await prisma.employee.findFirst({
        where: { 
          id: employeeId,
          orgUnitId: { in: accessibleOrgUnitIds },
        },
      });

      if (!employee) {
        return res.status(403).json({ 
          message: "Employee not found or access denied", 
          reason: "org_out_of_scope" 
        });
      }

      const role = await (prisma as any).role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      const existingUser = await prisma.user.findFirst({
        where: { 
          employeeId: employee.id,
        },
      });

      if (existingUser) {
        return res.status(400).json({ message: "This employee already has a user account" });
      }

      const email = employee.companyEmail || employee.personalEmail || `${employee.cardNumber || employee.id}@goyalsons.com`;

      const emailExists = await prisma.user.findUnique({
        where: { email },
      });

      if (emailExists) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      const user = await (prisma as any).user.create({
        data: {
          name: `${employee.firstName} ${employee.lastName || ''}`.trim(),
          email,
          phone: employee.phone,
          passwordHash: hashPassword(tempPassword),
          status: "active",
          orgUnitId: employee.orgUnitId,
          employeeId: employee.id,
          roles: {
            create: {
              roleId: role.id,
            },
          },
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      res.json({ 
        message: "Role assigned successfully",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: role.name,
        },
      });
    } catch (error) {
      console.error("Assign role error:", error);
      res.status(500).json({ message: "Failed to assign role" });
    }
  });

  app.get("/api/attendance", requireAuth, requirePolicy("attendance.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { from, to, employeeId } = req.query;

      const where: any = {
        employee: { 
          orgUnitId: { in: accessibleOrgUnitIds },
          lastInterviewDate: null, // Only active employees can have attendance records
        },
      };

      if (from) {
        where.date = { ...where.date, gte: new Date(from as string) };
      }
      if (to) {
        where.date = { ...where.date, lte: new Date(to as string) };
      }
      if (employeeId) {
        where.employeeId = employeeId;
      }

      const attendance = await prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: true,
              orgUnit: { select: { name: true } },
            },
          },
        },
        orderBy: { date: "desc" },
        take: 100,
      });

      res.json(attendance);
    } catch (error) {
      console.error("Attendance error:", error);
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  app.post("/api/attendance/checkin", requireAuth, requirePolicy("attendance.create"), async (req, res) => {
    try {
      const { employeeId } = req.body;
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      const employee = await prisma.employee.findFirst({
        where: { 
          id: employeeId,
          orgUnitId: { in: accessibleOrgUnitIds },
          lastInterviewDate: null, // Only active employees can check in
        },
      });

      if (!employee) {
        return res.status(403).json({ 
          message: "Access denied or employee is inactive", 
          reason: "org_out_of_scope_or_inactive" 
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingAttendance = await prisma.attendance.findFirst({
        where: {
          employeeId,
          date: { gte: today },
        },
      });

      if (existingAttendance) {
        return res.status(400).json({ message: "Already checked in today" });
      }

      const now = new Date();
      const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0);

      const attendance = await prisma.attendance.create({
        data: {
          employeeId,
          date: today,
          checkInAt: now,
          status: isLate ? "late" : "present",
        },
      });

      res.json(attendance);
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({ message: "Check-in failed" });
    }
  });

  // Today's attendance with present/absent status for all employees
  // Priority: 1. Local Prisma DB (real-time synced), 2. BigQuery (historical/backup)
  app.get("/api/attendance/today", requireAuth, requirePolicy("attendance.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { unitId, departmentId, designationId, status: filterStatus, page = "1", limit = "50" } = req.query;

      // Build employee filter - Only active employees (lastInterviewDate is null)
      const employeeWhere: any = {
        orgUnitId: { in: accessibleOrgUnitIds },
        lastInterviewDate: null, // Only active employees can participate
      };

      if (unitId) {
        employeeWhere.orgUnitId = unitId;
      }
      if (departmentId) {
        employeeWhere.departmentId = departmentId;
      }
      if (designationId) {
        employeeWhere.designationId = designationId;
      }

      // Get today's date in IST timezone
      const todayIST = getTodayDateIST();
      const todayStart = new Date(todayIST + 'T00:00:00+05:30');
      const todayEnd = new Date(todayIST + 'T23:59:59+05:30');
      
      console.log(`[Attendance Today] Date: ${todayIST}, Range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}`);

      // Get all employees with their LOCAL attendance for today
      const employees = await prisma.employee.findMany({
        where: employeeWhere,
        include: {
          orgUnit: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          attendance: {
            where: {
              date: {
                gte: todayStart,
                lte: todayEnd,
              },
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { firstName: "asc" },
      });

      // Build local attendance map by employee ID for quick lookup
      const localAttendanceByEmpId = new Map<string, any>();
      let localPresentCount = 0;
      employees.forEach(emp => {
        if (emp.attendance && emp.attendance.length > 0) {
          localAttendanceByEmpId.set(emp.id, emp.attendance[0]);
          localPresentCount++;
        }
      });
      console.log(`[Attendance Today] Local DB: ${localPresentCount} employees with attendance records`);

      // Fetch BigQuery attendance as FALLBACK/SUPPLEMENT
      let bigQueryAttendance: Map<string, any> = new Map();
      if (isBigQueryConfigured()) {
        try {
          bigQueryAttendance = await getTodayAttendanceFromBigQuery();
          console.log(`[Attendance Today] BigQuery returned ${bigQueryAttendance.size} records`);
          
          // Debug: Show sample employee card numbers for matching comparison
          if (employees.length > 0) {
            const sampleEmps = employees.slice(0, 3);
            sampleEmps.forEach(emp => {
              const normalized = normalizeCardNumber(emp.cardNumber);
              const bqMatch = bigQueryAttendance.get(normalized);
              console.log(`[Attendance Today] Employee "${emp.firstName}" cardNumber="${emp.cardNumber}" -> normalized="${normalized}" -> BigQuery match: ${bqMatch ? 'YES' : 'NO'}`);
            });
          }
        } catch (bqError) {
          console.error("[Attendance Today] BigQuery error:", bqError);
        }
      }

      // Transform data - PRIORITY: Local DB first, then BigQuery
      const attendanceData = employees.map(emp => {
        const localRecord = localAttendanceByEmpId.get(emp.id);
        const normalizedCardNo = normalizeCardNumber(emp.cardNumber);
        const bqRecord = normalizedCardNo ? bigQueryAttendance.get(normalizedCardNo) : null;
        
        // Determine status - Local DB takes priority
        let status = "absent";
        let checkInAt: Date | string | null = null;
        let checkOutAt: Date | string | null = null;
        let attendanceStatus: string | null = null;
        let dataSource: string = "none";
        
        // PRIORITY 1: Local Prisma attendance (real-time synced data)
        if (localRecord) {
          status = localRecord.status === "present" || localRecord.checkInAt ? "present" : "absent";
          checkInAt = localRecord.checkInAt;
          checkOutAt = localRecord.checkOutAt;
          attendanceStatus = localRecord.status;
          dataSource = "local";
        }
        // PRIORITY 2: BigQuery attendance (historical/backup)
        else if (bqRecord) {
          // IMPORTANT: t_in is actual check-in time, result_t_in is often default shift time
          // Only t_in/t_out indicate real punches
          const actualTimeIn = bqRecord.t_in; // NOT result_t_in (that's default shift time)
          const actualTimeOut = bqRecord.t_out; // NOT result_t_out
          
          // Check for valid ACTUAL punch time (not null, not empty, not "null" string)
          const hasActualPunchIn = actualTimeIn && actualTimeIn !== "null" && String(actualTimeIn).trim() !== "";
          const hasActualPunchOut = actualTimeOut && actualTimeOut !== "null" && String(actualTimeOut).trim() !== "";
          
          // For display, use actual times if available, otherwise result times
          if (hasActualPunchIn) {
            checkInAt = parseTimeToDateTime(actualTimeIn);
          } else if (bqRecord.result_t_in) {
            // result_t_in might be shift time, only show if status indicates presence
            const resultTimeIn = typeof bqRecord.result_t_in === 'object' ? bqRecord.result_t_in.value : bqRecord.result_t_in;
            // Don't use "05:30:00" default - it's just shift start
            if (resultTimeIn && resultTimeIn !== "05:30:00") {
              checkInAt = parseTimeToDateTime(resultTimeIn);
            }
          }
          
          if (hasActualPunchOut) {
            checkOutAt = parseTimeToDateTime(actualTimeOut);
          } else if (bqRecord.result_t_out) {
            const resultTimeOut = typeof bqRecord.result_t_out === 'object' ? bqRecord.result_t_out.value : bqRecord.result_t_out;
            if (resultTimeOut && resultTimeOut !== "05:30:00") {
              checkOutAt = parseTimeToDateTime(resultTimeOut);
            }
          }
          
          // Determine presence based on:
          // 1. P flag = 1 (explicit present from BigQuery processing)
          // 2. STATUS explicitly says PRESENT
          // 3. Has ACTUAL punch-in time (t_in, not result_t_in)
          // 4. STATUS is "MISS PENDING" with actual punch times (pending verification)
          const statusUpper = (bqRecord.STATUS || "").toUpperCase();
          const isPresent = 
            bqRecord.P === 1 || 
            statusUpper.includes("PRESENT") ||
            statusUpper === "P" ||
            hasActualPunchIn; // Real punch-in = employee is present
          
          status = isPresent ? "present" : "absent";
          attendanceStatus = bqRecord.STATUS;
          dataSource = "bigquery";
        }
        
        return {
          id: emp.id,
          cardNumber: emp.cardNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          phone: emp.phone,
          profileImageUrl: emp.profileImageUrl,
          unit: emp.orgUnit,
          department: emp.department,
          designation: emp.designation,
          status,
          checkInAt: checkInAt instanceof Date ? checkInAt.toISOString() : checkInAt,
          checkOutAt: checkOutAt instanceof Date ? checkOutAt.toISOString() : checkOutAt,
          attendanceStatus,
          dataSource, // Debug: shows where data came from
          bigQueryStatus: bqRecord?.STATUS || null,
          meta: bqRecord ? {
            branch_code: bqRecord.branch_code,
            entry_type: bqRecord.entry_type,
            status_remarks: bqRecord.status_remarks,
          } : (localRecord?.meta || null),
        };
      });

      // Apply status filter if provided
      const filteredData = filterStatus 
        ? attendanceData.filter(a => a.status === filterStatus)
        : attendanceData;

      // Calculate summary
      const presentCount = attendanceData.filter(a => a.status === "present").length;
      const absentCount = attendanceData.filter(a => a.status === "absent").length;
      
      console.log(`[Attendance Today] Summary: ${presentCount} present, ${absentCount} absent out of ${attendanceData.length} total`);

      // Pagination
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 50;
      const offset = (pageNum - 1) * limitNum;
      const paginatedData = filteredData.slice(offset, offset + limitNum);

      res.json({
        date: todayIST,
        summary: {
          total: attendanceData.length,
          present: presentCount,
          absent: absentCount,
          attendanceRate: attendanceData.length > 0 
            ? Math.round((presentCount / attendanceData.length) * 100)
            : 0,
        },
        data: paginatedData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: filteredData.length,
          totalPages: Math.ceil(filteredData.length / limitNum),
        },
      });
    } catch (error) {
      console.error("Today attendance error:", error);
      res.status(500).json({ message: "Failed to fetch today's attendance" });
    }
  });

  // Manager Dashboard - Attendance Overview for Today or Last Day
  app.get("/api/manager/dashboard/attendance", requireAuth, async (req, res) => {
    try {
      const employeeCardNo = req.user!.employeeCardNo;
      const { dateType = "today" } = req.query; // "today" or "lastday"

      if (!employeeCardNo) {
        console.log("[Manager Dashboard] ❌ No employee card number found");
        return res.status(403).json({ 
          message: "Manager card number not found. Please login as a manager." 
        });
      }

      // Normalize card number for consistent matching
      const normalizedCardNo = normalizeCardNumber(employeeCardNo);
      console.log(`[Manager Dashboard] Normalized card number: ${employeeCardNo} -> ${normalizedCardNo}`);

      // Get manager assignments from emp_manager table
      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mcardno" = ${normalizedCardNo} AND "mis_extinct" = false
      `;

      console.log(`[Manager Dashboard] Manager assignments found: ${managers.length} for card ${normalizedCardNo}`);
      
      if (managers.length === 0) {
        console.log("[Manager Dashboard] ❌ No manager assignments found");
        return res.json({
          date: getTodayDateIST(),
          dateType,
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            mis: 0,
            half: 0,
            late: 0,
            earlyOut: 0,
          },
          data: [],
        });
      }

      // Build where conditions based on manager's scope
      // Each manager assignment creates an AND condition (all specified fields must match)
      // Multiple assignments are combined with OR (any assignment can match)
      const whereConditions: any[] = [];
      
      managers.forEach((manager, idx) => {
        console.log(`[Manager Dashboard] Processing manager assignment ${idx + 1}:`, {
          mid: manager.mid,
          mcardno: manager.mcardno,
          departmentId: manager.mdepartmentId,
          designationId: manager.mdesignationId,
          orgUnitId: manager.morgUnitId,
        });

        const condition: any = {};
        if (manager.mdepartmentId) {
          condition.departmentId = manager.mdepartmentId;
          console.log(`[Manager Dashboard]   → Adding department filter: ${manager.mdepartmentId}`);
        }
        if (manager.mdesignationId) {
          condition.designationId = manager.mdesignationId;
          console.log(`[Manager Dashboard]   → Adding designation filter: ${manager.mdesignationId}`);
        }
        if (manager.morgUnitId) {
          condition.orgUnitId = manager.morgUnitId;
          console.log(`[Manager Dashboard]   → Adding orgUnit filter: ${manager.morgUnitId}`);
        }
        
        // Only add condition if at least one scope is defined
        if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
          whereConditions.push(condition);
          console.log(`[Manager Dashboard]   ✅ Added condition ${whereConditions.length}:`, condition);
        } else {
          console.log(`[Manager Dashboard]   ⚠️ Skipped condition - all fields are null`);
        }
      });
      
      console.log(`[Manager Dashboard] Total whereConditions built: ${whereConditions.length}`);

      if (whereConditions.length === 0) {
        console.log("[Manager Dashboard] ❌ No valid where conditions");
        return res.json({
          date: getTodayDateIST(),
          dateType,
          summary: {
            total: 0,
            present: 0,
            absent: 0,
            mis: 0,
            half: 0,
            late: 0,
            earlyOut: 0,
          },
          data: [],
        });
      }

      // Build employee filter - only active employees matching manager's scope
      const employeeWhere: any = {
        AND: [
          {
            lastInterviewDate: null, // Only active employees (haven't exited)
          },
          {
            OR: whereConditions, // Match any of the manager's assignments
          }
        ]
      };

      // Determine date range
      let targetDate: string;
      let dateStart: Date;
      let dateEnd: Date;

      if (dateType === "lastday") {
        // Get yesterday's date in IST (avoid timezone issues by calculating directly from date string)
        const todayIST = getTodayDateIST(); // Format: YYYY-MM-DD
        const [year, month, day] = todayIST.split('-').map(Number);
        const todayDate = new Date(year, month - 1, day); // month is 0-indexed
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        
        // Format as YYYY-MM-DD
        const yYear = yesterdayDate.getFullYear();
        const yMonth = String(yesterdayDate.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterdayDate.getDate()).padStart(2, '0');
        targetDate = `${yYear}-${yMonth}-${yDay}`;
        
        dateStart = new Date(targetDate + 'T00:00:00+05:30');
        dateEnd = new Date(targetDate + 'T23:59:59+05:30');
      } else {
        // Today
        targetDate = getTodayDateIST();
        dateStart = new Date(targetDate + 'T00:00:00+05:30');
        dateEnd = new Date(targetDate + 'T23:59:59+05:30');
      }

      console.log(`[Manager Dashboard] Fetching attendance for ${dateType}, Date: ${targetDate}`);
      console.log(`[Manager Dashboard] Employee where conditions:`, JSON.stringify(employeeWhere, null, 2));
      console.log(`[Manager Dashboard] Total where conditions: ${whereConditions.length}`);

      // Get all employees with their attendance
      const employees = await prisma.employee.findMany({
        where: employeeWhere,
        include: {
          orgUnit: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          attendance: {
            where: {
              date: {
                gte: dateStart,
                lte: dateEnd,
              },
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { firstName: "asc" },
      });

      // Build local attendance map
      const localAttendanceByEmpId = new Map<string, any>();
      employees.forEach(emp => {
        if (emp.attendance && emp.attendance.length > 0) {
          localAttendanceByEmpId.set(emp.id, emp.attendance[0]);
        }
      });

      // Fetch BigQuery attendance as fallback
      let bigQueryAttendance: Map<string, any> = new Map();
      if (isBigQueryConfigured()) {
        try {
          if (dateType === "today") {
            bigQueryAttendance = await getTodayAttendanceFromBigQuery();
          } else if (dateType === "lastday") {
            // Query BigQuery for yesterday's attendance
            const client = getBigQueryClient();
            const projectId = 'quickstart-1587217624038';
            const datasetId = 'hrms';
            const tableId = 'ATTENDENCE_SUMMARY';
            
            // Query for yesterday's date using parameterized query
            const query = `
              SELECT * 
              FROM \`${projectId}.${datasetId}.${tableId}\`
              WHERE dt = @targetDate
            `;
            
            const [rows] = await client.query({ 
              query, 
              params: { targetDate },
              location: 'us-central1' 
            });
            (rows as any[]).forEach((row: any) => {
              // Normalize BigQuery DATE/TIME objects (same as getTodayAttendanceFromBigQuery)
              const normalized: any = { ...row };
              if (row.dt && typeof row.dt === 'object' && row.dt.value) {
                normalized.dt = row.dt.value;
              }
              if (row.t_in && typeof row.t_in === 'object' && row.t_in.value) {
                normalized.t_in = row.t_in.value;
              }
              if (row.t_out && typeof row.t_out === 'object' && row.t_out.value) {
                normalized.t_out = row.t_out.value;
              }
              if (row.result_t_in && typeof row.result_t_in === 'object' && row.result_t_in.value) {
                normalized.result_t_in = row.result_t_in.value;
              }
              if (row.result_t_out && typeof row.result_t_out === 'object' && row.result_t_out.value) {
                normalized.result_t_out = row.result_t_out.value;
              }
              
              const cardNo = normalizeCardNumber(normalized.card_no || normalized.cardno || '');
              if (cardNo) {
                bigQueryAttendance.set(cardNo, normalized);
              }
            });
            console.log(`[Manager Dashboard] BigQuery returned ${bigQueryAttendance.size} records for ${targetDate}`);
          }
        } catch (bqError) {
          console.error("[Manager Dashboard] BigQuery error:", bqError);
        }
      }

      // Transform data with early/late indicators
      const attendanceData = employees.map(emp => {
        const localRecord = localAttendanceByEmpId.get(emp.id);
        const normalizedCardNo = normalizeCardNumber(emp.cardNumber);
        const bqRecord = normalizedCardNo ? bigQueryAttendance.get(normalizedCardNo) : null;
        
        let status = "absent";
        let attendanceStatus: string | null = null;
        let checkInAt: Date | string | null = null;
        let checkOutAt: Date | string | null = null;
        let isLate = false;
        let isEarlyOut = false;
        let dataSource: string = "none";
        
        // PRIORITY 1: Local Prisma attendance
        if (localRecord) {
          status = localRecord.status === "present" || localRecord.checkInAt ? "present" : "absent";
          checkInAt = localRecord.checkInAt;
          checkOutAt = localRecord.checkOutAt;
          attendanceStatus = localRecord.status;
          dataSource = "local";
        }
        // PRIORITY 2: BigQuery attendance
        else if (bqRecord) {
          const actualTimeIn = bqRecord.t_in;
          const actualTimeOut = bqRecord.t_out;
          
          const hasActualPunchIn = actualTimeIn && actualTimeIn !== "null" && String(actualTimeIn).trim() !== "";
          const hasActualPunchOut = actualTimeOut && actualTimeOut !== "null" && String(actualTimeOut).trim() !== "";
          
          // For lastday, combine time with targetDate; for today, parseTimeToDateTime uses today's date by default
          if (hasActualPunchIn) {
            if (dateType === "lastday") {
              checkInAt = parseTimeToDateTimeWithDate(actualTimeIn, new Date(targetDate + 'T00:00:00+05:30'));
            } else {
              checkInAt = parseTimeToDateTime(actualTimeIn);
            }
          } else if (bqRecord.result_t_in) {
            const resultTimeIn = typeof bqRecord.result_t_in === 'object' ? bqRecord.result_t_in.value : bqRecord.result_t_in;
            if (resultTimeIn && resultTimeIn !== "05:30:00") {
              if (dateType === "lastday") {
                checkInAt = parseTimeToDateTimeWithDate(resultTimeIn, new Date(targetDate + 'T00:00:00+05:30'));
              } else {
                checkInAt = parseTimeToDateTime(resultTimeIn);
              }
            }
          }
          
          if (hasActualPunchOut) {
            if (dateType === "lastday") {
              checkOutAt = parseTimeToDateTimeWithDate(actualTimeOut, new Date(targetDate + 'T00:00:00+05:30'));
            } else {
              checkOutAt = parseTimeToDateTime(actualTimeOut);
            }
          } else if (bqRecord.result_t_out) {
            const resultTimeOut = typeof bqRecord.result_t_out === 'object' ? bqRecord.result_t_out.value : bqRecord.result_t_out;
            if (resultTimeOut && resultTimeOut !== "05:30:00") {
              if (dateType === "lastday") {
                checkOutAt = parseTimeToDateTimeWithDate(resultTimeOut, new Date(targetDate + 'T00:00:00+05:30'));
              } else {
                checkOutAt = parseTimeToDateTime(resultTimeOut);
              }
            }
          }
          
          const statusUpper = (bqRecord.STATUS || "").toUpperCase();
          const isPresent = 
            bqRecord.P === 1 || 
            statusUpper.includes("PRESENT") ||
            statusUpper === "P" ||
            hasActualPunchIn;
          
          status = isPresent ? "present" : "absent";
          attendanceStatus = bqRecord.STATUS;
          dataSource = "bigquery";
          
          // Determine late/early indicators from status
          isLate = statusUpper.includes("LATE");
          isEarlyOut = statusUpper.includes("EARLY_OUT") || statusUpper.includes("EARLY OUT");
        }

        // Determine status category: Present, Absent, Mis (Miss), Half
        let statusCategory = "absent";
        if (status === "present") {
          const statusUpper = (attendanceStatus || "").toUpperCase();
          if (statusUpper.includes("HALF") || statusUpper.includes("HALFDAY")) {
            statusCategory = "half";
          } else if (statusUpper.includes("MISS")) {
            statusCategory = "mis";
          } else {
            statusCategory = "present";
          }
        }

        return {
          id: emp.id,
          cardNumber: emp.cardNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          unit: emp.orgUnit?.name || null,
          department: emp.department?.name || null,
          designation: emp.designation?.name || null,
          status: statusCategory, // present, absent, mis, half
          checkInAt: checkInAt instanceof Date ? checkInAt.toISOString() : checkInAt,
          checkOutAt: checkOutAt instanceof Date ? checkOutAt.toISOString() : checkOutAt,
          attendanceStatus,
          isLate,
          isEarlyOut,
          dataSource,
        };
      });

      // Calculate summary
      const presentCount = attendanceData.filter(a => a.status === "present").length;
      const absentCount = attendanceData.filter(a => a.status === "absent").length;
      const misCount = attendanceData.filter(a => a.status === "mis").length;
      const halfCount = attendanceData.filter(a => a.status === "half").length;
      const lateCount = attendanceData.filter(a => a.isLate).length;
      const earlyOutCount = attendanceData.filter(a => a.isEarlyOut).length;

      res.json({
        date: targetDate,
        dateType,
        summary: {
          total: attendanceData.length,
          present: presentCount,
          absent: absentCount,
          mis: misCount,
          half: halfCount,
          late: lateCount,
          earlyOut: earlyOutCount,
        },
        data: attendanceData,
      });
    } catch (error) {
      console.error("Manager dashboard attendance error:", error);
      res.status(500).json({ message: "Failed to fetch attendance data" });
    }
  });

  app.get("/api/attendance/history/config", requireAuth, async (req, res) => {
    // Allow employees to check config (they can view their own attendance)
    const isEmployee = req.user!.loginType === "employee";
    const hasPolicy = req.user!.policies?.includes("attendance.view");
    const isSuperAdmin = req.user!.isSuperAdmin;
    
    if (!isEmployee && !hasPolicy && !isSuperAdmin) {
      return res.status(403).json({ message: "Access denied", reason: "missing_policy", required: "attendance.view" });
    }
    
    res.json({ configured: isBigQueryConfigured() });
  });

  app.get("/api/attendance/history/:cardNo", requireAuth, async (req, res) => {
    try {
      // Prevent caching to ensure fresh data for each month
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Expires', '0');
      res.set('Pragma', 'no-cache');

      // STEP 1: Normalize user card once at the top
      const normalizedUserCard = req.user?.employeeCardNo
        ? String(req.user.employeeCardNo).trim()
        : null;

      let isManager = Boolean(req.user?.isManager);
      const isEmployee = req.user!.loginType === "employee";
      
      console.log(`[Attendance History] Initial state: isManager=${isManager} (from session), isEmployee=${isEmployee}, normalizedUserCard=${normalizedUserCard}`);
      
      // STEP 2: RUN FALLBACK MANAGER CHECK FIRST (before ANY 403)
      // If isManager is false AND normalizedUserCard exists, check database
      if (!isManager && normalizedUserCard) {
        console.log(`[Attendance History] 🔍 Running fallback manager check for card: ${normalizedUserCard}`);
        try {
          const managerCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::int as count
            FROM "emp_manager"
            WHERE "mcardno" = ${normalizedUserCard} AND "mis_extinct" = false
          `;
          const count = Number(managerCheck[0]?.count || 0);
          isManager = count > 0;
          console.log(`[Attendance History] 🔍 Manager count = ${count}, Final isManager = ${isManager}`);
        } catch (error) {
          console.error(`[Attendance History] ❌ Error in fallback manager check for card ${normalizedUserCard}:`, error);
          // Do NOT silently fail - log clearly and keep isManager as false
          isManager = false;
          console.log(`[Attendance History] 🔍 Final isManager = false (error occurred)`);
        }
      } else if (isManager) {
        console.log(`[Attendance History] ⏭️ Skipping fallback manager check (already marked as manager in session)`);
      } else if (!normalizedUserCard) {
        console.log(`[Attendance History] ⏭️ Skipping fallback manager check (no card number available)`);
      }
      
      console.log(`[Attendance History] Final manager status: isManager=${isManager} (session value was ${req.user?.isManager})`);
      
      const hasPolicy = req.user!.policies?.includes("attendance.view");
      const isSuperAdmin = req.user!.isSuperAdmin;
      
      console.log(`[Attendance History] Auth check:`, {
        isEmployee,
        isManager,
        isManagerRaw: req.user?.isManager,
        hasPolicy,
        isSuperAdmin,
        normalizedUserCard,
        loginType: req.user!.loginType,
      });
      
      // Non-employees need the attendance.view policy OR be a manager
      // Managers can view their team members' attendance
      if (!isEmployee && !hasPolicy && !isSuperAdmin && !isManager) {
        console.log(`[Attendance History] ❌ Access denied: missing policy or manager status`);
        return res.status(403).json({ message: "Access denied", reason: "missing_policy", required: "attendance.view" });
      }

      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery is not configured. Please add BIGQUERY_CREDENTIALS secret." });
      }

      let { cardNo } = req.params;
      const { month } = req.query;

      // Normalize requested card number
      const normalizedRequestedCard = String(cardNo).trim();

      // STEP 3: Apply employee restriction ONLY AFTER manager resolution
      // Employee restriction must run ONLY if: isEmployee === true AND isManager === false
      console.log(`[Attendance History] Checking employee restriction: isEmployee=${isEmployee}, isManager=${isManager}, will restrict=${isEmployee && !isManager}`);
      if (isEmployee && !isManager) {
        // Compare normalized values
        if (normalizedUserCard && normalizedRequestedCard !== normalizedUserCard) {
          console.log(`[Attendance History] ❌ Card number mismatch: requested="${normalizedRequestedCard}", employee="${normalizedUserCard}"`);
          console.log(`[Attendance History] ❌ Blocking employee access - not their own card`);
          return res.status(403).json({
            message: "Access denied: You can only view your own attendance"
          });
        }
        console.log(`[Attendance History] ✅ Employee access allowed - viewing own card`);
        cardNo = normalizedUserCard || cardNo;
        
        // STEP 4: Month restriction - apply last-3-month rule ONLY when:
        // isEmployee === true AND isManager === false
        // Managers must bypass month restriction completely
        if (month) {
          const requestedMonth = new Date(month as string);
          const now = new Date();
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          if (requestedMonth < threeMonthsAgo) {
            return res.status(403).json({ message: "Access denied: You can only view attendance from the last 3 months" });
          }
        }
      }

      // Manager login: verify the card number belongs to their team
      // Managers can view team members' attendance even if they're also employees
      // Managers can also view their own attendance
      if (isManager) {
        if (!normalizedUserCard) {
          console.log("[Attendance History] ❌ Manager card number not found in session");
          return res.status(403).json({ message: "Access denied: Manager card number not found" });
        }

        console.log(`[Attendance History] Manager access check: managerCardNo=${normalizedUserCard}, requestedCardNo=${normalizedRequestedCard}`);

        // Allow managers to view their own attendance
        if (normalizedRequestedCard === normalizedUserCard) {
          console.log(`[Attendance History] ✅ Manager viewing own attendance: ${normalizedRequestedCard}`);
          cardNo = normalizedRequestedCard;
          // Continue to fetch attendance (bypass team check)
        } else {
          // For team members, verify they're in the manager's team
          // Get manager's team members (use normalized card number for consistency)
          const managers = await prisma.$queryRaw<Array<{
            mid: string;
            mcardno: string;
            mdepartmentId: string | null;
            mdesignationId: string | null;
            morgUnitId: string | null;
            mis_extinct: boolean;
          }>>`
            SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
            FROM "emp_manager"
            WHERE "mcardno" = ${normalizedUserCard} AND "mis_extinct" = false
          `;

          console.log(`[Attendance History] Manager assignments found: ${managers.length}`);

          if (managers.length === 0) {
            console.log("[Attendance History] ❌ No manager assignments found");
            return res.status(403).json({ 
              message: "Access denied: No manager assignments found" 
            });
          }

          // Build where clause based on manager's scope
          const whereConditions: any[] = [];
          
          managers.forEach((manager) => {
            const condition: any = { status: "ACTIVE" };
            if (manager.mdepartmentId) {
              condition.departmentId = manager.mdepartmentId;
            }
            if (manager.mdesignationId) {
              condition.designationId = manager.mdesignationId;
            }
            if (manager.morgUnitId) {
              condition.orgUnitId = manager.morgUnitId;
            }
            
            if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
              whereConditions.push(condition);
            }
          });

          console.log(`[Attendance History] Where conditions: ${whereConditions.length}`);

          if (whereConditions.length === 0) {
            console.log("[Attendance History] ❌ No valid where conditions (manager has no scope defined)");
            return res.status(403).json({ 
              message: "Access denied: Manager has no team scope defined" 
            });
          }

          // Get team member card numbers
          const teamMembers = await prisma.employee.findMany({
            where: {
              OR: whereConditions,
            },
            select: { cardNumber: true },
          });

          const teamCardNumbers = teamMembers
            .map(e => e.cardNumber)
            .filter((card): card is string => card !== null)
            .map(card => String(card).trim()); // Normalize to strings

          console.log(`[Attendance History] Team members found: ${teamCardNumbers.length}`);
          console.log(`[Attendance History] Requested card "${normalizedRequestedCard}" in team: ${teamCardNumbers.includes(normalizedRequestedCard)}`);
          console.log(`[Attendance History] Sample team cards: ${teamCardNumbers.slice(0, 5).join(", ")}`);

          // Verify the requested card number is in the team
          if (!teamCardNumbers.includes(normalizedRequestedCard)) {
            console.log(`[Attendance History] ❌ Card "${normalizedRequestedCard}" not in team. Team cards: ${teamCardNumbers.slice(0, 10).join(", ")}...`);
            return res.status(403).json({ 
              message: "Access denied: You can only view attendance for your team members" 
            });
          }

          console.log(`[Attendance History] ✅ Manager access granted for team member card ${normalizedRequestedCard}`);
          cardNo = normalizedRequestedCard;
        }
      }

      // Ensure cardNo is set correctly after all checks
      // For employees, it's already set to their own card
      // For managers, use the requested card (already validated)
      if (isManager && !cardNo) {
        cardNo = normalizedRequestedCard;
      }

      console.log(`[API] Attendance history request: cardNo=${cardNo}, month=${month}`);

      if (!cardNo) {
        return res.status(400).json({ message: "Card number is required" });
      }

      const result = await getEmployeeAttendance(cardNo, month as string | undefined);
      console.log(`[API] Returning ${result.records.length} records, summary:`, result.summary);
      res.json(result);
    } catch (error: any) {
      console.error("Attendance history error:", error);
      
      // Check for specific decoder errors related to BigQuery credentials
      const errorMessage = error.message || String(error);
      if (errorMessage.includes("DECODER") || errorMessage.includes("decoder") || errorMessage.includes("1E08010C")) {
        console.error("[Attendance History] BigQuery credentials decoder error detected");
        res.status(500).json({ 
          message: "BigQuery credentials error: Please check BIGQUERY_CREDENTIALS environment variable format. Private key may have incorrect newline encoding." 
        });
      } else {
        res.status(500).json({ message: errorMessage || "Failed to fetch attendance history" });
      }
    }
  });


  app.get("/api/employees/by-card/:cardNo", requireAuth, async (req, res) => {
    try {
      const { cardNo } = req.params;
      const employee = await prisma.employee.findFirst({
        where: { cardNumber: cardNo },
        select: {
          id: true,
          cardNumber: true,
          firstName: true,
          lastName: true,
          weeklyOff: true,
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      res.json(employee);
    } catch (error: any) {
      console.error("Employee by card error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch employee" });
    }
  });

  app.get("/api/tasks", requireAuth, requirePolicy("tasks.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { status, priority } = req.query;

      const where: any = {
        assignee: { 
          orgUnitId: { in: accessibleOrgUnitIds },
          lastInterviewDate: null, // Only active employees can have tasks
        },
      };

      // Employee login: show only self-assigned tasks
      if (req.user!.loginType === "employee" && req.user!.employeeId) {
        where.assigneeId = req.user!.employeeId;
      }

      if (status) {
        where.status = status;
      }
      if (priority) {
        where.priority = priority;
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              orgUnit: { select: { id: true, name: true } },
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(tasks);
    } catch (error) {
      console.error("Tasks error:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", requireAuth, requirePolicy("tasks.create"), async (req, res) => {
    try {
      const { title, description, assigneeId, priority, dueDate } = req.body;
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      if (assigneeId) {
        const assignee = await prisma.employee.findFirst({
          where: { 
            id: assigneeId,
            orgUnitId: { in: accessibleOrgUnitIds },
            lastInterviewDate: null, // Only active employees can be assigned tasks
          },
        });

        if (!assignee) {
          return res.status(403).json({ 
            message: "Cannot assign task to employee outside your org scope",
            reason: "org_out_of_scope" 
          });
        }
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          assigneeId,
          creatorId: req.user!.id,
          priority,
          dueDate: dueDate ? new Date(dueDate) : undefined,
          status: "open",
        },
      });

      res.json(task);
    } catch (error) {
      console.error("Create task error:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.get("/api/users", requireAuth, requireMDO, requirePolicy("users.view"), async (req, res) => {
    try {
      const users = await (prisma as any).user.findMany({
        include: {
          roles: {
            include: {
              role: {
                include: {
                  policies: {
                    include: {
                      policy: true,
                    },
                  },
                },
              },
            },
          },
          orgUnit: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      res.json(users);
    } catch (error) {
      console.error("Users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/claims", requireAuth, requirePolicy("claims.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { status } = req.query;

      const where: any = {
        employee: { 
          orgUnitId: { in: accessibleOrgUnitIds },
          lastInterviewDate: null, // Only active employees can have claims
        },
      };

      // Employee login: show only self claims
      if (req.user!.loginType === "employee" && req.user!.employeeId) {
        where.employeeId = req.user!.employeeId;
      }

      if (status) {
        where.status = status;
      }

      const claims = await prisma.claim.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              orgUnit: { select: { id: true, name: true } },
            },
          },
          attachments: true,
        },
        orderBy: { submittedAt: "desc" },
      });

      res.json(claims);
    } catch (error) {
      console.error("Claims error:", error);
      res.status(500).json({ message: "Failed to fetch claims" });
    }
  });

  app.get("/api/announcements", requireAuth, requirePolicy("announcements.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      const announcements = await prisma.announcement.findMany({
        where: {
          OR: [
            { scope: "all" },
            {
              recipients: {
                some: {
                  orgUnitId: { in: accessibleOrgUnitIds },
                },
              },
            },
          ],
        },
        include: {
          createdBy: {
            select: { name: true },
          },
          recipients: {
            where: { orgUnitId: { in: accessibleOrgUnitIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              orgUnit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(announcements);
    } catch (error) {
      console.error("Announcements error:", error);
      res.status(500).json({ message: "Failed to fetch announcements" });
    }
  });

  app.get("/api/targets", requireAuth, requirePolicy("targets.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      const where: any = {
        employee: { 
          orgUnitId: { in: accessibleOrgUnitIds },
          lastInterviewDate: null, // Only active employees can have targets
        },
      };

      // Employee login: show only self targets
      if (req.user!.loginType === "employee" && req.user!.employeeId) {
        where.employeeId = req.user!.employeeId;
      }

      const targets = await prisma.employeeTarget.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              orgUnit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { periodEnd: "desc" },
      });

      res.json(targets);
    } catch (error) {
      console.error("Targets error:", error);
      res.status(500).json({ message: "Failed to fetch targets" });
    }
  });

  // ==================== ROLES API ====================

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

      // Create role with policies in transaction
      const role = await prisma.$transaction(async (tx: any) => {
        const newRole = await tx.role.create({
          data: {
            name,
            description: description || null,
            level: level || 0
          }
        });

        // Assign policies if provided
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

      // Check if role exists
      const existingRole = await (prisma as any).role.findUnique({
        where: { id }
      });

      if (!existingRole) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Update role and policies in transaction
      await prisma.$transaction(async (tx: any) => {
        // Update role
        await tx.role.update({
          where: { id },
          data: {
            name: name || existingRole.name,
            description: description !== undefined ? description : existingRole.description,
            level: level !== undefined ? level : existingRole.level
          }
        });

        // Update policies if provided
        if (policyIds && Array.isArray(policyIds)) {
          // Delete existing policies
          await tx.rolePolicy.deleteMany({
            where: { roleId: id }
          });

          // Add new policies
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

      // Check if role has users assigned
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

  // ==================== ROLE WORKFLOW API ====================

  // GET /api/roles/workflow - Get role hierarchy workflow
  app.get("/api/roles/workflow", requireAuth, async (req, res) => {
    try {
      // Try to get workflow from a storage mechanism (could be database, file, etc.)
      // For now, we'll use a simple in-memory storage or database table
      // You can extend this to use Prisma if you add a workflow table
      
      // Check if there's a workflow stored in database (you may need to create a workflow table)
      // For now, return empty workflow structure
      const workflow = {
        roles: [],
        connections: [],
      };

      res.json(workflow);
    } catch (error) {
      console.error("Get workflow error:", error);
      res.status(500).json({ message: "Failed to get workflow" });
    }
  });

  // POST /api/roles/workflow - Save role hierarchy workflow
  app.post("/api/roles/workflow", requireAuth, requirePolicy("admin.roles"), async (req, res) => {
    try {
      const { roles, connections } = req.body;

      if (!roles || !Array.isArray(roles)) {
        return res.status(400).json({ message: "Invalid workflow data: roles array is required" });
      }

      if (!connections || !Array.isArray(connections)) {
        return res.status(400).json({ message: "Invalid workflow data: connections array is required" });
      }

      // Validate workflow structure
      // Check for circular dependencies
      const nodeMap = new Map<string, Set<string>>();
      connections.forEach((conn: any) => {
        if (!nodeMap.has(conn.source)) {
          nodeMap.set(conn.source, new Set());
        }
        nodeMap.get(conn.source)!.add(conn.target);
      });

      // Simple cycle detection
      const visited = new Set<string>();
      const recStack = new Set<string>();
      
      const hasCycle = (node: string): boolean => {
        if (recStack.has(node)) return true;
        if (visited.has(node)) return false;
        
        visited.add(node);
        recStack.add(node);
        
        const children = nodeMap.get(node) || new Set();
        for (const child of Array.from(children)) {
          if (hasCycle(child)) return true;
        }
        
        recStack.delete(node);
        return false;
      };

      for (const role of roles) {
        if (!visited.has(role.id) && hasCycle(role.id)) {
          return res.status(400).json({ 
            message: "Circular hierarchy detected in workflow. Please fix the connections." 
          });
        }
      }

      // Store workflow (you can extend this to save to database)
      // For now, we'll just return the saved workflow
      // In production, you'd want to save this to a database table
      const savedWorkflow = {
        roles,
        connections,
        updatedAt: new Date().toISOString(),
      };

      // TODO: Save to database if you add a workflow table
      // Example:
      // await prisma.roleWorkflow.upsert({
      //   where: { id: "default" },
      //   update: { data: savedWorkflow, updatedAt: new Date() },
      //   create: { id: "default", data: savedWorkflow, updatedAt: new Date() }
      // });

      res.json(savedWorkflow);
    } catch (error) {
      console.error("Save workflow error:", error);
      res.status(500).json({ message: "Failed to save workflow" });
    }
  });

  // ==================== POLICIES API ====================

  // GET /api/policies - Get all policies grouped by category
  app.get("/api/policies", requireAuth, async (req, res) => {
    try {
      const policies = await (prisma as any).policy.findMany({
        orderBy: [
          { category: "asc" },
          { key: "asc" }
        ]
      });

      res.json(policies);
    } catch (error) {
      console.error("Policies error:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  // POST /api/policies - Create new policy (admin only)
  app.post("/api/policies", requireAuth, requirePolicy("admin.roles"), async (req, res) => {
    try {
      const { key, description, category } = req.body;

      if (!key) {
        return res.status(400).json({ message: "Policy key is required" });
      }

      const policy = await (prisma as any).policy.create({
        data: {
          key,
          description: description || null,
          category: category || null
        }
      });

      res.status(201).json(policy);
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ message: "Policy with this key already exists" });
      }
      console.error("Create policy error:", error);
      res.status(500).json({ message: "Failed to create policy" });
    }
  });

  // ==================== USER ROLE ASSIGNMENT API ====================

  // POST /api/users/assign-role - Assign role to user
  app.post("/api/users/assign-role", requireAuth, requirePolicy("users.assign_role"), async (req, res) => {
    try {
      const { userId, roleId, policyIds } = req.body;

      if (!userId || !roleId) {
        return res.status(400).json({ message: "User ID and Role ID are required" });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if role exists
      const role = await (prisma as any).role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        return res.status(404).json({ message: "Role not found" });
      }

      // Check if already assigned
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

      // Assign role
      await (prisma as any).userRole.create({
        data: {
          userId,
          roleId,
        },
      });

      // Note: Custom policies per user can be added later if needed
      // For now, user gets role's default policies

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

  // POST /api/users/update-role-permissions - Update role's policies (affects all users with that role)
  app.post("/api/users/update-role-permissions", requireAuth, requirePolicy("users.assign_role"), async (req, res) => {
    try {
      const { userId, roleId, policyIds } = req.body;

      if (!userId || !roleId || !Array.isArray(policyIds)) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      // Check if user has this role
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

      // Update role policies (affects all users with this role)
      await prisma.$transaction(async (tx: any) => {
        // Delete existing role policies
        await tx.rolePolicy.deleteMany({
          where: { roleId },
        });

        // Add new policies
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

  // ==================== SETTINGS API ====================
  
  app.get("/api/settings", requireAuth, requireMDO, async (req, res) => {
    try {
      let settings = await prisma.userSettings.findUnique({
        where: { userId: req.user!.id },
      });

      if (!settings) {
        settings = await prisma.userSettings.create({
          data: { userId: req.user!.id },
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("Settings error:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", requireAuth, requireMDO, async (req, res) => {
    try {
      const { theme, emailNotifications, smsNotifications, loginMethod, timezone, language } = req.body;

      const settings = await prisma.userSettings.upsert({
        where: { userId: req.user!.id },
        update: { 
          theme, 
          emailNotifications, 
          smsNotifications, 
          loginMethod, 
          timezone, 
          language 
        },
        create: { 
          userId: req.user!.id, 
          theme, 
          emailNotifications, 
          smsNotifications, 
          loginMethod, 
          timezone, 
          language 
        },
      });

      res.json(settings);
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.put("/api/settings/profile", requireAuth, requireMDO, async (req, res) => {
    try {
      const { name, phone } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { name, phone },
      });

      res.json({ success: true, user });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put("/api/settings/password", requireAuth, requireMDO, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentHash = hashPassword(currentPassword);
      if (currentHash !== user.passwordHash) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash: hashPassword(newPassword) },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ==================== MANAGER ASSIGNMENT API ====================
  
  // GET employee by card number
  app.get("/api/employees/by-card/:cardNumber", requireAuth, requireMDO, async (req, res) => {
    try {
      const { cardNumber } = req.params;
      
      if (!cardNumber || cardNumber.trim() === "") {
        return res.status(400).json({ 
          success: false, 
          message: "Card number is required" 
        });
      }

      const searchCardNumber = cardNumber.trim();
      const normalizedSearch = normalizeCardNumber(searchCardNumber);
      
      console.log(`[Manager Assign] Searching for card number: "${searchCardNumber}", normalized: "${normalizedSearch}"`);
      
      // Use the same pattern as employee-lookup endpoint for consistency
      // Try multiple search strategies for better matching
      const searchConditions: any[] = [
        // Strategy 1: Exact match (as string)
        { cardNumber: searchCardNumber },
        // Strategy 2: As string conversion (handles number inputs)
        { cardNumber: searchCardNumber.toString() },
        // Strategy 3: Try as employee code
        { employeeCode: searchCardNumber },
        { employeeCode: normalizedSearch },
      ];
      
      // Strategy 4: Normalized match (removes leading zeros) - only if different
      if (normalizedSearch !== searchCardNumber) {
        searchConditions.push({ cardNumber: normalizedSearch });
      }
      
      let employee = await prisma.employee.findFirst({
        where: {
          OR: searchConditions,
        },
        include: {
          designation: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          orgUnit: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
      
      if (employee) {
        console.log(`[Manager Assign] Found employee: ${employee.firstName} ${employee.lastName} (Card: ${employee.cardNumber}, Code: ${employee.employeeCode})`);
      }

      if (!employee) {
        // Debug: Check if any employees exist and show sample card numbers
        const sampleEmployees = await prisma.employee.findMany({
          take: 10,
          select: {
            cardNumber: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            status: true,
          },
          where: {
            cardNumber: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        const totalEmployees = await prisma.employee.count({
          where: { cardNumber: { not: null } },
        });
        
        console.log(`[Manager Assign] Employee not found. Total employees with card numbers: ${totalEmployees}`);
        console.log(`[Manager Assign] Sample card numbers in DB:`, 
          sampleEmployees.map(e => ({ 
            card: e.cardNumber, 
            code: e.employeeCode, 
            name: `${e.firstName} ${e.lastName}`,
            status: e.status 
          }))
        );
        
        return res.status(404).json({ 
          success: false, 
          message: `Employee not found with card number "${searchCardNumber}". Please verify the card number or check if the employee exists in the system.`,
          debug: process.env.NODE_ENV === 'development' ? {
            searched: searchCardNumber,
            normalized: normalizedSearch,
            totalEmployeesWithCardNumbers: totalEmployees,
            sampleCardNumbers: sampleEmployees
              .map(e => e.cardNumber)
              .filter(Boolean)
              .slice(0, 5),
          } : undefined,
        });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(400).json({ 
          success: false, 
          message: "Employee is not active. Only active employees can be assigned as managers." 
        });
      }

      res.json({
        success: true,
        data: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          cardNumber: employee.cardNumber,
          designation: employee.designation,
          orgUnit: employee.orgUnit,
          department: employee.department,
          status: employee.status,
        },
      });
    } catch (error) {
      console.error("Error fetching employee by card number:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch employee details" 
      });
    }
  });

  // POST assign manager
  app.post("/api/manager/assign", requireAuth, requireMDO, async (req, res) => {
    try {
      const { cardNumber, orgUnitId, departmentIds } = req.body;

      // Validation
      if (!cardNumber || cardNumber.trim() === "") {
        return res.status(400).json({ 
          success: false, 
          message: "Card number is required" 
        });
      }

      if (!orgUnitId) {
        return res.status(400).json({ 
          success: false, 
          message: "Unit selection is required" 
        });
      }

      if (!departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "At least one department must be selected" 
        });
      }

      // Fetch employee using the same search logic as GET endpoint
      const searchCardNumber = cardNumber.trim();
      const normalizedSearch = normalizeCardNumber(searchCardNumber);
      
      const searchConditions: any[] = [
        { cardNumber: searchCardNumber },
        { cardNumber: searchCardNumber.toString() },
        { employeeCode: searchCardNumber },
        { employeeCode: normalizedSearch },
      ];
      
      if (normalizedSearch !== searchCardNumber) {
        searchConditions.push({ cardNumber: normalizedSearch });
      }
      
      const employee = await prisma.employee.findFirst({
        where: {
          OR: searchConditions,
        },
        include: {
          designation: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!employee) {
        return res.status(404).json({ 
          success: false, 
          message: `Employee not found with card number "${searchCardNumber}"` 
        });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(400).json({ 
          success: false, 
          message: "Only active employees can be assigned as managers" 
        });
      }

      // Validate unit exists
      const orgUnit = await prisma.orgUnit.findUnique({
        where: { id: orgUnitId },
      });

      if (!orgUnit) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid unit selected" 
        });
      }

      // Validate departments exist
      const departments = await prisma.department.findMany({
        where: { id: { in: departmentIds } },
      });

      if (departments.length !== departmentIds.length) {
        return res.status(400).json({ 
          success: false, 
          message: "One or more selected departments are invalid" 
        });
      }

      // Check for existing active assignments (prevent duplicates)
      // Check each department individually for existing assignments
      const existingChecks = await Promise.all(
        departmentIds.map(async (deptId: string) => {
          const existing = await prisma.$queryRaw<Array<{ mid: string }>>`
            SELECT "mid" FROM "emp_manager" 
            WHERE "mcardno" = ${employee.cardNumber}
              AND "morgUnitId" = ${orgUnitId}
              AND "mdepartmentId" = ${deptId}
              AND "mis_extinct" = false
            LIMIT 1
          `;
          return { deptId, exists: existing.length > 0 };
        })
      );

      const existingAssignments = existingChecks.filter(check => check.exists);
      if (existingAssignments.length > 0) {
        const existingDeptNames = departments
          .filter(d => existingAssignments.some(e => e.deptId === d.id))
          .map(d => d.name);
        
        return res.status(409).json({ 
          success: false, 
          message: `Manager assignment already exists for department(s): ${existingDeptNames.join(", ")}` 
        });
      }

      // Create manager assignments (one record per department)
      const assignments: string[] = [];
      for (const deptId of departmentIds) {
        const mid = `${employee.cardNumber}_${orgUnitId}_${deptId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await prisma.$executeRaw`
          INSERT INTO "emp_manager" ("mid", "mcardno", "morgUnitId", "mdepartmentId", "mdesignationId", "mis_extinct")
          VALUES (${mid}, ${employee.cardNumber}, ${orgUnitId}, ${deptId}, ${employee.designationId || null}, false)
        `;

        assignments.push(mid);
      }

      res.json({
        success: true,
        message: `Manager assigned successfully to ${departments.length} department(s)`,
        data: {
          managerCardNumber: employee.cardNumber,
          managerName: `${employee.firstName} ${employee.lastName || ""}`.trim(),
          orgUnit: orgUnit.name,
          departments: departments.map(d => d.name),
          assignmentIds: assignments,
        },
      });
    } catch (error: any) {
      console.error("Error assigning manager:", error);
      
      // Handle duplicate key constraint
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        return res.status(409).json({ 
          success: false, 
          message: "Manager assignment already exists" 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to assign manager" 
      });
    }
  });

  // ==================== OTP API ====================

  function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      await prisma.otpCode.updateMany({
        where: { phone: cleanPhone, used: false },
        data: { used: true },
      });

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await prisma.otpCode.create({
        data: {
          phone: cleanPhone,
          code: otp,
          type: "login",
          expiresAt,
        },
      });

      console.log(`[OTP] Generated OTP for ${cleanPhone}: ${otp}`);
      
      const smsResult = await sendOtpSms(cleanPhone, otp);
      
      if (smsResult.success) {
        console.log(`[OTP] SMS sent successfully to ${cleanPhone}`);
        const maskedPhone = cleanPhone.slice(0, 4) + "****" + cleanPhone.slice(-2);
        res.json({ 
          success: true, 
          message: `OTP sent to ${maskedPhone}`,
          smsSent: true,
        });
      } else {
        console.error(`[OTP] Failed to send SMS: ${smsResult.error}`);
        res.json({ 
          success: true, 
          message: "OTP generated but SMS delivery failed. Please contact admin.",
          smsSent: false,
          debug: process.env.NODE_ENV === "development" ? otp : undefined,
        });
      }
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required" });
      }

      let cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }
      const searchPhone = cleanPhone.slice(-10);

      const otpRecord = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          code: otp,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { phone: { contains: searchPhone } },
            { secondaryPhone: { contains: searchPhone } },
          ],
        },
        include: { user: true, orgUnit: true },
      });

      let user = employee?.user;
      
      if (!user) {
        user = await prisma.user.findFirst({
          where: { phone: { contains: searchPhone } },
        });
      }

      if (!user && employee) {
        try {
          // Role tables removed - no need to assign roles
          const fullName = [employee.firstName, employee.lastName].filter(n => n && n !== ".").join(" ");
          
          let email = employee.companyEmail || employee.personalEmail;
          if (!email) {
            email = `emp-${employee.id.slice(0, 8)}@goyalsons.local`;
          }
          
          const existingEmailUser = await prisma.user.findUnique({
            where: { email },
          });
          
          if (existingEmailUser) {
            email = `emp-${employee.id}@goyalsons.local`;
          }
          
          user = await prisma.user.create({
            data: {
              name: fullName,
              email: email,
              phone: employee.phone,
              passwordHash: "otp-only-user",
              employeeId: employee.id,
              orgUnitId: employee.orgUnitId,
              status: "active",
            },
          });

          console.log(`[OTP] Auto-created User account for employee: ${fullName} (${employee.cardNumber})`);
        } catch (createError: any) {
          console.error(`[OTP] Failed to auto-create user for employee ${employee.id}:`, createError.message);
          return res.status(500).json({ message: "Failed to create account. Please contact admin." });
        }
      }

      if (!user) {
        return res.status(404).json({ message: "No employee found with this phone number. Please contact admin." });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
        },
      });

      const authInfo = await getUserAuthInfo(user.id);

      res.json({
        token: session.id,
        user: authInfo,
      });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // ==================== EMPLOYEE OTP LOGIN ====================

  // Helper function to mask phone number
  function maskPhone(phone: string): string {
    if (!phone) return "";
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length >= 10) {
      const last10 = cleanPhone.slice(-10);
      return `+91-******${last10.slice(-4)}`;
    }
    return `******${cleanPhone.slice(-4)}`;
  }

  // Lookup employee by code (card number) - Only active employees can login
  app.post("/api/auth/employee-lookup", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      // Retry logic for database connection issues
      let employee = null;
      const maxRetries = 3;
      let lastError: any = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Ensure database connection is alive before query
          try {
            await prisma.$queryRaw`SELECT 1`;
          } catch (connectionError: any) {
            console.warn(`[Employee Lookup] Connection check failed (attempt ${attempt}), attempting reconnect...`, connectionError.message);
            // Prisma will automatically reconnect on next query, but we can force it
            try {
              await prisma.$disconnect().catch(() => {});
            } catch (disconnectError) {
              // Ignore disconnect errors
            }
            // Wait a moment before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Test connection again
            await prisma.$queryRaw`SELECT 1`;
          }

          employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });
          break; // Success, exit retry loop
        } catch (error: any) {
          lastError = error;
          if (error.code === 'P1017' && attempt < maxRetries) {
            // Database connection closed, wait and retry
            console.warn(`[Employee Lookup] Database connection error (attempt ${attempt}/${maxRetries}), retrying...`, error.message);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          throw error; // Re-throw if not connection error or max retries reached
        }
      }

      if (!employee && lastError) {
        throw lastError;
      }

      if (!employee) {
        return res.status(404).json({ message: "Employee not found. Please check your employee code." });
      }

      // Only active employees can login - Check if lastInterviewDate is null
      // If lastInterviewDate is null → Employee is ACTIVE → Can login
      // If lastInterviewDate has a date → Employee is INACTIVE → Cannot login
      if (employee.lastInterviewDate !== null) {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered. Please contact admin." });
      }

      res.json({
        success: true,
        maskedPhone: maskPhone(employee.phone),
      });
    } catch (error) {
      console.error("Employee lookup error:", error);
      res.status(500).json({ message: "Failed to lookup employee" });
    }
  });

  // Send OTP to employee's registered phone
  app.post("/api/auth/send-employee-otp", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Only active employees can login - Check if lastInterviewDate is null
      // If lastInterviewDate is null → Employee is ACTIVE → Can login
      // If lastInterviewDate has a date → Employee is INACTIVE → Cannot login
      if (employee.lastInterviewDate !== null) {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      // Check if there's an existing valid OTP (valid for 5 minutes)
      const existingOtp = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingOtp) {
        const remainingSeconds = Math.floor((existingOtp.expiresAt.getTime() - Date.now()) / 1000);
        return res.json({
          success: true,
          existingOtp: true,
          remainingSeconds,
          message: `OTP already sent. Expires in ${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`,
        });
      }

      // Generate new OTP
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes total validity

      await prisma.otpCode.create({
        data: {
          phone: cleanPhone,
          code: otp,
          type: "employee_login",
          expiresAt,
        },
      });

      console.log(`[Employee OTP] Generated OTP for ${employee.cardNumber} (${cleanPhone}): ${otp}`);
      
      const smsResult = await sendOtpSms(cleanPhone, otp);
      
      if (smsResult.success) {
        console.log(`[Employee OTP] SMS sent successfully to ${cleanPhone}`);
        res.json({ 
          success: true, 
          message: `OTP sent to ${maskPhone(employee.phone)}`,
          smsSent: true,
        });
      } else {
        console.error(`[Employee OTP] Failed to send SMS: ${smsResult.error}`);
        res.json({ 
          success: true, 
          message: "OTP generated but SMS delivery failed. Please contact admin.",
          smsSent: false,
          debug: process.env.NODE_ENV === "development" ? otp : undefined,
        });
      }
    } catch (error) {
      console.error("Send employee OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  // Resend OTP - sends the same OTP if it's still valid (within 5 minutes)
  app.post("/api/auth/resend-employee-otp", async (req, res) => {
    try {
      const { employeeCode } = req.body;

      if (!employeeCode) {
        return res.status(400).json({ message: "Employee code is required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Only active employees can login - Check if lastInterviewDate is null
      // If lastInterviewDate is null → Employee is ACTIVE → Can login
      // If lastInterviewDate has a date → Employee is INACTIVE → Cannot login
      if (employee.lastInterviewDate !== null) {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      // Check if there's an existing valid OTP (must be within 5 minutes)
      const existingOtp = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!existingOtp) {
        return res.status(400).json({ message: "No valid OTP found. Please request a new OTP." });
      }

      // Resend the same OTP
      const smsResult = await sendOtpSms(cleanPhone, existingOtp.code);
      
      if (smsResult.success) {
        console.log(`[Employee OTP] Resent OTP for ${employee.cardNumber} (${cleanPhone}): ${existingOtp.code}`);
        const remainingSeconds = Math.floor((existingOtp.expiresAt.getTime() - Date.now()) / 1000);
        res.json({ 
          success: true, 
          message: `OTP resent to ${maskPhone(employee.phone)}`,
          smsSent: true,
          remainingSeconds,
        });
      } else {
        console.error(`[Employee OTP] Failed to resend SMS: ${smsResult.error}`);
        res.json({ 
          success: false, 
          message: "Failed to resend OTP. Please try again.",
          smsSent: false,
        });
      }
    } catch (error) {
      console.error("Resend employee OTP error:", error);
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  // Verify employee OTP and login
  app.post("/api/auth/verify-employee-otp", async (req, res) => {
    try {
      const { employeeCode, otp } = req.body;

      if (!employeeCode || !otp) {
        return res.status(400).json({ message: "Employee code and OTP are required" });
      }

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
        include: { user: true, orgUnit: true },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      // Only active employees can login - Check if lastInterviewDate is null
      // If lastInterviewDate is null → Employee is ACTIVE → Can login
      // If lastInterviewDate has a date → Employee is INACTIVE → Cannot login
      if (employee.lastInterviewDate !== null) {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      const otpRecord = await prisma.otpCode.findFirst({
        where: {
          phone: cleanPhone,
          code: otp,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!otpRecord) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      await prisma.otpCode.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      let user = employee.user;

      if (!user) {
        try {
          // Role tables removed - no need to assign roles
          const fullName = [employee.firstName, employee.lastName].filter(n => n && n !== ".").join(" ");
          
          let email = employee.companyEmail || employee.personalEmail;
          if (!email) {
            email = `emp-${employee.cardNumber}@goyalsons.local`;
          }
          
          const existingEmailUser = await prisma.user.findUnique({
            where: { email },
          });
          
          if (existingEmailUser) {
            email = `emp-${employee.id}@goyalsons.local`;
          }
          
          user = await prisma.user.create({
            data: {
              name: fullName,
              email: email,
              phone: employee.phone,
              passwordHash: "otp-only-user",
              employeeId: employee.id,
              orgUnitId: employee.orgUnitId,
              status: "active",
            },
          });

          console.log(`[Employee OTP] Auto-created User account for employee: ${fullName} (${employee.cardNumber})`);
        } catch (createError: any) {
          console.error(`[Employee OTP] Failed to auto-create user for employee ${employee.id}:`, createError.message);
          return res.status(500).json({ message: "Failed to create account. Please contact admin." });
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          expiresAt,
          loginType: "employee",
          employeeCardNo: employee.cardNumber,
        },
      });

      const authInfo = await getUserAuthInfo(user.id);

      res.json({
        token: session.id,
        user: {
          ...authInfo,
          loginType: "employee",
          employeeCardNo: employee.cardNumber,
          employeeId: employee.id,
        },
      });
    } catch (error) {
      console.error("Verify employee OTP error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // ==================== ADMIN API ROUTING ====================

  app.get("/api/admin/routing", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const routes = await prisma.apiRouting.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json(routes);
    } catch (error) {
      console.error("Get routes error:", error);
      res.status(500).json({ message: "Failed to fetch routes" });
    }
  });

  app.post("/api/admin/upload", requireAuth, requirePolicy("admin.panel"), (req: any, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.message === "Only CSV, JSON, and Excel files are allowed") {
          return res.status(400).json({ message: err.message });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size exceeds 10MB limit" });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = `/uploads/${req.file.filename}`;
      res.json({ 
        success: true, 
        filePath,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    });
  });

  app.use("/uploads", requireAuth, express.static(uploadsDir));

  app.post("/api/admin/routing", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { name, description, endpoint, method, sourceType, csvFilePath, csvUrl, headers, syncEnabled, syncIntervalHours, syncIntervalMinutes } = req.body;

      const route = await prisma.apiRouting.create({
        data: {
          name,
          description,
          endpoint,
          method: method || "GET",
          sourceType: sourceType || "api",
          csvFilePath,
          csvUrl,
          headers,
          syncEnabled: syncEnabled ?? true,
          syncIntervalHours: syncIntervalHours ?? 0,
          syncIntervalMinutes: syncIntervalMinutes ?? 10,
        },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json(route);
    } catch (error: any) {
      console.error("Create route error:", error);
      if (error.code === 'P2002') {
        res.status(400).json({ message: "A data source with this name already exists. Please use a different name." });
      } else {
        res.status(500).json({ message: "Failed to create route" });
      }
    }
  });

  app.put("/api/admin/routing/:id", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, endpoint, method, sourceType, csvFilePath, csvUrl, headers, syncEnabled, syncIntervalHours, syncIntervalMinutes, isActive, status } = req.body;

      const route = await prisma.apiRouting.update({
        where: { id },
        data: {
          name,
          description,
          endpoint,
          method,
          sourceType,
          csvFilePath,
          csvUrl,
          headers,
          syncEnabled,
          syncIntervalHours,
          syncIntervalMinutes,
          isActive,
          status,
        },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json(route);
    } catch (error) {
      console.error("Update route error:", error);
      res.status(500).json({ message: "Failed to update route" });
    }
  });

  app.delete("/api/admin/routing/:id", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.apiRouting.delete({
        where: { id },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete route error:", error);
      res.status(500).json({ message: "Failed to delete route" });
    }
  });

  app.post("/api/admin/routing/:id/test", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      const route = await prisma.apiRouting.findUnique({
        where: { id },
      });

      if (!route) {
        return res.status(404).json({ success: false, message: "Route not found" });
      }

      const sourceUrl = route.sourceType === "api" ? route.endpoint : (route.csvUrl || route.csvFilePath);
      
      if (!sourceUrl) {
        await prisma.apiRouting.update({
          where: { id },
          data: { 
            lastTestAt: new Date(),
            lastTestStatus: "failed",
          },
        });
        return res.json({ success: false, message: "No source URL configured" });
      }

      try {
        // Check if this is a local file (uploaded CSV)
        if (sourceUrl.startsWith("/uploads/")) {
          const filePath = path.join(process.cwd(), sourceUrl);
          
          if (!fs.existsSync(filePath)) {
            await prisma.apiRouting.update({
              where: { id },
              data: { 
                lastTestAt: new Date(),
                lastTestStatus: "failed",
              },
            });
            return res.json({ success: false, message: "File not found on server" });
          }

          const fileContent = fs.readFileSync(filePath, "utf-8");
          const ext = path.extname(filePath).toLowerCase();
          let recordCount = 0;

          let sampleRecord: Record<string, any> | null = null;
          let fields: string[] = [];

          if (ext === ".csv") {
            const lines = fileContent.trim().split("\n");
            recordCount = Math.max(0, lines.length - 1);
            if (lines.length > 1) {
              const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
              const firstDataLine = lines[1].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
              fields = headers;
              sampleRecord = {};
              headers.forEach((h, i) => { sampleRecord![h] = firstDataLine[i] || ''; });
            }
          } else if (ext === ".json") {
            try {
              const data = JSON.parse(fileContent);
              const records = Array.isArray(data) ? data : [data];
              recordCount = records.length;
              if (records.length > 0) {
                sampleRecord = records[0];
                fields = sampleRecord ? Object.keys(sampleRecord) : [];
              }
            } catch {
              await prisma.apiRouting.update({
                where: { id },
                data: { 
                  lastTestAt: new Date(),
                  lastTestStatus: "failed",
                },
              });
              return res.json({ success: false, message: "Invalid JSON format" });
            }
          } else if (ext === ".xlsx" || ext === ".xls") {
            recordCount = 1;
          }

          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "success",
              status: "tested",
            },
          });

          return res.json({ 
            success: true, 
            message: `File accessible. Found ${recordCount} ${ext === ".csv" ? "data rows" : "records"}.`,
            recordCount,
            sampleRecord,
            fields,
          });
        }

        // For remote URLs, fetch the data
        const headers: Record<string, string> = {};
        if (route.sourceType === "api") {
          headers["Accept"] = "application/json";
        }
        if (route.headers && typeof route.headers === "object") {
          Object.assign(headers, route.headers);
        }

        const response = await fetch(sourceUrl, {
          method: route.method || "GET",
          headers,
        });

        if (response.ok) {
          const responseText = await response.text();
          let records: any[] = [];
          let sampleRecord: Record<string, any> | null = null;
          let fields: string[] = [];

          // Check if this is CSV data (for csv source type or if response looks like CSV)
          const looksLikeCsv = route.sourceType === "csv" || 
            (responseText.trim().split('\n')[0]?.includes(',') && !responseText.trim().startsWith('{') && !responseText.trim().startsWith('['));

          if (looksLikeCsv) {
            // Parse CSV response
            const lines = responseText.trim().split("\n");
            const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
            fields = csvHeaders;
            
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
              const record: Record<string, any> = {};
              csvHeaders.forEach((header, idx) => {
                record[header] = values[idx] || '';
              });
              records.push(record);
            }
            
            sampleRecord = records.length > 0 ? records[0] : null;
          } else {
            // Parse as JSON
            try {
              const data = JSON.parse(responseText);
              records = Array.isArray(data) 
                ? data 
                : (data.master_for_google || data.data || data.records || []);
              sampleRecord = Array.isArray(records) && records.length > 0 ? records[0] : null;
              fields = sampleRecord ? Object.keys(sampleRecord) : [];
            } catch (jsonError) {
              await prisma.apiRouting.update({
                where: { id },
                data: { 
                  lastTestAt: new Date(),
                  lastTestStatus: "failed",
                },
              });
              return res.json({ 
                success: false, 
                message: `Failed to parse response: Invalid format (not valid JSON or CSV)` 
              });
            }
          }

          const recordCount = records.length;
          
          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "success",
              status: "tested",
            },
          });

          res.json({ 
            success: true, 
            message: `Connection successful. Found ${recordCount} records.`,
            recordCount,
            sampleRecord,
            fields,
          });
        } else {
          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "failed",
            },
          });
          res.json({ 
            success: false, 
            message: `HTTP ${response.status}: ${response.statusText}` 
          });
        }
      } catch (fetchError: any) {
        await prisma.apiRouting.update({
          where: { id },
          data: { 
            lastTestAt: new Date(),
            lastTestStatus: "failed",
          },
        });
        res.json({ 
          success: false, 
          message: `Connection failed: ${fetchError.message}` 
        });
      }
    } catch (error) {
      console.error("Test route error:", error);
      res.status(500).json({ success: false, message: "Failed to test route" });
    }
  });

  app.post("/api/admin/routing/:id/sync", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      const route = await prisma.apiRouting.findUnique({
        where: { id },
      });

      if (!route) {
        return res.status(404).json({ message: "Route not found" });
      }

      await prisma.apiRouting.update({
        where: { id },
        data: { 
          lastSyncAt: new Date(),
          lastSyncStatus: "in_progress",
        },
      });

      setImmediate(() => {
        triggerManualSync(id).catch((err) => {
          console.error(`[Sync] Background sync failed for ${route.name}:`, err);
        });
      });

      res.status(202).json({ 
        success: true, 
        message: `Sync started for ${route.name}. It will continue running in the background.` 
      });
    } catch (error) {
      console.error("Sync route error:", error);
      res.status(500).json({ message: "Failed to start sync" });
    }
  });

  // ==================== SYSTEM SETTINGS API ====================

  app.get("/api/admin/system-settings", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const settings = await prisma.systemSettings.findMany({
        orderBy: { category: "asc" },
      });
      res.json(settings);
    } catch (error) {
      console.error("Get system settings error:", error);
      res.status(500).json({ message: "Failed to fetch system settings" });
    }
  });

  app.get("/api/admin/system-settings/:key", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const setting = await prisma.systemSettings.findUnique({
        where: { key: req.params.key },
      });
      res.json(setting);
    } catch (error) {
      console.error("Get system setting error:", error);
      res.status(500).json({ message: "Failed to fetch system setting" });
    }
  });

  app.put("/api/admin/system-settings/:key", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { key } = req.params;
      const { value, description, category } = req.body;

      const setting = await prisma.systemSettings.upsert({
        where: { key },
        update: { value, description, category },
        create: { key, value, description, category: category || "general" },
      });

      res.json(setting);
    } catch (error) {
      console.error("Update system setting error:", error);
      res.status(500).json({ message: "Failed to update system setting" });
    }
  });

  // ==================== DATA FETCHER API ====================

  app.get("/api/admin/data-fetcher/logs", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const logs = await prisma.dataImportLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 50,
      });
      res.json(logs);
    } catch (error) {
      console.error("Get import logs error:", error);
      res.status(500).json({ message: "Failed to fetch import logs" });
    }
  });

  app.delete("/api/admin/data-fetcher/logs", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      await prisma.dataImportLog.deleteMany({});
      res.json({ success: true, message: "Sync history cleared" });
    } catch (error) {
      console.error("Clear logs error:", error);
      res.status(500).json({ message: "Failed to clear sync history" });
    }
  });

  app.post("/api/admin/data-fetcher/sync-employees", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const masterUrlSetting = await prisma.systemSettings.findUnique({
        where: { key: "EMPLOYEE_MASTER_URL" },
      });

      if (!masterUrlSetting || !masterUrlSetting.value) {
        return res.status(400).json({ 
          message: "Employee Master URL not configured. Please set it in System Settings." 
        });
      }

      const importLog = await prisma.dataImportLog.create({
        data: {
          sourceName: "Employee Master",
          sourceUrl: masterUrlSetting.value,
          status: "in_progress",
        },
      });

      try {
        console.log(`[Data Fetcher] Starting fetch from: ${masterUrlSetting.value}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        
        const response = await fetch(masterUrlSetting.value, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log("[Data Fetcher] Fetch successful, parsing JSON...");
        const data = await response.json();
        console.log("[Data Fetcher] JSON parsed successfully");
        
        const employees = Array.isArray(data) 
          ? data 
          : (data.master_for_google || data.data || data.records || [data]);
        
        console.log(`[Data Fetcher] Found ${employees.length} employees to import`);
        
        let imported = 0;
        let failed = 0;

        for (const emp of employees) {
          try {
            // Skip if CARD_NO is missing or invalid
            if (!emp["CARD_NO"] || emp["CARD_NO"].toString().trim() === "") {
              console.warn(`[Data Fetcher] Skipping employee with missing CARD_NO:`, emp["Name"] || "Unknown");
              failed++;
              continue;
            }
            
            let departmentId = null;
            if (emp["DEPARTMENT.DEPT_CODE"]) {
              const deptCode = emp["DEPARTMENT.DEPT_CODE"];
              const dept = await prisma.department.upsert({
                where: { code: deptCode },
                update: { name: getDepartmentName(deptCode) },
                create: { 
                  code: deptCode, 
                  name: getDepartmentName(deptCode)
                },
              });
              departmentId = dept.id;
            }

            let designationId = null;
            if (emp["DESIGNATION.DESIGN_CODE"]) {
              const desigCode = emp["DESIGNATION.DESIGN_CODE"];
              const desig = await prisma.designation.upsert({
                where: { code: desigCode },
                update: { name: getDesignationName(desigCode) },
                create: { 
                  code: desigCode, 
                  name: getDesignationName(desigCode)
                },
              });
              designationId = desig.id;
            }

            let timePolicyId = null;
            if (emp["TIMEPOLICY.POLICY_NAME"]) {
              const policy = await prisma.timePolicy.upsert({
                where: { code: emp["TIMEPOLICY.POLICY_NAME"] },
                update: { 
                  isSinglePunch: emp["TIMEPOLICY.IS_SINGLE_PUNCH"] === "true" 
                },
                create: { 
                  code: emp["TIMEPOLICY.POLICY_NAME"],
                  name: emp["TIMEPOLICY.POLICY_NAME"],
                  isSinglePunch: emp["TIMEPOLICY.IS_SINGLE_PUNCH"] === "true"
                },
              });
              timePolicyId = policy.id;
            }

            let orgUnitId = null;
            if (emp["UNIT.BRANCH_CODE"]) {
              const orgUnit = await prisma.orgUnit.upsert({
                where: { code: emp["UNIT.BRANCH_CODE"] },
                update: {},
                create: { 
                  code: emp["UNIT.BRANCH_CODE"],
                  name: emp["UNIT.BRANCH_CODE"],
                  level: 2,
                },
              });
              orgUnitId = orgUnit.id;
            }

            const nameParts = (emp["Name"] || "").trim().split(" ");
            const firstName = nameParts[0] || "Unknown";
            const lastName = nameParts.slice(1).join(" ") || null;

            let interviewDate = null;
            if (emp["Date_of_Interview"]) {
              try {
                const parts = emp["Date_of_Interview"].split("-");
                if (parts.length === 3) {
                  const months: { [key: string]: string } = {
                    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
                  };
                  const day = parts[0].padStart(2, "0");
                  const month = months[parts[1]] || "01";
                  const year = parts[2];
                  interviewDate = new Date(`${year}-${month}-${day}`);
                }
              } catch (e) {
                console.error("Date parse error:", e);
              }
            }

            let lastInterviewDate = null;
            if (emp["Last_INTERVIEW_DATE"] && emp["Last_INTERVIEW_DATE"].trim() !== "") {
              try {
                const parts = emp["Last_INTERVIEW_DATE"].split("-");
                if (parts.length === 3) {
                  const months: { [key: string]: string } = {
                    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                    "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                    "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
                  };
                  const day = parts[0].padStart(2, "0");
                  const month = months[parts[1]] || "01";
                  const year = parts[2];
                  lastInterviewDate = new Date(`${year}-${month}-${day}`);
                }
              } catch (e) {
                console.error("Last interview date parse error:", e);
              }
            }

            await prisma.employee.upsert({
              where: { cardNumber: emp["CARD_NO"] },
              update: {
                firstName,
                lastName,
                phone: emp["Phone_NO_1"] || null,
                secondaryPhone: emp["PHONE_NO_2"] || null,
                personalEmail: emp["PERSONAL_Email"] || null,
                companyEmail: emp["COMPANY_EMAIL"] || null,
                gender: emp["GENDER"] || null,
                aadhaar: emp["ADHAR_CARD"] || null,
                profileImageUrl: emp["person_img_cdn_url"] || null,
                personelImage: emp["personel_image"] || null,
                status: emp["STATUS"] || "ACTIVE",
                weeklyOff: emp["WEEKLY_OFF"] || null,
                weeklyOffCalculation: emp["weekly_off_calculation"] || null,
                shiftStart: emp["INTIME"] || null,
                shiftEnd: emp["OUTTIME"] || null,
                interviewDate,
                lastInterviewDate,
                externalId: emp["ID"] || null,
                autoNumber: emp["Auto_Number"] || null,
                zohoId: emp["zohobooksid"] || null,
                mobileOtp: emp["Mobile_Otp"] || null,
                departmentId,
                designationId,
                timePolicyId,
                orgUnitId,
                metadata: {
                  // Store all original fields with exact field names as they come from API
                  "CARD_NO": emp["CARD_NO"],
                  "TIMEPOLICY.IS_SINGLE_PUNCH": emp["TIMEPOLICY.IS_SINGLE_PUNCH"],
                  "Phone_NO_1": emp["Phone_NO_1"],
                  "weekly_off_calculation": emp["weekly_off_calculation"],
                  "Name": emp["Name"],
                  "Date_of_Interview": emp["Date_of_Interview"],
                  "STATUS": emp["STATUS"],
                  "DESIGNATION.DESIGN_NAME": emp["DESIGNATION.DESIGN_NAME"],
                  "zohobooksid": emp["zohobooksid"],
                  "GENDER": emp["GENDER"],
                  "ID": emp["ID"],
                  "ADHAR_CARD": emp["ADHAR_CARD"],
                  "WEEKLY_OFF": emp["WEEKLY_OFF"],
                  "UNIT.BRANCH_CODE": emp["UNIT.BRANCH_CODE"],
                  "person_img_cdn_url": emp["person_img_cdn_url"],
                  "OUTTIME": emp["OUTTIME"],
                  "Mobile_Otp": emp["Mobile_Otp"],
                  "Last_INTERVIEW_DATE": emp["Last_INTERVIEW_DATE"],
                  "Auto_Number": emp["Auto_Number"],
                  "TIMEPOLICY.POLICY_NAME": emp["TIMEPOLICY.POLICY_NAME"],
                  "PERSONAL_Email": emp["PERSONAL_Email"],
                  "DEPARTMENT.DEPT_CODE": emp["DEPARTMENT.DEPT_CODE"],
                  "DEPARTMENT.DEPARTMENT": emp["DEPARTMENT.DEPARTMENT"],
                  "PHONE_NO_2": emp["PHONE_NO_2"],
                  "DESIGNATION.DESIGN_CODE": emp["DESIGNATION.DESIGN_CODE"],
                  "INTIME": emp["INTIME"],
                  "COMPANY_EMAIL": emp["COMPANY_EMAIL"],
                  "personel_image": emp["personel_image"],
                },
              },
              create: {
                cardNumber: emp["CARD_NO"],
                firstName,
                lastName,
                phone: emp["Phone_NO_1"] || null,
                secondaryPhone: emp["PHONE_NO_2"] || null,
                personalEmail: emp["PERSONAL_Email"] || null,
                companyEmail: emp["COMPANY_EMAIL"] || null,
                gender: emp["GENDER"] || null,
                aadhaar: emp["ADHAR_CARD"] || null,
                profileImageUrl: emp["person_img_cdn_url"] || null,
                personelImage: emp["personel_image"] || null,
                status: emp["STATUS"] || "ACTIVE",
                weeklyOff: emp["WEEKLY_OFF"] || null,
                weeklyOffCalculation: emp["weekly_off_calculation"] || null,
                shiftStart: emp["INTIME"] || null,
                shiftEnd: emp["OUTTIME"] || null,
                interviewDate,
                lastInterviewDate,
                externalId: emp["ID"] || null,
                autoNumber: emp["Auto_Number"] || null,
                zohoId: emp["zohobooksid"] || null,
                mobileOtp: emp["Mobile_Otp"] || null,
                departmentId,
                designationId,
                timePolicyId,
                orgUnitId,
                metadata: {
                  // Store all original fields with exact field names as they come from API
                  "CARD_NO": emp["CARD_NO"],
                  "TIMEPOLICY.IS_SINGLE_PUNCH": emp["TIMEPOLICY.IS_SINGLE_PUNCH"],
                  "Phone_NO_1": emp["Phone_NO_1"],
                  "weekly_off_calculation": emp["weekly_off_calculation"],
                  "Name": emp["Name"],
                  "Date_of_Interview": emp["Date_of_Interview"],
                  "STATUS": emp["STATUS"],
                  "DESIGNATION.DESIGN_NAME": emp["DESIGNATION.DESIGN_NAME"],
                  "zohobooksid": emp["zohobooksid"],
                  "GENDER": emp["GENDER"],
                  "ID": emp["ID"],
                  "ADHAR_CARD": emp["ADHAR_CARD"],
                  "WEEKLY_OFF": emp["WEEKLY_OFF"],
                  "UNIT.BRANCH_CODE": emp["UNIT.BRANCH_CODE"],
                  "person_img_cdn_url": emp["person_img_cdn_url"],
                  "OUTTIME": emp["OUTTIME"],
                  "Mobile_Otp": emp["Mobile_Otp"],
                  "Last_INTERVIEW_DATE": emp["Last_INTERVIEW_DATE"],
                  "Auto_Number": emp["Auto_Number"],
                  "TIMEPOLICY.POLICY_NAME": emp["TIMEPOLICY.POLICY_NAME"],
                  "PERSONAL_Email": emp["PERSONAL_Email"],
                  "DEPARTMENT.DEPT_CODE": emp["DEPARTMENT.DEPT_CODE"],
                  "DEPARTMENT.DEPARTMENT": emp["DEPARTMENT.DEPARTMENT"],
                  "PHONE_NO_2": emp["PHONE_NO_2"],
                  "DESIGNATION.DESIGN_CODE": emp["DESIGNATION.DESIGN_CODE"],
                  "INTIME": emp["INTIME"],
                  "COMPANY_EMAIL": emp["COMPANY_EMAIL"],
                  "personel_image": emp["personel_image"],
                },
              },
            });

            imported++;
            if (imported % 50 === 0) {
              console.log(`[Data Fetcher] Progress: ${imported}/${employees.length} employees imported`);
            }
          } catch (empError: any) {
            console.error(`[Data Fetcher] Failed to import employee ${emp["CARD_NO"]}:`, empError.message);
            failed++;
          }
        }

        console.log(`[Data Fetcher] Import complete: ${imported} imported, ${failed} failed`);

        await prisma.dataImportLog.update({
          where: { id: importLog.id },
          data: {
            status: failed > 0 ? "partial" : "completed",
            recordsTotal: employees.length,
            recordsImported: imported,
            recordsFailed: failed,
            completedAt: new Date(),
          },
        });

        res.json({
          success: true,
          message: `Import completed: ${imported} imported, ${failed} failed`,
          total: employees.length,
          imported,
          failed,
        });
      } catch (fetchError: any) {
        const errorMessage = fetchError.name === 'AbortError' 
          ? 'Request timed out after 60 seconds. The data source may be slow or unreachable.'
          : fetchError.message;
        
        console.error(`[Data Fetcher] Error: ${errorMessage}`);
        
        await prisma.dataImportLog.update({
          where: { id: importLog.id },
          data: {
            status: "failed",
            errorMessage: errorMessage,
            completedAt: new Date(),
          },
        });

        res.status(500).json({ 
          message: `Failed to fetch data: ${errorMessage}` 
        });
      }
    } catch (error) {
      console.error("Sync employees error:", error);
      res.status(500).json({ message: "Failed to sync employees" });
    }
  });

  app.post("/api/admin/data-fetcher/test-url", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ 
          success: false,
          message: `HTTP Error ${response.status}: ${response.statusText}` 
        });
      }

      const data = await response.json();
      const records = Array.isArray(data) 
        ? data 
        : (data.master_for_google || data.data || data.records || []);

      res.json({ 
        success: true,
        message: `Connection successful! Found ${records.length} employee records.`,
        recordCount: records.length
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        message: `Connection failed: ${error.message}` 
      });
    }
  });

  app.post("/api/admin/test-api-preview", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ success: false, message: "URL is required" });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return res.json({ 
            success: false,
            message: `HTTP Error ${response.status}: ${response.statusText}` 
          });
        }

        const data = await response.json();
        const records = Array.isArray(data) 
          ? data 
          : (data.master_for_google || data.data || data.records || []);

        if (!Array.isArray(records) || records.length === 0) {
          return res.json({ 
            success: false,
            message: "No records found in the API response" 
          });
        }

        const sampleRecord = records[0];
        const fields = Object.keys(sampleRecord);

        res.json({ 
          success: true,
          totalRecords: records.length,
          sampleRecord: sampleRecord,
          fields: fields,
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return res.json({ 
            success: false,
            message: "Request timed out after 30 seconds" 
          });
        }
        throw fetchError;
      }
    } catch (error: any) {
      res.json({ 
        success: false,
        message: `Connection failed: ${error.message}` 
      });
    }
  });

  // ==================== SALES API ====================
  // 
  // ⚠️ IMPORTANT: This section has been MOVED to server/routes/sales.routes.ts
  // 
  // The code below is commented out to avoid duplication.
  // If you need to modify sales API endpoints, edit server/routes/sales.routes.ts instead.
  //
  /*
  // In-memory cache for sales data (5 minute TTL)
  let salesCache: { data: any[]; timestamp: number; summary: any } | null = null;
  const SALES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Sales API Configuration from Environment Variables
  const SALES_API_TIMEOUT_MS = parseInt(process.env.SALES_API_TIMEOUT_MS || "60000", 10);
  const SALES_API_HOST = process.env.SALES_API_HOST || 'VENDOR.GOYALSONS.COM';
  const SALES_API_PORT = parseInt(process.env.SALES_API_PORT || "99", 10);
  const SALES_API_PATH = process.env.SALES_API_PATH || '/gsweb_v3/webform2.aspx';
  const SALES_API_KEY = process.env.SALES_API_KEY || 'ank2024';
  const SALES_API_SQL_QUERY = process.env.SALES_API_SQL_QUERY;

  async function fetchSalesDataFromAPI(): Promise<any[]> {
    if (!SALES_API_SQL_QUERY) {
      throw new Error('SALES_API_SQL_QUERY environment variable is required. Please set it in your .env file.');
    }

    const salesApiToken = process.env.SALES_API_TOKEN;
    
    const sqlQuery = SALES_API_SQL_QUERY;
    const encodedSql = encodeURIComponent(sqlQuery);
    const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;
    
    const options = {
      method: 'GET' as const,
      hostname: SALES_API_HOST,
      port: SALES_API_PORT,
      path: apiPath,
      headers: {
        'Authorization': `Bearer ${salesApiToken || ''}`,
        'User-Agent': process.env.SALES_API_USER_AGENT || 'PostmanRuntime/7.43.4',
        'Accept': '*'+'/'+'*',
      },
      rejectUnauthorized: process.env.SALES_API_REJECT_UNAUTHORIZED === 'true',
      maxRedirects: parseInt(process.env.SALES_API_MAX_REDIRECTS || "20", 10)
    };

    const responseText = await new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${SALES_API_TIMEOUT_MS / 1000} seconds`));
      }, SALES_API_TIMEOUT_MS);

      const request = https.https.request(options, (response: any) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          clearTimeout(timeoutId);
          const body = Buffer.concat(chunks).toString();
          if (response.statusCode !== 200) {
            reject(new Error(`API returned status ${response.statusCode}`));
            return;
          }
          resolve(body);
        });
        response.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
      request.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      request.end();
    });

    let records: any[] = [];
    const looksLikeCsv = !responseText.trim().startsWith('{') && 
                        !responseText.trim().startsWith('[') && 
                        responseText.trim().split('\n')[0]?.includes(',');

    if (looksLikeCsv) {
      const lines = responseText.trim().split("\n");
      const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
        const record: Record<string, any> = {};
        csvHeaders.forEach((header, idx) => {
          record[header] = values[idx] || '';
        });
        records.push(record);
      }
    } else {
      const data = JSON.parse(responseText);
      records = Array.isArray(data) ? data : (data.data || data.records || []);
    }
    
    return records;
  }

  function getMonthKey(value: any): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 7); // YYYY-MM
  }

  app.get("/api/sales", requireAuth, async (req, res) => {
    try {
      const { page = "1", limit = "100", dept, brand, search } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));

      // Check cache or fetch fresh data
      const now = Date.now();
      if (!salesCache || (now - salesCache.timestamp) > SALES_CACHE_TTL) {
        console.log('[Sales API] Fetching fresh data from vendor...');
        const records = await fetchSalesDataFromAPI();
        
        let totalSales = 0;
        let totalDays = 0;
        records.forEach((record: any) => {
          totalSales += parseFloat(record.TOTAL_SALE) || 0;
          totalDays += parseInt(record.PR_DAYS) || 0;
        });

        salesCache = {
          data: records,
          timestamp: now,
          summary: {
            totalSales,
            totalRecords: records.length,
            avgSale: records.length > 0 ? Math.round(totalSales / records.length) : 0,
            avgDays: records.length > 0 ? Math.round(totalDays / records.length) : 0,
          }
        };
        console.log(`[Sales API] Cached ${records.length} records`);
      }

      let filteredData = [...salesCache.data];

      // Apply filters
      if (dept && dept !== 'all') {
        filteredData = filteredData.filter(r => r.DEPT === dept);
      }
      if (brand && brand !== 'all') {
        filteredData = filteredData.filter(r => r.BRAND === brand);
      }
      if (search && typeof search === 'string' && search.trim()) {
        const searchLower = search.toLowerCase();
        filteredData = filteredData.filter(r => 
          r.SM?.toLowerCase().includes(searchLower) ||
          r.SHRTNAME?.toLowerCase().includes(searchLower) ||
          r.SMNO?.toLowerCase().includes(searchLower) ||
          r.EMAIL?.toLowerCase().includes(searchLower)
        );
      }

      // Sort by total sale descending
      filteredData.sort((a, b) => (parseFloat(b.TOTAL_SALE) || 0) - (parseFloat(a.TOTAL_SALE) || 0));

      // Pagination
      const totalFiltered = filteredData.length;
      const skip = (pageNum - 1) * limitNum;
      const paginatedData = filteredData.slice(skip, skip + limitNum);

      // Get unique departments and brands for filters
      const departments = Array.from(new Set(salesCache.data.map(r => r.DEPT).filter(Boolean))).sort();
      const brands = Array.from(new Set(salesCache.data.map(r => r.BRAND).filter(Boolean))).sort();

      res.json({ 
        success: true, 
        data: paginatedData,
        summary: salesCache.summary,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limitNum),
          hasMore: skip + paginatedData.length < totalFiltered,
        },
        filters: { departments, brands }
      });
    } catch (error: any) {
      console.error("Sales API error:", error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to fetch sales data: ${error.message}` 
      });
    }
  });

  // Sales Dashboard - Aggregated data for executive dashboard
  app.get("/api/sales/dashboard", requireAuth, async (req, res) => {
    try {
      const { month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Employee login: restrict to last 2 months
      if (isEmployeeLogin && month && typeof month === 'string') {
        const requestedMonth = new Date(month);
        const now = new Date();
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (requestedMonth < twoMonthsAgo) {
          return res.status(403).json({ 
            success: false,
            message: "Access denied: You can only view sales from the last 2 months" 
          });
        }
      }
      
      // Ensure cache is populated
      const now = Date.now();
      if (!salesCache || (now - salesCache.timestamp) > SALES_CACHE_TTL) {
        const records = await fetchSalesDataFromAPI();
        let totalSales = 0;
        let totalDays = 0;
        records.forEach((record: any) => {
          totalSales += parseFloat(record.TOTAL_SALE) || 0;
          totalDays += parseInt(record.PR_DAYS) || 0;
        });
        salesCache = {
          data: records,
          timestamp: now,
          summary: {
            totalSales,
            totalRecords: records.length,
            avgSale: records.length > 0 ? Math.round(totalSales / records.length) : 0,
            avgDays: records.length > 0 ? Math.round(totalDays / records.length) : 0,
          }
        };
      }

      let data = [...salesCache.data];
      
      // Filter by month if provided
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          const recordMonth = new Date(r.BILL_MONTH).toISOString().slice(0, 7);
          return recordMonth === month;
        });
      }

      // Calculate KPIs
      let totalSale = 0;
      let inhouseSale = 0;
      const staffSet = new Set<string>();
      const unitSet = new Set<string>();
      
      data.forEach(r => {
        totalSale += parseFloat(r.TOTAL_SALE) || 0;
        inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.SMNO) staffSet.add(r.SMNO);
        if (r.SHRTNAME) unitSet.add(r.SHRTNAME);
      });

      // Aggregate by unit
      const unitMap: Record<string, { totalSale: number; inhouseSale: number; staffCount: number; deptSet: Set<string> }> = {};
      data.forEach(r => {
        const unit = r.SHRTNAME || 'Unknown';
        if (!unitMap[unit]) {
          unitMap[unit] = { totalSale: 0, inhouseSale: 0, staffCount: 0, deptSet: new Set() };
        }
        unitMap[unit].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        unitMap[unit].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.DEPT) unitMap[unit].deptSet.add(r.DEPT);
      });

      // Count unique staff per unit
      const staffByUnit: Record<string, Set<string>> = {};
      data.forEach(r => {
        const unit = r.SHRTNAME || 'Unknown';
        if (!staffByUnit[unit]) staffByUnit[unit] = new Set();
        if (r.SMNO) staffByUnit[unit].add(r.SMNO);
      });

      const units = Object.entries(unitMap).map(([name, stats]) => ({
        name,
        totalSale: stats.totalSale,
        inhouseSale: stats.inhouseSale,
        staffCount: staffByUnit[name]?.size || 0,
        departmentCount: stats.deptSet.size,
      })).sort((a, b) => b.totalSale - a.totalSale);

      // Get available months from filtered data (employees only see months with their own sales)
      const monthsSet = new Set<string>();
      // For employees, use the already-filtered data; for MDO, use all cached data
      const monthSource = isEmployeeLogin ? data : salesCache.data;
      const now_date = new Date();
      const twoMonthsAgo = new Date(now_date.getFullYear(), now_date.getMonth() - 1, 1);
      
      monthSource.forEach(r => {
        if (r.BILL_MONTH) {
          const monthDate = new Date(r.BILL_MONTH);
          // For employees, only include months within the allowed 2-month range
          if (!isEmployeeLogin || monthDate >= twoMonthsAgo) {
            monthsSet.add(monthDate.toISOString().slice(0, 7));
          }
        }
      });
      const availableMonths = Array.from(monthsSet).sort().reverse();

      // Top 5 staff
      const staffSales: Record<string, { name: string; totalSale: number; unit: string }> = {};
      data.forEach(r => {
        const smno = r.SMNO || 'unknown';
        if (!staffSales[smno]) {
          staffSales[smno] = { name: r.SM || r.SHRTNAME || smno, totalSale: 0, unit: r.SHRTNAME || '' };
        }
        staffSales[smno].totalSale += parseFloat(r.TOTAL_SALE) || 0;
      });
      const topStaff = Object.values(staffSales).sort((a, b) => b.totalSale - a.totalSale).slice(0, 5);

      // Monthly trend (use filtered data for employees)
      const monthlyTrend: Record<string, number> = {};
      data.forEach(r => {
        if (r.BILL_MONTH) {
          const m = new Date(r.BILL_MONTH).toISOString().slice(0, 7);
          monthlyTrend[m] = (monthlyTrend[m] || 0) + (parseFloat(r.TOTAL_SALE) || 0);
        }
      });
      const sliceCount = isEmployeeLogin ? 2 : 6;
      const trendData = Object.entries(monthlyTrend)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-sliceCount)
        .map(([month, sale]) => ({ month, sale }));

      // Calculate data date range
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      data.forEach(r => {
        if (r.BILL_MONTH) {
          const billDate = new Date(r.BILL_MONTH);
          if (billDate && !isNaN(billDate.getTime())) {
            if (!minDate || billDate < minDate) minDate = billDate;
            if (!maxDate || billDate > maxDate) maxDate = billDate;
          }
        }
      });

      res.json({
        success: true,
        kpis: {
          totalSale,
          inhouseSale,
          externalSale: totalSale - inhouseSale,
          totalStaff: staffSet.size,
          totalUnits: unitSet.size,
        },
        units,
        topStaff,
        trendData,
        availableMonths,
        selectedMonth: month || null,
        lastUpdateTime: salesCache.timestamp,
        dataDateRange: {
          from: minDate instanceof Date ? minDate.toISOString() : null,
          to: maxDate instanceof Date ? maxDate.toISOString() : null,
        },
      });
    } catch (error: any) {
      console.error("Sales dashboard error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get departments for a specific unit
  app.get("/api/sales/units/:unit/departments", requireAuth, async (req, res) => {
    try {
      const { unit } = req.params;
      const { month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Block employee access to this drill-down endpoint (they only see their own data)
      if (isEmployeeLogin) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied: This view is restricted to management users" 
        });
      }
      
      const now = Date.now();
      if (!salesCache || (now - salesCache.timestamp) > SALES_CACHE_TTL) {
        const records = await fetchSalesDataFromAPI();
        salesCache = { data: records, timestamp: now, summary: {} };
      }

      let data = salesCache.data.filter(r => r.SHRTNAME === unit);
      
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          return new Date(r.BILL_MONTH).toISOString().slice(0, 7) === month;
        });
      }

      // Aggregate by department
      const deptMap: Record<string, { totalSale: number; inhouseSale: number; staffSet: Set<string> }> = {};
      data.forEach(r => {
        const dept = r.DEPT || 'Unknown';
        if (!deptMap[dept]) {
          deptMap[dept] = { totalSale: 0, inhouseSale: 0, staffSet: new Set() };
        }
        deptMap[dept].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        deptMap[dept].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.SMNO) deptMap[dept].staffSet.add(r.SMNO);
      });

      const departments = Object.entries(deptMap).map(([name, stats]) => ({
        name,
        totalSale: stats.totalSale,
        inhouseSale: stats.inhouseSale,
        staffCount: stats.staffSet.size,
      })).sort((a, b) => b.totalSale - a.totalSale);

      res.json({ success: true, unit, departments });
    } catch (error: any) {
      console.error("Unit departments error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get staff for a unit/department
  app.get("/api/sales/staff", requireAuth, async (req, res) => {
    try {
      const { unit, department, month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Block employee access to staff list (they only see their own data on dashboard)
      if (isEmployeeLogin) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied: This view is restricted to management users" 
        });
      }
      
      const now = Date.now();
      if (!salesCache || (now - salesCache.timestamp) > SALES_CACHE_TTL) {
        const records = await fetchSalesDataFromAPI();
        salesCache = { data: records, timestamp: now, summary: {} };
      }

      let data = [...salesCache.data];
      
      if (unit && typeof unit === 'string') {
        data = data.filter(r => r.SHRTNAME === unit);
      }
      if (department && typeof department === 'string') {
        data = data.filter(r => r.DEPT === department);
      }
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          return new Date(r.BILL_MONTH).toISOString().slice(0, 7) === month;
        });
      }

      // Aggregate by staff
      const staffMap: Record<string, {
        smno: string;
        name: string;
        email: string;
        unit: string;
        department: string;
        totalSale: number;
        inhouseSale: number;
        presentDays: number;
        brands: Record<string, { sale: number; inhouse: number }>;
        lastUpdated: string;
      }> = {};

      data.forEach(r => {
        const smno = r.SMNO || 'unknown';
        if (!staffMap[smno]) {
          staffMap[smno] = {
            smno,
            name: r.SM || smno,
            email: r.EMAIL || '',
            unit: r.SHRTNAME || '',
            department: r.DEPT || '',
            totalSale: 0,
            inhouseSale: 0,
            presentDays: 0,
            brands: {},
            lastUpdated: r.UPD_ON || '',
          };
        }
        staffMap[smno].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        staffMap[smno].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        staffMap[smno].presentDays += parseInt(r.PR_DAYS) || 0;
        
        // Track brand breakdown
        const brand = r.BRAND || 'Unknown';
        if (!staffMap[smno].brands[brand]) {
          staffMap[smno].brands[brand] = { sale: 0, inhouse: 0 };
        }
        staffMap[smno].brands[brand].sale += parseFloat(r.TOTAL_SALE) || 0;
        staffMap[smno].brands[brand].inhouse += parseFloat(r.INHOUSE_SAL) || 0;

        // Track latest update
        if (r.UPD_ON && r.UPD_ON > staffMap[smno].lastUpdated) {
          staffMap[smno].lastUpdated = r.UPD_ON;
        }
      });

      // Calculate performance and format response
      const staff = Object.values(staffMap).map(s => {
        const dailySale = s.presentDays > 0 ? s.totalSale / s.presentDays : 0;
        let performance: 'high' | 'average' | 'low' = 'average';
        if (s.totalSale <= 0) {
          performance = 'low';
        } else if (dailySale >= 5000) {
          performance = 'high';
        } else if (dailySale < 2000) {
          performance = 'low';
        }
        
        return {
          ...s,
          dailySale: Math.round(dailySale),
          performance,
          isNegative: s.totalSale < 0,
          brandList: Object.entries(s.brands).map(([name, data]) => ({
            name,
            sale: data.sale,
            inhouse: data.inhouse,
          })),
        };
      }).sort((a, b) => b.totalSale - a.totalSale);

      res.json({ success: true, staff });
    } catch (error: any) {
      console.error("Sales staff error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });
  */

  // ==================== SALES STAFF BILL SUMMARY API ====================
  // 
  // ⚠️ IMPORTANT: This section has been MOVED to server/routes/sales-staff.routes.ts
  // 
  // The code below is commented out to avoid duplication.
  // If you need to modify sales staff endpoints, edit server/routes/sales-staff.routes.ts instead.
  //
  // Note: Helper functions (fetchBillSummaryFromAPI, storeBillSummaryInDB, etc.) are exported
  // from sales-staff.routes.ts and imported at the top of this file for use in team endpoints.
  //
  /*
  
  // Helper function to store data in PostgreSQL
  // Helper function to ensure database connection is alive
  async function ensureDatabaseConnection(): Promise<void> {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error: any) {
      console.warn('[Database] Connection check failed, attempting reconnect...', error.message);
      // Prisma will automatically reconnect on next query, but we can force it
      try {
        await prisma.$disconnect().catch(() => {});
      } catch (disconnectError) {
        // Ignore disconnect errors
      }
      // Wait a moment before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Test connection again
      await prisma.$queryRaw`SELECT 1`;
    }
  }

  async function storeBillSummaryInDB(records: any[]): Promise<void> {
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Ensure database connection is alive before operations
        await ensureDatabaseConnection();
        
        // Clear old data (optional: you might want to keep historical data)
        // For now, we'll replace all data on refresh
        await prisma.salesStaffSummary.deleteMany({});
        
        // Insert new records
        const dataToInsert = records.map((r) => ({
          dat: r.dat || r.DAT || '',
          unit: r.UNIT || r.unit || null,
          smno: r.SMNO || r.smno || '',
          sm: r.SM || r.sm || null,
          divi: r.divi || r.DIVI || null,
          btype: r.BTYPE || r.btype || null,
          qty: parseInt(r.QTY || r.qty || '0', 10) || 0,
          netSale: parseFloat(r.NetSale || r.NETSALE || r.netSale || '0') || 0,
          updon: r.updon ? new Date(r.updon) : null,
        }));

        // Batch insert in chunks of 1000
        const chunkSize = 1000;
        for (let i = 0; i < dataToInsert.length; i += chunkSize) {
          const chunk = dataToInsert.slice(i, i + chunkSize);
          await prisma.salesStaffSummary.createMany({
            data: chunk,
            skipDuplicates: true,
          });
        }
        
        console.log(`[Sales Staff Summary] Stored ${records.length} records in PostgreSQL`);
        return; // Success, exit retry loop
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message || String(error);
        console.error(`[Sales Staff Summary] Error storing data in DB (attempt ${attempt}/${maxRetries}):`, errorMessage);
        
        // Check if it's a connection error
        if (errorMessage.includes("Connection must be open") || 
            errorMessage.includes("Connection closed") ||
            errorMessage.includes("Connection terminated") ||
            error.code === "P1001" ||
            error.code === "P1008") {
          // Wait before retrying (exponential backoff)
          const waitTime = 1000 * attempt; // 1s, 2s, 3s
          console.log(`[Sales Staff Summary] Connection error detected, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          // Force reconnection
          try {
            await prisma.$disconnect().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (disconnectError) {
            // Ignore disconnect errors
          }
          continue; // Retry
        } else {
          // Non-connection error, throw immediately
          throw error;
        }
      }
    }
    
    // All retries failed
    throw new Error(`Failed to store data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  // Helper function to read data from PostgreSQL with timeout (MTD filtered)
  async function getBillSummaryFromDB(): Promise<any[]> {
    const DB_TIMEOUT_MS = 10000; // 10 seconds timeout for DB operations
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Database query timed out after 10 seconds'));
      }, DB_TIMEOUT_MS);
    });

    try {
      const records = await Promise.race([
        prisma.salesStaffSummary.findMany({
          orderBy: { updatedAt: 'desc' },
        }),
        timeoutPromise,
      ]);
      
      // MTD Filter: Only get records from current month (1st of month to today)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(23, 59, 59, 999);

      // Filter records to only include current month (MTD)
      const mtdRecords = records.filter((r) => {
        const recordDate = parseBillDate(r.dat);
        if (!recordDate) return false;
        return recordDate >= currentMonthStart && recordDate <= today;
      });
      
      // Convert back to the format expected by the frontend
      return mtdRecords.map((r) => ({
        dat: r.dat,
        DAT: r.dat,
        UNIT: r.unit || '',
        unit: r.unit || '',
        SMNO: r.smno,
        smno: r.smno,
        SM: r.sm || '',
        sm: r.sm || '',
        divi: r.divi || '',
        DIVI: r.divi || '',
        BTYPE: r.btype || '',
        btype: r.btype || '',
        QTY: r.qty.toString(),
        qty: r.qty.toString(),
        NetSale: r.netSale.toString(),
        NETSALE: r.netSale.toString(),
        netSale: r.netSale.toString(),
        updon: r.updon,
        updatedAt: r.updatedAt, // Include updatedAt for last refresh time calculation
      }));
    } catch (error: any) {
      console.error('[Sales Staff Summary] Error reading from database:', error);
      throw error;
    }
  }

  // Helper function to read ALL data from PostgreSQL (no MTD filtering) - for pivot table
  async function getBillSummaryFromDBAll(): Promise<any[]> {
    const DB_TIMEOUT_MS = 10000; // 10 seconds timeout for DB operations
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Database query timed out after 10 seconds'));
      }, DB_TIMEOUT_MS);
    });

    try {
      const records = await Promise.race([
        prisma.salesStaffSummary.findMany({
          orderBy: { dat: 'desc' }, // Order by date for pivot table
        }),
        timeoutPromise,
      ]);
      
      // NO MTD FILTERING - return all historical data
      // Convert back to the format expected by the frontend
      return records.map((r) => ({
        dat: r.dat,
        DAT: r.dat,
        UNIT: r.unit || '',
        unit: r.unit || '',
        SMNO: r.smno,
        smno: r.smno,
        SM: r.sm || '',
        sm: r.sm || '',
        divi: r.divi || '',
        DIVI: r.divi || '',
        BTYPE: r.btype || '',
        btype: r.btype || '',
        QTY: r.qty.toString(),
        qty: r.qty.toString(),
        NetSale: r.netSale.toString(),
        NETSALE: r.netSale.toString(),
        netSale: r.netSale.toString(),
        updon: r.updon,
      }));
    } catch (error: any) {
      console.error('[Sales Staff Summary] Error reading all data from database:', error);
      throw error;
    }
  }

  async function fetchBillSummaryFromAPI(): Promise<any[]> {
    try {
      // New vendor API for bill summary: dat, UNIT, SMNO, SM, divi, BTYPE, QTY, NetSale, updon
      // MTD (Month-To-Date): Only fetch current month data from 1st of month to today
      const sqlQuery = `SELECT TO_CHAR(a.BILLDATE, 'DD-MON-YYYY') dat,a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end divi,a.BTYPE,round(SUM(A.QTY),0) QTY,round(Sum(a.SAL),0) NetSale , SYSDATE updon
FROM GSMT.SM_MONTHLY_BILLSUMMARY a
WHERE trunc(A.BILLDATE,'mon') = TRUNC(SYSDATE,'mon') AND A.BILLDATE <= SYSDATE and a.DIV <> 'NON-INVENTORY'
Group by TO_CHAR(a.BILLDATE, 'DD-MON-YYYY'),a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end,a.BTYPE`;
      const encodedSql = encodeURIComponent(sqlQuery);
      const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;

      const options = {
        method: 'GET' as const,
        hostname: SALES_API_HOST.toLowerCase(),
        port: SALES_API_PORT,
        path: apiPath,
        headers: {
          'Authorization': `Bearer ${process.env.SALES_API_TOKEN || ''}`,
          'User-Agent': process.env.SALES_API_USER_AGENT || 'PostmanRuntime/7.43.4',
          'Accept': '*'+'/'+'*',
        },
        rejectUnauthorized: process.env.SALES_API_REJECT_UNAUTHORIZED === 'true',
        maxRedirects: parseInt(process.env.SALES_API_MAX_REDIRECTS || "20", 10)
      };

      const responseText = await new Promise<string>((resolve, reject) => {
        let request: any = null;
        const timeoutId = setTimeout(() => {
          if (request) {
            request.destroy();
          }
          reject(new Error(`Bill summary request timed out after ${SALES_API_TIMEOUT_MS / 1000} seconds`));
        }, SALES_API_TIMEOUT_MS);

        request = https.https.request(options, (response: any) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            clearTimeout(timeoutId);
            const body = Buffer.concat(chunks).toString();
            if (response.statusCode !== 200) {
              reject(new Error(`Bill summary API returned status ${response.statusCode}: ${body.substring(0, 200)}`));
              return;
            }
            resolve(body);
          });
          response.on('error', (error: Error) => {
            clearTimeout(timeoutId);
            reject(new Error(`API response error: ${error.message}`));
          });
        });
        request.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(new Error(`API request error: ${error.message}. Check network connectivity to vendor.goyalsons.com:99`));
        });
        request.end();
      });

      let records: any[] = [];
      const looksLikeCsv = !responseText.trim().startsWith('{') && 
                          !responseText.trim().startsWith('[') && 
                          responseText.trim().split('\n')[0]?.includes(',');

      if (looksLikeCsv) {
        const lines = responseText.trim().split("\n");
        if (lines.length === 0) {
          throw new Error('API returned empty CSV response');
        }
        const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
          const record: Record<string, any> = {};
          csvHeaders.forEach((header, idx) => {
            record[header] = values[idx] || '';
          });
          records.push(record);
        }
      } else {
        try {
          const data = JSON.parse(responseText);
          records = Array.isArray(data) ? data : (data.data || data.records || []);
        } catch (parseError) {
          throw new Error(`Failed to parse API response: ${responseText.substring(0, 200)}`);
        }
      }
      
      console.log(`[Bill Summary API] Fetched ${records.length} records`);
      return records;
    } catch (error: any) {
      console.error('[Bill Summary API] Error fetching data:', error);
      throw new Error(`Failed to fetch bill summary from API: ${error.message}`);
    }
  }

  // Parse date like "10-NOV-2025" to Date object
  function parseBillDate(dateStr: string | Date): Date | null {
    if (!dateStr) return null;
    
    // If it's already a Date object, return it normalized
    if (dateStr instanceof Date) {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    
    // Try parsing as ISO date string first
    if (dateStr.includes('T') || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          d.setHours(0, 0, 0, 0);
          return d;
        }
      } catch (e) {
        // Continue to try other formats
      }
    }
    
    // Try parsing as "DD-MON-YYYY" format
    const months: Record<string, number> = {
      'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    const parts = dateStr.split('-');
    if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = months[parts[1]?.toUpperCase()];
    const year = parseInt(parts[2]);
      if (!isNaN(day) && month !== undefined && !isNaN(year)) {
    const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);
    return date;
      }
    }
    
    // Try parsing as "DD/MM/YYYY" or "MM/DD/YYYY"
    const slashParts = dateStr.split('/');
    if (slashParts.length === 3) {
      const part1 = parseInt(slashParts[0]);
      const part2 = parseInt(slashParts[1]);
      const part3 = parseInt(slashParts[2]);
      if (!isNaN(part1) && !isNaN(part2) && !isNaN(part3)) {
        // Try DD/MM/YYYY first
        if (part1 <= 31 && part2 <= 12) {
          const date = new Date(part3, part2 - 1, part1);
          if (!isNaN(date.getTime())) {
            date.setHours(0, 0, 0, 0);
            return date;
          }
        }
        // Try MM/DD/YYYY
        if (part1 <= 12 && part2 <= 31) {
          const date = new Date(part3, part1 - 1, part2);
          if (!isNaN(date.getTime())) {
            date.setHours(0, 0, 0, 0);
            return date;
          }
        }
      }
    }
    
    return null;
  }

  // Helper: Fetch employee designations for SMNOs
  async function getEmployeeDesignations(smnos: string[]): Promise<Map<string, { code: string; name: string } | null>> {
    const designationMap = new Map<string, { code: string; name: string } | null>();
    
    if (smnos.length === 0) return designationMap;
    
    try {
      const employees = await prisma.employee.findMany({
        where: {
          cardNumber: { in: smnos },
        },
        select: {
          cardNumber: true,
          designation: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      });

      employees.forEach(emp => {
        if (emp.cardNumber) {
          designationMap.set(emp.cardNumber, emp.designation ? {
            code: emp.designation.code,
            name: emp.designation.name,
          } : null);
        }
      });
    } catch (error) {
      console.error('[Sales Staff] Error fetching designations:', error);
      // Don't fail the whole request if designation fetch fails
    }
    
    return designationMap;
  }

  // Refresh endpoint - fetches from API and stores in DB
  app.post("/api/sales/staff/summary/refresh", requireAuth, async (req, res) => {
    try {
      console.log('[Sales Staff Summary] Refresh requested by user:', req.user!.id);
      
      // Ensure database connection is alive before starting
      await ensureDatabaseConnection();
      
      // Fetch fresh data from API
      const records = await fetchBillSummaryFromAPI();
      
      if (records.length === 0) {
        console.warn('[Sales Staff Summary] API returned empty data');
        return res.json({
          success: true,
          message: "Refresh completed, but no new data was returned from API",
          recordCount: 0,
        });
      }
      
      // Store in PostgreSQL (with retry logic)
      await storeBillSummaryInDB(records);
      
      res.json({
        success: true,
        message: `Successfully refreshed ${records.length} records`,
        recordCount: records.length,
      });
    } catch (error: any) {
      console.error("Sales staff summary refresh error:", error);
      const errorMessage = error.message || "Failed to refresh data";
      res.status(500).json({ 
        success: false, 
        message: errorMessage.includes("Connection") 
          ? "Database connection error. Please try again in a moment." 
          : errorMessage
      });
    }
  });

  // Sales Staff Summary (cards + month/brand breakdown)
  app.get("/api/sales/staff/summary", requireAuth, async (req, res) => {
    try {
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      const requestedSmno = typeof req.query.smno === "string" ? req.query.smno : null;

      // Read from PostgreSQL instead of cache
      let data: any[] = [];
      let dataSource = 'database';
      
      try {
        data = await getBillSummaryFromDB();
        
        // If database is empty, fetch from API and store
        if (data.length === 0) {
          console.log('[Sales Staff Summary] Database empty, fetching initial data from API...');
          try {
            const records = await fetchBillSummaryFromAPI();
            if (records.length > 0) {
              await storeBillSummaryInDB(records);
              data = await getBillSummaryFromDB();
              dataSource = 'api-then-db';
            } else {
              console.warn('[Sales Staff Summary] API returned empty data');
              // Return empty data structure instead of error
              data = [];
            }
          } catch (apiError: any) {
            console.error('[Sales Staff Summary] Failed to fetch from API:', apiError);
            // Return error response instead of hanging
            return res.status(503).json({
              success: false,
              message: `Database is empty and unable to fetch from API: ${apiError.message}. Please use the Refresh button to try again.`,
              error: apiError.message,
              dataSource: 'none',
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Staff Summary] Error reading from DB:', dbError);
        // Try to fallback to API, but with proper error handling
        try {
          console.log('[Sales Staff Summary] Attempting API fallback...');
          data = await fetchBillSummaryFromAPI();
          dataSource = 'api-fallback';
          // Try to store for next time, but don't fail if it doesn't work
          try {
            await storeBillSummaryInDB(data);
          } catch (storeError) {
            console.warn('[Sales Staff Summary] Failed to store API data, but continuing with response:', storeError);
          }
        } catch (apiError: any) {
          console.error('[Sales Staff Summary] Both DB and API failed:', apiError);
          return res.status(503).json({
            success: false,
            message: `Unable to load sales data. Database error: ${dbError.message}. API error: ${apiError.message}. Please try refreshing.`,
            error: {
              database: dbError.message,
              api: apiError.message,
            },
            dataSource: 'none',
          });
        }
      }

      // Filter by employee if employee login (MDO users see all data)
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => r.SMNO === employeeCardNo);
      }

      // MTD Filter: Only include records from current month (1st of month to today)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(23, 59, 59, 999);

      // Filter data to only include current month records
      data = data.filter((r) => {
        const recordDate = parseBillDate(r.dat || r.DAT);
        if (!recordDate) return false;
        return recordDate >= currentMonthStart && recordDate <= today;
      });

      // Get today's date for comparison (reset to start of day)
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterday = new Date(todayStart);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(todayStart);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

      // Build daily totals per staff for cards (today, last sale date, last-last sale date)
      const staffSales: Record<string, { 
        name: string; 
        unit: string;
        dateTotals: Record<string, number>;
        sortedDates: string[];
      }> = {};

      data.forEach((r) => {
        const smno = r.SMNO || "unknown";
        const name = r.SM || smno;
        const unit = r.UNIT || "";
        const dateStr = r.dat || r.DAT || "";
        const netSale = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

        if (!staffSales[smno]) {
          staffSales[smno] = { name, unit, dateTotals: {}, sortedDates: [] };
        }
        staffSales[smno].dateTotals[dateStr] = (staffSales[smno].dateTotals[dateStr] || 0) + netSale;
      });

      // Sort dates for each staff (most recent first)
      Object.values(staffSales).forEach(staff => {
        staff.sortedDates = Object.keys(staff.dateTotals)
          .map(d => ({ dateStr: d, date: parseBillDate(d) }))
          .filter(d => d.date !== null)
          .sort((a, b) => b.date!.getTime() - a.date!.getTime())
          .map(d => d.dateStr);
      });

      // Build cards array
      const cards = Object.entries(staffSales)
        .map(([smno, info]) => {
          const getVal = (idx: number) => info.sortedDates[idx] ? info.dateTotals[info.sortedDates[idx]] : 0;
          const totalSale = Object.values(info.dateTotals).reduce((sum, v) => sum + v, 0);

          return {
            smno,
            name: info.name,
            unit: info.unit,
            todaySale: getVal(0),      // Most recent date
            lastSale: getVal(1),        // Second most recent
            lastLastSale: getVal(2),    // Third most recent
            todayDate: info.sortedDates[0] || null,
            lastDate: info.sortedDates[1] || null,
            lastLastDate: info.sortedDates[2] || null,
            totalSale,
          };
        })
        .sort((a, b) => b.todaySale - a.todaySale);

      // Fetch designations for all SMNOs
      const uniqueSmnos = cards.map(c => c.smno);
      const designationMap = await getEmployeeDesignations(uniqueSmnos);

      // Filter to only include active employees (lastInterviewDate is null)
      let activeEmployeeCardNos: Set<string> = new Set();
      try {
        const activeEmployees = await prisma.employee.findMany({
          where: {
            cardNumber: { in: uniqueSmnos },
            lastInterviewDate: null, // Only active employees (not exited)
          },
          select: { cardNumber: true },
        });
        activeEmployeeCardNos = new Set(
          activeEmployees
            .map(e => e.cardNumber)
            .filter((card): card is string => card !== null)
        );
      } catch (error) {
        console.error('[Sales Staff Summary] Error filtering active employees:', error);
        // If filtering fails, include all (don't break the endpoint)
      }

      // Add designation to each card and filter to only active employees
      const cardsWithDesignation = cards
        .filter(card => activeEmployeeCardNos.has(card.smno)) // Only show active employees
        .map(card => ({
        ...card,
        designation: designationMap.get(card.smno) || null,
      }));

      // Determine which staff to show detail for
      // Employees see only their own data, MDO users can see all
      let targetSmno: string | null = requestedSmno;
      if (isEmployeeLogin) {
        targetSmno = employeeCardNo || null;
      }
      if (!targetSmno && cardsWithDesignation.length > 0) {
        targetSmno = cardsWithDesignation[0].smno;
      }

      // Get records for selected staff
      const staffRecords = targetSmno
        ? data.filter((r) => r.SMNO === targetSmno)
        : [];

      // Build table grouped by month and brand type
      let tableMonth: string | null = null;
      let tableRows: Array<{ brandType: string; quantity: number; netAmount: number }> = [];
      let grandTotal = 0;
      let grandQty = 0;

      if (staffRecords.length > 0) {
        // MTD: Use current month for table display
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        tableMonth = currentMonthKey;
        
        // Filter records for current month (MTD)
        const monthRecords = staffRecords.filter(r => {
          const d = parseBillDate(r.dat || r.DAT);
          if (!d) return false;
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return monthKey === currentMonthKey;
        });

          // Group by BTYPE (N = INH, Y = SOR)
          const byBrand: Record<string, { quantity: number; netAmount: number }> = {};

          monthRecords.forEach((r) => {
            const btype = (r.BTYPE || "").toString().trim().toUpperCase();
            const brandKey = btype === "Y" ? "Y" : btype === "N" ? "N" : "Unknown";
            const quantity = parseInt(r.QTY || r.qty || 0) || 0;
            const netAmount = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

            if (!byBrand[brandKey]) {
              byBrand[brandKey] = { quantity: 0, netAmount: 0 };
            }
            byBrand[brandKey].quantity += quantity;
            byBrand[brandKey].netAmount += netAmount;
            grandTotal += netAmount;
            grandQty += quantity;
          });

          const brandLabels: Record<string, string> = {
            N: "INH",
            Y: "SOR",
            Unknown: "Unknown",
          };

        tableRows = Object.entries(byBrand)
          .map(([key, vals]) => ({
            brandType: brandLabels[key] || key,
            quantity: vals.quantity,
            netAmount: vals.netAmount,
          }))
          .sort((a, b) => a.brandType.localeCompare(b.brandType));
      }

      // Calculate MTD date range: 1st of current month to today
      const mtdStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const mtdEndDate = new Date(now);
      
      const fromDate = format(mtdStartDate, "dd-MMM-yyyy").toUpperCase();
      const toDate = format(mtdEndDate, "dd-MMM-yyyy").toUpperCase();

      // Get the latest updatedAt timestamp from the data (last refresh time)
      let lastRefreshTime: Date | null = null;
      if (data.length > 0) {
        // Get max updatedAt from the records
        const maxUpdatedAt = data.reduce((max, r) => {
          const recordDate = r.updatedAt ? new Date(r.updatedAt) : null;
          if (!recordDate) return max;
          return !max || recordDate > max ? recordDate : max;
        }, null as Date | null);
        lastRefreshTime = maxUpdatedAt;
        // If no updatedAt found (API fallback case), use current time
        if (!lastRefreshTime && dataSource === 'api-fallback') {
          lastRefreshTime = new Date();
        }
      }

      return res.json({
        success: true,
        cards: cardsWithDesignation, // Use cards with designation
        table: {
          month: tableMonth,
          rows: tableRows,
          grandTotal,
          grandQty,
        },
        dateRange: {
          from: fromDate,
          to: toDate,
        },
        selectedSmno: targetSmno,
        dataSource, // Include data source for debugging
        lastRefreshTime: lastRefreshTime ? lastRefreshTime.toISOString() : null, // Add last refresh time
      });
    } catch (error: any) {
      console.error("Sales staff summary error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Sales Pivot Data (for Excel-style pivot table)
  app.get("/api/sales/pivot", requireAuth, async (req, res) => {
    try {
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;

      // Read ALL data from PostgreSQL (no MTD filtering for pivot table)
      // Pivot table should show all historical data so users can see trends across months
      let data: any[] = [];
      try {
        data = await getBillSummaryFromDBAll();
        
        // If database is empty, fetch from API and store
        if (data.length === 0) {
          console.log('[Sales Pivot] Database empty, fetching initial data from API...');
          try {
            const records = await fetchBillSummaryFromAPI();
            if (records.length > 0) {
              await storeBillSummaryInDB(records);
              data = await getBillSummaryFromDBAll();
            } else {
              console.warn('[Sales Pivot] API returned empty data');
              data = [];
            }
          } catch (apiError: any) {
            console.error('[Sales Pivot] Failed to fetch from API:', apiError);
            // Return empty data instead of error for pivot
            return res.json({
              success: true,
              data: [],
              recordCount: 0,
              message: `Database is empty and unable to fetch from API: ${apiError.message}. Please use the Refresh button.`,
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Pivot] Error reading from DB:', dbError);
        // Try to fallback to API
        try {
          console.log('[Sales Pivot] Attempting API fallback...');
          data = await fetchBillSummaryFromAPI();
          // Try to store for next time, but don't fail if it doesn't work
          try {
            await storeBillSummaryInDB(data);
          } catch (storeError) {
            console.warn('[Sales Pivot] Failed to store API data, but continuing with response:', storeError);
          }
        } catch (apiError: any) {
          console.error('[Sales Pivot] Both DB and API failed:', apiError);
          return res.json({
            success: true,
            data: [],
            recordCount: 0,
            message: `Unable to load pivot data. Please try refreshing.`,
          });
        }
      }

      // Filter by employee if employee login (MDO users see all data)
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => r.SMNO === employeeCardNo);
      } else {
        // For MDO users: Filter to show only sales employees (designation = "SM")
        try {
          const salesEmployees = await prisma.employee.findMany({
            where: {
              designation: {
                code: "SM" // Salesman designation
              },
              lastInterviewDate: null // Only active employees
            },
            select: {
              cardNumber: true
            }
          });
          
          const salesEmployeeCardNumbers = salesEmployees
            .map(emp => emp.cardNumber)
            .filter(cardNo => cardNo !== null && cardNo !== undefined)
            .map(cardNo => cardNo!.toString());
          
          if (salesEmployeeCardNumbers.length > 0) {
            // Filter data to only include sales employees
            data = data.filter((r) => {
              const smno = (r.SMNO || r.smno || "").toString();
              return salesEmployeeCardNumbers.includes(smno);
            });
            console.log(`[Sales Pivot] Filtered to ${data.length} records for ${salesEmployeeCardNumbers.length} sales employees`);
          } else {
            console.warn('[Sales Pivot] No sales employees found with designation SM');
          }
        } catch (filterError: any) {
          console.error('[Sales Pivot] Error filtering sales employees:', filterError);
          // Continue with all data if filter fails
        }
      }

      // NO MTD FILTERING for pivot table - show all historical data
      // This allows users to see trends across multiple months

      // Transform data to pivot format
      // API returns: dat, UNIT, SMNO, SM, divi, BTYPE, QTY, NetSale
      const pivotData = data.map((r) => ({
        dat: r.dat || r.DAT || "",
        unit: r.UNIT || r.unit || "",
        smno: parseInt(r.SMNO || r.smno || "0", 10) || 0,
        sm: r.SM || r.sm || "",
        divi: r.divi || r.DIVI || "",
        btype: ((r.BTYPE || r.btype || "").toString().toUpperCase() === "Y" ? "Y" : "N") as "Y" | "N",
        qty: parseInt(r.QTY || r.qty || "0", 10) || 0,
        netsale: parseFloat(r.NetSale || r.NETSALE || r.netSale || "0") || 0,
      }));

      return res.json({
        success: true,
        data: pivotData,
        recordCount: pivotData.length,
      });
    } catch (error: any) {
      console.error("Sales pivot error:", error);
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  });
  */

  // ==================== LOOKUP TABLES API ====================
  // 
  // ⚠️ IMPORTANT: This section has been MOVED to server/routes/lookup.routes.ts
  // 
  // The code below is commented out to avoid duplication.
  // If you need to modify lookup endpoints, edit server/routes/lookup.routes.ts instead.
  //
  /*
  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      const departments = await prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      res.json(departments);
    } catch (error) {
      console.error("Departments error:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  app.get("/api/designations", requireAuth, async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const unitId = req.query.unitId as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;

      const designations = await prisma.designation.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      const designationsWithCounts = await Promise.all(
        designations.map(async (desig) => {
          const whereClause: any = { designationId: desig.id };
          
          if (unitId) {
            whereClause.orgUnitId = unitId;
          } else {
            whereClause.orgUnitId = { in: accessibleOrgUnitIds };
          }
          
          if (departmentId) {
            whereClause.departmentId = departmentId;
          }

          const employeeCount = await prisma.employee.count({
            where: whereClause,
          });
          return {
            ...desig,
            employeeCount,
          };
        })
      );

      res.json(designationsWithCounts);
    } catch (error) {
      console.error("Designations error:", error);
      res.status(500).json({ message: "Failed to fetch designations" });
    }
  });

  app.get("/api/time-policies", requireAuth, async (req, res) => {
    try {
      const policies = await prisma.timePolicy.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      res.json(policies);
    } catch (error) {
      console.error("Time policies error:", error);
      res.status(500).json({ message: "Failed to fetch time policies" });
    }
  });
  */

  // ==================== EMP MANAGER API ====================
  // 
  // ⚠️ IMPORTANT: Core emp-manager CRUD endpoints have been MOVED to server/routes/emp-manager.routes.ts
  // 
  // The code below is commented out to avoid duplication.
  // If you need to modify core emp-manager endpoints, edit server/routes/emp-manager.routes.ts instead.
  //
  // Note: Team endpoints (members, tasks, sales-staff) remain in this file below due to complexity
  // and dependencies. They can be extracted later if needed.
  //
  /*

  // POST /api/emp-manager - Assign manager
  app.post("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const { mcardno, mdepartmentId, mdesignationId, morgUnitId } = req.body;

      if (!mcardno) {
        return res.status(400).json({ success: false, message: "mcardno is required" });
      }

      // Insert directly into emp_manager table (no validation from other tables)
      // Use a transaction to ensure we can get the inserted row
      const result = await prisma.$transaction(async (tx) => {
        // Handle empty strings as null
        const deptId = mdepartmentId && mdepartmentId.trim() ? String(mdepartmentId) : null;
        const desigId = mdesignationId && mdesignationId.trim() ? String(mdesignationId) : null;
        const orgId = morgUnitId && morgUnitId.trim() ? String(morgUnitId) : null;
        
        // Generate a unique mid (using timestamp + random for uniqueness)
        const mid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        await tx.$executeRaw`
          INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct")
          VALUES (${mid}, ${String(mcardno)}, ${deptId}, ${desigId}, ${orgId}, false)
        `;

        // Get the latest inserted record for this card number
        const inserted = await tx.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentId: string | null;
          mdesignationId: string | null;
          morgUnitId: string | null;
          mis_extinct: boolean;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
          FROM "emp_manager"
          WHERE "mcardno" = ${String(mcardno)} AND "mis_extinct" = false
          ORDER BY "mid" DESC
          LIMIT 1
        `;

        return inserted[0] || null;
      });

      res.json({
        success: true,
        message: "Manager assigned successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("Assign manager error:", error);
      const errorMessage = error.message || "Failed to assign manager";
      // Check if it's a table not found error
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database." 
        });
      }
      res.status(500).json({ success: false, message: errorMessage });
    }
  });

  // GET /api/emp-manager/by-card/:mcardno - Get managers by card number
  app.get("/api/emp-manager/by-card/:mcardno", requireAuth, async (req, res) => {
    try {
      const { mcardno } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mcardno" = ${mcardno} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by card error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-department/:departmentId - Get managers by department
  app.get("/api/emp-manager/by-department/:departmentId", requireAuth, async (req, res) => {
    try {
      const { departmentId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mdepartmentId" = ${departmentId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by department error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-designation/:designationId - Get managers by designation
  app.get("/api/emp-manager/by-designation/:designationId", requireAuth, async (req, res) => {
    try {
      const { designationId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mdesignationId" = ${designationId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by designation error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-orgunit/:orgUnitId - Get managers by org unit
  app.get("/api/emp-manager/by-orgunit/:orgUnitId", requireAuth, async (req, res) => {
    try {
      const { orgUnitId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "morgUnitId" = ${orgUnitId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by org unit error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager - Get all active managers
  app.get("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mis_extinct" = false
        ORDER BY "mcardno", "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      // Check if it's a table not found error
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database.",
          data: []
        });
      }
      res.status(500).json({ success: false, message: errorMessage, data: [] });
    }
  });

  // GET /api/emp-manager/all - Get all managers including extinct
  app.get("/api/emp-manager/all", requireAuth, async (req, res) => {
    try {
      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        ORDER BY "mis_extinct" ASC, "mcardno", "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers (including extinct) error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database.",
          data: []
        });
      }
      res.status(500).json({ success: false, message: errorMessage, data: [] });
    }
  });
  */

  // GET /api/manager/team/members - Get team members for manager
  // NOTE: Team endpoints remain in legacy file for now
  app.get("/api/manager/team/members", requireAuth, async (req, res) => {
    try {
      const employeeCardNo = req.user!.employeeCardNo;
      
      console.log("[Team Members] Manager card number:", employeeCardNo);
      
      if (!employeeCardNo) {
        console.log("[Team Members] ❌ No employee card number found");
        return res.status(403).json({ 
          success: false, 
          message: "Manager card number not found. Please login as a manager." 
        });
      }

      // Get manager assignments
      const managers = await prisma.$queryRaw<Array<{
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

      if (managers.length === 0) {
        console.log("[Team Members] ❌ No manager assignments found");
        return res.json([]);
      }

      // Build where clause based on manager's scope
      // interviewDate: null is ALWAYS applied at top level (only active employees)
      const whereConditions: any[] = [];
      
      managers.forEach((manager) => {
        const condition: any = {};
        if (manager.mdepartmentId) {
          condition.departmentId = manager.mdepartmentId;
        }
        if (manager.mdesignationId) {
          condition.designationId = manager.mdesignationId;
        }
        if (manager.morgUnitId) {
          condition.orgUnitId = manager.morgUnitId;
        }
        
        if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
          whereConditions.push(condition);
        }
      });

      if (whereConditions.length === 0) {
        console.log("[Team Members] ❌ No valid where conditions");
        return res.json([]);
      }

      // Get team members - lastInterviewDate: null is ALWAYS applied (only active employees)
      const teamMembers = await prisma.employee.findMany({
        where: {
          AND: [
            {
              lastInterviewDate: null, // ALWAYS applied - only active employees who haven't exited
            },
            {
          OR: whereConditions,
            }
          ]
        },
        select: { 
          id: true,
          firstName: true,
          lastName: true,
          cardNumber: true,
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          orgUnit: { select: { id: true, name: true } },
        },
        orderBy: { firstName: "asc" },
      });

      console.log("[Team Members] ✅ Found", teamMembers.length, "team members");
      res.json(teamMembers);
    } catch (error: any) {
      console.error("[Team Members] ❌ Error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch team members" 
      });
    }
  });

  // GET /api/manager/team/tasks - Get team tasks for manager
  // NOTE: This endpoint remains in legacy file for now
  app.get("/api/manager/team/tasks", requireAuth, async (req, res) => {
    try {
      const employeeCardNo = req.user!.employeeCardNo;
      
      console.log("[Team Tasks] Manager card number:", employeeCardNo);
      
      if (!employeeCardNo) {
        console.log("[Team Tasks] ❌ No employee card number found");
        return res.status(403).json({ 
          success: false, 
          message: "Manager card number not found. Please login as a manager." 
        });
      }

      // Get manager assignments
      const managers = await prisma.$queryRaw<Array<{
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

      console.log("[Team Tasks] Manager assignments found:", managers.length);
      managers.forEach((m, i) => {
        console.log(`[Team Tasks]   ${i + 1}. Dept: ${m.mdepartmentId || "None"}, Designation: ${m.mdesignationId || "None"}, OrgUnit: ${m.morgUnitId || "None"}`);
      });

      if (managers.length === 0) {
        console.log("[Team Tasks] ❌ No manager assignments found");
        return res.json([]);
      }

      // Build where clause based on manager's scope
      // Each manager assignment creates an AND condition (all specified fields must match)
      // Multiple assignments are combined with OR (any assignment can match)
      const whereConditions: any[] = [];
      
      managers.forEach((manager, idx) => {
        console.log(`[Team Tasks] Processing manager assignment ${idx + 1}:`, {
          mid: manager.mid,
          departmentId: manager.mdepartmentId,
          designationId: manager.mdesignationId,
          orgUnitId: manager.morgUnitId,
        });

        const condition: any = { status: "ACTIVE" };
        if (manager.mdepartmentId) {
          condition.departmentId = manager.mdepartmentId;
          console.log(`[Team Tasks]   → Adding department filter: ${manager.mdepartmentId}`);
        }
        if (manager.mdesignationId) {
          condition.designationId = manager.mdesignationId;
          console.log(`[Team Tasks]   → Adding designation filter: ${manager.mdesignationId}`);
        }
        if (manager.morgUnitId) {
          condition.orgUnitId = manager.morgUnitId;
          console.log(`[Team Tasks]   → Adding orgUnit filter: ${manager.morgUnitId}`);
        }
        
        // Only add condition if at least one scope is defined
        if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
          whereConditions.push(condition);
          console.log(`[Team Tasks]   ✅ Added condition ${idx + 1}:`, condition);
        } else {
          console.log(`[Team Tasks]   ⚠️ Skipped condition ${idx + 1} (no scope defined)`);
        }
      });

      console.log("[Team Tasks] Final where conditions (OR logic):", JSON.stringify(whereConditions, null, 2));
      console.log("[Team Tasks] Query will find employees matching ANY of these conditions (each condition uses AND)");

      if (whereConditions.length === 0) {
        console.log("[Team Tasks] ❌ No valid where conditions (manager has no scope defined)");
        return res.json([]);
      }

      // Get team member IDs with detailed logging - Only active employees
      console.log("[Team Tasks] Executing employee query with OR conditions...");
      const teamMembers = await prisma.employee.findMany({
        where: {
          AND: [
            { lastInterviewDate: null }, // Only active employees
            { OR: whereConditions },
          ],
        },
        select: { 
          id: true,
          firstName: true,
          lastName: true,
          cardNumber: true,
          departmentId: true,
          designationId: true,
          orgUnitId: true,
          status: true,
        },
      });

      console.log("[Team Tasks] Team members found:", teamMembers.length);
      if (teamMembers.length > 0) {
        teamMembers.forEach((m, i) => {
          console.log(`[Team Tasks]   ${i + 1}. ${m.firstName} ${m.lastName || ""} (Card: ${m.cardNumber})`);
          console.log(`[Team Tasks]      → Dept: ${m.departmentId || "None"}, Designation: ${m.designationId || "None"}, OrgUnit: ${m.orgUnitId || "None"}`);
        });
      } else {
        console.log("[Team Tasks] ⚠️ No employees match the filter criteria!");
        console.log("[Team Tasks] Debug: Checking sample employees to see why filter doesn't match...");
        
        // Debug: Check a few employees to see their actual values
        const sampleEmployees = await prisma.employee.findMany({
          where: { lastInterviewDate: null }, // Only active employees
          take: 5,
          select: {
            firstName: true,
            lastName: true,
            cardNumber: true,
            departmentId: true,
            designationId: true,
            orgUnitId: true,
          },
        });
        console.log("[Team Tasks] Sample active employees in DB:", sampleEmployees.map(e => ({
          name: `${e.firstName} ${e.lastName || ""}`,
          card: e.cardNumber,
          dept: e.departmentId,
          desig: e.designationId,
          org: e.orgUnitId,
        })));
      }

      const teamMemberIds = teamMembers.map(e => e.id);

      if (teamMemberIds.length === 0) {
        console.log("[Team Tasks] ❌ No team members found matching manager scope");
        return res.json([]);
      }

      // Get tasks for team members
      const tasks = await prisma.task.findMany({
        where: {
          assigneeId: { in: teamMemberIds },
        },
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              cardNumber: true,
              department: { select: { id: true, name: true, code: true } },
              designation: { select: { id: true, name: true, code: true } },
              orgUnit: { select: { id: true, name: true } },
            },
          },
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      console.log("[Team Tasks] ✅ Tasks found:", tasks.length);
      tasks.forEach((t, i) => {
        console.log(`[Team Tasks]   ${i + 1}. "${t.title}" assigned to ${t.assignee?.firstName} ${t.assignee?.lastName || ""}`);
      });

      res.json(tasks);
    } catch (error: any) {
      console.error("[Team Tasks] ❌ Error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch team tasks" 
      });
    }
  });

  // ==================== MANAGER TEAM ENDPOINTS ====================
  // NOTE: These team endpoints (members, tasks, sales-staff) remain in legacy file
  // They have complex dependencies and can be extracted later if needed
  
  // GET /api/manager/team/sales-staff - Get team sales staff for manager
  // TODO: This endpoint uses functions from sales-staff.routes.ts (fetchBillSummaryFromAPI, etc.)
  // Either import these functions or move this endpoint to sales-staff.routes.ts
  app.get("/api/manager/team/sales-staff", requireAuth, async (req, res) => {
    try {
      const forceRefresh = req.query.forceRefresh === 'true';
      const employeeCardNo = req.user!.employeeCardNo;
      
      console.log("[Team Sales] Manager card number:", employeeCardNo);
      
      if (!employeeCardNo) {
        console.log("[Team Sales] ❌ No employee card number found");
        return res.status(403).json({ 
          success: false, 
          message: "Manager card number not found. Please login as a manager." 
        });
      }

      // Get manager assignments
      const managers = await prisma.$queryRaw<Array<{
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

      console.log("[Team Sales] Manager assignments found:", managers.length);
      managers.forEach((m, i) => {
        console.log(`[Team Sales]   ${i + 1}. Dept: ${m.mdepartmentId || "None"}, Designation: ${m.mdesignationId || "None"}, OrgUnit: ${m.morgUnitId || "None"}`);
      });

      if (managers.length === 0) {
        console.log("[Team Sales] ❌ No manager assignments found");
        return res.json({ success: true, cards: [], table: { month: null, rows: [], grandTotal: 0, grandQty: 0 } });
      }

      // Build where clause based on manager's scope
      const whereConditions: any[] = [];
      
      managers.forEach((manager, idx) => {
        console.log(`[Team Sales] Processing manager assignment ${idx + 1}:`, {
          mid: manager.mid,
          departmentId: manager.mdepartmentId,
          designationId: manager.mdesignationId,
          orgUnitId: manager.morgUnitId,
        });

        const condition: any = { status: "ACTIVE" };
        if (manager.mdepartmentId) {
          condition.departmentId = manager.mdepartmentId;
          console.log(`[Team Sales]   → Adding department filter: ${manager.mdepartmentId}`);
        }
        if (manager.mdesignationId) {
          condition.designationId = manager.mdesignationId;
          console.log(`[Team Sales]   → Adding designation filter: ${manager.mdesignationId}`);
        }
        if (manager.morgUnitId) {
          condition.orgUnitId = manager.morgUnitId;
          console.log(`[Team Sales]   → Adding orgUnit filter: ${manager.morgUnitId}`);
        }
        
        if (manager.mdepartmentId || manager.mdesignationId || manager.morgUnitId) {
          whereConditions.push(condition);
          console.log(`[Team Sales]   ✅ Added condition ${idx + 1}:`, condition);
        } else {
          console.log(`[Team Sales]   ⚠️ Skipped condition ${idx + 1} (no scope defined)`);
        }
      });

      console.log("[Team Sales] Final where conditions (OR logic):", JSON.stringify(whereConditions, null, 2));

      if (whereConditions.length === 0) {
        console.log("[Team Sales] ❌ No valid where conditions (manager has no scope defined)");
        return res.json({ success: true, cards: [], table: { month: null, rows: [], grandTotal: 0, grandQty: 0 } });
      }

      // Get team member card numbers
      console.log("[Team Sales] Executing employee query with OR conditions...");
      const teamMembers = await prisma.employee.findMany({
        where: {
          OR: whereConditions,
        },
        select: { 
          cardNumber: true,
          firstName: true,
          lastName: true,
          departmentId: true,
          designationId: true,
          orgUnitId: true,
        },
      });

      console.log("[Team Sales] Team members found:", teamMembers.length);
      if (teamMembers.length > 0) {
        teamMembers.forEach((m, i) => {
          console.log(`[Team Sales]   ${i + 1}. ${m.firstName} ${m.lastName || ""} (Card: ${m.cardNumber})`);
        });
      } else {
        console.log("[Team Sales] ⚠️ No employees match the filter criteria!");
      }

      const teamCardNumbers = teamMembers
        .map(e => e.cardNumber)
        .filter((card): card is string => card !== null);

      console.log("[Team Sales] Team card numbers:", teamCardNumbers.length);
      console.log("[Team Sales] Card numbers:", teamCardNumbers);

      if (teamCardNumbers.length === 0) {
        console.log("[Team Sales] ❌ No team card numbers found");
        return res.json({ success: true, cards: [], table: { month: null, rows: [], grandTotal: 0, grandQty: 0 } });
      }

      // Get sales data from database (same as sales/staff/summary)
      console.log("[Team Sales] Fetching sales data from database...");
      let data: any[] = [];
      let dataSource = 'database';
      
      // If forceRefresh is true, fetch fresh data from API
      if (forceRefresh) {
        console.log('[Team Sales] Force refresh requested, fetching from API...');
        try {
          const records = await fetchBillSummaryFromAPI();
          if (records.length > 0) {
            await storeBillSummaryInDB(records);
            data = await getBillSummaryFromDB();
            dataSource = 'api-then-db';
          } else {
            // If API returns empty, fall back to database
            data = await getBillSummaryFromDB();
          }
        } catch (apiError: any) {
          console.error('[Team Sales] Force refresh failed, using database:', apiError);
          // Fall back to database if API fails
          data = await getBillSummaryFromDB();
        }
      } else {
      try {
        data = await getBillSummaryFromDB();
        
        // If database is empty, try to fetch from API
        if (data.length === 0) {
          console.log('[Team Sales] Database empty, fetching from API...');
          try {
            const records = await fetchBillSummaryFromAPI();
            if (records.length > 0) {
              await storeBillSummaryInDB(records);
              data = await getBillSummaryFromDB();
              dataSource = 'api-then-db';
            }
          } catch (apiError: any) {
            console.error('[Team Sales] Failed to fetch from API:', apiError);
          }
        }
      } catch (dbError: any) {
        console.error('[Team Sales] Error reading from DB:', dbError);
        try {
          data = await fetchBillSummaryFromAPI();
          dataSource = 'api-fallback';
        } catch (apiError: any) {
          console.error('[Team Sales] Both DB and API failed:', apiError);
          return res.status(503).json({
            success: false,
            message: `Unable to load sales data: ${apiError.message}`,
            dataSource: 'none',
          });
          }
        }
      }

      // Filter by team member card numbers
      data = data.filter((r) => teamCardNumbers.includes(r.SMNO || ""));

      console.log("[Team Sales] Sales records found for team:", data.length);

      // Get today's date for comparison
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterday = new Date(todayStart);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(todayStart);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

      // Build daily totals per staff for cards (today, last sale date, last-last sale date)
      const staffSales: Record<string, { 
        name: string; 
        unit: string;
        dateTotals: Record<string, number>;
        sortedDates: string[];
      }> = {};

      data.forEach((r) => {
        const smno = r.SMNO || "unknown";
        const name = r.SM || smno;
        const unit = r.UNIT || "";
        const dateStr = r.dat || r.DAT || "";
        const netSale = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

        if (!staffSales[smno]) {
          staffSales[smno] = { name, unit, dateTotals: {}, sortedDates: [] };
        }
        staffSales[smno].dateTotals[dateStr] = (staffSales[smno].dateTotals[dateStr] || 0) + netSale;
      });

      // Sort dates for each staff (most recent first)
      Object.values(staffSales).forEach(staff => {
        staff.sortedDates = Object.keys(staff.dateTotals)
          .map(d => ({ dateStr: d, date: parseBillDate(d) }))
          .filter(d => d.date !== null)
          .sort((a, b) => b.date!.getTime() - a.date!.getTime())
          .map(d => d.dateStr);
      });

      // Build cards array
      const currentMonthKeyForCards = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const cards = Object.entries(staffSales)
        .map(([smno, info]) => {
          const getVal = (idx: number) => info.sortedDates[idx] ? info.dateTotals[info.sortedDates[idx]] : 0;
          const totalSale = Object.values(info.dateTotals).reduce((sum, v) => sum + v, 0);
          
          // Calculate current month total
          let monthTotal = 0;
          Object.entries(info.dateTotals).forEach(([dateStr, sale]) => {
            const date = parseBillDate(dateStr);
            if (date) {
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              if (monthKey === currentMonthKeyForCards) {
                monthTotal += sale;
              }
            }
          });

          return {
            smno,
            name: info.name,
            unit: info.unit,
            todaySale: getVal(0),      // Most recent date
            lastSale: getVal(1),        // Second most recent
            lastLastSale: getVal(2),    // Third most recent
            todayDate: info.sortedDates[0] || null,
            lastDate: info.sortedDates[1] || null,
            lastLastDate: info.sortedDates[2] || null,
            totalSale,
            monthTotal, // Current month total
          };
        })
        .sort((a, b) => b.todaySale - a.todaySale);

      // Fetch designations for all SMNOs
      const uniqueSmnos = cards.map(c => c.smno);
      const designationMap = await getEmployeeDesignations(uniqueSmnos);

      // Add designation to each card
      const cardsWithDesignation = cards.map(card => ({
        ...card,
        designation: designationMap.get(card.smno) || null,
      }));

      // Determine which staff to show detail for
      const requestedSmno = typeof req.query.smno === "string" ? req.query.smno : null;
      let targetSmno: string | null = requestedSmno;
      if (!targetSmno && cards.length > 0) {
        targetSmno = cards[0].smno;
      }

      // Get records for selected staff
      const staffRecords = targetSmno
        ? data.filter((r) => r.SMNO === targetSmno)
        : [];

      // Build table grouped by month and brand type (for selected staff)
      let tableMonth: string | null = null;
      let tableRows: Array<{ brandType: string; quantity: number; netAmount: number }> = [];
      let grandTotal = 0;
      let grandQty = 0;

      if (staffRecords.length > 0) {
        // Use requested month or default to current month for table display
        const requestedMonthForTable = typeof req.query.month === "string" ? req.query.month : null;
        const currentMonthKey = requestedMonthForTable || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        tableMonth = currentMonthKey;
        
        // Filter records for selected month
        const monthRecords = staffRecords.filter(r => {
          const d = parseBillDate(r.dat || r.DAT);
          if (!d) return false;
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return monthKey === currentMonthKey;
        });

        // Group by BTYPE (N = INH, Y = SOR)
        const byBrand: Record<string, { quantity: number; netAmount: number }> = {};

        monthRecords.forEach((r) => {
          const btype = (r.BTYPE || "").toString().trim().toUpperCase();
          const brandKey = btype === "Y" ? "Y" : btype === "N" ? "N" : "Unknown";
          const quantity = parseInt(r.QTY || r.qty || 0) || 0;
          const netAmount = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

          if (!byBrand[brandKey]) {
            byBrand[brandKey] = { quantity: 0, netAmount: 0 };
          }
          byBrand[brandKey].quantity += quantity;
          byBrand[brandKey].netAmount += netAmount;
          grandTotal += netAmount;
          grandQty += quantity;
        });

        const brandLabels: Record<string, string> = {
          N: "INH",
          Y: "SOR",
          Unknown: "Unknown",
        };

        tableRows = Object.entries(byBrand)
          .map(([key, vals]) => ({
            brandType: brandLabels[key] || key,
            quantity: vals.quantity,
            netAmount: vals.netAmount,
          }))
          .sort((a, b) => a.brandType.localeCompare(b.brandType));
      }

      // Build pivot table data (filtered by selected staff member if provided, otherwise all team members)
      const pivotTable: {
        rows: Array<{
          rowLabel: string;
          today: { qty: number; netSale: number };
          lastDay: { qty: number; netSale: number };
          monthRange: { qty: number; netSale: number };
        }>;
      } = {
        rows: [],
      };

      // Get month parameter from query (default to current month if not provided)
      const requestedMonth = typeof req.query.month === "string" ? req.query.month : null;
      const pivotMonthKey = requestedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      // Get filter parameters
      const filterUnit = typeof req.query.filterUnit === "string" ? req.query.filterUnit : null;
      const filterDivision = typeof req.query.filterDivision === "string" ? req.query.filterDivision : null;

      // Calculate date ranges (reuse existing todayStart from above)
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Get last day (most recent date before today from the data)
      const allDates = new Set<string>();
      data.forEach(r => {
        const dateStr = r.dat || r.DAT;
        if (dateStr) allDates.add(dateStr);
      });
      const sortedDates = Array.from(allDates)
        .map(d => ({ dateStr: d, date: parseBillDate(d) }))
        .filter(d => d.date !== null && d.date < todayStart)
        .sort((a, b) => b.date!.getTime() - a.date!.getTime());
      const lastDayDate = sortedDates.length > 0 ? sortedDates[0].date : null;
      const lastDayStart = lastDayDate ? new Date(lastDayDate) : null;
      const lastDayEnd = lastDayStart ? new Date(lastDayStart) : null;
      if (lastDayEnd) {
        lastDayEnd.setHours(23, 59, 59, 999);
      }
      
      // Month range: 1st of selected month to today (or end of month if past month)
      const [year, month] = pivotMonthKey.split("-").map(Number);
      const monthStart = new Date(year, month - 1, 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(year, month, 0); // Last day of month
      monthEnd.setHours(23, 59, 59, 999);
      const monthRangeEnd = monthEnd > todayEnd ? todayEnd : monthEnd;

      // Get all records for pivot (from entire data, not just selected month, to calculate today and lastDay)
      let pivotRecords = data;
      
      // Filter by selected staff member if provided
      if (targetSmno) {
        pivotRecords = pivotRecords.filter(r => r.SMNO === targetSmno);
      }
      
      // Filter by unit if provided
      if (filterUnit) {
        pivotRecords = pivotRecords.filter(r => {
          const unit = (r.UNIT || r.unit || "").toString().trim();
          return unit === filterUnit;
        });
      }
      
      // Filter by division if provided
      if (filterDivision) {
        pivotRecords = pivotRecords.filter(r => {
          const divi = (r.divi || r.DIVI || "").toString().trim() || "Unknown";
          return divi === filterDivision;
        });
      }

      // Collect all available units and divisions from the data (before filtering)
      // This is used to populate filter dropdowns
      const allUnitSet = new Set<string>();
      const allDivisionSet = new Set<string>();
      
      // Get all records for the selected month (before unit/division filtering)
      let allMonthRecords = data.filter(r => {
        const d = parseBillDate(r.dat || r.DAT);
        if (!d) return false;
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return monthKey === pivotMonthKey;
      });
      
      if (targetSmno) {
        allMonthRecords = allMonthRecords.filter(r => r.SMNO === targetSmno);
      }

      allMonthRecords.forEach((r) => {
        const divi = (r.divi || r.DIVI || "").toString().trim() || "Unknown";
        const unit = (r.UNIT || r.unit || "").toString().trim() || "Unknown";
        allUnitSet.add(unit);
        allDivisionSet.add(divi);
      });

      const availableUnits = Array.from(allUnitSet).sort();
      const availableDivisions = Array.from(allDivisionSet).sort();

      // Group by division and brand type, then calculate today, lastDay, and monthRange totals
      // Structure: pivotData[division][brandType] = { today, lastDay, monthRange }
      const pivotData: Record<string, Record<string, { 
        today: { qty: number; netSale: number };
        lastDay: { qty: number; netSale: number };
        monthRange: { qty: number; netSale: number };
      }>> = {};
      const divisionSet = new Set<string>();

      console.log(`[Team Sales] Processing ${pivotRecords.length} records for pivot table`);
      console.log(`[Team Sales] Date ranges - Today: ${todayStart.toISOString()} to ${todayEnd.toISOString()}, Month: ${monthStart.toISOString()} to ${monthRangeEnd.toISOString()}`);
      if (lastDayStart && lastDayEnd) {
        console.log(`[Team Sales] Last Day: ${lastDayStart.toISOString()} to ${lastDayEnd.toISOString()}`);
      }
      
      // Sample a few records to see their date format
      if (pivotRecords.length > 0) {
        const sampleRecords = pivotRecords.slice(0, 5);
        console.log(`[Team Sales] Sample records (first 5):`);
        sampleRecords.forEach((r, idx) => {
          const dateStr = r.dat || r.DAT;
          const parsed = parseBillDate(dateStr);
          console.log(`[Team Sales]   Record ${idx + 1}: dat="${dateStr}", parsed=${parsed ? parsed.toISOString() : 'null'}, qty=${r.QTY || r.qty}, netSale=${r.NetSale || r.NETSALE || r.netSale}`);
        });
      }

      pivotRecords.forEach((r) => {
        // Handle date - could be string or Date object from database
        let recordDate: Date | null = null;
        const dateStr = r.dat || r.DAT;
        if (dateStr) {
          if (dateStr instanceof Date) {
            recordDate = new Date(dateStr);
            recordDate.setHours(0, 0, 0, 0);
          } else if (typeof dateStr === 'string') {
            recordDate = parseBillDate(dateStr);
          }
        }
        if (!recordDate) {
          // Skip records with invalid dates
          return;
        }
        
        const divi = (r.divi || r.DIVI || "").toString().trim() || "Unknown";
        const btype = (r.BTYPE || "").toString().trim().toUpperCase();
        const brandLabel = btype === "Y" ? "SOR" : btype === "N" ? "InHouse" : "Unknown";
        const quantity = parseInt(r.QTY || r.qty || 0) || 0;
        const netAmount = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

        divisionSet.add(divi);

        if (!pivotData[divi]) {
          pivotData[divi] = {};
        }
        if (!pivotData[divi][brandLabel]) {
          pivotData[divi][brandLabel] = {
            today: { qty: 0, netSale: 0 },
            lastDay: { qty: 0, netSale: 0 },
            monthRange: { qty: 0, netSale: 0 },
          };
        }

        // Normalize dates to compare only date part (ignore time)
        const recordDateOnly = new Date(recordDate.getFullYear(), recordDate.getMonth(), recordDate.getDate());
        const todayDateOnly = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate());
        const lastDayDateOnly = lastDayStart ? new Date(lastDayStart.getFullYear(), lastDayStart.getMonth(), lastDayStart.getDate()) : null;
        const monthStartDateOnly = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate());
        const monthRangeEndDateOnly = new Date(monthRangeEnd.getFullYear(), monthRangeEnd.getMonth(), monthRangeEnd.getDate());

        // Check if record is from today
        if (recordDateOnly.getTime() === todayDateOnly.getTime()) {
          pivotData[divi][brandLabel].today.qty += quantity;
          pivotData[divi][brandLabel].today.netSale += netAmount;
        }
        
        // Check if record is from last day
        if (lastDayDateOnly && recordDateOnly.getTime() === lastDayDateOnly.getTime()) {
          pivotData[divi][brandLabel].lastDay.qty += quantity;
          pivotData[divi][brandLabel].lastDay.netSale += netAmount;
        }
        
        // Check if record is in month range
        if (recordDateOnly >= monthStartDateOnly && recordDateOnly <= monthRangeEndDateOnly) {
          pivotData[divi][brandLabel].monthRange.qty += quantity;
          pivotData[divi][brandLabel].monthRange.netSale += netAmount;
        }
      });

      console.log(`[Team Sales] Pivot data summary: ${Object.keys(pivotData).length} divisions, ${divisionSet.size} unique divisions`);
      Object.entries(pivotData).forEach(([divi, brands]) => {
        Object.entries(brands).forEach(([brand, data]) => {
          if (data.today.qty > 0 || data.today.netSale > 0 || 
              data.lastDay.qty > 0 || data.lastDay.netSale > 0 || 
              data.monthRange.qty > 0 || data.monthRange.netSale > 0) {
            console.log(`[Team Sales] ${divi}/${brand}: today=${data.today.qty}/${data.today.netSale}, lastDay=${data.lastDay.qty}/${data.lastDay.netSale}, monthRange=${data.monthRange.qty}/${data.monthRange.netSale}`);
          }
        });
      });

      // Build pivot rows with division hierarchy
      const sortedDivisions = Array.from(divisionSet).sort();

      // Build rows: Division header first, then InHouse, then SOR
      sortedDivisions.forEach(divi => {
        const divisionData = pivotData[divi];
        
        // Calculate division totals (sum of all brand types)
        const divisionTotals = {
          today: { qty: 0, netSale: 0 },
          lastDay: { qty: 0, netSale: 0 },
          monthRange: { qty: 0, netSale: 0 },
        };

        // Add division header first
        Object.values(divisionData).forEach(brandData => {
          divisionTotals.today.qty += brandData.today.qty;
          divisionTotals.today.netSale += brandData.today.netSale;
          divisionTotals.lastDay.qty += brandData.lastDay.qty;
          divisionTotals.lastDay.netSale += brandData.lastDay.netSale;
          divisionTotals.monthRange.qty += brandData.monthRange.qty;
          divisionTotals.monthRange.netSale += brandData.monthRange.netSale;
        });

        pivotTable.rows.push({
          rowLabel: divi,
          today: divisionTotals.today,
          lastDay: divisionTotals.lastDay,
          monthRange: divisionTotals.monthRange,
        });

        // Add brand types under division (InHouse, then SOR)
        const brandOrder = ["InHouse", "SOR"];
        brandOrder.forEach(brandLabel => {
          if (divisionData[brandLabel]) {
            pivotTable.rows.push({
              rowLabel: brandLabel,
              today: divisionData[brandLabel].today,
              lastDay: divisionData[brandLabel].lastDay,
              monthRange: divisionData[brandLabel].monthRange,
            });
          }
        });
      });

      // Calculate MTD date range: 1st of current month to today
      const mtdStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const mtdEndDate = new Date(now);
      
      const fromDate = format(mtdStartDate, "dd-MMM-yyyy").toUpperCase();
      const toDate = format(mtdEndDate, "dd-MMM-yyyy").toUpperCase();

      // Get the latest updatedAt timestamp from the data (last refresh time)
      let lastRefreshTime: Date | null = null;
      if (data.length > 0) {
        // Get max updatedAt from the records
        const maxUpdatedAt = data.reduce((max, r) => {
          const recordDate = r.updatedAt ? new Date(r.updatedAt) : null;
          if (!recordDate) return max;
          return !max || recordDate > max ? recordDate : max;
        }, null as Date | null);
        lastRefreshTime = maxUpdatedAt;
        // If no updatedAt found (API fallback case), use current time
        if (!lastRefreshTime && dataSource === 'api-fallback') {
          lastRefreshTime = new Date();
        }
      }

      console.log("[Team Sales] ✅ Returning", cardsWithDesignation.length, "team sales cards");
      console.log("[Team Sales] Pivot table rows:", pivotTable.rows.length);

      res.json({
        success: true,
        cards: cardsWithDesignation,
        table: {
          month: tableMonth,
          rows: tableRows,
          grandTotal,
          grandQty,
        },
        pivotTable, // Add pivot table data
        dateRange: {
          from: fromDate,
          to: toDate,
        },
        selectedSmno: targetSmno,
        dataSource,
        lastRefreshTime: lastRefreshTime ? lastRefreshTime.toISOString() : null, // Add last refresh time
        availableUnits, // Available units for filtering
        availableDivisions, // Available divisions for filtering
      });
    } catch (error: any) {
      console.error("Manager team sales-staff error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to fetch team sales staff" 
      });
    }
  });


  app.delete("/api/emp-manager/:mid", requireAuth, async (req, res) => {
    try {
      const { mid } = req.params;

      if (!mid) {
        return res.status(400).json({ 
          success: false, 
          message: "Manager ID (mid) is required" 
        });
      }

      // Check if manager exists
      const existing = await prisma.$queryRaw<Array<{ mid: string }>>`
        SELECT "mid" FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      if (existing.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Manager assignment not found" 
        });
      }

      // Delete the manager assignment
      await prisma.$executeRaw`
        DELETE FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      res.json({ 
        success: true, 
        message: "Manager assignment removed successfully" 
      });
    } catch (error: any) {
      console.error("Delete manager error:", error);
      const errorMessage = error.message || "Failed to delete manager";
      res.status(500).json({ 
        success: false, 
        message: errorMessage 
      });
    }
  });
  

  return httpServer;
}
