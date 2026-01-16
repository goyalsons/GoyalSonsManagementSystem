import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validatePolicyKey } from "../lib/validation";
import { logPolicyCreation } from "../lib/audit-log";

export function registerPoliciesRoutes(app: Express): void {
  // GET /api/policies - Get all policies grouped by category
  app.get("/api/policies", requireAuth, async (req, res) => {
    try {
      const policies = await prisma.policy.findMany({
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
  app.post("/api/policies", requireAuth, requirePolicy(POLICIES.ADMIN_ROLES), async (req, res) => {
    try {
      const { key, description, category } = req.body;

      if (!key) {
        return res.status(400).json({ message: "Policy key is required" });
      }

      // Validate policy key format
      const validation = validatePolicyKey(key);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const policy = await prisma.policy.create({
        data: {
          key,
          description: description || null,
          category: category || null
        }
      });

      // Log policy creation
      await logPolicyCreation(req.user!.id, policy.id, policy.key);

      res.status(201).json(policy);
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({ message: "Policy with this key already exists" });
      }
      console.error("Create policy error:", error);
      res.status(500).json({ message: "Failed to create policy" });
    }
  });
}

