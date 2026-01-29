import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy, hashPassword } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";

export function registerSettingsRoutes(app: Express): void {
  app.get("/api/settings", requireAuth, requirePolicy(POLICIES.SETTINGS_VIEW), async (req, res) => {
    try {
      let settings = await prisma.userSettings.findUnique({
        where: { userId: req.user!.id },
      });

      if (!settings) {
        settings = await prisma.userSettings.create({
          data: { userId: req.user!.id },
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("Settings error:", error);
      res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", requireAuth, requirePolicy(POLICIES.SETTINGS_VIEW), async (req, res) => {
    try {
      const { theme, emailNotifications, smsNotifications, loginMethod, timezone, language } = req.body;

      const settings = await prisma.userSettings.upsert({
        where: { userId: req.user!.id },
        update: { 
          theme, 
          emailNotifications, 
          smsNotifications, 
          loginMethod, 
          timezone, 
          language 
        },
        create: { 
          userId: req.user!.id, 
          theme, 
          emailNotifications, 
          smsNotifications, 
          loginMethod, 
          timezone, 
          language 
        },
      });

      res.json(settings);
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  app.put("/api/settings/profile", requireAuth, requirePolicy(POLICIES.SETTINGS_VIEW), async (req, res) => {
    try {
      const { name, phone } = req.body;

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { name, phone },
      });

      res.json({ success: true, user });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put("/api/settings/password", requireAuth, requirePolicy(POLICIES.SETTINGS_VIEW), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentHash = hashPassword(currentPassword);
      if (currentHash !== user.passwordHash) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      await prisma.user.update({
        where: { id: req.user!.id },
        data: { passwordHash: hashPassword(newPassword) },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
}

