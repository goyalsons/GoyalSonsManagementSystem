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
import { getEmployeeAttendance, isBigQueryConfigured } from "./bigquery-service";
import { sendOtpSms } from "./sms-service";
import multer from "multer";
import fs from "fs";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".csv", ".json", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, JSON, and Excel files are allowed"));
    }
  },
});

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

if (GOOGLE_OAUTH_ENABLED) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID!,
    clientSecret: GOOGLE_CLIENT_SECRET!,
    callbackURL: "/api/auth/google/callback",
  }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(null, false, { message: "No email found in Google profile" });
      }
      
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
      });
      
      if (!user) {
        return done(null, false, { message: "No MDO account found with this email" });
      }
      
      return done(null, user);
    } catch (error) {
      return done(error as Error);
    }
  }));
  
  passport.serializeUser((user: any, done: any) => {
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: any, done: any) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: Number(id) } });
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Health check endpoint for Railway
  app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
  });
  
  // Initialize passport
  app.use(passport.initialize());
  
  app.use(loadUserFromSession);
  
  // Google OAuth routes
  if (GOOGLE_OAUTH_ENABLED) {
    app.get("/api/auth/google", passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
    }));
    
    app.get("/api/auth/google/callback", (req, res, next) => {
      passport.authenticate("google", { session: false }, async (err: any, user: any, info: any) => {
        try {
          if (err) {
            console.error("Google OAuth error:", err);
            return res.redirect("/login?error=oauth_error");
          }
          
          if (!user) {
            const message = info?.message || "Authentication failed";
            return res.redirect(`/login?error=${encodeURIComponent(message)}`);
          }
          
          // Create session for the user
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const session = await prisma.session.create({
            data: {
              userId: user.id,
              expiresAt,
            },
          });
          
          // Redirect with token
          res.redirect(`/auth-callback?token=${session.id}`);
        } catch (error) {
          console.error("Google OAuth callback error:", error);
          res.redirect("/login?error=session_error");
        }
      })(req, res, next);
    });
  } else {
    // Fallback if Google OAuth is not configured
    app.get("/api/auth/google", (req, res) => {
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

      res.json({
        token: session.id,
        user,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    res.json(req.user);
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
      const orgUnits = await prisma.orgUnit.findMany({
        where: {
          id: { in: req.user!.accessibleOrgUnitIds },
        },
        orderBy: { level: "asc" },
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
          where: { orgUnitId: { in: accessibleOrgUnitIds } },
        }),
        prisma.attendance.count({
          where: {
            date: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lt: new Date(new Date().setHours(23, 59, 59, 999)),
            },
            status: { in: ["present", "late"] },
            employee: { orgUnitId: { in: accessibleOrgUnitIds } },
          },
        }),
        prisma.task.count({
          where: {
            status: { in: ["open", "in_progress"] },
            assignee: { orgUnitId: { in: accessibleOrgUnitIds } },
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
          employee: { orgUnitId: { in: accessibleOrgUnitIds } },
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

      const where: any = { orgUnitId: { in: accessibleOrgUnitIds } };
      
      if (unitId) {
        where.orgUnitId = unitId;
      }
      if (departmentId) {
        where.departmentId = departmentId;
      }
      if (designationId) {
        where.designationId = designationId;
      }
      
      // Filter by active/inactive status based on interviewDate
      // Active = interviewDate is null (employee hasn't exited)
      // Inactive = interviewDate has a value (employee has exited)
      if (statusFilter === 'active') {
        where.interviewDate = null;
      } else if (statusFilter === 'inactive') {
        where.interviewDate = { not: null };
      }
      // If statusFilter is 'all' or not provided, show all employees
      
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
            orgUnit: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, name: true, code: true } },
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

      const role = await prisma.role.findUnique({
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

      const user = await prisma.user.create({
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
        employee: { orgUnitId: { in: accessibleOrgUnitIds } },
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
        },
      });

      if (!employee) {
        return res.status(403).json({ 
          message: "Access denied", 
          reason: "org_out_of_scope" 
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
  app.get("/api/attendance/today", requireAuth, requirePolicy("attendance.view"), async (req, res) => {
    try {
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;
      const { unitId, departmentId, designationId, status: filterStatus, page = "1", limit = "50" } = req.query;

      // Build employee filter
      const employeeWhere: any = {
        orgUnitId: { in: accessibleOrgUnitIds },
        status: "ACTIVE",
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

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get all employees with their today's attendance
      const employees = await prisma.employee.findMany({
        where: employeeWhere,
        include: {
          orgUnit: { select: { id: true, name: true, code: true } },
          department: { select: { id: true, name: true, code: true } },
          designation: { select: { id: true, name: true, code: true } },
          attendance: {
            where: {
              date: {
                gte: today,
                lt: tomorrow,
              },
            },
            take: 1,
          },
        },
        orderBy: { firstName: "asc" },
      });

      // Transform data to include present/absent status
      const attendanceData = employees.map(emp => {
        const todayAttendance = emp.attendance[0];
        const isPresent = !!todayAttendance;
        
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
          status: isPresent ? "present" : "absent",
          checkInAt: todayAttendance?.checkInAt || null,
          checkOutAt: todayAttendance?.checkOutAt || null,
          attendanceStatus: todayAttendance?.status || null,
          meta: todayAttendance?.meta || null,
        };
      });

      // Apply status filter if provided
      const filteredData = filterStatus 
        ? attendanceData.filter(a => a.status === filterStatus)
        : attendanceData;

      // Calculate summary
      const presentCount = attendanceData.filter(a => a.status === "present").length;
      const absentCount = attendanceData.filter(a => a.status === "absent").length;

      // Pagination
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 50;
      const offset = (pageNum - 1) * limitNum;
      const paginatedData = filteredData.slice(offset, offset + limitNum);

      res.json({
        date: today.toISOString().split("T")[0],
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

      const isEmployee = req.user!.loginType === "employee";
      const hasPolicy = req.user!.policies?.includes("attendance.view");
      const isSuperAdmin = req.user!.isSuperAdmin;
      
      // Non-employees need the attendance.view policy
      if (!isEmployee && !hasPolicy && !isSuperAdmin) {
        return res.status(403).json({ message: "Access denied", reason: "missing_policy", required: "attendance.view" });
      }

      if (!isBigQueryConfigured()) {
        return res.status(503).json({ message: "BigQuery is not configured. Please add BIGQUERY_CREDENTIALS secret." });
      }

      let { cardNo } = req.params;
      const { month } = req.query;

      // Employee login: restrict to own card number and last 3 months
      if (isEmployee) {
        if (req.user!.employeeCardNo && cardNo !== req.user!.employeeCardNo) {
          return res.status(403).json({ message: "Access denied: You can only view your own attendance" });
        }
        cardNo = req.user!.employeeCardNo || cardNo;
        
        // Restrict to last 3 months for employees
        if (month) {
          const requestedMonth = new Date(month as string);
          const now = new Date();
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          if (requestedMonth < threeMonthsAgo) {
            return res.status(403).json({ message: "Access denied: You can only view attendance from the last 3 months" });
          }
        }
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
      res.status(500).json({ message: error.message || "Failed to fetch attendance history" });
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
        assignee: { orgUnitId: { in: accessibleOrgUnitIds } },
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
      const accessibleOrgUnitIds = req.user!.accessibleOrgUnitIds;

      const users = await prisma.user.findMany({
        where: { orgUnitId: { in: accessibleOrgUnitIds } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          orgUnit: { select: { name: true, code: true } },
          roles: {
            include: {
              role: { select: { name: true } },
            },
          },
        },
        orderBy: { name: "asc" },
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
        employee: { orgUnitId: { in: accessibleOrgUnitIds } },
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
        employee: { orgUnitId: { in: accessibleOrgUnitIds } },
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

  app.get("/api/roles", requireAuth, async (req, res) => {
    try {
      const roles = await prisma.role.findMany({
        include: {
          policies: {
            include: {
              policy: true,
            },
          },
        },
        orderBy: { level: "asc" },
      });

      res.json(roles);
    } catch (error) {
      console.error("Roles error:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.get("/api/policies", requireAuth, async (req, res) => {
    try {
      const policies = await prisma.policy.findMany({
        orderBy: { category: "asc" },
      });

      res.json(policies);
    } catch (error) {
      console.error("Policies error:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  // ==================== SETTINGS API ====================
  
  app.get("/api/settings", requireAuth, async (req, res) => {
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

  app.put("/api/settings", requireAuth, async (req, res) => {
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

  app.put("/api/settings/profile", requireAuth, async (req, res) => {
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

  app.put("/api/settings/password", requireAuth, async (req, res) => {
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
          const employeeRole = await prisma.role.findFirst({
            where: { name: "Employee" },
          });

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
            },
          });

          if (employeeRole) {
            await prisma.userRole.create({
              data: {
                userId: user.id,
                roleId: employeeRole.id,
              },
            });
          }

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

      const employee = await prisma.employee.findFirst({
        where: {
          OR: [
            { cardNumber: employeeCode },
            { cardNumber: employeeCode.toString() },
          ],
        },
      });

      if (!employee) {
        return res.status(404).json({ message: "Employee not found. Please check your employee code." });
      }

      // Check if employee is active (left employees have lastInterviewDate set or status != ACTIVE)
      if (employee.status !== "ACTIVE") {
        return res.status(403).json({ message: "Your account is not active. Please contact HR." });
      }

      // Check if employee has left (lastInterviewDate indicates exit interview)
      if ((employee as any).lastInterviewDate) {
        return res.status(404).json({ message: "Employee not found. Please check your employee code." });
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

      if (!employee.phone) {
        return res.status(400).json({ message: "No phone number registered for this employee" });
      }

      let cleanPhone = employee.phone.replace(/\D/g, "");
      if (cleanPhone.length === 10) {
        cleanPhone = "91" + cleanPhone;
      }

      // Check if there's an existing valid OTP
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
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

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
          const employeeRole = await prisma.role.findFirst({
            where: { name: "Employee" },
          });

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
            },
          });

          if (employeeRole) {
            await prisma.userRole.create({
              data: {
                userId: user.id,
                roleId: employeeRole.id,
              },
            });
          }

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
                fields = Object.keys(sampleRecord);
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
            if (emp["Last_INTERVIEW_DATE"]) {
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
                  interviewDate = new Date(`${year}-${month}-${day}`);
                }
              } catch (e) {
                console.error("Date parse error:", e);
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
                profileImageUrl: emp["person_img_cdn_url"] || emp["personel_image"] || null,
                status: emp["STATUS"] || "ACTIVE",
                weeklyOff: emp["WEEKLY_OFF"] || null,
                shiftStart: emp["INTIME"] || null,
                shiftEnd: emp["OUTTIME"] || null,
                interviewDate,
                externalId: emp["ID"] || null,
                autoNumber: emp["Auto_Number"] || null,
                zohoId: emp["zohobooksid"] || null,
                departmentId,
                designationId,
                timePolicyId,
                orgUnitId,
                metadata: {
                  weekly_off_calculation: emp["weekly_off_calculation"],
                  last_interview_date: emp["Last_INTERVIEW_DATE"],
                  mobile_otp: emp["Mobile_Otp"],
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
                profileImageUrl: emp["person_img_cdn_url"] || emp["personel_image"] || null,
                status: emp["STATUS"] || "ACTIVE",
                weeklyOff: emp["WEEKLY_OFF"] || null,
                shiftStart: emp["INTIME"] || null,
                shiftEnd: emp["OUTTIME"] || null,
                interviewDate,
                externalId: emp["ID"] || null,
                autoNumber: emp["Auto_Number"] || null,
                zohoId: emp["zohobooksid"] || null,
                departmentId,
                designationId,
                timePolicyId,
                orgUnitId,
                metadata: {
                  weekly_off_calculation: emp["weekly_off_calculation"],
                  last_interview_date: emp["Last_INTERVIEW_DATE"],
                  mobile_otp: emp["Mobile_Otp"],
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

  // In-memory cache for sales data (5 minute TTL)
  let salesCache: { data: any[]; timestamp: number; summary: any } | null = null;
  const SALES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const SALES_API_TIMEOUT_MS = parseInt(process.env.SALES_API_TIMEOUT_MS || "60000", 10);

  async function fetchSalesDataFromAPI(): Promise<any[]> {
    const salesApiToken = process.env.SALES_API_TOKEN;
    
    const sqlQuery = `SELECT SHRTNAME, DEPT, SMNO, SM, EMAIL, BILL_MONTH, BRAND, TOTAL_SALE, PR_DAYS, INHOUSE_SAL, SYSDATE UPD_ON FROM GSMT.SM_MONTHLY Where SMNO IN (Select SMNO FROM GSMT.SM_MONTHLY where BILL_MONTH >= ADD_MONTHS(SYSDATE, -2) and TOTAL_SALE >= 100)`;
    const encodedSql = encodeURIComponent(sqlQuery);
    const apiPath = `/gsweb_v3/webform2.aspx?sql=${encodedSql}&TYP=sql&key=ank2024`;
    
    const options = {
      method: 'GET' as const,
      hostname: 'VENDOR.GOYALSONS.COM',
      port: 99,
      path: apiPath,
      headers: {
        'Authorization': `Bearer ${salesApiToken || ''}`,
        'User-Agent': 'PostmanRuntime/7.43.4',
        'Accept': '*/*',
      },
      rejectUnauthorized: false,
      maxRedirects: 20
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
      const departments = [...new Set(salesCache.data.map(r => r.DEPT).filter(Boolean))].sort();
      const brands = [...new Set(salesCache.data.map(r => r.BRAND).filter(Boolean))].sort();

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

      // Employee login: filter to show only own sales data
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter(r => r.SMNO === employeeCardNo);
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

  // ==================== SALES STAFF BILL SUMMARY API ====================
  
  // Separate cache for bill summary data (5 minute TTL)
  let billSummaryCache: { data: any[]; timestamp: number } | null = null;
  const BILL_SUMMARY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async function fetchBillSummaryFromAPI(): Promise<any[]> {
    // New vendor API for bill summary: dat, UNIT, SMNO, SM, divi, BTYPE, QTY, NetSale, updon
    const sqlQuery = `SELECT TO_CHAR(a.BILLDATE, 'DD-MON-YYYY') dat,a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end divi,a.BTYPE,round(SUM(A.QTY),0) QTY,round(Sum(a.SAL),0) NetSale , SYSDATE updon
FROM GSMT.SM_MONTHLY_BILLSUMMARY a
WHERE trunc(A.BILLDATE,'mon') >= TRUNC(ADD_MONTHS(SYSDATE,-1),'mon') and a.DIV <> 'NON-INVENTORY'
Group by TO_CHAR(a.BILLDATE, 'DD-MON-YYYY'),a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end,a.BTYPE`;
    const encodedSql = encodeURIComponent(sqlQuery);
    const apiPath = `/gsweb_v3/webform2.aspx?sql=${encodedSql}&TYP=sql&key=ank2024`;

    const options = {
      method: 'GET' as const,
      hostname: 'vendor.goyalsons.com',
      port: 99,
      path: apiPath,
      headers: {
        'User-Agent': 'PostmanRuntime/7.43.4',
        'Accept': '*/*',
      },
      rejectUnauthorized: false,
      maxRedirects: 20
    };

    const responseText = await new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Bill summary request timed out after ${SALES_API_TIMEOUT_MS / 1000} seconds`));
      }, SALES_API_TIMEOUT_MS);

      const request = https.https.request(options, (response: any) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          clearTimeout(timeoutId);
          const body = Buffer.concat(chunks).toString();
          if (response.statusCode !== 200) {
            reject(new Error(`Bill summary API returned status ${response.statusCode}`));
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
    
    console.log(`[Bill Summary API] Fetched ${records.length} records`);
    return records;
  }

  // Parse date like "10-NOV-2025" to Date object
  function parseBillDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const months: Record<string, number> = {
      'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
      'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
    };
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = months[parts[1]?.toUpperCase()];
    const year = parseInt(parts[2]);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    return new Date(year, month, day);
  }

  // Sales Staff Summary (cards + month/brand breakdown)
  app.get("/api/sales/staff/summary", requireAuth, async (req, res) => {
    try {
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      const requestedSmno = typeof req.query.smno === "string" ? req.query.smno : null;

      // Fetch fresh data or use cache
      const now = Date.now();
      if (!billSummaryCache || now - billSummaryCache.timestamp > BILL_SUMMARY_CACHE_TTL) {
        console.log('[Sales Staff Summary] Fetching fresh bill summary data...');
        const records = await fetchBillSummaryFromAPI();
        billSummaryCache = { data: records, timestamp: now };
      }

      let data = [...billSummaryCache.data];

      // Filter by employee if employee login
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => r.SMNO === employeeCardNo);
      }

      // Get today's date for comparison
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(today);
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

      // Determine which staff to show detail for
      let targetSmno: string | null = requestedSmno;
      if (isEmployeeLogin) {
        targetSmno = employeeCardNo || null;
      }
      if (!targetSmno && cards.length > 0) {
        targetSmno = cards[0].smno;
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
        // Find the latest month in the data
        const monthsInData = new Set<string>();
        staffRecords.forEach(r => {
          const d = parseBillDate(r.dat || r.DAT);
          if (d) {
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthsInData.add(monthKey);
          }
        });
        const sortedMonths = Array.from(monthsInData).sort().reverse();
        const latestMonth = sortedMonths[0];

        if (latestMonth) {
          tableMonth = latestMonth;
          
          // Filter records for the latest month
          const monthRecords = staffRecords.filter(r => {
            const d = parseBillDate(r.dat || r.DAT);
            if (!d) return false;
            const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return monthKey === latestMonth;
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
      }

      // Calculate date range from all data, but force the start day to the 1st of the earliest month
      const allDates = data
        .map(r => ({ str: r.dat || r.DAT || "", date: parseBillDate(r.dat || r.DAT) }))
        .filter(d => d.date !== null)
        .sort((a, b) => a.date!.getTime() - b.date!.getTime());
      
      const earliestDate = allDates.length > 0 ? allDates[0].date! : null;
      const latestDate = allDates.length > 0 ? allDates[allDates.length - 1].date! : null;

      const fromDate = earliestDate
        ? format(new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1), "dd-MMM-yyyy").toUpperCase()
        : null;
      const toDate = latestDate
        ? format(latestDate, "dd-MMM-yyyy").toUpperCase()
        : null;

      return res.json({
        success: true,
        cards,
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

      // Fetch fresh data or use cache
      const now = Date.now();
      if (!billSummaryCache || now - billSummaryCache.timestamp > BILL_SUMMARY_CACHE_TTL) {
        console.log('[Sales Pivot] Fetching fresh bill summary data...');
        const records = await fetchBillSummaryFromAPI();
        billSummaryCache = { data: records, timestamp: now };
      }

      let data = [...billSummaryCache.data];

      // Filter by employee if employee login
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => r.SMNO === employeeCardNo);
      }

      // Transform data to pivot format
      // API returns: dat, UNIT, SMNO, SM, divi, BTYPE, QTY, NetSale
      const pivotData = data.map((r) => ({
        dat: r.dat || r.DAT || "",
        unit: r.UNIT || "",
        smno: parseInt(r.SMNO, 10) || 0,
        sm: r.SM || "",
        divi: r.divi || r.DIVI || "",
        btype: (r.BTYPE === "Y" ? "Y" : "N") as "Y" | "N",
        qty: parseInt(r.QTY, 10) || 0,
        netsale: parseFloat(r.NetSale || r.NETSALE || 0) || 0,
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

  // ==================== LOOKUP TABLES API ====================

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

  return httpServer;
}
