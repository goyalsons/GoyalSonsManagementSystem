/**
 * Page Management Routes
 * 
 * Admin-only routes for managing UI pages and auto-generating policies
 */

import type { Express } from "express";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { POLICIES } from "../constants/policies";
import {
  createPage,
  updatePage,
  getAllPages,
  getPageById,
  getPageByPath,
  deletePage,
  syncPagesFromNavConfig,
  type CreatePageInput,
} from "../services/page-management.service";

export function registerPagesRoutes(app: Express): void {
  // GET /api/pages - Get all pages with their policies
  app.get("/api/pages", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const pages = await getAllPages();
      res.json(pages);
    } catch (error: any) {
      console.error("Get pages error:", error);
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });

  // GET /api/pages/active - Get only active pages (for navigation)
  app.get("/api/pages/active", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { prisma } = await import("../lib/prisma");
      const pages = await prisma.uiPage.findMany({
        where: { isActive: true },
        include: {
          policies: {
            where: { isActive: true },
            select: {
              id: true,
              key: true,
              description: true,
            },
          },
        },
        orderBy: { order: "asc" },
      });
      res.json(pages);
    } catch (error: any) {
      console.error("Get active pages error:", error);
      res.status(500).json({ message: "Failed to fetch active pages" });
    }
  });

  // GET /api/pages/:id - Get single page
  app.get("/api/pages/:id", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const { id } = req.params;
      const page = await getPageById(id);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error: any) {
      console.error("Get page error:", error);
      res.status(500).json({ message: "Failed to fetch page" });
    }
  });

  // GET /api/pages/by-path/:path - Get page by path
  app.get("/api/pages/by-path/*", requireAuth, requirePolicy(POLICIES.ADMIN_PANEL), async (req, res) => {
    try {
      const path = "/" + req.params[0]; // Reconstruct path
      const page = await getPageByPath(path);
      if (!page) {
        return res.status(404).json({ message: "Page not found" });
      }
      res.json(page);
    } catch (error: any) {
      console.error("Get page by path error:", error);
      res.status(500).json({ message: "Failed to fetch page" });
    }
  });

  // POST /api/pages - Create new page (admin only)
  app.post(
    "/api/pages",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const input: CreatePageInput = req.body;

        // Validate required fields
        if (!input.pageKey || !input.pageName || !input.path || !input.policyPrefix) {
          return res.status(400).json({
            message: "pageKey, pageName, path, and policyPrefix are required",
          });
        }

        const result = await createPage(input);

        res.status(201).json({
          message: "Page created successfully",
          page: result.page,
          policiesCreated: result.policiesCreated,
          errors: result.errors,
        });
      } catch (error: any) {
        console.error("Create page error:", error);
        res.status(500).json({
          message: error.message || "Failed to create page",
        });
      }
    }
  );

  // PUT /api/pages/:id - Update page (admin only)
  app.put(
    "/api/pages/:id",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const { id } = req.params;
        const input: Partial<CreatePageInput> = req.body;

        const page = await updatePage(id, input);

        res.json({
          message: "Page updated successfully",
          page,
        });
      } catch (error: any) {
        console.error("Update page error:", error);
        res.status(500).json({
          message: error.message || "Failed to update page",
        });
      }
    }
  );

  // DELETE /api/pages/:id - Delete page (soft delete, admin only)
  app.delete(
    "/api/pages/:id",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const { id } = req.params;
        await deletePage(id);
        res.json({ message: "Page deleted successfully" });
      } catch (error: any) {
        console.error("Delete page error:", error);
        res.status(500).json({
          message: error.message || "Failed to delete page",
        });
      }
    }
  );

  // POST /api/pages/sync - Sync pages from NAV_CONFIG (admin only, for migration)
  app.post(
    "/api/pages/sync",
    requireAuth,
    requirePolicy(POLICIES.ADMIN_PANEL),
    async (req, res) => {
      try {
        const result = await syncPagesFromNavConfig();
        res.json({
          message: "Pages synced successfully",
          ...result,
        });
      } catch (error: any) {
        console.error("Sync pages error:", error);
        res.status(500).json({
          message: error.message || "Failed to sync pages",
        });
      }
    }
  );
}
