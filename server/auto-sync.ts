import { prisma } from "./lib/prisma";

const syncTimers: Map<string, NodeJS.Timeout> = new Map();

// Attendance data column detection
const ATTENDANCE_COLUMNS = ["FirstIn", "LastOUT", "cardno", "dt", "device"];
const EMPLOYEE_COLUMNS = ["CARD_NO", "Name", "DEPARTMENT.DEPT_CODE"];

function detectDataType(record: any): "attendance" | "employee" {
  const keys = Object.keys(record);
  const hasAttendanceColumns = ATTENDANCE_COLUMNS.some(col => keys.includes(col));
  const hasEmployeeColumns = EMPLOYEE_COLUMNS.some(col => keys.includes(col));
  
  if (hasAttendanceColumns && !hasEmployeeColumns) {
    return "attendance";
  }
  return "employee";
}

const DEPARTMENT_NAMES: Record<string, string> = {
  "AC": "Account",
  "GL": "Girls",
  "LW": "Ladies Wear", 
  "MN": "Mens",
  "FJ": "Fashion",
  "LE": "Ladies Fit",
  "HN": "Household",
  "PL": "Purses",
  "BY": "Boys",
  "IN": "Infants",
  "AS": "Accessor",
  "FW": "Footwear",
  "BK": "Backoffice",
  "SM": "SM",
};

const DESIGNATION_NAMES: Record<string, string> = {
  "SM": "Salesman",
  "HK": "Housekeeper",
  "AC": "Accounts",
  "MC": "Merchandiser",
  "EL": "Electrician",
  "CM": "Computer",
  "TL": "Tailor",
  "GD": "Guard",
  "DR": "Driver",
  "MN": "Manager",
  "HL": "Helper",
};

export function getDepartmentName(code: string): string {
  return DEPARTMENT_NAMES[code] || code;
}

export function getDesignationName(code: string): string {
  return DESIGNATION_NAMES[code] || code;
}

function formatInterval(hours: number, minutes: number): string {
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

function getIntervalMs(hours: number, minutes: number): number {
  const totalMinutes = (hours || 0) * 60 + (minutes || 10);
  return Math.max(totalMinutes, 1) * 60 * 1000;
}

async function syncApiSource(routeId: string): Promise<void> {
  const startTime = new Date();
  
  try {
    const route = await prisma.apiRouting.findUnique({
      where: { id: routeId },
    });

    if (!route || route.status !== "active") {
      console.log(`[Auto-Sync] Route ${routeId} not found or inactive, stopping timer`);
      stopRouteSync(routeId);
      return;
    }

    if (!route.syncEnabled) {
      console.log(`[Auto-Sync] Route ${route.name} has sync disabled, skipping`);
      return;
    }

    const sourceUrl = route.sourceType === "api" ? route.endpoint : (route.csvUrl || route.csvFilePath);
    
    console.log(`[Auto-Sync] Starting sync for "${route.name}" at ${startTime.toISOString()}`);
    
    if (!sourceUrl) {
      console.log(`[Auto-Sync] No source URL for ${route.name}, skipping`);
      return;
    }

    const importLog = await prisma.dataImportLog.create({
      data: {
        sourceName: route.name,
        sourceUrl: sourceUrl,
        status: "in_progress",
      },
    });

    await prisma.apiRouting.update({
      where: { id: routeId },
      data: { 
        lastSyncStatus: "in_progress",
        syncProgressCurrent: 0,
        syncProgressTotal: 0,
      },
    });

    try {
      let data: any[];
      
      if (route.sourceType === "csv") {
        data = await fetchCsvData(sourceUrl);
      } else {
        data = await fetchApiData(sourceUrl, route.headers);
      }
      
      console.log(`[Auto-Sync] [${route.name}] Found ${data.length} records to import`);
      
      // Update total count
      await prisma.apiRouting.update({
        where: { id: routeId },
        data: { syncProgressTotal: data.length },
      });
      
      // Detect data type from first record
      const dataType = data.length > 0 ? detectDataType(data[0]) : "employee";
      console.log(`[Auto-Sync] [${route.name}] Detected data type: ${dataType}`);
      
      let imported = 0;
      let failed = 0;

      // Handle attendance data separately
      if (dataType === "attendance") {
        const result = await syncAttendanceData(data, route.name, routeId);
        imported = result.imported;
        failed = result.failed;
        
        const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
        console.log(`[Auto-Sync] [${route.name}] Attendance sync complete: ${imported} imported, ${failed} failed, ${result.skipped} skipped (no matching employee) in ${duration}s`);

        await prisma.dataImportLog.update({
          where: { id: importLog.id },
          data: {
            status: failed > 0 ? "partial" : "completed",
            recordsTotal: data.length,
            recordsImported: imported,
            recordsFailed: failed,
            completedAt: new Date(),
            metadata: { skipped: result.skipped, dataType: "attendance" },
          },
        });

        await prisma.apiRouting.update({
          where: { id: routeId },
          data: { 
            lastSyncAt: new Date(),
            lastSyncStatus: failed > 0 ? "partial" : "completed",
          },
        });
        
        return;
      }

      // Employee data import (original logic)
      for (const emp of data) {
        try {
          if (!emp["CARD_NO"]) {
            failed++;
            continue;
          }

          let departmentId = null;
          if (emp["DEPARTMENT.DEPT_CODE"]) {
            const deptCode = emp["DEPARTMENT.DEPT_CODE"];
            const dept = await prisma.department.upsert({
              where: { code: deptCode },
              update: { name: getDepartmentName(deptCode) },
              create: { 
                code: deptCode, 
                name: getDepartmentName(deptCode)
              },
            });
            departmentId = dept.id;
          }

          let designationId = null;
          if (emp["DESIGNATION.DESIGN_CODE"]) {
            const desigCode = emp["DESIGNATION.DESIGN_CODE"];
            const desig = await prisma.designation.upsert({
              where: { code: desigCode },
              update: { name: getDesignationName(desigCode) },
              create: { 
                code: desigCode, 
                name: getDesignationName(desigCode)
              },
            });
            designationId = desig.id;
          }

          let timePolicyId = null;
          if (emp["TIMEPOLICY.POLICY_NAME"]) {
            const policy = await prisma.timePolicy.upsert({
              where: { code: emp["TIMEPOLICY.POLICY_NAME"] },
              update: { 
                isSinglePunch: emp["TIMEPOLICY.IS_SINGLE_PUNCH"] === "true" 
              },
              create: { 
                code: emp["TIMEPOLICY.POLICY_NAME"],
                name: emp["TIMEPOLICY.POLICY_NAME"],
                isSinglePunch: emp["TIMEPOLICY.IS_SINGLE_PUNCH"] === "true"
              },
            });
            timePolicyId = policy.id;
          }

          let orgUnitId = null;
          if (emp["UNIT.BRANCH_CODE"]) {
            const orgUnit = await prisma.orgUnit.upsert({
              where: { code: emp["UNIT.BRANCH_CODE"] },
              update: { type: "branch" },
              create: { 
                code: emp["UNIT.BRANCH_CODE"],
                name: emp["UNIT.BRANCH_CODE"],
                type: "branch",
                level: 2,
              },
            });
            orgUnitId = orgUnit.id;
          }

          const nameParts = (emp["Name"] || "").trim().split(" ");
          const firstName = nameParts[0] || "Unknown";
          const lastName = nameParts.slice(1).join(" ") || null;

          let interviewDate = null;
          if (emp["Last_INTERVIEW_DATE"]) {
            try {
              const parts = emp["Last_INTERVIEW_DATE"].split("-");
              if (parts.length === 3) {
                const months: { [key: string]: string } = {
                  "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04",
                  "May": "05", "Jun": "06", "Jul": "07", "Aug": "08",
                  "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
                };
                const day = parts[0].padStart(2, "0");
                const month = months[parts[1]] || "01";
                const year = parts[2];
                interviewDate = new Date(`${year}-${month}-${day}`);
              }
            } catch (e) {}
          }

          await prisma.employee.upsert({
            where: { cardNumber: emp["CARD_NO"] },
            update: {
              firstName,
              lastName,
              phone: emp["Phone_NO_1"] || null,
              secondaryPhone: emp["PHONE_NO_2"] || null,
              personalEmail: emp["PERSONAL_Email"] || null,
              companyEmail: emp["COMPANY_EMAIL"] || null,
              gender: emp["GENDER"] || null,
              aadhaar: emp["ADHAR_CARD"] || null,
              profileImageUrl: emp["person_img_cdn_url"] || emp["personel_image"] || null,
              status: emp["STATUS"] || "ACTIVE",
              weeklyOff: emp["WEEKLY_OFF"] || null,
              shiftStart: emp["INTIME"] || null,
              shiftEnd: emp["OUTTIME"] || null,
              interviewDate,
              externalId: emp["ID"] || null,
              autoNumber: emp["Auto_Number"] || null,
              zohoId: emp["zohobooksid"] || null,
              departmentId,
              designationId,
              timePolicyId,
              orgUnitId,
              metadata: {
                weekly_off_calculation: emp["weekly_off_calculation"],
                last_interview_date: emp["Last_INTERVIEW_DATE"],
                mobile_otp: emp["Mobile_Otp"],
              },
            },
            create: {
              cardNumber: emp["CARD_NO"],
              firstName,
              lastName,
              phone: emp["Phone_NO_1"] || null,
              secondaryPhone: emp["PHONE_NO_2"] || null,
              personalEmail: emp["PERSONAL_Email"] || null,
              companyEmail: emp["COMPANY_EMAIL"] || null,
              gender: emp["GENDER"] || null,
              aadhaar: emp["ADHAR_CARD"] || null,
              profileImageUrl: emp["person_img_cdn_url"] || emp["personel_image"] || null,
              status: emp["STATUS"] || "ACTIVE",
              weeklyOff: emp["WEEKLY_OFF"] || null,
              shiftStart: emp["INTIME"] || null,
              shiftEnd: emp["OUTTIME"] || null,
              interviewDate,
              externalId: emp["ID"] || null,
              autoNumber: emp["Auto_Number"] || null,
              zohoId: emp["zohobooksid"] || null,
              departmentId,
              designationId,
              timePolicyId,
              orgUnitId,
              metadata: {
                weekly_off_calculation: emp["weekly_off_calculation"],
                last_interview_date: emp["Last_INTERVIEW_DATE"],
                mobile_otp: emp["Mobile_Otp"],
              },
            },
          });

          imported++;
          const processed = imported + failed;
          if (processed % 50 === 0 || processed === data.length) {
            console.log(`[Auto-Sync] [${route.name}] Progress: ${processed}/${data.length}`);
            await prisma.apiRouting.update({
              where: { id: routeId },
              data: { syncProgressCurrent: processed },
            });
          }
        } catch (empError: any) {
          failed++;
          const processed = imported + failed;
          if (processed % 50 === 0) {
            await prisma.apiRouting.update({
              where: { id: routeId },
              data: { syncProgressCurrent: processed },
            });
          }
        }
      }

      const duration = Math.round((Date.now() - startTime.getTime()) / 1000);
      console.log(`[Auto-Sync] [${route.name}] Complete: ${imported} imported, ${failed} failed in ${duration}s`);

      await prisma.dataImportLog.update({
        where: { id: importLog.id },
        data: {
          status: failed > 0 ? "partial" : "completed",
          recordsTotal: data.length,
          recordsImported: imported,
          recordsFailed: failed,
          completedAt: new Date(),
        },
      });

      await prisma.apiRouting.update({
        where: { id: routeId },
        data: { 
          lastSyncAt: new Date(),
          lastSyncStatus: failed > 0 ? "partial" : "completed",
        },
      });
    } catch (fetchError: any) {
      const errorMessage = fetchError.name === 'AbortError' 
        ? 'Request timed out'
        : fetchError.message;
      
      console.error(`[Auto-Sync] [${route.name}] Error: ${errorMessage}`);
      
      await prisma.dataImportLog.update({
        where: { id: importLog.id },
        data: {
          status: "failed",
          errorMessage: errorMessage,
          completedAt: new Date(),
        },
      });

      await prisma.apiRouting.update({
        where: { id: routeId },
        data: { 
          lastSyncAt: new Date(),
          lastSyncStatus: "failed",
        },
      });
    }
  } catch (error) {
    console.error(`[Auto-Sync] Fatal error for route ${routeId}:`, error);
  }
}

async function fetchApiData(url: string, headers?: any): Promise<any[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);
  
  const fetchHeaders: Record<string, string> = {
    "Accept": "application/json",
  };
  
  if (headers && typeof headers === "object") {
    Object.assign(fetchHeaders, headers);
  }
  
  const response = await fetch(url, {
    signal: controller.signal,
    headers: fetchHeaders,
  });
  clearTimeout(timeoutId);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data) 
    ? data 
    : (data.master_for_google || data.data || data.records || [data]);
}

async function fetchCsvData(urlOrPath: string): Promise<any[]> {
  let csvContent: string;
  
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    
    const response = await fetch(urlOrPath, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    csvContent = await response.text();
  } else {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    // Handle local uploads path
    let filePath = urlOrPath;
    if (urlOrPath.startsWith("/uploads/")) {
      filePath = path.join(process.cwd(), urlOrPath);
    }
    
    csvContent = await fs.readFile(filePath, "utf-8");
  }
  
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return [];
  }
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const records: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const record: any = {};
    
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });
    
    records.push(record);
  }
  
  return records;
}

// Parse date from CSV format (e.g., "5-Dec-25" or "12/5/2025")
function parseAttendanceDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  try {
    // Format: "5-Dec-25"
    if (dateStr.includes("-")) {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const months: { [key: string]: number } = {
          "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3,
          "May": 4, "Jun": 5, "Jul": 6, "Aug": 7,
          "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
        };
        const day = parseInt(parts[0]);
        const month = months[parts[1]];
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      }
    }
    // Format: "12/5/2025"
    if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      if (parts.length >= 3) {
        const month = parseInt(parts[0]) - 1;
        const day = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
      }
    }
    return new Date(dateStr);
  } catch {
    return null;
  }
}

// Parse datetime from CSV format (e.g., "12/5/2025 12:22")
function parseAttendanceDateTime(dateTimeStr: string): Date | null {
  if (!dateTimeStr) return null;
  
  try {
    // Format: "12/5/2025 12:22"
    const parts = dateTimeStr.split(" ");
    if (parts.length >= 2) {
      const dateParts = parts[0].split("/");
      const timeParts = parts[1].split(":");
      
      if (dateParts.length >= 3 && timeParts.length >= 2) {
        const month = parseInt(dateParts[0]) - 1;
        const day = parseInt(dateParts[1]);
        const year = parseInt(dateParts[2]);
        const hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);
        
        return new Date(year, month, day, hours, minutes);
      }
    }
    return new Date(dateTimeStr);
  } catch {
    return null;
  }
}

// Sync attendance records from CSV data
async function syncAttendanceData(
  data: any[], 
  routeName: string,
  routeId: string
): Promise<{ imported: number; failed: number; skipped: number }> {
  let imported = 0;
  let failed = 0;
  let skipped = 0;

  for (const record of data) {
    try {
      const cardno = record["cardno"] || record["ID"];
      if (!cardno) {
        skipped++;
        continue;
      }

      // Find employee by card number
      const employee = await prisma.employee.findUnique({
        where: { cardNumber: String(cardno) },
      });

      if (!employee) {
        // Employee not found in master data
        skipped++;
        continue;
      }

      // Parse date
      const attendanceDate = parseAttendanceDate(record["dt"]);
      if (!attendanceDate) {
        failed++;
        continue;
      }

      // Parse check-in and check-out times
      const checkIn = parseAttendanceDateTime(record["FirstIn"]);
      const checkOut = parseAttendanceDateTime(record["LastOUT"]);

      // Create date key for upsert (start of day)
      const dateStart = new Date(attendanceDate);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(attendanceDate);
      dateEnd.setHours(23, 59, 59, 999);

      // Check if attendance record already exists for this employee on this date
      const existing = await prisma.attendance.findFirst({
        where: {
          employeeId: employee.id,
          date: {
            gte: dateStart,
            lte: dateEnd,
          },
        },
      });

      const attendanceData = {
        checkInAt: checkIn,
        checkOutAt: checkOut,
        status: "present",
        meta: {
          device: record["device"] || null,
          originalStatus: record["status"] || null,
          empName: record["Empname"] || null,
        },
      };

      if (existing) {
        // Update existing record
        await prisma.attendance.update({
          where: { id: existing.id },
          data: attendanceData,
        });
      } else {
        // Create new record
        await prisma.attendance.create({
          data: {
            employeeId: employee.id,
            date: attendanceDate,
            ...attendanceData,
          },
        });
      }

      imported++;
      const processed = imported + failed + skipped;
      if (processed % 50 === 0 || processed === data.length) {
        console.log(`[Auto-Sync] [${routeName}] Attendance progress: ${processed}/${data.length}`);
        await prisma.apiRouting.update({
          where: { id: routeId },
          data: { syncProgressCurrent: processed },
        });
      }
    } catch (error: any) {
      failed++;
    }
  }

  return { imported, failed, skipped };
}

function scheduleRouteSync(route: { id: string; name: string; syncIntervalHours: number; syncIntervalMinutes: number }): void {
  stopRouteSync(route.id);
  
  const intervalMs = getIntervalMs(route.syncIntervalHours, route.syncIntervalMinutes);
  
  console.log(`[Auto-Sync] Scheduling "${route.name}" to sync every ${formatInterval(route.syncIntervalHours, route.syncIntervalMinutes)}`);
  
  const timer = setInterval(async () => {
    await syncApiSource(route.id);
  }, intervalMs);
  
  syncTimers.set(route.id, timer);
}

function stopRouteSync(routeId: string): void {
  const timer = syncTimers.get(routeId);
  if (timer) {
    clearInterval(timer);
    syncTimers.delete(routeId);
  }
}

export async function refreshSyncSchedules(): Promise<void> {
  try {
    const routes = await prisma.apiRouting.findMany({
      where: {
        status: "active",
        syncEnabled: true,
      },
    });

    syncTimers.forEach((_, routeId) => {
      if (!routes.find(r => r.id === routeId)) {
        stopRouteSync(routeId);
      }
    });

    for (const route of routes) {
      scheduleRouteSync({
        id: route.id,
        name: route.name,
        syncIntervalHours: route.syncIntervalHours,
        syncIntervalMinutes: route.syncIntervalMinutes,
      });
    }

    console.log(`[Auto-Sync] Refreshed schedules for ${routes.length} active data sources`);
  } catch (error) {
    console.error("[Auto-Sync] Error refreshing sync schedules:", error);
  }
}

export async function triggerManualSync(routeId: string): Promise<void> {
  await syncApiSource(routeId);
}

export async function startAutoSync(): Promise<void> {
  console.log("[Auto-Sync] Starting multi-source sync scheduler...");
  
  setTimeout(async () => {
    await refreshSyncSchedules();
    
    const routes = await prisma.apiRouting.findMany({
      where: {
        status: "active",
        syncEnabled: true,
      },
    });
    
    console.log(`[Auto-Sync] Running initial sync for ${routes.length} sources...`);
    
    for (const route of routes) {
      setTimeout(() => syncApiSource(route.id), 5000 + Math.random() * 10000);
    }
  }, 3000);
}
