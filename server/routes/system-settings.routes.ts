import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerSystemSettingsRoutes(app: Express): void {
  app.get("/api/admin/system-settings", requireAuth, requirePolicy("admin.master-settings.view"), async (req, res) => {
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

  app.get("/api/admin/system-settings/:key", requireAuth, requirePolicy("admin.master-settings.view"), async (req, res) => {
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

  app.put("/api/admin/system-settings/:key", requireAuth, requirePolicy("admin.master-settings.view"), async (req, res) => {
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
}

