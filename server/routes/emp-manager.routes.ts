import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-middleware";

export function registerEmpManagerRoutes(app: Express) {
  // POST /api/emp-manager - Assign manager
  app.post("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const { mcardno, mdepartmentId, mdesignationId, morgUnitId } = req.body;

      if (!mcardno) {
        return res.status(400).json({ success: false, message: "mcardno is required" });
      }

      // Insert directly into emp_manager table (no validation from other tables)
      // Use a transaction to ensure we can get the inserted row
      const result = await prisma.$transaction(async (tx) => {
        // Handle empty strings as null
        const deptId = mdepartmentId && mdepartmentId.trim() ? String(mdepartmentId) : null;
        const desigId = mdesignationId && mdesignationId.trim() ? String(mdesignationId) : null;
        const orgId = morgUnitId && morgUnitId.trim() ? String(morgUnitId) : null;
        
        // Generate a unique mid (using timestamp + random for uniqueness)
        const mid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        await tx.$executeRaw`
          INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct")
          VALUES (${mid}, ${String(mcardno)}, ${deptId}, ${desigId}, ${orgId}, false)
        `;

        // Get the latest inserted record for this card number
        const inserted = await tx.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentId: string | null;
          mdesignationId: string | null;
          morgUnitId: string | null;
          mis_extinct: boolean;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
          FROM "emp_manager"
          WHERE "mcardno" = ${String(mcardno)} AND "mis_extinct" = false
          ORDER BY "mid" DESC
          LIMIT 1
        `;

        return inserted[0] || null;
      });

      res.json({
        success: true,
        message: "Manager assigned successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("Assign manager error:", error);
      const errorMessage = error.message || "Failed to assign manager";
      // Check if it's a table not found error
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database." 
        });
      }
      res.status(500).json({ success: false, message: errorMessage });
    }
  });

  // GET /api/emp-manager/by-card/:mcardno - Get managers by card number
  app.get("/api/emp-manager/by-card/:mcardno", requireAuth, async (req, res) => {
    try {
      const { mcardno } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mcardno" = ${mcardno} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by card error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-department/:departmentId - Get managers by department
  app.get("/api/emp-manager/by-department/:departmentId", requireAuth, async (req, res) => {
    try {
      const { departmentId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mdepartmentId" = ${departmentId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by department error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-designation/:designationId - Get managers by designation
  app.get("/api/emp-manager/by-designation/:designationId", requireAuth, async (req, res) => {
    try {
      const { designationId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mdesignationId" = ${designationId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by designation error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-orgunit/:orgUnitId - Get managers by org unit
  app.get("/api/emp-manager/by-orgunit/:orgUnitId", requireAuth, async (req, res) => {
    try {
      const { orgUnitId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "morgUnitId" = ${orgUnitId} AND "mis_extinct" = false
        ORDER BY "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by org unit error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager - Get all active managers
  app.get("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        WHERE "mis_extinct" = false
        ORDER BY "mcardno", "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      // Check if it's a table not found error
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database.",
          data: []
        });
      }
      res.status(500).json({ success: false, message: errorMessage, data: [] });
    }
  });

  // GET /api/emp-manager/all - Get all managers including extinct
  app.get("/api/emp-manager/all", requireAuth, async (req, res) => {
    try {
      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentId: string | null;
        mdesignationId: string | null;
        morgUnitId: string | null;
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct"
        FROM "emp_manager"
        ORDER BY "mis_extinct" ASC, "mcardno", "mid" DESC
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers (including extinct) error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please ensure the table exists in the database.",
          data: []
        });
      }
      res.status(500).json({ success: false, message: errorMessage, data: [] });
    }
  });

  // DELETE /api/emp-manager/:mid - Delete a manager assignment
  app.delete("/api/emp-manager/:mid", requireAuth, async (req, res) => {
    try {
      const { mid } = req.params;

      if (!mid) {
        return res.status(400).json({ 
          success: false, 
          message: "Manager ID (mid) is required" 
        });
      }

      // Check if manager exists
      const existing = await prisma.$queryRaw<Array<{ mid: string }>>`
        SELECT "mid" FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      if (existing.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Manager assignment not found" 
        });
      }

      // Delete the manager assignment
      await prisma.$executeRaw`
        DELETE FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      res.json({ 
        success: true, 
        message: "Manager assignment removed successfully" 
      });
    } catch (error: any) {
      console.error("Delete manager error:", error);
      const errorMessage = error.message || "Failed to delete manager";
      res.status(500).json({ 
        success: false, 
        message: errorMessage 
      });
    }
  });

  // NOTE: Team endpoints (members, tasks, sales-staff) are still in routes-legacy.ts
  // They can be extracted later if needed, but they have complex dependencies
  // on sales-staff functions and manager logic
}

