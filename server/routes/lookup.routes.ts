import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-middleware";

export function registerLookupRoutes(app: Express) {
  // GET /api/departments - Get all active departments
  app.get("/api/departments", requireAuth, async (req, res) => {
    try {
      const unitId = req.query.unitId as string | undefined;
      const accessibleOrgUnitIds = req.user?.accessibleOrgUnitIds || [];

      const departments = await prisma.department.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      const departmentsWithCounts = await Promise.all(
        departments.map(async (dept) => {
          // Count only "real" synced employees (cardNumber comes from CARD_NO).
          // This avoids showing seed-only departments that have no presence in Employee Master.
          const whereClause: any = { departmentId: dept.id, cardNumber: { not: null } };

          if (unitId) {
            whereClause.orgUnitId = unitId;
          } else if (accessibleOrgUnitIds.length > 0) {
            whereClause.orgUnitId = { in: accessibleOrgUnitIds };
          }

          const employeeCount = await prisma.employee.count({
            where: whereClause,
          });

          return {
            ...dept,
            employeeCount,
          };
        }),
      );

      // Hide departments that do not exist in real synced employee data
      res.json(departmentsWithCounts.filter((d) => (d.employeeCount || 0) > 0));
    } catch (error) {
      console.error("Departments error:", error);
      res.status(500).json({ message: "Failed to fetch departments" });
    }
  });

  // GET /api/designations - Get all active designations
  app.get("/api/designations", requireAuth, async (req, res) => {
    try {
      const unitId = req.query.unitId as string | undefined;
      const departmentId = req.query.departmentId as string | undefined;
      const accessibleOrgUnitIds = req.user?.accessibleOrgUnitIds || [];

      const designations = await prisma.designation.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });

      const designationsWithCounts = await Promise.all(
        designations.map(async (desig) => {
          const whereClause: any = { designationId: desig.id };

          if (unitId) {
            whereClause.orgUnitId = unitId;
          } else if (accessibleOrgUnitIds.length > 0) {
            whereClause.orgUnitId = { in: accessibleOrgUnitIds };
          }

          if (departmentId) {
            whereClause.departmentId = departmentId;
          }

          const employeeCount = await prisma.employee.count({
            where: whereClause,
          });

          return {
            ...desig,
            employeeCount,
          };
        }),
      );

      res.json(designationsWithCounts);
    } catch (error) {
      console.error("Designations error:", error);
      res.status(500).json({ message: "Failed to fetch designations" });
    }
  });

  // GET /api/time-policies - Get all active time policies
  app.get("/api/time-policies", requireAuth, async (req, res) => {
    try {
      const policies = await prisma.timePolicy.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      res.json(policies);
    } catch (error) {
      console.error("Time policies error:", error);
      res.status(500).json({ message: "Failed to fetch time policies" });
    }
  });
}

