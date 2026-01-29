/**
 * Policy Guard Middleware
 * 
 * Centralized policy validation middleware.
 * Policies are checked strictly from req.user.policies (cached auth snapshot).
 *
 * Performance/Security notes:
 * - No DB queries on the request path (including the "deny" path).
 * - Validate policy keys against a precomputed allowlist to catch typos/misconfig early.
 */

import { Request, Response, NextFunction } from "express";
import { POLICIES } from "../constants/policies";

// Precompute allowed policy keys once (module scope) to avoid per-request work.
const ALLOWED_POLICY_KEYS = new Set(Object.values(POLICIES) as unknown as string[]);

function assertValidPolicyKey(policyKey: string): true | { error: any } {
  if (ALLOWED_POLICY_KEYS.has(policyKey)) return true;
  return {
    error: {
      code: "INVALID_POLICY",
      message: "Policy key is not in the allowed list",
      requiredPolicy: policyKey,
    },
  };
}

function hasPolicy(userPolicies: string[] | undefined, policyKey: string): boolean {
  if (!userPolicies || userPolicies.length === 0) return false;
  return userPolicies.includes(policyKey);
}

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

    const valid = assertValidPolicyKey(policyKey);
    if (valid !== true) {
      return res.status(500).json(valid.error);
    }

    // Check if user has the required policy (from cached auth snapshot)
    if (hasPolicy(req.user.policies, policyKey)) {
      return next();
    }

    // Deny fast: do not hit DB on missing policy.
    return res.status(403).json({
      message: "Access denied",
      reason: "missing_policy",
      requiredPolicy: policyKey,
    });
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

    for (const policyKey of policyKeys) {
      const valid = assertValidPolicyKey(policyKey);
      if (valid !== true) return res.status(500).json(valid.error);
    }

    const userPolicies = req.user.policies || [];
    if (userPolicies.length > 0) {
      // Build a Set once for multi-key checks.
      const userPolicySet = new Set(userPolicies);
      for (const policyKey of policyKeys) {
        if (userPolicySet.has(policyKey)) return next();
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

    for (const policyKey of policyKeys) {
      const valid = assertValidPolicyKey(policyKey);
      if (valid !== true) return res.status(500).json(valid.error);
    }

    const userPolicies = req.user.policies || [];
    if (userPolicies.length === 0) {
      return res.status(403).json({
        message: "Access denied",
        reason: "missing_policies",
        requiredPolicies: policyKeys,
      });
    }

    // Check if user has all required policies (Set for O(1) lookups)
    const userPolicySet = new Set(userPolicies);
    const hasAll = policyKeys.every((k) => userPolicySet.has(k));

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
