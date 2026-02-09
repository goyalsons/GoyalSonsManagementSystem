import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy, requireAnyPolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import { validatePolicyKey } from "../lib/validation";
import { logPolicyCreation } from "../lib/audit-log";

export function registerPoliciesRoutes(app: Express): void {
  // GET /api/policies - Get all policies (for management page or role-editing)
  app.get("/api/policies", requireAuth, requireAnyPolicy(POLICIES.VIEW_POLICIES, POLICIES.ROLES_ASSIGNED_VIEW, POLICIES.ADMIN_PANEL), async (req, res) => {
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

  // POST /api/policies - Create new policy
  app.post("/api/policies", requireAuth, requirePolicy(POLICIES.CREATE_POLICY), async (req, res) => {
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

      const allowedPolicies = new Set(Object.values(POLICIES));
      if (!allowedPolicies.has(key)) {
        return res.status(400).json({ message: "Policy key is not in the allowed list" });
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

  // PATCH /api/policies/:id - Update policy (description, category)
  app.patch("/api/policies/:id", requireAuth, requirePolicy(POLICIES.EDIT_POLICY), async (req, res) => {
    try {
      const { id } = req.params;
      const { description, category } = req.body;

      const policy = await prisma.policy.findUnique({ where: { id } });
      if (!policy) return res.status(404).json({ message: "Policy not found" });

      const data: { description?: string | null; category?: string | null } = {};
      if (description !== undefined) data.description = description ? String(description).trim() || null : null;
      if (category !== undefined) data.category = category ? String(category).trim() || null : null;

      const updated = await prisma.policy.update({
        where: { id },
        data,
      });
      res.json(updated);
    } catch (error) {
      console.error("Update policy error:", error);
      res.status(500).json({ message: "Failed to update policy" });
    }
  });
}

