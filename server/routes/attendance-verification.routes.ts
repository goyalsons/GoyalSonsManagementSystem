import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";

export function registerAttendanceVerificationRoutes(app: Express) {
  // GET /api/attendance/team-verifications?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Returns verification map: { [employeeId_date]: "CORRECT" | "NOT_CORRECT" }
  app.get(
    "/api/attendance/team-verifications",
    requireAuth,
    requirePolicy("attendance.team.view"),
    async (req, res) => {
      try {
        const fromStr = (req.query.from as string) || "";
        const toStr = (req.query.to as string) || "";

        if (!fromStr || !toStr) {
          return res.status(400).json({
            message: "Query params 'from' and 'to' (YYYY-MM-DD) are required",
          });
        }

        const fromDate = new Date(fromStr);
        const toDate = new Date(toStr);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
        }

        const records = await prisma.attendanceVerification.findMany({
          where: {
            date: { gte: fromDate, lte: toDate },
          },
          select: { employeeId: true, date: true, status: true, query: true },
        });

        const map: Record<string, { status: "CORRECT" | "NOT_CORRECT"; query?: string | null }> = {};
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
        return res.status(500).json({ message: err?.message || "Failed to fetch verifications" });
      }
    }
  );

  // POST /api/attendance/team-verifications
  // body: { updates: [{ employeeId, date, status }] }
  app.post(
    "/api/attendance/team-verifications",
    requireAuth,
    requirePolicy("attendance.team.view"),
    async (req, res) => {
      try {
        const userId = (req as any).user?.id || null;
        const { updates } = req.body as {
          updates: Array<{
            employeeId: string;
            date: string; // YYYY-MM-DD
            status: "CORRECT" | "NOT_CORRECT";
            query?: string | null;
          }>;
        };

        if (!Array.isArray(updates) || updates.length === 0) {
          return res.status(400).json({ message: "Body must include 'updates' array with at least one item" });
        }

        for (const u of updates) {
          if (!u.employeeId || !u.date || (u.status !== "CORRECT" && u.status !== "NOT_CORRECT")) {
            return res.status(400).json({
              message: "Each update must have employeeId, date (YYYY-MM-DD), and status (CORRECT|NOT_CORRECT)",
            });
          }
        }

        const results = await Promise.all(
          updates.map((u) => {
            const d = new Date(u.date);
            if (isNaN(d.getTime())) {
              throw new Error(`Invalid date: ${u.date}`);
            }
            const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const query = u.query != null ? String(u.query).trim() || null : null;
            return prisma.attendanceVerification.upsert({
              where: {
                employeeId_date: {
                  employeeId: u.employeeId,
                  date,
                },
              },
              create: {
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
              select: { id: true, employeeId: true, date: true, status: true, query: true },
            });
          })
        );

        return res.json({ success: true, updated: results.length, results });
      } catch (err: any) {
        console.error("[Attendance Verifications] POST error:", err);
        return res.status(500).json({ message: err?.message || "Failed to save verifications" });
      }
    }
  );
}
