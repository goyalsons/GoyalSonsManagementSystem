import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

/** Get team member IDs for logged-in manager */
async function getTeamMemberIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employeeId: true },
  });
  if (!user?.employeeId) return [];
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { cardNumber: true },
  });
  if (!employee?.cardNumber) return [];
  const assignments = await prisma.$queryRaw<Array<{
    mdepartmentIds: string[];
    mdesignationIds: string[];
    morgUnitIds: string[];
  }>>`
    SELECT "mdepartmentIds", "mdesignationIds", "morgUnitIds"
    FROM "emp_manager"
    WHERE "mcardno" = ${employee.cardNumber} AND "mis_extinct" = false
  `;
  if (assignments.length === 0) return [];
  const a = assignments[0];
  const conditions: any[] = [];
  if (a.mdepartmentIds?.length > 0)
    conditions.push({ departmentId: { in: a.mdepartmentIds } });
  if (a.mdesignationIds?.length > 0)
    conditions.push({ designationId: { in: a.mdesignationIds } });
  if (a.morgUnitIds?.length > 0)
    conditions.push({ orgUnitId: { in: a.morgUnitIds } });
  if (conditions.length === 0) return [];
  const members = await prisma.employee.findMany({
    where: {
      OR: conditions,
      status: "ACTIVE",
      cardNumber: { not: null },
      id: { not: user.employeeId },
    },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

export function registerAttendanceVerificationRoutes(app: Express) {
  // GET /api/attendance/submit-context - Manager name, card no, unit no for submit modal
  app.get(
    "/api/attendance/submit-context",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            name: true,
            employee: { select: { cardNumber: true } },
            orgUnit: { select: { name: true, code: true } },
          },
        });
        const managerName = user?.name ?? "—";
        const managerCardNo = user?.employee?.cardNumber ?? "—";
        const managerUnitNo = user?.orgUnit?.name ?? user?.orgUnit?.code ?? "—";
        return res.json({ managerName, managerCardNo, managerUnitNo });
      } catch (err: any) {
        return res.status(500).json({ message: err?.message || "Failed" });
      }
    }
  );

  // POST /api/attendance/team-verification/batches - Create verification batch
  app.post(
    "/api/attendance/team-verification/batches",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }
        const { monthStart, notes } = req.body as {
          monthStart: string; // YYYY-MM-DD (first day of month)
          notes?: string;
        };
        if (!monthStart) {
          return res.status(400).json({
            message: "monthStart (YYYY-MM-DD) is required",
          });
        }
        const parts = monthStart.split("-").map(Number);
        const y = parts[0],
          m = parts[1];
        if (!y || !m || m < 1 || m > 12) {
          return res.status(400).json({ message: "Invalid monthStart format (use YYYY-MM-DD)" });
        }
        const firstDay = new Date(y, m - 1, 1);

        const batch = await prisma.attendanceVerificationBatch.create({
          data: {
            monthStart: firstDay,
            createdByUserId: userId,
            notes: notes || null,
          },
          select: {
            id: true,
            monthStart: true,
            createdAt: true,
            notes: true,
          },
        });

        return res.json({
          success: true,
          batch: {
            id: batch.id,
            monthStart: batch.monthStart.toISOString().slice(0, 10),
            createdAt: batch.createdAt,
            notes: batch.notes,
          },
        });
      } catch (err: any) {
        console.error("[Verification Batches] POST error:", err);
        return res
          .status(500)
          .json({ message: err?.message || "Failed to create batch" });
      }
    }
  );

  // GET /api/attendance/team-verifications
  // ?from= & to= (date range) OR ?batchId= (single batch)
  app.get(
    "/api/attendance/team-verifications",
    requireAuth,
    requirePolicy("attendance.team.view"),
    async (req, res) => {
      try {
        const batchId = req.query.batchId as string | undefined;
        const fromStr = (req.query.from as string) || "";
        const toStr = (req.query.to as string) || "";

        let records: { employeeId: string; date: Date; status: string; query: string | null }[];

        if (batchId) {
          records = await prisma.attendanceVerification.findMany({
            where: { batchId },
            select: { employeeId: true, date: true, status: true, query: true },
          });
        } else if (fromStr && toStr) {
          const fromDate = new Date(fromStr);
          const toDate = new Date(toStr);
          if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return res
              .status(400)
              .json({ message: "Invalid date format. Use YYYY-MM-DD" });
          }
          records = await prisma.attendanceVerification.findMany({
            where: { date: { gte: fromDate, lte: toDate } },
            select: { employeeId: true, date: true, status: true, query: true },
          });
        } else {
          return res.status(400).json({
            message: "Provide batchId or both from and to (YYYY-MM-DD)",
          });
        }

        const map: Record<
          string,
          { status: "CORRECT" | "NOT_CORRECT"; query?: string | null }
        > = {};
        records.forEach((r) => {
          const dateKey = r.date.toISOString().slice(0, 10);
          map[`${r.employeeId}_${dateKey}`] = {
            status: r.status as "CORRECT" | "NOT_CORRECT",
            query: r.query,
          };
        });

        return res.json({ verifications: map });
      } catch (err: any) {
        console.error("[Attendance Verifications] GET error:", err);
        return res
          .status(500)
          .json({
            message: err?.message || "Failed to fetch verifications",
          });
      }
    }
  );

  // POST /api/attendance/team-verifications - Save verifications (requires batchId)
  app.post(
    "/api/attendance/team-verifications",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id || null;
        const { batchId, updates } = req.body as {
          batchId: string;
          updates: Array<{
            employeeId: string;
            date: string;
            status: "CORRECT" | "NOT_CORRECT";
            query?: string | null;
          }>;
        };

        if (!batchId) {
          return res.status(400).json({
            message: "batchId is required",
          });
        }

        if (!Array.isArray(updates) || updates.length === 0) {
          return res.status(400).json({
            message: "Body must include 'updates' array with at least one item",
          });
        }

        const teamIds = await getTeamMemberIds(userId || "");
        const teamSet = new Set(teamIds);

        for (const u of updates) {
          if (!u.employeeId || !u.date) {
            return res.status(400).json({
              message: "Each update must have employeeId and date (YYYY-MM-DD)",
            });
          }
          if (u.status !== "CORRECT" && u.status !== "NOT_CORRECT") {
            return res.status(400).json({
              message: "status must be CORRECT or NOT_CORRECT",
            });
          }
          if (u.status === "NOT_CORRECT") {
            const q = (u.query ?? "").trim();
            if (!q) {
              return res.status(400).json({
                message: `NOT_CORRECT requires query for employee ${u.employeeId}`,
              });
            }
          }
          if (!teamSet.has(u.employeeId)) {
            return res.status(403).json({
              message: `Employee ${u.employeeId} is not in your team`,
            });
          }
        }

        const batch = await prisma.attendanceVerificationBatch.findUnique({
          where: { id: batchId },
        });
        if (!batch) {
          return res.status(404).json({ message: "Batch not found" });
        }

        const results = await Promise.all(
          updates.map((u) => {
            const d = new Date(u.date);
            if (isNaN(d.getTime())) {
              throw new Error(`Invalid date: ${u.date}`);
            }
            const date = new Date(
              d.getFullYear(),
              d.getMonth(),
              d.getDate()
            );
            const query =
              u.status === "NOT_CORRECT"
                ? String(u.query ?? "").trim() || null
                : null;
            return prisma.attendanceVerification.upsert({
              where: {
                batchId_employeeId_date: {
                  batchId,
                  employeeId: u.employeeId,
                  date,
                },
              },
              create: {
                batchId,
                employeeId: u.employeeId,
                date,
                status: u.status,
                query,
                updatedByUserId: userId,
              },
              update: {
                status: u.status,
                query,
                updatedByUserId: userId,
              },
              select: {
                id: true,
                employeeId: true,
                date: true,
                status: true,
                query: true,
              },
            });
          })
        );

        return res.json({
          success: true,
          updated: results.length,
          results,
        });
      } catch (err: any) {
        console.error("[Attendance Verifications] POST error:", err);
        return res
          .status(500)
          .json({
            message: err?.message || "Failed to save verifications",
          });
      }
    }
  );

  // POST /api/attendance/team-verifications/clear - Clear all verifications for batch (body: { batchId })
  app.post(
    "/api/attendance/team-verifications/clear",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const { batchId } = (req.body as { batchId?: string }) || {};
        if (!batchId) {
          return res.status(400).json({ message: "batchId is required" });
        }

        const batch = await prisma.attendanceVerificationBatch.findUnique({
          where: { id: batchId },
        });
        if (!batch) {
          return res.status(404).json({ message: "Batch not found" });
        }
        if (batch.submittedAt) {
          return res.status(400).json({
            message: "Cannot clear verifications for a submitted batch",
          });
        }

        const { count } = await prisma.attendanceVerification.deleteMany({
          where: { batchId },
        });

        return res.json({ success: true, deleted: count });
      } catch (err: any) {
        console.error("[Attendance Verifications] DELETE error:", err);
        return res.status(500).json({
          message: err?.message || "Failed to clear verifications",
        });
      }
    }
  );

  // POST /api/attendance/verification-batches (alias) and POST .../:id/submit
  app.post(
    "/api/attendance/verification-batches",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const { monthStart, notes } = req.body as { monthStart?: string; notes?: string };
        if (!monthStart) return res.status(400).json({ message: "monthStart (YYYY-MM-DD) is required" });
        const parts = monthStart.split("-").map(Number);
        const y = parts[0],
          m = parts[1];
        if (!y || !m || m < 1 || m > 12)
          return res.status(400).json({ message: "Invalid monthStart format (use YYYY-MM-DD)" });
        const firstDay = new Date(y, m - 1, 1);
        const batch = await prisma.attendanceVerificationBatch.create({
          data: { monthStart: firstDay, createdByUserId: userId, notes: notes || null },
          select: { id: true, monthStart: true, createdAt: true, notes: true, submittedAt: true },
        });
        return res.json({
          success: true,
          batch: {
            id: batch.id,
            monthStart: batch.monthStart.toISOString().slice(0, 10),
            createdAt: batch.createdAt,
            notes: batch.notes,
            submittedAt: batch.submittedAt,
          },
        });
      } catch (err: any) {
        console.error("[Verification Batches] POST error:", err);
        return res.status(500).json({ message: err?.message || "Failed to create batch" });
      }
    }
  );

  app.post(
    "/api/attendance/verification-batches/:id/submit",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const { id: batchId } = req.params;
        const batch = await prisma.attendanceVerificationBatch.findUnique({ where: { id: batchId } });
        if (!batch) return res.status(404).json({ message: "Batch not found" });
        if (batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "You can only submit your own batch" });
        }
        if (batch.submittedAt) return res.status(400).json({ message: "Batch already submitted" });
        await prisma.attendanceVerificationBatch.update({
          where: { id: batchId },
          data: { submittedAt: new Date() },
        });
        return res.json({ success: true, submittedAt: new Date().toISOString() });
      } catch (err: any) {
        console.error("[Verification Batches] Submit error:", err);
        return res.status(500).json({ message: err?.message || "Failed to submit batch" });
      }
    }
  );

  // DELETE /api/attendance/verification-batches/:id - Permanently delete batch (manager only, own batch)
  app.delete(
    "/api/attendance/verification-batches/:id",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const { id: batchId } = req.params;
        const batch = await prisma.attendanceVerificationBatch.findUnique({ where: { id: batchId } });
        if (!batch) return res.status(404).json({ message: "Batch not found" });
        if (batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "You can only delete your own batch" });
        }
        await prisma.attendanceVerificationBatch.delete({ where: { id: batchId } });
        return res.json({ success: true });
      } catch (err: any) {
        console.error("[Verification Batches] DELETE error:", err);
        return res.status(500).json({ message: err?.message || "Failed to delete" });
      }
    }
  );

  // POST /api/attendance/verification-batches/:id/unsubmit - Reopen for editing (Store Manager only, own batch)
  app.post(
    "/api/attendance/verification-batches/:id/unsubmit",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      try {
        const { id: batchId } = req.params;
        console.log("[Verification Batches] Unsubmit requested for batch:", batchId);
        const batch = await prisma.attendanceVerificationBatch.findUnique({ where: { id: batchId } });
        if (!batch) return res.status(404).json({ message: "Batch not found" });
        if (batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "You can only reopen your own batch" });
        }
        if (!batch.submittedAt) return res.status(400).json({ message: "Batch is not submitted" });
        await prisma.attendanceVerificationBatch.update({
          where: { id: batchId },
          data: { submittedAt: null },
        });
        return res.json({ success: true });
      } catch (err: any) {
        console.error("[Verification Batches] Unsubmit error:", err);
        return res.status(500).json({ message: err?.message || "Failed to reopen batch" });
      }
    }
  );

  // GET /api/attendance/my-queries - Manager's batches with tickets (NOT_CORRECT verifications)
  app.get(
    "/api/attendance/my-queries",
    requireAuth,
    requirePolicy("attendance.team.queries.view"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const batches = await prisma.attendanceVerificationBatch.findMany({
          where: { createdByUserId: userId, submittedAt: { not: null } },
          orderBy: { submittedAt: "desc" },
          include: {
            verifications: {
              where: { status: "NOT_CORRECT", dismissedByManagerAt: null },
            },
            createdBy: { select: { id: true, name: true, email: true } },
          },
        });
        const employeeIds = [...new Set(batches.flatMap((b) => b.verifications.map((v) => v.employeeId)))];
        const employees = employeeIds.length
          ? await prisma.employee.findMany({
              where: { id: { in: employeeIds } },
              select: { id: true, firstName: true, lastName: true, cardNumber: true },
            })
          : [];
        const empMap = new Map(employees.map((e) => [e.id, e]));
        const batchesWithTickets = batches.map((b) => ({
          id: b.id,
          monthStart: b.monthStart.toISOString().slice(0, 10),
          submittedAt: b.submittedAt?.toISOString() ?? null,
          createdBy: b.createdBy,
          tickets: b.verifications.map((v) => {
            const emp = empMap.get(v.employeeId);
            return {
              id: v.id,
              employeeId: v.employeeId,
              employeeName: emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : "—",
              cardNumber: emp?.cardNumber ?? "—",
              date: v.date.toISOString().slice(0, 10),
              query: v.query,
              hrStatus: v.hrStatus,
              hrRemark: v.hrRemark,
              reraiseRemark: v.reraiseRemark,
            };
          }),
        }));
        return res.json({ batches: batchesWithTickets });
      } catch (err: any) {
        console.error("[My Queries] GET error:", err);
        return res.status(500).json({ message: err?.message || "Failed to fetch" });
      }
    }
  );

  // GET /api/attendance/hr/queries/batch/:batchId - single batch detail (must be before /queries to match)
  app.get(
    "/api/attendance/hr/queries/batch/:batchId",
    requireAuth,
    requirePolicy("attendance.hr.view"),
    async (req, res) => {
      try {
        const { batchId } = req.params;
        const b = await prisma.attendanceVerificationBatch.findFirst({
          where: { id: batchId },
          include: {
            verifications: true,
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
                orgUnitId: true,
                employee: { select: { cardNumber: true } },
                orgUnit: { select: { name: true, code: true } },
              },
            },
          },
        });
        if (!b) return res.status(404).json({ message: "Batch not found" });
        if (!b.submittedAt) return res.status(404).json({ message: "Batch not submitted" });
        const employeeIds = [...new Set(b.verifications.map((v) => v.employeeId))];
        const employees =
          employeeIds.length > 0
            ? await prisma.employee.findMany({
                where: { id: { in: employeeIds } },
                select: { id: true, firstName: true, lastName: true, cardNumber: true, orgUnitId: true },
              })
            : [];
        const empMap = new Map(employees.map((e) => [e.id, e]));
        const managerName = b.createdBy?.name ?? "—";
        const managerCardNo = b.createdBy?.employee?.cardNumber ?? b.createdBy?.email ?? "—";
        const managerUnitNo = b.createdBy?.orgUnit?.name ?? b.createdBy?.orgUnit?.code ?? "—";
        const monthStartStr = b.monthStart.toISOString().slice(0, 10);

        const notCorrectVerifications = b.verifications.filter((v) => v.status === "NOT_CORRECT");
        const tickets = notCorrectVerifications.map((v) => {
          const emp = empMap.get(v.employeeId);
          return {
            id: v.id,
            employeeId: v.employeeId,
            employeeName: emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : "—",
            cardNumber: emp?.cardNumber ?? "—",
            date: v.date.toISOString().slice(0, 10),
            query: v.query,
            hrStatus: v.hrStatus,
            hrRemark: v.hrRemark,
            reraiseRemark: v.reraiseRemark,
          };
        });

        const byEmployee = new Map<
          string,
          { correctDates: number[]; notCorrectDates: { day: number; query: string | null }[] }
        >();
        for (const v of b.verifications) {
          if (!byEmployee.has(v.employeeId)) byEmployee.set(v.employeeId, { correctDates: [], notCorrectDates: [] });
          const row = byEmployee.get(v.employeeId)!;
          const day = v.date.getDate();
          if (v.status === "CORRECT") row.correctDates.push(day);
          else row.notCorrectDates.push({ day, query: v.query });
        }
        const members = Array.from(byEmployee.entries())
          .map(([empId, data]) => {
            const emp = empMap.get(empId);
            const name = emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : "—";
            const correctStr =
              data.correctDates.length > 0
                ? data.notCorrectDates.length === 0
                  ? "All correct"
                  : data.correctDates.sort((a, b) => a - b).join(", ")
                : "—";
            const notCorrectStr = data.notCorrectDates
              .sort((a, b) => a.day - b.day)
              .map((d) => d.day)
              .join(", ") || "—";
            const queryStr =
              data.notCorrectDates.length > 0
                ? data.notCorrectDates
                    .sort((a, b) => a.day - b.day)
                    .map((d) => (d.query ? `${d.day}: ${d.query}` : String(d.day)))
                    .join("; ")
                : "—";
            return {
              employeeId: empId,
              cardNumber: emp?.cardNumber ?? "—",
              employeeName: name,
              correctDates: correctStr,
              notCorrectDates: notCorrectStr,
              query: queryStr,
            };
          })
          .sort((a, b) => (a.employeeName || "").localeCompare(b.employeeName || ""));

        return res.json({
          batch: {
            id: b.id,
            monthStart: monthStartStr,
            submittedAt: b.submittedAt?.toISOString() ?? null,
            managerName,
            managerCardNo,
            managerUnitNo,
            tickets,
            members,
          },
        });
      } catch (err: any) {
        console.error("[HR Query Batch] GET error:", err);
        return res.status(500).json({ message: err?.message || "Failed to fetch" });
      }
    }
  );

  // DELETE /api/attendance/hr/queries/batch/:batchId - HR: permanently delete a submission batch
  app.delete(
    "/api/attendance/hr/queries/batch/:batchId",
    requireAuth,
    requirePolicy("attendance.hr.resolve"),
    async (req, res) => {
      try {
        const { batchId } = req.params;
        const batch = await prisma.attendanceVerificationBatch.findUnique({ where: { id: batchId } });
        if (!batch) return res.status(404).json({ message: "Batch not found" });
        await prisma.attendanceVerificationBatch.delete({ where: { id: batchId } });
        return res.json({ success: true });
      } catch (err: any) {
        console.error("[HR Query Batch] DELETE error:", err);
        return res.status(500).json({ message: err?.message || "Failed to delete" });
      }
    }
  );

  // GET /api/attendance/hr/queries - HR: batches with manager info + nested tickets (per-submission cards)
  app.get(
    "/api/attendance/hr/queries",
    requireAuth,
    requirePolicy("attendance.hr.view"),
    async (req, res) => {
      try {
        const monthStr = req.query.month as string | undefined;
        const branchId = req.query.branch as string | undefined;
        const statusFilter = req.query.status as string | undefined;
        const search = (req.query.search as string)?.trim();
        const batches = await prisma.attendanceVerificationBatch.findMany({
          where: { submittedAt: { not: null } },
          orderBy: { submittedAt: "desc" },
          include: {
            verifications: { where: { status: "NOT_CORRECT" } }, // only tickets for list (members loaded on detail page)
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                employeeId: true,
                orgUnitId: true,
                employee: { select: { cardNumber: true } },
                orgUnit: { select: { name: true, code: true } },
              },
            },
          },
        });
        const employeeIds = [...new Set(batches.flatMap((b) => b.verifications.map((v) => v.employeeId)))];
        const employees = employeeIds.length
          ? await prisma.employee.findMany({
              where: { id: { in: employeeIds } },
              select: { id: true, firstName: true, lastName: true, cardNumber: true, orgUnitId: true },
            })
          : [];
        const empMap = new Map(employees.map((e) => [e.id, e]));

        const outBatches: Array<{
          id: string;
          monthStart: string;
          submittedAt: string | null;
          managerName: string;
          managerCardNo: string;
          managerUnitNo: string;
          tickets: Array<{
            id: string;
            employeeId: string;
            employeeName: string;
            cardNumber: string;
            date: string;
            query: string | null;
            hrStatus: string | null;
            hrRemark: string | null;
            reraiseRemark: string | null;
          }>;
        }> = [];

        for (const b of batches) {
          const monthStartStr = b.monthStart.toISOString().slice(0, 10);
          if (monthStr) {
            const [y, m] = monthStr.split("-").map(Number);
            if (!isNaN(y) && !isNaN(m)) {
              const batchMonth = `${b.monthStart.getFullYear()}-${String(b.monthStart.getMonth() + 1).padStart(2, "0")}`;
              if (batchMonth !== monthStr) continue;
            }
          }
          const managerName = b.createdBy?.name ?? "—";
          const managerCardNo = b.createdBy?.employee?.cardNumber ?? b.createdBy?.email ?? "—";
          const managerUnitNo = b.createdBy?.orgUnit?.name ?? b.createdBy?.orgUnit?.code ?? "—";

          const tickets: typeof outBatches[0]["tickets"] = [];
          for (const v of b.verifications) {
            const emp = empMap.get(v.employeeId);
            if (branchId && emp?.orgUnitId !== branchId) continue;
            if (statusFilter && v.hrStatus !== statusFilter) continue;
            const name = emp ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim() : "—";
            if (search && !name.toLowerCase().includes(search.toLowerCase()) && !(emp?.cardNumber ?? "").includes(search)) continue;
            tickets.push({
              id: v.id,
              employeeId: v.employeeId,
              employeeName: name,
              cardNumber: emp?.cardNumber ?? "—",
              date: v.date.toISOString().slice(0, 10),
              query: v.query,
              hrStatus: v.hrStatus,
              hrRemark: v.hrRemark,
              reraiseRemark: v.reraiseRemark,
            });
          }

          outBatches.push({
            id: b.id,
            monthStart: monthStartStr,
            submittedAt: b.submittedAt?.toISOString() ?? null,
            managerName,
            managerCardNo,
            managerUnitNo,
            tickets,
          });
        }
        return res.json({ batches: outBatches });
      } catch (err: any) {
        console.error("[HR Queries] GET error:", err);
        return res.status(500).json({ message: err?.message || "Failed to fetch" });
      }
    }
  );

  // PATCH /api/attendance/hr/queries/:id - HR resolve (set hrStatus, hrRemark)
  app.patch(
    "/api/attendance/hr/queries/:id",
    requireAuth,
    requirePolicy("attendance.hr.resolve"),
    async (req, res) => {
      try {
        const { id } = req.params;
        const { hrStatus, hrRemark } = req.body as { hrStatus?: string; hrRemark?: string };
        const allowed = ["IN_PROGRESS", "NEED_INFO", "RESOLVED", "REJECTED"];
        if (hrStatus && !allowed.includes(hrStatus)) {
          return res.status(400).json({ message: "Invalid hrStatus" });
        }
        const v = await prisma.attendanceVerification.findUnique({ where: { id } });
        if (!v) return res.status(404).json({ message: "Ticket not found" });
        const needsRemark = hrStatus === "RESOLVED" || hrStatus === "REJECTED" || hrStatus === "NEED_INFO";
        if (needsRemark && (!hrRemark || !hrRemark.trim())) {
          return res.status(400).json({ message: "Remark is required for this status" });
        }
        await prisma.attendanceVerification.update({
          where: { id },
          data: {
            ...(hrStatus && { hrStatus }),
            ...(hrRemark !== undefined && { hrRemark: hrRemark?.trim() || null }),
          },
        });
        return res.json({ success: true });
      } catch (err: any) {
        console.error("[HR Queries] PATCH error:", err);
        return res.status(500).json({ message: err?.message || "Failed to update" });
      }
    }
  );

  // POST /api/attendance/my-queries/:ticketId/accept and .../reraise (manager actions)
  app.post(
    "/api/attendance/my-queries/:ticketId/accept",
    requireAuth,
    requirePolicy("attendance.team.queries.view"),
    async (req, res) => {
      try {
        const { ticketId } = req.params;
        const v = await prisma.attendanceVerification.findUnique({
          where: { id: ticketId },
          include: { batch: true },
        });
        if (!v || v.status !== "NOT_CORRECT") return res.status(404).json({ message: "Ticket not found" });
        if (v.batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "Not your ticket" });
        }
        await prisma.attendanceVerification.update({
          where: { id: ticketId },
          data: { hrStatus: "RESOLVED", hrRemark: (v.hrRemark || "") + "\n[Manager accepted.]" },
        });
        return res.json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ message: err?.message || "Failed" });
      }
    }
  );

  // POST /api/attendance/my-queries/:ticketId/dismiss - Manager removes resolved item from list (soft-hide)
  app.post(
    "/api/attendance/my-queries/:ticketId/dismiss",
    requireAuth,
    requirePolicy("attendance.team.queries.view"),
    async (req, res) => {
      try {
        const { ticketId } = req.params;
        const v = await prisma.attendanceVerification.findUnique({
          where: { id: ticketId },
          include: { batch: true },
        });
        if (!v || v.status !== "NOT_CORRECT") return res.status(404).json({ message: "Ticket not found" });
        if (v.batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "Not your ticket" });
        }
        if (v.hrStatus !== "RESOLVED") {
          return res.status(400).json({ message: "Only resolved items can be dismissed" });
        }
        await prisma.attendanceVerification.update({
          where: { id: ticketId },
          data: { dismissedByManagerAt: new Date() },
        });
        return res.json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ message: err?.message || "Failed" });
      }
    }
  );

  app.post(
    "/api/attendance/my-queries/:ticketId/reraise",
    requireAuth,
    requirePolicy("attendance.team.queries.view"),
    async (req, res) => {
      try {
        const { ticketId } = req.params;
        const { remark } = req.body as { remark?: string };
        if (!remark?.trim()) return res.status(400).json({ message: "Remark is required" });
        const v = await prisma.attendanceVerification.findUnique({
          where: { id: ticketId },
          include: { batch: true },
        });
        if (!v || v.status !== "NOT_CORRECT") return res.status(404).json({ message: "Ticket not found" });
        if (v.batch.createdByUserId !== (req as any).user?.id) {
          return res.status(403).json({ message: "Not your ticket" });
        }
        await prisma.attendanceVerification.update({
          where: { id: ticketId },
          data: { reraiseRemark: remark.trim(), hrStatus: "NEED_INFO", hrRemark: (v.hrRemark || "") + "\n[Re-raised: " + remark.trim() + "]" },
        });
        return res.json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ message: err?.message || "Failed" });
      }
    }
  );

  // GET /api/attendance/verification-batches - list or get one (for check page: create or load by month)
  app.get(
    "/api/attendance/verification-batches",
    requireAuth,
    requirePolicy("attendance.team.verify"),
    async (req, res) => {
      try {
        const monthStart = req.query.monthStart as string; // YYYY-MM-DD
        if (!monthStart) {
          return res.status(400).json({ message: "monthStart (YYYY-MM-DD) required" });
        }
        const parts = monthStart.split("-").map(Number);
        const y = parts[0],
          m = parts[1];
        if (!y || !m || m < 1 || m > 12)
          return res.status(400).json({ message: "Invalid monthStart (use YYYY-MM-DD)" });
        const firstDay = new Date(y, m - 1, 1);
        const userId = (req as any).user?.id;
        const batch = await prisma.attendanceVerificationBatch.findFirst({
          where: { monthStart: firstDay, createdByUserId: userId ?? undefined },
          orderBy: { createdAt: "desc" },
          select: { id: true, monthStart: true, createdAt: true, notes: true, submittedAt: true },
        });
        if (!batch) {
          return res.json({ batch: null });
        }
        return res.json({
          batch: {
            id: batch.id,
            monthStart: batch.monthStart.toISOString().slice(0, 10),
            createdAt: batch.createdAt,
            notes: batch.notes,
            submittedAt: batch.submittedAt,
          },
        });
      } catch (err: any) {
        console.error("[Verification Batches] GET error:", err);
        return res.status(500).json({ message: err?.message || "Failed" });
      }
    }
  );

  // GET /api/attendance/team-verification/audit/batches - List batches
  app.get(
    "/api/attendance/team-verification/audit/batches",
    requireAuth,
    requirePolicy("attendance.team.verification.audit.view"),
    async (req, res) => {
      try {
        const monthStr = req.query.month as string | undefined; // YYYY-MM optional
        const where: { monthStart?: { gte: Date; lte: Date } } = {};
        if (monthStr) {
          const [y, m] = monthStr.split("-").map(Number);
          if (!isNaN(y) && !isNaN(m)) {
            const start = new Date(y, m - 1, 1);
            const end = new Date(y, m, 0);
            where.monthStart = { gte: start, lte: end };
          }
        }

        const batches = await prisma.attendanceVerificationBatch.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
                employee: { select: { cardNumber: true } },
              },
            },
            _count: { select: { verifications: true } },
          },
        });

        const stats = await Promise.all(
          batches.map(async (b) => {
            const correct = await prisma.attendanceVerification.count({
              where: { batchId: b.id, status: "CORRECT" },
            });
            const notCorrect = await prisma.attendanceVerification.count({
              where: { batchId: b.id, status: "NOT_CORRECT" },
            });
            return {
              id: b.id,
              monthStart: b.monthStart.toISOString().slice(0, 10),
              createdByUserId: b.createdByUserId,
              createdBy: b.createdBy
                ? {
                    id: b.createdBy.id,
                    name: b.createdBy.name,
                    email: b.createdBy.email,
                    cardNumber: b.createdBy.employee?.cardNumber ?? null,
                  }
                : null,
              createdAt: b.createdAt,
              notes: b.notes,
              totalVerified: b._count.verifications,
              correctCount: correct,
              notCorrectCount: notCorrect,
            };
          })
        );

        return res.json({ batches: stats });
      } catch (err: any) {
        console.error("[Verification Audit] GET batches error:", err);
        return res
          .status(500)
          .json({
            message: err?.message || "Failed to fetch batches",
          });
      }
    }
  );

  // GET /api/attendance/team-verification/audit/batches/:batchId
  app.get(
    "/api/attendance/team-verification/audit/batches/:batchId",
    requireAuth,
    requirePolicy("attendance.team.verification.audit.view"),
    async (req, res) => {
      try {
        const { batchId } = req.params;
        const statusFilter = req.query.status as
          | "all"
          | "CORRECT"
          | "NOT_CORRECT"
          | undefined;

        const batch = await prisma.attendanceVerificationBatch.findUnique({
          where: { id: batchId },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
          },
        });

        if (!batch) {
          return res.status(404).json({ message: "Batch not found" });
        }

        const where: { batchId: string; status?: string } = { batchId };
        if (
          statusFilter &&
          statusFilter !== "all" &&
          (statusFilter === "CORRECT" || statusFilter === "NOT_CORRECT")
        ) {
          where.status = statusFilter;
        }

        const verifications = await prisma.attendanceVerification.findMany({
          where,
          include: {
            batch: { select: { monthStart: true, notes: true } },
          },
        });

        const employeeIds = [...new Set(verifications.map((v) => v.employeeId))];
        const employees = await prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            cardNumber: true,
          },
        });
        const empMap = new Map(employees.map((e) => [e.id, e]));

        const rows = verifications.map((v) => {
          const emp = empMap.get(v.employeeId);
          const name = emp
            ? `${emp.firstName || ""} ${emp.lastName || ""}`.trim()
            : "—";
          return {
            cardNo: emp?.cardNumber ?? "—",
            name,
            status: v.status,
            query: v.query,
            date: v.date.toISOString().slice(0, 10),
          };
        });

        return res.json({
          batch: {
            id: batch.id,
            monthStart: batch.monthStart.toISOString().slice(0, 10),
            createdAt: batch.createdAt,
            notes: batch.notes,
            createdBy: batch.createdBy,
          },
          rows,
        });
      } catch (err: any) {
        console.error(
          "[Verification Audit] GET batch details error:",
          err
        );
        return res
          .status(500)
          .json({
            message: err?.message || "Failed to fetch batch details",
          });
      }
    }
  );
}
