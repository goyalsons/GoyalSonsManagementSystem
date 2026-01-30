import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-middleware";

export function registerEmpManagerRoutes(app: Express) {
  // POST /api/emp-manager - Assign or update manager (upsert - one row per card number)
  app.post("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const { mcardno, mdepartmentIds, mdesignationIds, morgUnitIds } = req.body;

      if (!mcardno) {
        return res.status(400).json({ success: false, message: "mcardno is required" });
      }

      // Convert to arrays and filter empty values
      const deptIds: string[] = (Array.isArray(mdepartmentIds) ? mdepartmentIds : []).filter((id: string) => id && id.trim());
      const desigIds: string[] = (Array.isArray(mdesignationIds) ? mdesignationIds : []).filter((id: string) => id && id.trim());
      const orgIds: string[] = (Array.isArray(morgUnitIds) ? morgUnitIds : []).filter((id: string) => id && id.trim());

      const result = await prisma.$transaction(async (tx) => {
        // Check if manager already exists for this card number
        const existing = await tx.$queryRaw<Array<{
          mid: string;
          mcardno: string;
          mdepartmentIds: string[];
          mdesignationIds: string[];
          morgUnitIds: string[];
          mis_extinct: boolean;
        }>>`
          SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
          FROM "emp_manager"
          WHERE "mcardno" = ${String(mcardno)}
          LIMIT 1
        `;

        if (existing.length > 0) {
          // Update existing record - merge arrays (add new values, keep existing)
          const existingRecord = existing[0];
          const mergedDeptIds = [...new Set([...existingRecord.mdepartmentIds, ...deptIds])];
          const mergedDesigIds = [...new Set([...existingRecord.mdesignationIds, ...desigIds])];
          const mergedOrgIds = [...new Set([...existingRecord.morgUnitIds, ...orgIds])];

          await tx.$executeRaw`
            UPDATE "emp_manager"
            SET "mdepartmentIds" = ${mergedDeptIds}::text[],
                "mdesignationIds" = ${mergedDesigIds}::text[],
                "morgUnitIds" = ${mergedOrgIds}::text[],
                "mis_extinct" = false
            WHERE "mid" = ${existingRecord.mid}
          `;

          return {
            mid: existingRecord.mid,
            mcardno: String(mcardno),
            mdepartmentIds: mergedDeptIds,
            mdesignationIds: mergedDesigIds,
            morgUnitIds: mergedOrgIds,
            mis_extinct: false,
            updated: true
          };
        } else {
          // Insert new record
          const mid = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          
          await tx.$executeRaw`
            INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct")
            VALUES (${mid}, ${String(mcardno)}, ${deptIds}::text[], ${desigIds}::text[], ${orgIds}::text[], false)
          `;

          return {
            mid,
            mcardno: String(mcardno),
            mdepartmentIds: deptIds,
            mdesignationIds: desigIds,
            morgUnitIds: orgIds,
            mis_extinct: false,
            updated: false
          };
        }
      });

      // Increment policyVersion for the user with this card number
      // This will invalidate their session cache and force re-fetching policies
      // which will now include the manager auto-policies
      try {
        const employee = await prisma.employee.findFirst({
          where: { cardNumber: String(mcardno) },
          select: { id: true }
        });
        
        if (employee) {
          await prisma.user.updateMany({
            where: { employeeId: employee.id },
            data: { policyVersion: { increment: 1 } }
          });
          console.log(`[emp-manager] Incremented policyVersion for employee cardNo: ${mcardno}`);
        }
      } catch (pvError) {
        console.error("[emp-manager] Failed to increment policyVersion:", pvError);
        // Non-fatal - continue with success response
      }

      res.json({
        success: true,
        message: result.updated ? "Manager updated successfully" : "Manager assigned successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("Assign manager error:", error);
      const errorMessage = error.message || "Failed to assign manager";
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please run the migration first." 
        });
      }
      res.status(500).json({ success: false, message: errorMessage });
    }
  });

  // GET /api/emp-manager/by-card/:mcardno - Get manager by card number
  app.get("/api/emp-manager/by-card/:mcardno", requireAuth, async (req, res) => {
    try {
      const { mcardno } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE "mcardno" = ${mcardno} AND "mis_extinct" = false
        LIMIT 1
      `;

      res.json({ success: true, data: managers[0] || null });
    } catch (error: any) {
      console.error("Get manager by card error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch manager" });
    }
  });

  // GET /api/emp-manager/by-department/:departmentId - Get managers that include this department
  app.get("/api/emp-manager/by-department/:departmentId", requireAuth, async (req, res) => {
    try {
      const { departmentId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE ${departmentId} = ANY("mdepartmentIds") AND "mis_extinct" = false
        ORDER BY "mcardno"
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by department error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-designation/:designationId - Get managers that include this designation
  app.get("/api/emp-manager/by-designation/:designationId", requireAuth, async (req, res) => {
    try {
      const { designationId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE ${designationId} = ANY("mdesignationIds") AND "mis_extinct" = false
        ORDER BY "mcardno"
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get managers by designation error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to fetch managers" });
    }
  });

  // GET /api/emp-manager/by-orgunit/:orgUnitId - Get managers that include this org unit
  app.get("/api/emp-manager/by-orgunit/:orgUnitId", requireAuth, async (req, res) => {
    try {
      const { orgUnitId } = req.params;

      const managers = await prisma.$queryRaw<Array<{
        mid: string;
        mcardno: string;
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE ${orgUnitId} = ANY("morgUnitIds") AND "mis_extinct" = false
        ORDER BY "mcardno"
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
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE "mis_extinct" = false
        ORDER BY "mcardno"
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please run the migration first.",
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
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
        mis_extinct: boolean;
      }>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        ORDER BY "mis_extinct" ASC, "mcardno"
      `;

      res.json({ success: true, data: managers });
    } catch (error: any) {
      console.error("Get all managers (including extinct) error:", error);
      const errorMessage = error.message || "Failed to fetch managers";
      if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
        return res.status(500).json({ 
          success: false, 
          message: "emp_manager table not found. Please run the migration first.",
          data: []
        });
      }
      res.status(500).json({ success: false, message: errorMessage, data: [] });
    }
  });

  // PUT /api/emp-manager/:mid - Update a manager's assignments (replace arrays)
  app.put("/api/emp-manager/:mid", requireAuth, async (req, res) => {
    try {
      const { mid } = req.params;
      const { mdepartmentIds, mdesignationIds, morgUnitIds } = req.body;

      if (!mid) {
        return res.status(400).json({ 
          success: false, 
          message: "Manager ID (mid) is required" 
        });
      }

      // Convert to arrays and filter empty values
      const deptIds: string[] = (Array.isArray(mdepartmentIds) ? mdepartmentIds : []).filter((id: string) => id && id.trim());
      const desigIds: string[] = (Array.isArray(mdesignationIds) ? mdesignationIds : []).filter((id: string) => id && id.trim());
      const orgIds: string[] = (Array.isArray(morgUnitIds) ? morgUnitIds : []).filter((id: string) => id && id.trim());

      // Check if manager exists
      const existing = await prisma.$queryRaw<Array<{ mid: string; mcardno: string }>>`
        SELECT "mid", "mcardno" FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      if (existing.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Manager assignment not found" 
        });
      }

      // Update the manager
      await prisma.$executeRaw`
        UPDATE "emp_manager"
        SET "mdepartmentIds" = ${deptIds}::text[],
            "mdesignationIds" = ${desigIds}::text[],
            "morgUnitIds" = ${orgIds}::text[]
        WHERE "mid" = ${mid}
      `;

      res.json({ 
        success: true, 
        message: "Manager updated successfully",
        data: {
          mid,
          mcardno: existing[0].mcardno,
          mdepartmentIds: deptIds,
          mdesignationIds: desigIds,
          morgUnitIds: orgIds,
          mis_extinct: false
        }
      });
    } catch (error: any) {
      console.error("Update manager error:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to update manager" 
      });
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

      // Check if manager exists and get card number for policyVersion update
      const existing = await prisma.$queryRaw<Array<{ mid: string; mcardno: string }>>`
        SELECT "mid", "mcardno" FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      if (existing.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Manager assignment not found" 
        });
      }

      const mcardno = existing[0].mcardno;

      // Delete the manager assignment
      await prisma.$executeRaw`
        DELETE FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      // Increment policyVersion to invalidate cache and remove manager policies
      try {
        const employee = await prisma.employee.findFirst({
          where: { cardNumber: mcardno },
          select: { id: true }
        });
        
        if (employee) {
          await prisma.user.updateMany({
            where: { employeeId: employee.id },
            data: { policyVersion: { increment: 1 } }
          });
          console.log(`[emp-manager] Incremented policyVersion after delete for cardNo: ${mcardno}`);
        }
      } catch (pvError) {
        console.error("[emp-manager] Failed to increment policyVersion after delete:", pvError);
      }

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

