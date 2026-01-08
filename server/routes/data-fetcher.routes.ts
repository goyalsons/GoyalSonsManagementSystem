import type { Express } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePolicy } from "../lib/auth-middleware";
import { getDepartmentName, getDesignationName } from "../auto-sync";

export function registerDataFetcherRoutes(app: Express): void {
  app.get("/api/admin/data-fetcher/logs", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const logs = await prisma.dataImportLog.findMany({
        orderBy: { startedAt: "desc" },
        take: 50,
      });
      res.json(logs);
    } catch (error) {
      console.error("Get import logs error:", error);
      res.status(500).json({ message: "Failed to fetch import logs" });
    }
  });

  app.delete("/api/admin/data-fetcher/logs", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      await prisma.dataImportLog.deleteMany({});
      res.json({ success: true, message: "Sync history cleared" });
    } catch (error) {
      console.error("Clear logs error:", error);
      res.status(500).json({ message: "Failed to clear sync history" });
    }
  });

  app.post("/api/admin/data-fetcher/sync-employees", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const masterUrlSetting = await prisma.systemSettings.findUnique({
        where: { key: "EMPLOYEE_MASTER_URL" },
      });

      if (!masterUrlSetting || !masterUrlSetting.value) {
        return res.status(400).json({ 
          message: "Employee Master URL not configured. Please set it in System Settings." 
        });
      }

      const importLog = await prisma.dataImportLog.create({
        data: {
          sourceName: "Employee Master",
          sourceUrl: masterUrlSetting.value,
          status: "in_progress",
        },
      });

      try {
        console.log(`[Data Fetcher] Starting fetch from: ${masterUrlSetting.value}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000);
        
        const response = await fetch(masterUrlSetting.value, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log("[Data Fetcher] Fetch successful, parsing JSON...");
        const data = await response.json();
        console.log("[Data Fetcher] JSON parsed successfully");
        
        const employees = Array.isArray(data) 
          ? data 
          : (data.master_for_google || data.data || data.records || [data]);
        
        console.log(`[Data Fetcher] Found ${employees.length} employees to import`);
        
        let imported = 0;
        let failed = 0;

        for (const emp of employees) {
          try {
            if (!emp["CARD_NO"] || emp["CARD_NO"].toString().trim() === "") {
              console.warn(`[Data Fetcher] Skipping employee with missing CARD_NO:`, emp["Name"] || "Unknown");
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
                update: {},
                create: { 
                  code: emp["UNIT.BRANCH_CODE"],
                  name: emp["UNIT.BRANCH_CODE"],
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
              } catch (e) {
                console.error("Date parse error:", e);
              }
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
            if (imported % 50 === 0) {
              console.log(`[Data Fetcher] Progress: ${imported}/${employees.length} employees imported`);
            }
          } catch (empError: any) {
            console.error(`[Data Fetcher] Failed to import employee ${emp["CARD_NO"]}:`, empError.message);
            failed++;
          }
        }

        console.log(`[Data Fetcher] Import complete: ${imported} imported, ${failed} failed`);

        await prisma.dataImportLog.update({
          where: { id: importLog.id },
          data: {
            status: failed > 0 ? "partial" : "completed",
            recordsTotal: employees.length,
            recordsImported: imported,
            recordsFailed: failed,
            completedAt: new Date(),
          },
        });

        res.json({
          success: true,
          message: `Import completed: ${imported} imported, ${failed} failed`,
          total: employees.length,
          imported,
          failed,
        });
      } catch (fetchError: any) {
        const errorMessage = fetchError.name === 'AbortError' 
          ? 'Request timed out after 60 seconds. The data source may be slow or unreachable.'
          : fetchError.message;
        
        console.error(`[Data Fetcher] Error: ${errorMessage}`);
        
        await prisma.dataImportLog.update({
          where: { id: importLog.id },
          data: {
            status: "failed",
            errorMessage: errorMessage,
            completedAt: new Date(),
          },
        });

        res.status(500).json({ 
          message: `Failed to fetch data: ${errorMessage}` 
        });
      }
    } catch (error) {
      console.error("Sync employees error:", error);
      res.status(500).json({ message: "Failed to sync employees" });
    }
  });

  app.post("/api/admin/data-fetcher/test-url", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ 
          success: false,
          message: `HTTP Error ${response.status}: ${response.statusText}` 
        });
      }

      const data = await response.json();
      const records = Array.isArray(data) 
        ? data 
        : (data.master_for_google || data.data || data.records || []);

      res.json({ 
        success: true,
        message: `Connection successful! Found ${records.length} employee records.`,
        recordCount: records.length
      });
    } catch (error: any) {
      res.status(400).json({ 
        success: false,
        message: `Connection failed: ${error.message}` 
      });
    }
  });

  app.post("/api/admin/test-api-preview", requireAuth, requirePolicy("admin.panel"), async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ success: false, message: "URL is required" });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
          return res.json({ 
            success: false,
            message: `HTTP Error ${response.status}: ${response.statusText}` 
          });
        }

        const data = await response.json();
        const records = Array.isArray(data) 
          ? data 
          : (data.master_for_google || data.data || data.records || []);

        if (!Array.isArray(records) || records.length === 0) {
          return res.json({ 
            success: false,
            message: "No records found in the API response" 
          });
        }

        const sampleRecord = records[0];
        const fields = Object.keys(sampleRecord);

        res.json({ 
          success: true,
          totalRecords: records.length,
          sampleRecord: sampleRecord,
          fields: fields,
        });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          return res.json({ 
            success: false,
            message: "Request timed out after 30 seconds" 
          });
        }
        throw fetchError;
      }
    } catch (error: any) {
      res.json({ 
        success: false,
        message: `Connection failed: ${error.message}` 
      });
    }
  });
}

