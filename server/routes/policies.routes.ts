import type { Express } from "express";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerPoliciesRoutes(app: Express): void {
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
}

