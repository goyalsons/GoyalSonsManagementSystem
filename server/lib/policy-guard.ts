/**
 * Policy Guard Middleware
 * 
 * Centralized policy validation middleware.
 * Policies are loaded from database/JWT, not hardcoded.
 */

import { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";

/**
 * Policy guard middleware factory
 * 
 * Usage:
 *   app.get("/api/resource", requireAuth, policyGuard("resource.view"), handler)
 * 
 * @param policyKey - Policy key to check (e.g., "help_tickets.view")
 * @returns Express middleware function
 */
export function policyGuard(policyKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // SuperAdmin bypasses all policy checks
    if (req.user.isSuperAdmin) {
      return next();
    }

    // Check if user has the required policy (from JWT snapshot)
    if (req.user.policies && req.user.policies.includes(policyKey)) {
      return next();
    }

    // Policy not found in JWT - verify it exists in DB and check user again
    // This handles cases where policy was added after JWT was issued
    try {
      const policy = await prisma.policy.findUnique({
        where: { key: policyKey },
        select: { isActive: true },
      });

      if (!policy) {
        return res.status(403).json({
          message: "Access denied",
          reason: "policy_not_found",
          requiredPolicy: policyKey,
        });
      }

      if (!policy.isActive) {
        return res.status(403).json({
          message: "Access denied",
          reason: "policy_inactive",
          requiredPolicy: policyKey,
        });
      }

      // Policy exists but user doesn't have it
      return res.status(403).json({
        message: "Access denied",
        reason: "missing_policy",
        requiredPolicy: policyKey,
      });
    } catch (error) {
      console.error("[Policy Guard] Error checking policy:", error);
      return res.status(500).json({
        message: "Internal server error",
        reason: "policy_check_failed",
      });
    }
  };
}

/**
 * Multiple policy guard (user needs ANY of the policies)
 * 
 * Usage:
 *   app.get("/api/resource", requireAuth, policyGuardAny(["resource.view", "resource.admin"]), handler)
 */
export function policyGuardAny(policyKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    // Check if user has any of the required policies
    for (const policyKey of policyKeys) {
      if (req.user.policies && req.user.policies.includes(policyKey)) {
        return next();
      }
    }

    return res.status(403).json({
      message: "Access denied",
      reason: "missing_policy",
      requiredPolicies: policyKeys,
    });
  };
}

/**
 * Multiple policy guard (user needs ALL of the policies)
 * 
 * Usage:
 *   app.post("/api/resource", requireAuth, policyGuardAll(["resource.create", "resource.approve"]), handler)
 */
export function policyGuardAll(policyKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    // Check if user has all required policies
    const hasAll = policyKeys.every(
      (policyKey) => req.user.policies && req.user.policies.includes(policyKey)
    );

    if (!hasAll) {
      return res.status(403).json({
        message: "Access denied",
        reason: "missing_policies",
        requiredPolicies: policyKeys,
      });
    }

    return next();
  };
}
