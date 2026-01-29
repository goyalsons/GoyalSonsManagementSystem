import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { getUserAuthInfo } from "./authorization";
import { POLICIES } from "../constants/policies";
import * as crypto from "crypto";
import { getSessionAuthSnapshot, putSessionAuthSnapshot } from "./auth-cache";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        orgUnitId: string | null;
        roles: { id: string; name: string }[];
        policies: string[];
        accessibleOrgUnitIds: string[];
        loginType: "mdo" | "employee";
        employeeCardNo: string | null;
        employeeId: string | null;
        // Optional fields used by some legacy routes
        isManager?: boolean;
        managerScopes?: {
          departmentIds: string[] | null;
          designationIds: string[] | null;
          orgUnitIds: string[] | null;
        } | null;
      };
    }
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function authenticateUser(email: string, password: string) {
  const passwordHash = hashPassword(password);

  // Optional env-based credential override/fallback
  const envEmail = process.env.ENV_LOGIN_EMAIL;
  const envPasswordHash =
    process.env.ENV_LOGIN_PASSWORD_HASH ||
    (process.env.ENV_LOGIN_PASSWORD ? hashPassword(process.env.ENV_LOGIN_PASSWORD) : undefined);

  if (
    envEmail &&
    envPasswordHash &&
    email.toLowerCase() === envEmail.toLowerCase() &&
    passwordHash === envPasswordHash
  ) {
    const envUser = await prisma.user.findUnique({
      where: { email: envEmail },
      select: { id: true },
    });
    if (envUser) {
      return getUserAuthInfo(envUser.id);
    }
    // If env credentials match but user record is missing, treat as invalid to avoid
    // creating implicit users; caller will see 401.
  }
  
  const user = await prisma.user.findUnique({
    where: { email, passwordHash },
    select: { id: true },
  });

  if (!user) return null;

  return getUserAuthInfo(user.id);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

/**
 * Require specific policy
 * 
 * This middleware checks if the authenticated user has the required policy.
 * Policies are checked from the JWT token (no DB query needed).
 * 
 * @param policyKey - Policy key to check (e.g., "dashboard.view")
 */
export function requirePolicy(policyKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Director mode: bypass all policy restrictions
    if (req.user.roles?.some((r) => r.name === "Director")) {
      return next();
    }

    // POLICIES is a const map; its Object.values() becomes a string-literal union.
    // Cast for runtime membership check without forcing callers to use the union type.
    const allowedPolicies = new Set(Object.values(POLICIES) as unknown as string[]);
    if (!allowedPolicies.has(policyKey)) {
      return res.status(500).json({
        code: "INVALID_POLICY",
        message: "Policy key is not in the allowed list",
        requiredPolicy: policyKey,
      });
    }

    // If user has no policies at all, treat as NO_POLICY
    if (!req.user.policies || req.user.policies.length === 0) {
      return res.status(403).json({
        code: "NO_POLICY",
        message: "User has no applicable policy",
      });
    }

    // Check if user has the required policy (from JWT snapshot)
    if (req.user.policies && req.user.policies.includes(policyKey)) {
      return next();
    }

    return res.status(403).json({ 
      code: "NO_POLICY",
      message: "User has no applicable policy",
      requiredPolicy: policyKey
    });
  };
}

export function requireOrgAccess(getTargetOrgUnitId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const targetOrgUnitId = getTargetOrgUnitId(req);
    if (targetOrgUnitId && !req.user.accessibleOrgUnitIds.includes(targetOrgUnitId)) {
      return res.status(403).json({ 
        message: "Access denied", 
        reason: "org_out_of_scope" 
      });
    }

    next();
  };
}

function getSessionId(req: Request): string | null {
  const sessionHeader = req.headers["x-session-id"];
  if (Array.isArray(sessionHeader)) {
    return sessionHeader[0] || null;
  }
  return sessionHeader ? String(sessionHeader) : null;
}

async function ensureUserHasRole(userId: string, roleName: string): Promise<boolean> {
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName },
    select: { id: true },
  });

  const existing = await prisma.userRole.findUnique({
    where: {
      userId_roleId: {
        userId,
        roleId: role.id,
      },
    },
    select: { userId: true },
  });
  if (existing) return false;

  await prisma.userRole.create({
    data: { userId, roleId: role.id },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { policyVersion: { increment: 1 } },
  });

  return true;
}

/**
 * Load user from session
 *
 * This middleware:
 * 1. Extracts sessionId from request headers
 * 2. Loads session from prisma.session
 * 3. Loads user data and policies from DB
 * 4. Attaches req.user
 */
export async function loadUserFromSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = getSessionId(req);

  if (!sessionId) {
    return next(); // No session = unauthenticated request (will be caught by requireAuth)
  }

  try {
    // 1) Fast path: session-level cached auth snapshot
    const cached = await getSessionAuthSnapshot(sessionId);
    if (cached.hit) {
      req.user = {
        ...cached.snapshot,
        loginType: cached.loginType,
        employeeCardNo: cached.employeeCardNo,
      };
      return next();
    }

    // 2) Cache miss: load session from DB (cheap) and compute snapshot (expensive)
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, expiresAt: true, loginType: true, employeeCardNo: true },
    });

    if (!session) {
      return next();
    }

    if (session.expiresAt < new Date()) {
      return res.status(401).json({
        message: "Session expired - please login again",
        reason: "session_expired",
      });
    }

    // Lightweight policyVersion read for cache invalidation (no joins)
    const userVersion = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { policyVersion: true },
    });
    const policyVersion = userVersion?.policyVersion ?? 0;

    let authInfo = await getUserAuthInfo(session.userId);
    if (!authInfo) {
      return next();
    }

    // If user has no policies, auto-attach default role for employee sessions.
    // This matches desired behavior: users with zero policies get default access automatically.
    if (
      (!authInfo.policies || authInfo.policies.length === 0) &&
      !authInfo.roles?.some((r) => r.name === "Director") &&
      (session.loginType === "employee" || Boolean(authInfo.employeeId))
    ) {
      const changed = await ensureUserHasRole(session.userId, "Employee");
      if (changed) {
        authInfo = await getUserAuthInfo(session.userId);
      }
    }

    req.user = {
      ...authInfo,
      loginType: session.loginType === "employee" ? "employee" : "mdo",
      employeeCardNo: session.employeeCardNo || null,
    };

    // Cache the snapshot (session-scoped)
    // Note: we cache the same structure as getUserAuthInfo returns.
    await putSessionAuthSnapshot({
      sessionId: session.id,
      userId: session.userId,
      sessionExpiresAt: session.expiresAt,
      sessionLoginType: session.loginType === "employee" ? "employee" : "mdo",
      sessionEmployeeCardNo: session.employeeCardNo || null,
      policyVersion: (await prisma.user.findUnique({ where: { id: session.userId }, select: { policyVersion: true } }))?.policyVersion ?? policyVersion,
      snapshot: authInfo,
    });
  } catch (error: any) {
    if (error?.code === "P1001") {
      return res.status(503).json({
        message: "Database unavailable. Please try again later.",
        reason: "db_unreachable",
      });
    }
    console.error("[loadUserFromSession] ❌ Session load error:", error);
  }

  return next();
}

// Helper function for org subtree (needed in this file)
async function getOrgSubtreeIds(orgUnitId: string): Promise<string[]> {
  const result = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE org_tree AS (
      SELECT id FROM "OrgUnit" WHERE id = ${orgUnitId}
      UNION ALL
      SELECT o.id FROM "OrgUnit" o
      INNER JOIN org_tree t ON o."parentId" = t.id
    )
    SELECT id FROM org_tree
  `;
  return result.map((row) => row.id);
}
