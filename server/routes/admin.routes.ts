import type { Express } from "express";
import path from "path";
import fs from "fs";
import express from "express";
import multer from "multer";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { refreshSyncSchedules, triggerManualSync } from "../auto-sync";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (_req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [".csv", ".json", ".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, JSON, and Excel files are allowed"));
    }
  },
});

export function registerAdminRoutes(app: Express): void {
  app.get("/api/admin/routing", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const routes = await prisma.apiRouting.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json(routes);
    } catch (error) {
      console.error("Get routes error:", error);
      res.status(500).json({ message: "Failed to fetch routes" });
    }
  });

  app.post("/api/admin/upload", requireAuth, requirePolicy("admin.panel"), (req: any, res, next) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.message === "Only CSV, JSON, and Excel files are allowed") {
          return res.status(400).json({ message: err.message });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size exceeds 10MB limit" });
        }
        return res.status(400).json({ message: err.message || "Upload failed" });
      }
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const filePath = `/uploads/${req.file.filename}`;
      res.json({ 
        success: true, 
        filePath,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    });
  });

  app.use("/uploads", requireAuth, express.static(uploadsDir));

  app.post("/api/admin/routing", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { name, description, endpoint, method, sourceType, csvFilePath, csvUrl, headers, syncEnabled, syncIntervalHours, syncIntervalMinutes } = req.body;

      const route = await prisma.apiRouting.create({
        data: {
          name,
          description,
          endpoint,
          method: method || "GET",
          sourceType: sourceType || "api",
          csvFilePath,
          csvUrl,
          headers,
          syncEnabled: syncEnabled ?? true,
          syncIntervalHours: syncIntervalHours ?? 0,
          syncIntervalMinutes: syncIntervalMinutes ?? 10,
        },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json(route);
    } catch (error: any) {
      console.error("Create route error:", error);
      if (error.code === 'P2002') {
        res.status(400).json({ message: "A data source with this name already exists. Please use a different name." });
      } else {
        res.status(500).json({ message: "Failed to create route" });
      }
    }
  });

  app.put("/api/admin/routing/:id", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, endpoint, method, sourceType, csvFilePath, csvUrl, headers, syncEnabled, syncIntervalHours, syncIntervalMinutes, isActive, status } = req.body;

      const route = await prisma.apiRouting.update({
        where: { id },
        data: {
          name,
          description,
          endpoint,
          method,
          sourceType,
          csvFilePath,
          csvUrl,
          headers,
          syncEnabled,
          syncIntervalHours,
          syncIntervalMinutes,
          isActive,
          status,
        },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json(route);
    } catch (error) {
      console.error("Update route error:", error);
      res.status(500).json({ message: "Failed to update route" });
    }
  });

  app.delete("/api/admin/routing/:id", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      await prisma.apiRouting.delete({
        where: { id },
      });

      refreshSyncSchedules().catch(err => console.error("[Auto-Sync] Error refreshing schedules:", err));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete route error:", error);
      res.status(500).json({ message: "Failed to delete route" });
    }
  });

  app.post("/api/admin/routing/:id/test", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      const route = await prisma.apiRouting.findUnique({
        where: { id },
      });

      if (!route) {
        return res.status(404).json({ success: false, message: "Route not found" });
      }

      const sourceUrl = route.sourceType === "api" ? route.endpoint : (route.csvUrl || route.csvFilePath);
      
      if (!sourceUrl) {
        await prisma.apiRouting.update({
          where: { id },
          data: { 
            lastTestAt: new Date(),
            lastTestStatus: "failed",
          },
        });
        return res.json({ success: false, message: "No source URL configured" });
      }

      try {
        if (sourceUrl.startsWith("/uploads/")) {
          const filePath = path.join(process.cwd(), sourceUrl);
          
          if (!fs.existsSync(filePath)) {
            await prisma.apiRouting.update({
              where: { id },
              data: { 
                lastTestAt: new Date(),
                lastTestStatus: "failed",
              },
            });
            return res.json({ success: false, message: "File not found on server" });
          }

          const fileContent = fs.readFileSync(filePath, "utf-8");
          const ext = path.extname(filePath).toLowerCase();
          let recordCount = 0;

          let sampleRecord: Record<string, any> | null = null;
          let fields: string[] = [];

          if (ext === ".csv") {
            const lines = fileContent.trim().split("\n");
            recordCount = Math.max(0, lines.length - 1);
            if (lines.length > 1) {
              const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
              const firstDataLine = lines[1].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
              fields = headers;
              sampleRecord = {};
              headers.forEach((h, i) => { sampleRecord![h] = firstDataLine[i] || ''; });
            }
          } else if (ext === ".json") {
            try {
              const data = JSON.parse(fileContent);
              const records = Array.isArray(data) ? data : [data];
              recordCount = records.length;
              if (records.length > 0) {
                sampleRecord = records[0];
                fields = sampleRecord ? Object.keys(sampleRecord) : [];
              }
            } catch {
              await prisma.apiRouting.update({
                where: { id },
                data: { 
                  lastTestAt: new Date(),
                  lastTestStatus: "failed",
                },
              });
              return res.json({ success: false, message: "Invalid JSON format" });
            }
          } else if (ext === ".xlsx" || ext === ".xls") {
            recordCount = 1;
          }

          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "success",
              status: "tested",
            },
          });

          return res.json({ 
            success: true, 
            message: `File accessible. Found ${recordCount} ${ext === ".csv" ? "data rows" : "records"}.`,
            recordCount,
            sampleRecord,
            fields,
          });
        }

        const headers: Record<string, string> = {};
        if (route.sourceType === "api") {
          headers["Accept"] = "application/json";
        }
        if (route.headers && typeof route.headers === "object") {
          Object.assign(headers, route.headers);
        }

        const response = await fetch(sourceUrl, {
          method: route.method || "GET",
          headers,
        });

        if (response.ok) {
          const responseText = await response.text();
          let records: any[] = [];
          let sampleRecord: Record<string, any> | null = null;
          let fields: string[] = [];

          const looksLikeCsv = route.sourceType === "csv" || 
            (responseText.trim().split('\n')[0]?.includes(',') && !responseText.trim().startsWith('{') && !responseText.trim().startsWith('['));

          if (looksLikeCsv) {
            const lines = responseText.trim().split("\n");
            const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
            fields = csvHeaders;
            
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
              const record: Record<string, any> = {};
              csvHeaders.forEach((header, idx) => {
                record[header] = values[idx] || '';
              });
              records.push(record);
            }
            
            sampleRecord = records.length > 0 ? records[0] : null;
          } else {
            try {
              const data = JSON.parse(responseText);
              records = Array.isArray(data) 
                ? data 
                : (data.master_for_google || data.data || data.records || []);
              sampleRecord = Array.isArray(records) && records.length > 0 ? records[0] : null;
              fields = sampleRecord ? Object.keys(sampleRecord) : [];
            } catch (jsonError) {
              await prisma.apiRouting.update({
                where: { id },
                data: { 
                  lastTestAt: new Date(),
                  lastTestStatus: "failed",
                },
              });
              return res.json({ 
                success: false, 
                message: `Failed to parse response: Invalid format (not valid JSON or CSV)` 
              });
            }
          }

          const recordCount = records.length;
          
          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "success",
              status: "tested",
            },
          });

          res.json({ 
            success: true, 
            message: `Connection successful. Found ${recordCount} records.`,
            recordCount,
            sampleRecord,
            fields,
          });
        } else {
          await prisma.apiRouting.update({
            where: { id },
            data: { 
              lastTestAt: new Date(),
              lastTestStatus: "failed",
            },
          });
          res.json({ 
            success: false, 
            message: `HTTP ${response.status}: ${response.statusText}` 
          });
        }
      } catch (fetchError: any) {
        await prisma.apiRouting.update({
          where: { id },
          data: { 
            lastTestAt: new Date(),
            lastTestStatus: "failed",
          },
        });
        res.json({ 
          success: false, 
          message: `Connection failed: ${fetchError.message}` 
        });
      }
    } catch (error) {
      console.error("Test route error:", error);
      res.status(500).json({ success: false, message: "Failed to test route" });
    }
  });

  app.post("/api/admin/routing/:id/sync", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { id } = req.params;

      const route = await prisma.apiRouting.findUnique({
        where: { id },
      });

      if (!route) {
        return res.status(404).json({ message: "Route not found" });
      }

      await prisma.apiRouting.update({
        where: { id },
        data: { 
          lastSyncAt: new Date(),
          lastSyncStatus: "in_progress",
        },
      });

      setImmediate(() => {
        triggerManualSync(id).catch((err) => {
          console.error(`[Sync] Background sync failed for ${route.name}:`, err);
        });
      });

      res.status(202).json({ 
        success: true, 
        message: `Sync started for ${route.name}. It will continue running in the background.` 
      });
    } catch (error) {
      console.error("Sync route error:", error);
      res.status(500).json({ message: "Failed to start sync" });
    }
  });
}

