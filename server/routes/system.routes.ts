/**
 * System health and operational endpoints.
 * GET /api/system/health - RBAC and DB consistency (no auth, for load balancers).
 * GET /api/system/health/dashboard - Director-only diagnostics (requires system.health.view).
 */

import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { POLICY_KEYS_FLAT } from "../../shared/policies";
import { getAuthCacheSize } from "../lib/auth-cache";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";

const SEED_VERSION = "1.0";

async function getHealthData() {
  const registryCount = POLICY_KEYS_FLAT.length;
  const dbPolicies = await prisma.policy.findMany({ select: { key: true } });
  const dbPolicyKeys = new Set(dbPolicies.map((p) => p.key));
  const missingPolicies = POLICY_KEYS_FLAT.filter((k) => !dbPolicyKeys.has(k));
  const rolesCount = await prisma.role.count();
  const cacheSize = getAuthCacheSize();
  return {
    registryPolicyCount: registryCount,
    dbPolicyCount: dbPolicies.length,
    missingPolicies,
    rolesCount,
    cacheSize,
    timestamp: new Date().toISOString(),
  };
}

export function registerSystemRoutes(app: Express): void {
  app.get("/api/system/health", async (_req, res) => {
    try {
      const data = await getHealthData();
      res.status(200).json({
        status: "ok",
        timestamp: data.timestamp,
        rbac: {
          policyRegistryCount: data.registryPolicyCount,
          dbPolicyCount: data.dbPolicyCount,
          rolesCount: data.rolesCount,
          missingCriticalPolicies: data.missingPolicies.length > 0 ? data.missingPolicies : undefined,
        },
        seedVersion: SEED_VERSION,
        cache: { type: "in-memory", size: data.cacheSize },
      });
    } catch (error: any) {
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error?.message ?? "Health check failed",
      });
    }
  });

  app.get("/api/system/health/dashboard", requireAuth, requirePolicy(POLICIES.SYSTEM_HEALTH_VIEW), async (_req, res) => {
    try {
      const data = await getHealthData();
      res.status(200).json(data);
    } catch (error: any) {
      res.status(500).json({ message: error?.message ?? "Health check failed" });
    }
  });
}
