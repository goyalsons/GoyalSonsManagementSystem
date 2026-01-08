import type { Express } from "express";
import https from "follow-redirects";
import { format } from "date-fns";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-middleware";

// Sales API Configuration from Environment Variables
const SALES_API_TIMEOUT_MS = parseInt(process.env.SALES_API_TIMEOUT_MS || "60000", 10);
const SALES_API_HOST = process.env.SALES_API_HOST || 'VENDOR.GOYALSONS.COM';
const SALES_API_PORT = parseInt(process.env.SALES_API_PORT || "99", 10);
const SALES_API_PATH = process.env.SALES_API_PATH || '/gsweb_v3/webform2.aspx';
const SALES_API_KEY = process.env.SALES_API_KEY || 'ank2024';

// Helper function to ensure database connection is alive
async function ensureDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    console.warn('[Database] Connection check failed, attempting reconnect...', error.message);
    // Prisma will automatically reconnect on next query, but we can force it
    try {
      await prisma.$disconnect().catch(() => {});
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    // Wait a moment before retrying
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Test connection again
    await prisma.$queryRaw`SELECT 1`;
  }
}

export async function storeBillSummaryInDB(records: any[]): Promise<void> {
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Ensure database connection is alive before operations
      await ensureDatabaseConnection();
      
      // Clear old data (optional: you might want to keep historical data)
      // For now, we'll replace all data on refresh
      await prisma.salesStaffSummary.deleteMany({});
      
      // Insert new records
      const dataToInsert = records.map((r) => ({
        dat: r.dat || r.DAT || '',
        unit: r.UNIT || r.unit || null,
        smno: r.SMNO || r.smno || '',
        sm: r.SM || r.sm || null,
        divi: r.divi || r.DIVI || null,
        btype: r.BTYPE || r.btype || null,
        qty: parseInt(r.QTY || r.qty || '0', 10) || 0,
        netSale: parseFloat(r.NetSale || r.NETSALE || r.netSale || '0') || 0,
        updon: r.updon ? new Date(r.updon) : null,
      }));

      // Batch insert in chunks of 1000
      const chunkSize = 1000;
      for (let i = 0; i < dataToInsert.length; i += chunkSize) {
        const chunk = dataToInsert.slice(i, i + chunkSize);
        await prisma.salesStaffSummary.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }
      
      console.log(`[Sales Staff Summary] Stored ${records.length} records in PostgreSQL`);
      return; // Success, exit retry loop
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      console.error(`[Sales Staff Summary] Error storing data in DB (attempt ${attempt}/${maxRetries}):`, errorMessage);
      
      // Check if it's a connection error
      if (errorMessage.includes("Connection must be open") || 
          errorMessage.includes("Connection closed") ||
          errorMessage.includes("Connection terminated") ||
          error.code === "P1001" ||
          error.code === "P1008") {
        // Wait before retrying (exponential backoff)
        const waitTime = 1000 * attempt; // 1s, 2s, 3s
        console.log(`[Sales Staff Summary] Connection error detected, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Force reconnection
        try {
          await prisma.$disconnect().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
        continue; // Retry
      } else {
        // Non-connection error, throw immediately
        throw error;
      }
    }
  }
  
  // All retries failed
  throw new Error(`Failed to store data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// Helper function to read data from PostgreSQL with timeout (MTD filtered)
export async function getBillSummaryFromDB(): Promise<any[]> {
  const DB_TIMEOUT_MS = 10000; // 10 seconds timeout for DB operations
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database query timed out after 10 seconds'));
    }, DB_TIMEOUT_MS);
  });

  try {
    const records = await Promise.race([
      prisma.salesStaffSummary.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
      timeoutPromise,
    ]);
    
    // MTD Filter: Only get records from current month (1st of month to today)
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(23, 59, 59, 999);

    // Filter records to only include current month (MTD)
    const mtdRecords = records.filter((r) => {
      const recordDate = parseBillDate(r.dat);
      if (!recordDate) return false;
      return recordDate >= currentMonthStart && recordDate <= today;
    });
    
    // Convert back to the format expected by the frontend
    return mtdRecords.map((r) => ({
      dat: r.dat,
      DAT: r.dat,
      UNIT: r.unit || '',
      unit: r.unit || '',
      SMNO: r.smno,
      smno: r.smno,
      SM: r.sm || '',
      sm: r.sm || '',
      divi: r.divi || '',
      DIVI: r.divi || '',
      BTYPE: r.btype || '',
      btype: r.btype || '',
      QTY: r.qty.toString(),
      qty: r.qty.toString(),
      NetSale: r.netSale.toString(),
      NETSALE: r.netSale.toString(),
      netSale: r.netSale.toString(),
      updon: r.updon,
      updatedAt: r.updatedAt, // Include updatedAt for last refresh time calculation
    }));
  } catch (error: any) {
    console.error('[Sales Staff Summary] Error reading from database:', error);
    throw error;
  }
}

// Helper function to read ALL data from PostgreSQL (no MTD filtering) - for pivot table
async function getBillSummaryFromDBAll(): Promise<any[]> {
  const DB_TIMEOUT_MS = 10000; // 10 seconds timeout for DB operations
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database query timed out after 10 seconds'));
    }, DB_TIMEOUT_MS);
  });

  try {
    const records = await Promise.race([
      prisma.salesStaffSummary.findMany({
        orderBy: { dat: 'desc' }, // Order by date for pivot table
      }),
      timeoutPromise,
    ]);
    
    // NO MTD FILTERING - return all historical data
    // Convert back to the format expected by the frontend
    return records.map((r) => ({
      dat: r.dat,
      DAT: r.dat,
      UNIT: r.unit || '',
      unit: r.unit || '',
      SMNO: r.smno,
      smno: r.smno,
      SM: r.sm || '',
      sm: r.sm || '',
      divi: r.divi || '',
      DIVI: r.divi || '',
      BTYPE: r.btype || '',
      btype: r.btype || '',
      QTY: r.qty.toString(),
      qty: r.qty.toString(),
      NetSale: r.netSale.toString(),
      NETSALE: r.netSale.toString(),
      netSale: r.netSale.toString(),
      updon: r.updon,
    }));
  } catch (error: any) {
    console.error('[Sales Staff Summary] Error reading all data from database:', error);
    throw error;
  }
}

export async function fetchBillSummaryFromAPI(): Promise<any[]> {
  try {
    // New vendor API for bill summary: dat, UNIT, SMNO, SM, divi, BTYPE, QTY, NetSale, updon
    // MTD (Month-To-Date): Only fetch current month data from 1st of month to today
    const sqlQuery = `SELECT TO_CHAR(a.BILLDATE, 'DD-MON-YYYY') dat,a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end divi,a.BTYPE,round(SUM(A.QTY),0) QTY,round(Sum(a.SAL),0) NetSale , SYSDATE updon
FROM GSMT.SM_MONTHLY_BILLSUMMARY a
WHERE trunc(A.BILLDATE,'mon') = TRUNC(SYSDATE,'mon') AND A.BILLDATE <= SYSDATE and a.DIV <> 'NON-INVENTORY'
Group by TO_CHAR(a.BILLDATE, 'DD-MON-YYYY'),a.UNIT,a.SMNO,a.SM,Case When a.DIV in ('BOYS','GIRLS','INFANTS') then 'KIDS' else a.DIV end,a.BTYPE`;
    const encodedSql = encodeURIComponent(sqlQuery);
    const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;

    // Build headers object
    const headers: Record<string, string> = {
      'User-Agent': process.env.SALES_API_USER_AGENT || 'PostmanRuntime/7.43.4',
      'Accept': '*/*',
    };

    // Only add Authorization header if token exists and is valid
    try {
      const salesApiToken = process.env.SALES_API_TOKEN;
      if (salesApiToken) {
        // Remove all whitespace and control characters
        let cleanToken = salesApiToken.trim();
        
        // Skip if it looks like a SQL query
        if (cleanToken.startsWith('SELECT') || cleanToken.length > 500) {
          console.warn('[Sales Staff API] Skipping invalid token (looks like SQL query or too long)');
        } else {
          // Remove all control characters and non-printable characters
          cleanToken = cleanToken.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
          
          // Only add if token is valid after cleaning
          if (cleanToken.length > 0 && cleanToken.length < 500) {
            // Validate token doesn't contain invalid HTTP header characters
            if (!/[^\x20-\x7E]/.test(cleanToken)) {
              headers['Authorization'] = `Bearer ${cleanToken}`;
            } else {
              console.warn('[Sales Staff API] Token contains invalid characters, skipping Authorization header');
            }
          }
        }
      }
    } catch (error: any) {
      console.warn('[Sales Staff API] Error processing token, skipping Authorization header:', error.message);
    }

    const options = {
      method: 'GET' as const,
      hostname: SALES_API_HOST.toLowerCase(),
      port: SALES_API_PORT,
      path: apiPath,
      headers,
      rejectUnauthorized: process.env.SALES_API_REJECT_UNAUTHORIZED === 'true',
      maxRedirects: parseInt(process.env.SALES_API_MAX_REDIRECTS || "20", 10)
    };

    const responseText = await new Promise<string>((resolve, reject) => {
      let request: any = null;
      const timeoutId = setTimeout(() => {
        if (request) {
          request.destroy();
        }
        reject(new Error(`Bill summary request timed out after ${SALES_API_TIMEOUT_MS / 1000} seconds`));
      }, SALES_API_TIMEOUT_MS);

      request = https.https.request(options, (response: any) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          clearTimeout(timeoutId);
          const body = Buffer.concat(chunks).toString();
          if (response.statusCode !== 200) {
            reject(new Error(`Bill summary API returned status ${response.statusCode}: ${body.substring(0, 200)}`));
            return;
          }
          resolve(body);
        });
        response.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(new Error(`API response error: ${error.message}`));
        });
      });
      request.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(new Error(`API request error: ${error.message}. Check network connectivity to vendor.goyalsons.com:99`));
      });
      request.end();
    });

    let records: any[] = [];
    const looksLikeCsv = !responseText.trim().startsWith('{') && 
                        !responseText.trim().startsWith('[') && 
                        responseText.trim().split('\n')[0]?.includes(',');

    if (looksLikeCsv) {
      const lines = responseText.trim().split("\n");
      if (lines.length === 0) {
        throw new Error('API returned empty CSV response');
      }
      const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
        const record: Record<string, any> = {};
        csvHeaders.forEach((header, idx) => {
          record[header] = values[idx] || '';
        });
        records.push(record);
      }
    } else {
      try {
        const data = JSON.parse(responseText);
        records = Array.isArray(data) ? data : (data.data || data.records || []);
      } catch (parseError) {
        throw new Error(`Failed to parse API response: ${responseText.substring(0, 200)}`);
      }
    }
    
    console.log(`[Bill Summary API] Fetched ${records.length} records`);
    return records;
  } catch (error: any) {
    console.error('[Bill Summary API] Error fetching data:', error);
    throw new Error(`Failed to fetch bill summary from API: ${error.message}`);
  }
}

// Parse date like "10-NOV-2025" to Date object
export function parseBillDate(dateStr: string | Date): Date | null {
  if (!dateStr) return null;
  
  // If it's already a Date object, return it normalized
  if (dateStr instanceof Date) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  
  // Try parsing as ISO date string first
  if (dateStr.includes('T') || dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        d.setHours(0, 0, 0, 0);
        return d;
      }
    } catch (e) {
      // Continue to try other formats
    }
  }
  
  // Try parsing as "DD-MON-YYYY" format
  const months: Record<string, number> = {
    'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
    'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
  };
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = months[parts[1]?.toUpperCase()];
    const year = parseInt(parts[2]);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
  }
  
  // Try parsing as "DD/MM/YYYY" or "MM/DD/YYYY"
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3) {
    const part1 = parseInt(slashParts[0]);
    const part2 = parseInt(slashParts[1]);
    const part3 = parseInt(slashParts[2]);
    if (!isNaN(part1) && !isNaN(part2) && !isNaN(part3)) {
      // Try DD/MM/YYYY first
      if (part1 <= 31 && part2 <= 12) {
        const date = new Date(part3, part2 - 1, part1);
        if (!isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
      // Try MM/DD/YYYY
      if (part1 <= 12 && part2 <= 31) {
        const date = new Date(part3, part1 - 1, part2);
        if (!isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
      }
    }
  }
  
  return null;
}

// Helper: Fetch employee designations for SMNOs
export async function getEmployeeDesignations(smnos: string[]): Promise<Map<string, { code: string; name: string } | null>> {
  const designationMap = new Map<string, { code: string; name: string } | null>();
  
  if (smnos.length === 0) return designationMap;
  
  try {
    const employees = await prisma.employee.findMany({
      where: {
        cardNumber: { in: smnos },
      },
      select: {
        cardNumber: true,
        designation: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    employees.forEach(emp => {
      if (emp.cardNumber) {
        designationMap.set(emp.cardNumber, emp.designation ? {
          code: emp.designation.code,
          name: emp.designation.name,
        } : null);
      }
    });
  } catch (error) {
    console.error('[Sales Staff] Error fetching designations:', error);
    // Don't fail the whole request if designation fetch fails
  }
  
  return designationMap;
}

export function registerSalesStaffRoutes(app: Express) {
  // Refresh endpoint - fetches from API and stores in DB
  app.post("/api/sales/staff/summary/refresh", requireAuth, async (req, res) => {
    try {
      console.log('[Sales Staff Summary] Refresh requested by user:', req.user!.id);
      
      // Ensure database connection is alive before starting
      await ensureDatabaseConnection();
      
      // Fetch fresh monthly sales data from API (using new SQL query for pivot table)
      let records: any[];
      try {
        records = await fetchMonthlySalesForPivot();
      } catch (apiError: any) {
        // If it's a header error, provide more helpful message
        if (apiError.message?.includes('Invalid character in header') || 
            apiError.message?.includes('Authorization')) {
          console.error('[Sales Staff Summary] Header error - token may be invalid');
          return res.status(500).json({
            success: false,
            message: 'Failed to fetch monthly sales from API: Invalid authorization token. Please check SALES_API_TOKEN in .env file.',
            error: 'INVALID_TOKEN'
          });
        }
        throw apiError;
      }
      
      if (records.length === 0) {
        console.warn('[Sales Staff Summary] API returned empty data');
        return res.json({
          success: true,
          message: "Refresh completed, but no new data was returned from API",
          recordCount: 0,
        });
      }
      
      // Store in PostgreSQL (with retry logic)
      await storeMonthlySalesDataInDBForPivot(records);
      
      res.json({
        success: true,
        message: `Successfully refreshed ${records.length} monthly sales records for pivot table`,
        recordCount: records.length,
      });
    } catch (error: any) {
      console.error("Sales staff summary refresh error:", error);
      const errorMessage = error.message || "Failed to refresh data";
      res.status(500).json({ 
        success: false, 
        message: errorMessage.includes("Connection") 
          ? "Database connection error. Please try again in a moment." 
          : errorMessage
      });
    }
  });

  // Sales Staff Summary (cards + month/brand breakdown)
  app.get("/api/sales/staff/summary", requireAuth, async (req, res) => {
    try {
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      const requestedSmno = typeof req.query.smno === "string" ? req.query.smno : null;

      // Read from PostgreSQL instead of cache
      let data: any[] = [];
      let dataSource = 'database';
      
      try {
        data = await getBillSummaryFromDB();
        
        // If database is empty, fetch from API and store
        if (data.length === 0) {
          console.log('[Sales Staff Summary] Database empty, fetching initial data from API...');
          try {
            const records = await fetchBillSummaryFromAPI();
            if (records.length > 0) {
              await storeBillSummaryInDB(records);
              data = await getBillSummaryFromDB();
              dataSource = 'api-then-db';
            } else {
              console.warn('[Sales Staff Summary] API returned empty data');
              // Return empty data structure instead of error
              data = [];
            }
          } catch (apiError: any) {
            console.error('[Sales Staff Summary] Failed to fetch from API:', apiError);
            // Return error response instead of hanging
            return res.status(503).json({
              success: false,
              message: `Database is empty and unable to fetch from API: ${apiError.message}. Please use the Refresh button to try again.`,
              error: apiError.message,
              dataSource: 'none',
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Staff Summary] Error reading from DB:', dbError);
        // Try to fallback to API, but with proper error handling
        try {
          console.log('[Sales Staff Summary] Attempting API fallback...');
          data = await fetchBillSummaryFromAPI();
          dataSource = 'api-fallback';
          // Try to store for next time, but don't fail if it doesn't work
          try {
            await storeBillSummaryInDB(data);
          } catch (storeError) {
            console.warn('[Sales Staff Summary] Failed to store API data, but continuing with response:', storeError);
          }
        } catch (apiError: any) {
          console.error('[Sales Staff Summary] Both DB and API failed:', apiError);
          return res.status(503).json({
            success: false,
            message: `Unable to load sales data. Database error: ${dbError.message}. API error: ${apiError.message}. Please try refreshing.`,
            error: {
              database: dbError.message,
              api: apiError.message,
            },
            dataSource: 'none',
          });
        }
      }

      // Filter by employee if employee login (MDO users see all data)
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => r.SMNO === employeeCardNo);
      }

      // MTD Filter: Only include records from current month (1st of month to today)
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentMonthStart.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(23, 59, 59, 999);

      // Filter data to only include current month records
      data = data.filter((r) => {
        const recordDate = parseBillDate(r.dat || r.DAT);
        if (!recordDate) return false;
        return recordDate >= currentMonthStart && recordDate <= today;
      });

      // Get today's date for comparison (reset to start of day)
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const yesterday = new Date(todayStart);
      yesterday.setDate(yesterday.getDate() - 1);
      const dayBeforeYesterday = new Date(todayStart);
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

      // Build daily totals per staff for cards (today, last sale date, last-last sale date)
      const staffSales: Record<string, { 
        name: string; 
        unit: string;
        dateTotals: Record<string, number>;
        sortedDates: string[];
      }> = {};

      data.forEach((r) => {
        const smno = r.SMNO || "unknown";
        const name = r.SM || smno;
        const unit = r.UNIT || "";
        const dateStr = r.dat || r.DAT || "";
        const netSale = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

        if (!staffSales[smno]) {
          staffSales[smno] = { name, unit, dateTotals: {}, sortedDates: [] };
        }
        staffSales[smno].dateTotals[dateStr] = (staffSales[smno].dateTotals[dateStr] || 0) + netSale;
      });

      // Sort dates for each staff (most recent first)
      Object.values(staffSales).forEach(staff => {
        staff.sortedDates = Object.keys(staff.dateTotals)
          .map(d => ({ dateStr: d, date: parseBillDate(d) }))
          .filter(d => d.date !== null)
          .sort((a, b) => b.date!.getTime() - a.date!.getTime())
          .map(d => d.dateStr);
      });

      // Build cards array
      const cards = Object.entries(staffSales)
        .map(([smno, info]) => {
          const getVal = (idx: number) => info.sortedDates[idx] ? info.dateTotals[info.sortedDates[idx]] : 0;
          const totalSale = Object.values(info.dateTotals).reduce((sum, v) => sum + v, 0);

          return {
            smno,
            name: info.name,
            unit: info.unit,
            todaySale: getVal(0),      // Most recent date
            lastSale: getVal(1),        // Second most recent
            lastLastSale: getVal(2),    // Third most recent
            todayDate: info.sortedDates[0] || null,
            lastDate: info.sortedDates[1] || null,
            lastLastDate: info.sortedDates[2] || null,
            totalSale,
          };
        })
        .sort((a, b) => b.todaySale - a.todaySale);

      // Fetch designations for all SMNOs
      const uniqueSmnos = cards.map(c => c.smno);
      const designationMap = await getEmployeeDesignations(uniqueSmnos);

      // Filter to only include active employees (status: "ACTIVE" AND interviewDate: null)
      let activeEmployeeCardNos: Set<string> = new Set();
      try {
        const activeEmployees = await prisma.employee.findMany({
          where: {
            cardNumber: { in: uniqueSmnos },
            status: "ACTIVE",
            interviewDate: null, // Only active employees (not exited)
          },
          select: { cardNumber: true },
        });
        activeEmployeeCardNos = new Set(
          activeEmployees
            .map(e => e.cardNumber)
            .filter((card): card is string => card !== null)
        );
      } catch (error) {
        console.error('[Sales Staff Summary] Error filtering active employees:', error);
        // If filtering fails, include all (don't break the endpoint)
      }

      // Add designation to each card and filter to only active employees
      const cardsWithDesignation = cards
        .filter(card => activeEmployeeCardNos.has(card.smno)) // Only show active employees
        .map(card => ({
          ...card,
          designation: designationMap.get(card.smno) || null,
        }));

      // Determine which staff to show detail for
      // Employees see only their own data, MDO users can see all
      let targetSmno: string | null = requestedSmno;
      if (isEmployeeLogin) {
        targetSmno = employeeCardNo || null;
      }
      if (!targetSmno && cardsWithDesignation.length > 0) {
        targetSmno = cardsWithDesignation[0].smno;
      }

      // Get records for selected staff
      const staffRecords = targetSmno
        ? data.filter((r) => r.SMNO === targetSmno)
        : [];

      // Build table grouped by month and brand type
      let tableMonth: string | null = null;
      let tableRows: Array<{ brandType: string; quantity: number; netAmount: number }> = [];
      let grandTotal = 0;
      let grandQty = 0;

      if (staffRecords.length > 0) {
        // MTD: Use current month for table display
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        tableMonth = currentMonthKey;
        
        // Filter records for current month (MTD)
        const monthRecords = staffRecords.filter(r => {
          const d = parseBillDate(r.dat || r.DAT);
          if (!d) return false;
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          return monthKey === currentMonthKey;
        });

          // Group by BTYPE (N = INH, Y = SOR)
          const byBrand: Record<string, { quantity: number; netAmount: number }> = {};

          monthRecords.forEach((r) => {
            const btype = (r.BTYPE || "").toString().trim().toUpperCase();
            const brandKey = btype === "Y" ? "Y" : btype === "N" ? "N" : "Unknown";
            const quantity = parseInt(r.QTY || r.qty || 0) || 0;
            const netAmount = parseFloat(r.NetSale || r.NETSALE || 0) || 0;

            if (!byBrand[brandKey]) {
              byBrand[brandKey] = { quantity: 0, netAmount: 0 };
            }
            byBrand[brandKey].quantity += quantity;
            byBrand[brandKey].netAmount += netAmount;
            grandTotal += netAmount;
            grandQty += quantity;
          });

          const brandLabels: Record<string, string> = {
            N: "INH",
            Y: "SOR",
            Unknown: "Unknown",
          };

        tableRows = Object.entries(byBrand)
          .map(([key, vals]) => ({
            brandType: brandLabels[key] || key,
            quantity: vals.quantity,
            netAmount: vals.netAmount,
          }))
          .sort((a, b) => a.brandType.localeCompare(b.brandType));
      }

      // Calculate MTD date range: 1st of current month to today
      const mtdStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const mtdEndDate = new Date(now);
      
      const fromDate = format(mtdStartDate, "dd-MMM-yyyy").toUpperCase();
      const toDate = format(mtdEndDate, "dd-MMM-yyyy").toUpperCase();

      // Get the latest updatedAt timestamp from the data (last refresh time)
      let lastRefreshTime: Date | null = null;
      if (data.length > 0) {
        // Get max updatedAt from the records
        const maxUpdatedAt = data.reduce((max, r) => {
          const recordDate = r.updatedAt ? new Date(r.updatedAt) : null;
          if (!recordDate) return max;
          return !max || recordDate > max ? recordDate : max;
        }, null as Date | null);
        lastRefreshTime = maxUpdatedAt;
        // If no updatedAt found (API fallback case), use current time
        if (!lastRefreshTime && dataSource === 'api-fallback') {
          lastRefreshTime = new Date();
        }
      }

      return res.json({
        success: true,
        cards: cardsWithDesignation, // Use cards with designation
        table: {
          month: tableMonth,
          rows: tableRows,
          grandTotal,
          grandQty,
        },
        dateRange: {
          from: fromDate,
          to: toDate,
        },
        selectedSmno: targetSmno,
        dataSource, // Include data source for debugging
        lastRefreshTime: lastRefreshTime ? lastRefreshTime.toISOString() : null, // Add last refresh time
      });
    } catch (error: any) {
      console.error("Sales staff summary error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Helper function to fetch monthly sales data for pivot (using new SQL query)
  async function fetchMonthlySalesForPivot(): Promise<any[]> {
    const sqlQuery = process.env.SALES_API_MONTHLY_SQL_QUERY;

    if (!sqlQuery || sqlQuery.trim().length === 0) {
      throw new Error('SALES_API_MONTHLY_SQL_QUERY environment variable is required. Please set it in your .env file.');
    }

    const encodedSql = encodeURIComponent(sqlQuery);
    const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;
    
    const headers: Record<string, string> = {
      'User-Agent': process.env.SALES_API_USER_AGENT || 'PostmanRuntime/7.43.4',
      'Accept': '*/*',
    };

    try {
      const salesApiToken = process.env.SALES_API_TOKEN;
      if (salesApiToken) {
        let cleanToken = salesApiToken.trim();
        if (!cleanToken.startsWith('SELECT') && cleanToken.length < 500) {
          cleanToken = cleanToken.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
          if (cleanToken.length > 0 && !/[^\x20-\x7E]/.test(cleanToken)) {
            headers['Authorization'] = `Bearer ${cleanToken}`;
          }
        }
      }
    } catch (error: any) {
      console.warn('[Monthly Sales Pivot API] Error processing token:', error.message);
    }
    
    const options = {
      method: 'GET' as const,
      hostname: SALES_API_HOST,
      port: SALES_API_PORT,
      path: apiPath,
      headers,
      rejectUnauthorized: process.env.SALES_API_REJECT_UNAUTHORIZED === 'true',
      maxRedirects: parseInt(process.env.SALES_API_MAX_REDIRECTS || "20", 10)
    };

    const responseText = await new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${SALES_API_TIMEOUT_MS / 1000} seconds`));
      }, SALES_API_TIMEOUT_MS);

      const request = https.https.request(options, (response: any) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          clearTimeout(timeoutId);
          const body = Buffer.concat(chunks).toString();
          if (response.statusCode !== 200) {
            reject(new Error(`API returned status ${response.statusCode}`));
            return;
          }
          resolve(body);
        });
        response.on('error', (error: Error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
      request.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      request.end();
    });

    let records: any[] = [];
    const looksLikeCsv = !responseText.trim().startsWith('{') && 
                        !responseText.trim().startsWith('[') && 
                        responseText.trim().split('\n')[0]?.includes(',');

    if (looksLikeCsv) {
      const lines = responseText.trim().split("\n");
      const csvHeaders = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ''));
        const record: Record<string, any> = {};
        csvHeaders.forEach((header, idx) => {
          record[header] = values[idx] || '';
        });
        records.push(record);
      }
    } else {
      const data = JSON.parse(responseText);
      records = Array.isArray(data) ? data : (data.data || data.records || []);
    }
    
    return records;
  }

  // Helper function to store monthly sales data in PostgreSQL (for pivot)
  async function storeMonthlySalesDataInDBForPivot(records: any[]): Promise<void> {
    const maxRetries = 3;
    let lastError: any = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await ensureDatabaseConnection();
        
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
        twoMonthsAgo.setDate(1);
        twoMonthsAgo.setHours(0, 0, 0, 0);
        
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);
        
        await prisma.salesData.deleteMany({
          where: {
            billMonth: {
              gte: twoMonthsAgo,
              lt: currentMonth,
            },
          },
        });
        
        const dataToInsert = records.map((r) => {
          let billMonthDate: Date | null = null;
          if (r.BILL_MONTH || r.bill_month) {
            try {
              const dateStr = r.BILL_MONTH || r.bill_month;
              if (typeof dateStr === 'string' && dateStr.includes('-')) {
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                  const day = parseInt(parts[0], 10);
                  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                  const monthIndex = monthNames.indexOf(parts[1].toUpperCase());
                  const year = parseInt(parts[2], 10);
                  if (monthIndex !== -1 && !isNaN(year)) {
                    billMonthDate = new Date(year, monthIndex, day);
                  }
                }
              }
              if (!billMonthDate) {
                billMonthDate = new Date(dateStr);
              }
              if (isNaN(billMonthDate.getTime())) {
                billMonthDate = null;
              }
            } catch (e) {
              billMonthDate = null;
            }
          }
          
          return {
            smno: r.SMNO || r.smno || null,
            sm: r.SM || r.sm || null,
            shrtname: r.SHRTNAME || r.shrtname || null,
            dept: r.DEPT || r.dept || null,
            brand: r.BRAND || r.brand || null,
            email: r.EMAIL || r.email || null,
            totalSale: parseFloat(r.TOTAL_SALE || r.total_sale || r.TOTAL_SALE || '0') || 0,
            inhouseSal: parseFloat(r.INHOUSE_SAL || r.inhouse_sal || r.INHOUSE_SAL || '0') || 0,
            prDays: parseInt(r.PR_DAYS || r.pr_days || r.PR_DAYS || '0', 10) || 0,
            billMonth: billMonthDate,
            updOn: r.UPD_ON || r.upd_on || r.UPD_ON || null,
          };
        });

        const chunkSize = 1000;
        for (let i = 0; i < dataToInsert.length; i += chunkSize) {
          const chunk = dataToInsert.slice(i, i + chunkSize);
          await prisma.salesData.createMany({
            data: chunk,
            skipDuplicates: true,
          });
        }
        
        console.log(`[Monthly Sales Pivot] Stored ${records.length} records in PostgreSQL`);
        return;
      } catch (error: any) {
        lastError = error;
        const errorMessage = error.message || String(error);
        console.error(`[Monthly Sales Pivot] Error storing data in DB (attempt ${attempt}/${maxRetries}):`, errorMessage);
        
        if (errorMessage.includes("Connection must be open") || 
            errorMessage.includes("Connection closed") ||
            errorMessage.includes("Connection terminated") ||
            error.code === "P1001" ||
            error.code === "P1008") {
          const waitTime = 1000 * attempt;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          try {
            await prisma.$disconnect().catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (disconnectError) {
            // Ignore
          }
          continue;
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Failed to store monthly sales data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  // Helper function to get monthly sales data from DB for pivot
  async function getMonthlySalesFromDBForPivot(): Promise<any[]> {
    const DB_TIMEOUT_MS = 10000;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Database query timed out after 10 seconds'));
      }, DB_TIMEOUT_MS);
    });

    try {
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      twoMonthsAgo.setDate(1);
      twoMonthsAgo.setHours(0, 0, 0, 0);
      
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const records = await Promise.race([
        prisma.salesData.findMany({
          where: {
            billMonth: {
              gte: twoMonthsAgo,
              lt: currentMonth,
            },
          },
          orderBy: { billMonth: 'desc' },
        }),
        timeoutPromise,
      ]);
      
      return records;
    } catch (error: any) {
      console.error('[Monthly Sales Pivot] Error reading from database:', error);
      throw error;
    }
  }

  // Sales Pivot Data (for Excel-style pivot table) - Using Monthly Sales Data
  app.get("/api/sales/pivot", requireAuth, async (req, res) => {
    try {
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;

      // Read monthly sales data from PostgreSQL
      let data: any[] = [];
      try {
        data = await getMonthlySalesFromDBForPivot();
        
        // If database is empty, fetch from API and store
        if (data.length === 0) {
          console.log('[Sales Pivot] Database empty, fetching initial data from API...');
          try {
            const records = await fetchMonthlySalesForPivot();
            if (records.length > 0) {
              await storeMonthlySalesDataInDBForPivot(records);
              data = await getMonthlySalesFromDBForPivot();
            } else {
              console.warn('[Sales Pivot] API returned empty data');
              data = [];
            }
          } catch (apiError: any) {
            console.error('[Sales Pivot] Failed to fetch from API:', apiError);
            return res.json({
              success: true,
              data: [],
              recordCount: 0,
              message: `Database is empty and unable to fetch from API: ${apiError.message}. Please use the Refresh button.`,
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Pivot] Error reading from DB:', dbError);
        // Try to fallback to API
        try {
          console.log('[Sales Pivot] Attempting API fallback...');
          data = await fetchMonthlySalesForPivot();
        } catch (apiError: any) {
          console.error('[Sales Pivot] Both DB and API failed:', apiError);
          return res.json({
            success: true,
            data: [],
            recordCount: 0,
            message: `Unable to load pivot data. Please try refreshing.`,
          });
        }
      }

      // Filter by employee if employee login (MDO users see all data)
      if (isEmployeeLogin && employeeCardNo) {
        data = data.filter((r) => (r.smno || "").toString() === employeeCardNo.toString());
      } else {
        // For MDO users: Filter to show only sales employees (designation = "SM")
        try {
          const salesEmployees = await prisma.employee.findMany({
            where: {
              designation: {
                code: "SM"
              },
              status: "ACTIVE"
            },
            select: {
              cardNumber: true
            }
          });
          
          const salesEmployeeCardNumbers = salesEmployees
            .map(emp => emp.cardNumber)
            .filter(cardNo => cardNo !== null && cardNo !== undefined)
            .map(cardNo => cardNo!.toString());
          
          if (salesEmployeeCardNumbers.length > 0) {
            data = data.filter((r) => {
              const smno = (r.smno || "").toString();
              return salesEmployeeCardNumbers.includes(smno);
            });
            console.log(`[Sales Pivot] Filtered to ${data.length} records for ${salesEmployeeCardNumbers.length} sales employees`);
          } else {
            console.warn('[Sales Pivot] No sales employees found with designation SM');
          }
        } catch (filterError: any) {
          console.error('[Sales Pivot] Error filtering sales employees:', filterError);
        }
      }

      // Transform monthly sales data to pivot format
      // Monthly data: SHRTNAME, DEPT, SMNO, SM, EMAIL, BILL_MONTH, BRAND, TOTAL_SALE, PR_DAYS, INHOUSE_SAL
      // Pivot expects: dat, unit, smno, sm, divi, btype, qty, netsale
      const pivotData = data.map((r) => {
        // Parse BILL_MONTH date (can be Date object or string)
        let dat = "";
        if (r.billMonth) {
          try {
            const dateObj = r.billMonth instanceof Date ? r.billMonth : new Date(r.billMonth);
            if (!isNaN(dateObj.getTime())) {
              dat = format(dateObj, 'dd-MMM-yyyy').toUpperCase();
            }
          } catch {
            dat = "";
          }
        }

        // Determine btype: "N" for InHouse (if INHOUSE_SAL > 0), "Y" for SOR (external)
        const totalSale = parseFloat(r.totalSale?.toString() || '0') || 0;
        const inhouseSal = parseFloat(r.inhouseSal?.toString() || '0') || 0;
        const externalSale = totalSale - inhouseSal;
        
        // Create two rows: one for InHouse, one for SOR (if both exist)
        const rows: any[] = [];
        
        if (inhouseSal > 0) {
          rows.push({
            dat: dat,
            unit: r.shrtname || "",
            smno: parseInt(r.smno || "0", 10) || 0,
            sm: r.sm || "",
            divi: r.brand || r.dept || "",
            btype: "N" as "Y" | "N", // N = InHouse
            qty: parseInt(r.prDays?.toString() || '0', 10) || 0,
            netsale: inhouseSal,
          });
        }
        
        if (externalSale > 0) {
          rows.push({
            dat: dat,
            unit: r.shrtname || "",
            smno: parseInt(r.smno || "0", 10) || 0,
            sm: r.sm || "",
            divi: r.brand || r.dept || "",
            btype: "Y" as "Y" | "N", // Y = SOR (external)
            qty: parseInt(r.prDays?.toString() || '0', 10) || 0,
            netsale: externalSale,
          });
        }
        
        // If no sale at all, still create one row
        if (rows.length === 0) {
          rows.push({
            dat: dat,
            unit: r.shrtname || "",
            smno: parseInt(r.smno || "0", 10) || 0,
            sm: r.sm || "",
            divi: r.brand || r.dept || "",
            btype: "N" as "Y" | "N",
            qty: parseInt(r.prDays?.toString() || '0', 10) || 0,
            netsale: 0,
          });
        }
        
        return rows;
      }).flat(); // Flatten array of arrays

      return res.json({
        success: true,
        data: pivotData,
        recordCount: pivotData.length,
      });
    } catch (error: any) {
      console.error("Sales pivot error:", error);
      res.status(500).json({ success: false, message: error.message, data: [] });
    }
  });

}

