import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { replaceUserRoles } from "../lib/role-replacement";
import { invalidateSessionsForUser } from "../lib/auth-cache";

export function registerEmpManagerRoutes(app: Express) {
  // POST /api/emp-manager - Assign or update manager
  app.post("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const { mcardno, mdepartmentIds, mdesignationIds, morgUnitIds } = req.body;

      if (!mcardno) {
        return res.status(400).json({ success: false, message: "mcardno is required" });
      }

      const deptIds: string[] = (Array.isArray(mdepartmentIds) ? mdepartmentIds : []).filter((id: string) => id && id.trim());
      const desigIds: string[] = (Array.isArray(mdesignationIds) ? mdesignationIds : []).filter((id: string) => id && id.trim());
      const orgIds: string[] = (Array.isArray(morgUnitIds) ? morgUnitIds : []).filter((id: string) => id && id.trim());

      const result = await prisma.$transaction(async (tx) => {
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
          const managerUser = await prisma.user.findFirst({
            where: { employeeId: employee.id },
            select: { id: true }
          });
          const storeManagerRole = await prisma.role.findUnique({
            where: { name: "Store Manager" },
            select: { id: true }
          });
          if (managerUser && storeManagerRole) {
            await replaceUserRoles(prisma, managerUser.id, storeManagerRole.id);
            invalidateSessionsForUser(managerUser.id);
          }
        }
      } catch (pvError) {
        console.error("[emp-manager] Failed to increment policyVersion or assign role:", pvError);
      }

      res.json({
        success: true,
        message: result.updated ? "Manager updated successfully" : "Manager assigned successfully",
        data: result,
      });
    } catch (error: any) {
      console.error("Assign manager error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to assign manager" });
    }
  });

  // GET /api/emp-manager/my-team - Get team members for logged-in manager
  app.get("/api/emp-manager/my-team", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      
      if (!user.employeeId) {
        return res.json({ success: true, data: [] });
      }
      
      const employee = await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { cardNumber: true }
      });
      
      if (!employee?.cardNumber) {
        return res.json({ success: true, data: [] });
      }
      
      const managerAssignments = await prisma.$queryRaw<Array<{
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
      }>>`
        SELECT "mdepartmentIds", "mdesignationIds", "morgUnitIds"
        FROM "emp_manager"
        WHERE "mcardno" = ${employee.cardNumber} AND "mis_extinct" = false
      `;
      
      if (managerAssignments.length === 0) {
        return res.json({ success: true, data: [] });
      }
      
      const a = managerAssignments[0];
      console.log("[my-team] Manager cardNo:", employee.cardNumber);
      console.log("[my-team] Manager assignment:", JSON.stringify(a));
      
      // Debug: Check what orgUnits are in the assignment
      if (a.morgUnitIds?.length > 0) {
        const orgUnits = await prisma.orgUnit.findMany({
          where: { id: { in: a.morgUnitIds } },
          select: { id: true, name: true }
        });
        console.log("[my-team] OrgUnits in assignment:", JSON.stringify(orgUnits));
      }
      
      const conditions: any[] = [];
      
      if (a.mdepartmentIds?.length > 0) {
        conditions.push({ departmentId: { in: a.mdepartmentIds } });
      }
      if (a.mdesignationIds?.length > 0) {
        conditions.push({ designationId: { in: a.mdesignationIds } });
      }
      if (a.morgUnitIds?.length > 0) {
        const assignedOrgUnits = await prisma.orgUnit.findMany({
          where: { id: { in: a.morgUnitIds } },
          select: { id: true, name: true, code: true }
        });
        const namesAndCodes = assignedOrgUnits.flatMap(o => [o.name?.trim(), o.code?.trim()]).filter(Boolean);
        const allMatchingOrgUnitIds = namesAndCodes.length > 0
          ? await prisma.orgUnit.findMany({
              where: {
                OR: [
                  { id: { in: a.morgUnitIds } },
                  { name: { in: namesAndCodes } },
                  { code: { in: namesAndCodes } }
                ]
              },
              select: { id: true }
            }).then(rows => rows.map(r => r.id))
          : a.morgUnitIds;
        const uniqueIds = [...new Set([...a.morgUnitIds, ...(Array.isArray(allMatchingOrgUnitIds) ? allMatchingOrgUnitIds : [])])];
        conditions.push({ orgUnitId: { in: uniqueIds } });
      }
      
      console.log("[my-team] Conditions:", JSON.stringify(conditions));
      
      if (conditions.length === 0) {
        console.log("[my-team] No conditions - returning empty");
        return res.json({ success: true, data: [] });
      }
      
      const whereClause = {
        OR: conditions,
        status: "ACTIVE",
        lastInterviewDate: null,
        cardNumber: { not: null },
        NOT: { cardNumber: employee.cardNumber }
      };
      console.log("[my-team] Where clause:", JSON.stringify(whereClause));
      
      const teamMembers = await prisma.employee.findMany({
        where: whereClause,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          cardNumber: true,
          designation: { select: { name: true } },
          department: { select: { name: true } },
        },
        orderBy: { firstName: 'asc' },
      });
      
      console.log("[my-team] Found", teamMembers.length, "team members");
      res.json({ success: true, data: teamMembers });
    } catch (error: any) {
      console.error("Get my team error:", error);
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  });

  // GET /api/emp-manager/lookup?q=cardNoOrName - Search by card no or name; returns employee + isUnderYou
  app.get("/api/emp-manager/lookup", requireAuth, requirePolicy("attendance.team.view"), async (req, res) => {
    try {
      const q = (req.query.q as string)?.trim();
      if (!q) {
        return res.json({ success: true, found: false });
      }
      const user = req.user!;
      if (!user.employeeId) {
        return res.json({ success: true, found: false });
      }
      const managerEmployee = await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { cardNumber: true },
      });
      if (!managerEmployee?.cardNumber) {
        return res.json({ success: true, found: false });
      }
      const managerAssignments = await prisma.$queryRaw<Array<{
        mdepartmentIds: string[];
        mdesignationIds: string[];
        morgUnitIds: string[];
      }>>`
        SELECT "mdepartmentIds", "mdesignationIds", "morgUnitIds"
        FROM "emp_manager"
        WHERE "mcardno" = ${managerEmployee.cardNumber} AND "mis_extinct" = false
      `;
      const teamWhere: any = { OR: [] };
      if (managerAssignments.length > 0) {
        const a = managerAssignments[0];
        if (a.mdepartmentIds?.length > 0) teamWhere.OR.push({ departmentId: { in: a.mdepartmentIds } });
        if (a.mdesignationIds?.length > 0) teamWhere.OR.push({ designationId: { in: a.mdesignationIds } });
        if (a.morgUnitIds?.length > 0) teamWhere.OR.push({ orgUnitId: { in: a.morgUnitIds } });
      }
      if (teamWhere.OR.length === 0) {
        return res.json({ success: true, found: false });
      }
      const teamIds = await prisma.employee.findMany({
        where: { ...teamWhere, lastInterviewDate: null, cardNumber: { not: null } },
        select: { id: true },
      }).then((rows) => new Set(rows.map((r) => r.id)));
      const isNumeric = /^\d+$/.test(q);
      let match: { id: string; cardNumber: string | null; firstName: string; lastName: string | null } | null = null;
      if (isNumeric) {
        match = await prisma.employee.findFirst({
          where: {
            OR: [
              { cardNumber: q },
              { cardNumber: { contains: q, mode: "insensitive" } },
              { employeeCode: q },
            ],
            lastInterviewDate: null,
            cardNumber: { not: null },
          },
          select: { id: true, cardNumber: true, firstName: true, lastName: true },
        });
      }
      if (!match) {
        match = await prisma.employee.findFirst({
          where: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { cardNumber: { contains: q, mode: "insensitive" } },
            ],
            lastInterviewDate: null,
            cardNumber: { not: null },
          },
          select: { id: true, cardNumber: true, firstName: true, lastName: true },
        });
      }
      if (!match) {
        return res.json({ success: true, found: false });
      }
      const isUnderYou = teamIds.has(match.id);
      return res.json({
        success: true,
        found: true,
        employee: {
          id: match.id,
          cardNumber: match.cardNumber,
          firstName: match.firstName,
          lastName: match.lastName,
        },
        isUnderYou,
      });
    } catch (error: any) {
      console.error("Lookup member error:", error);
      res.status(500).json({ success: false, message: error.message || "Lookup failed" });
    }
  });

  // GET /api/emp-manager/by-card/:mcardno
  app.get("/api/emp-manager/by-card/:mcardno", requireAuth, async (req, res) => {
    try {
      const { mcardno } = req.params;
      const managers = await prisma.$queryRaw<Array<any>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE "mcardno" = ${mcardno} AND "mis_extinct" = false
        LIMIT 1
      `;
      res.json({ success: true, data: managers[0] || null });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // GET /api/emp-manager
  app.get("/api/emp-manager", requireAuth, async (req, res) => {
    try {
      const managers = await prisma.$queryRaw<Array<any>>`
        SELECT "mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct"
        FROM "emp_manager"
        WHERE "mis_extinct" = false
        ORDER BY "mcardno"
      `;
      res.json({ success: true, data: managers });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  });

  // PUT /api/emp-manager/:mid
  app.put("/api/emp-manager/:mid", requireAuth, async (req, res) => {
    try {
      const { mid } = req.params;
      const { mdepartmentIds, mdesignationIds, morgUnitIds } = req.body;

      const deptIds: string[] = (Array.isArray(mdepartmentIds) ? mdepartmentIds : []).filter((id: string) => id && id.trim());
      const desigIds: string[] = (Array.isArray(mdesignationIds) ? mdesignationIds : []).filter((id: string) => id && id.trim());
      const orgIds: string[] = (Array.isArray(morgUnitIds) ? morgUnitIds : []).filter((id: string) => id && id.trim());

      await prisma.$executeRaw`
        UPDATE "emp_manager"
        SET "mdepartmentIds" = ${deptIds}::text[],
            "mdesignationIds" = ${desigIds}::text[],
            "morgUnitIds" = ${orgIds}::text[]
        WHERE "mid" = ${mid}
      `;

      res.json({ success: true, message: "Manager updated successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // DELETE /api/emp-manager/:mid
  app.delete("/api/emp-manager/:mid", requireAuth, async (req, res) => {
    try {
      const { mid } = req.params;

      const existing = await prisma.$queryRaw<Array<{ mcardno: string }>>`
        SELECT "mcardno" FROM "emp_manager" WHERE "mid" = ${mid}
      `;

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: "Manager not found" });
      }

      await prisma.$executeRaw`DELETE FROM "emp_manager" WHERE "mid" = ${mid}`;

      try {
        const employee = await prisma.employee.findFirst({
          where: { cardNumber: existing[0].mcardno },
          select: { id: true }
        });
        if (employee) {
          await prisma.user.updateMany({
            where: { employeeId: employee.id },
            data: { policyVersion: { increment: 1 } }
          });
        }
      } catch (e) {}

      res.json({ success: true, message: "Manager removed successfully" });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  });
}
