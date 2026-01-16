import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { getUserAuthInfo } from "./authorization";
import * as crypto from "crypto";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        isSuperAdmin: boolean;
        orgUnitId: string | null;
        roles: { id: string; name: string }[];
        policies: string[];
        accessibleOrgUnitIds: string[];
        loginType: "mdo" | "employee";
        employeeCardNo: string | null;
        employeeId: string | null;
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
 * SuperAdmin bypasses all policy checks.
 * 
 * @param policyKey - Policy key to check (e.g., "users.view")
 */
export function requirePolicy(policyKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // If user has no policies at all, treat as NO_POLICY
    if (!req.user.policies || req.user.policies.length === 0) {
      return res.status(403).json({
        code: "NO_POLICY",
        message: "User has no applicable policy",
      });
    }

    // SuperAdmin bypasses all policy checks
    if (req.user.isSuperAdmin) {
      return next();
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

    if (req.user.isSuperAdmin) {
      return next();
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

// MDO email whitelist - users with these emails are automatically assigned MDO role
const MDO_EMAIL_WHITELIST = [
  "ankush@goyalsons.com",
  "abhishek@goyalsons.com",
  "mukesh@goyalsons.com",
].map(email => email.toLowerCase());

export function requireMDO(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  // Check if user is employee login type (card-based login) - block these
  if (req.user.loginType === "employee") {
    return res.status(403).json({ 
      message: "Access denied", 
      reason: "employee_restricted" 
    });
  }

  // If loginType is "mdo", allow access (all Google OAuth users have loginType="mdo")
  if (req.user.loginType === "mdo") {
    return next();
  }

  // For other login types, check email whitelist (backward compatibility)
  const userEmail = req.user.email?.toLowerCase();
  const isMDOEmail = MDO_EMAIL_WHITELIST.includes(userEmail || "");

  // Check if ENV_LOGIN_EMAIL is set - only that user gets MDO access (unless whitelisted)
  const envLoginEmail = process.env.ENV_LOGIN_EMAIL;
  if (envLoginEmail && !isMDOEmail) {
    if (userEmail !== envLoginEmail.toLowerCase()) {
      return res.status(403).json({ 
        message: "Access denied. Only authorized MDO users can access this resource.", 
        reason: "mdo_access_restricted"
      });
    }
  }

  // If email is in whitelist or matches ENV_LOGIN_EMAIL, allow access
  next();
}

function getSessionId(req: Request): string | null {
  const sessionHeader = req.headers["x-session-id"];
  if (Array.isArray(sessionHeader)) {
    return sessionHeader[0] || null;
  }
  return sessionHeader ? String(sessionHeader) : null;
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

    const authInfo = await getUserAuthInfo(session.userId);
    if (!authInfo) {
      return next();
    }

    req.user = {
      ...authInfo,
      loginType: session.loginType === "employee" ? "employee" : "mdo",
      employeeCardNo: session.employeeCardNo || null,
    };
  } catch (error) {
    console.error("[loadUserFromSession] ❌ Session load error:", error);
  }

  next();
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
