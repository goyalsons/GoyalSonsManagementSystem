import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";
import { authorize, getUserAuthInfo } from "./authorization";
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

export function requirePolicy(policyKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    if (!req.user.policies.includes(policyKey)) {
      return res.status(403).json({ 
        message: "Access denied", 
        reason: "missing_policy",
        required: policyKey 
      });
    }

    next();
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

export function requireMDO(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (req.user.loginType === "employee") {
    return res.status(403).json({ 
      message: "Access denied", 
      reason: "employee_restricted" 
    });
  }

  next();
}

export async function loadUserFromSession(req: Request, res: Response, next: NextFunction) {
  const sessionToken = req.headers.authorization?.replace("Bearer ", "") || 
                       (req.session as any)?.userId;

  if (!sessionToken) {
    return next();
  }

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionToken },
      include: { user: { include: { employee: true } } },
    });

    if (session && session.expiresAt > new Date()) {
      const userInfo = await getUserAuthInfo(session.userId);
      if (userInfo) {
        req.user = {
          ...userInfo,
          loginType: (session.loginType as "mdo" | "employee") || "mdo",
          employeeCardNo: session.employeeCardNo || null,
          employeeId: session.user.employeeId || null,
        };
      }
    }
  } catch (error) {
    console.error("Session load error:", error);
  }

  next();
}
