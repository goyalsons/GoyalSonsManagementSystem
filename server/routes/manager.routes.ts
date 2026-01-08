import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireMDO } from "../lib/auth-middleware";
import { normalizeCardNumber } from "../bigquery-service";

export function registerManagerRoutes(app: Express): void {
  // GET employee by card number
  app.get("/api/employees/by-card/:cardNumber", requireAuth, requireMDO, async (req, res) => {
    try {
      const { cardNumber } = req.params;
      
      if (!cardNumber || cardNumber.trim() === "") {
        return res.status(400).json({ 
          success: false, 
          message: "Card number is required" 
        });
      }

      const searchCardNumber = cardNumber.trim();
      const normalizedSearch = normalizeCardNumber(searchCardNumber);
      
      console.log(`[Manager Assign] Searching for card number: "${searchCardNumber}", normalized: "${normalizedSearch}"`);
      
      const searchConditions: any[] = [
        { cardNumber: searchCardNumber },
        { cardNumber: searchCardNumber.toString() },
        { employeeCode: searchCardNumber },
        { employeeCode: normalizedSearch },
      ];
      
      if (normalizedSearch !== searchCardNumber) {
        searchConditions.push({ cardNumber: normalizedSearch });
      }
      
      let employee = await prisma.employee.findFirst({
        where: {
          OR: searchConditions,
        },
        include: {
          designation: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          orgUnit: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });
      
      if (employee) {
        console.log(`[Manager Assign] Found employee: ${employee.firstName} ${employee.lastName} (Card: ${employee.cardNumber}, Code: ${employee.employeeCode})`);
      }

      if (!employee) {
        const sampleEmployees = await prisma.employee.findMany({
          take: 10,
          select: {
            cardNumber: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            status: true,
          },
          where: {
            cardNumber: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        
        const totalEmployees = await prisma.employee.count({
          where: { cardNumber: { not: null } },
        });
        
        console.log(`[Manager Assign] Employee not found. Total employees with card numbers: ${totalEmployees}`);
        
        return res.status(404).json({ 
          success: false, 
          message: `Employee not found with card number "${searchCardNumber}". Please verify the card number or check if the employee exists in the system.`,
          debug: process.env.NODE_ENV === 'development' ? {
            searched: searchCardNumber,
            normalized: normalizedSearch,
            totalEmployeesWithCardNumbers: totalEmployees,
            sampleCardNumbers: sampleEmployees
              .map(e => e.cardNumber)
              .filter(Boolean)
              .slice(0, 5),
          } : undefined,
        });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(400).json({ 
          success: false, 
          message: "Employee is not active. Only active employees can be assigned as managers." 
        });
      }

      res.json({
        success: true,
        data: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          cardNumber: employee.cardNumber,
          designation: employee.designation,
          orgUnit: employee.orgUnit,
          department: employee.department,
          status: employee.status,
        },
      });
    } catch (error) {
      console.error("Error fetching employee by card number:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch employee details" 
      });
    }
  });

  // POST assign manager
  app.post("/api/manager/assign", requireAuth, requireMDO, async (req, res) => {
    try {
      const { cardNumber, orgUnitId, departmentIds } = req.body;

      if (!cardNumber || cardNumber.trim() === "") {
        return res.status(400).json({ 
          success: false, 
          message: "Card number is required" 
        });
      }

      if (!orgUnitId) {
        return res.status(400).json({ 
          success: false, 
          message: "Unit selection is required" 
        });
      }

      if (!departmentIds || !Array.isArray(departmentIds) || departmentIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "At least one department must be selected" 
        });
      }

      const searchCardNumber = cardNumber.trim();
      const normalizedSearch = normalizeCardNumber(searchCardNumber);
      
      const searchConditions: any[] = [
        { cardNumber: searchCardNumber },
        { cardNumber: searchCardNumber.toString() },
        { employeeCode: searchCardNumber },
        { employeeCode: normalizedSearch },
      ];
      
      if (normalizedSearch !== searchCardNumber) {
        searchConditions.push({ cardNumber: normalizedSearch });
      }
      
      const employee = await prisma.employee.findFirst({
        where: {
          OR: searchConditions,
        },
        include: {
          designation: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      if (!employee) {
        return res.status(404).json({ 
          success: false, 
          message: `Employee not found with card number "${searchCardNumber}"` 
        });
      }

      if (employee.status !== "ACTIVE") {
        return res.status(400).json({ 
          success: false, 
          message: "Only active employees can be assigned as managers" 
        });
      }

      const orgUnit = await prisma.orgUnit.findUnique({
        where: { id: orgUnitId },
      });

      if (!orgUnit) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid unit selected" 
        });
      }

      const departments = await prisma.department.findMany({
        where: { id: { in: departmentIds } },
      });

      if (departments.length !== departmentIds.length) {
        return res.status(400).json({ 
          success: false, 
          message: "One or more selected departments are invalid" 
        });
      }

      const existingChecks = await Promise.all(
        departmentIds.map(async (deptId: string) => {
          const existing = await prisma.$queryRaw<Array<{ mid: string }>>`
            SELECT "mid" FROM "emp_manager" 
            WHERE "mcardno" = ${employee.cardNumber}
              AND "morgUnitId" = ${orgUnitId}
              AND "mdepartmentId" = ${deptId}
              AND "mis_extinct" = false
            LIMIT 1
          `;
          return { deptId, exists: existing.length > 0 };
        })
      );

      const existingAssignments = existingChecks.filter(check => check.exists);
      if (existingAssignments.length > 0) {
        const existingDeptNames = departments
          .filter(d => existingAssignments.some(e => e.deptId === d.id))
          .map(d => d.name);
        
        return res.status(409).json({ 
          success: false, 
          message: `Manager assignment already exists for department(s): ${existingDeptNames.join(", ")}` 
        });
      }

      const assignments: string[] = [];
      for (const deptId of departmentIds) {
        const mid = `${employee.cardNumber}_${orgUnitId}_${deptId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await prisma.$executeRaw`
          INSERT INTO "emp_manager" ("mid", "mcardno", "morgUnitId", "mdepartmentId", "mdesignationId", "mis_extinct")
          VALUES (${mid}, ${employee.cardNumber}, ${orgUnitId}, ${deptId}, ${employee.designationId || null}, false)
        `;

        assignments.push(mid);
      }

      res.json({
        success: true,
        message: `Manager assigned successfully to ${departments.length} department(s)`,
        data: {
          managerCardNumber: employee.cardNumber,
          managerName: `${employee.firstName} ${employee.lastName || ""}`.trim(),
          orgUnit: orgUnit.name,
          departments: departments.map(d => d.name),
          assignmentIds: assignments,
        },
      });
    } catch (error: any) {
      console.error("Error assigning manager:", error);
      
      if (error.code === "23505" || error.message?.includes("duplicate")) {
        return res.status(409).json({ 
          success: false, 
          message: "Manager assignment already exists" 
        });
      }

      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to assign manager" 
      });
    }
  });
}

