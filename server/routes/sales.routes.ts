import type { Express } from "express";
import https from "follow-redirects";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth-middleware";
import { format } from "date-fns";

// Helper function to ensure database connection is alive
async function ensureDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error: any) {
    console.warn('[Database] Connection check failed, attempting reconnect...', error.message);
    try {
      await prisma.$disconnect().catch(() => {});
    } catch (disconnectError) {
      // Ignore disconnect errors
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    await prisma.$queryRaw`SELECT 1`;
  }
}

// Sales API Configuration from Environment Variables
const SALES_API_TIMEOUT_MS = parseInt(process.env.SALES_API_TIMEOUT_MS || "60000", 10);
const SALES_API_HOST = process.env.SALES_API_HOST || 'VENDOR.GOYALSONS.COM';
const SALES_API_PORT = parseInt(process.env.SALES_API_PORT || "99", 10);
const SALES_API_PATH = process.env.SALES_API_PATH || '/gsweb_v3/webform2.aspx';
const SALES_API_KEY = process.env.SALES_API_KEY || 'ank2024';
const SALES_API_SQL_QUERY = process.env.SALES_API_SQL_QUERY;

async function fetchSalesDataFromAPI(): Promise<any[]> {
  if (!SALES_API_SQL_QUERY) {
    throw new Error('SALES_API_SQL_QUERY environment variable is required. Please set it in your .env file.');
  }

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
        console.warn('[Sales API] Skipping invalid token (looks like SQL query or too long)');
      } else {
        // Remove all control characters and non-printable characters
        cleanToken = cleanToken.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
        
        // Only add if token is valid after cleaning
        if (cleanToken.length > 0 && cleanToken.length < 500) {
          // Validate token doesn't contain invalid HTTP header characters
          if (!/[^\x20-\x7E]/.test(cleanToken)) {
            headers['Authorization'] = `Bearer ${cleanToken}`;
          } else {
            console.warn('[Sales API] Token contains invalid characters, skipping Authorization header');
          }
        }
      }
    }
  } catch (error: any) {
    console.warn('[Sales API] Error processing token, skipping Authorization header:', error.message);
  }
  
  const sqlQuery = SALES_API_SQL_QUERY;
  const encodedSql = encodeURIComponent(sqlQuery);
  const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;
  
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

// Helper function to fetch monthly sales data from external API
async function fetchMonthlySalesDataFromAPI(): Promise<any[]> {
  // Read SQL query from environment variable only (no hardcoded fallback)
  const sqlQuery = process.env.SALES_API_MONTHLY_SQL_QUERY;

  if (!sqlQuery || sqlQuery.trim().length === 0) {
    throw new Error('SALES_API_MONTHLY_SQL_QUERY environment variable is required. Please set it in your .env file.');
  }

  const encodedSql = encodeURIComponent(sqlQuery);
  const apiPath = `${SALES_API_PATH}?sql=${encodedSql}&TYP=sql&key=${SALES_API_KEY}`;
  
  // Build headers object
  const headers: Record<string, string> = {
    'User-Agent': process.env.SALES_API_USER_AGENT || 'PostmanRuntime/7.43.4',
    'Accept': '*/*',
  };

  // Add Authorization header if token exists
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
    console.warn('[Monthly Sales API] Error processing token:', error.message);
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

// Helper function to store monthly sales data in PostgreSQL
async function storeMonthlySalesDataInDB(records: any[]): Promise<void> {
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureDatabaseConnection();
      
      // Clear old monthly data - only keep Current Month + Last Month
      // Delete records where billMonth is Current Month or Last Month
      // This ensures old months are automatically removed when new month starts
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      lastMonthStart.setHours(0, 0, 0, 0);
      
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      nextMonthStart.setHours(0, 0, 0, 0);
      
      // Delete Current Month + Last Month data (will be replaced with fresh data)
      await (prisma as any).salesData.deleteMany({
        where: {
          billMonth: {
            gte: lastMonthStart,
            lt: nextMonthStart,
          },
        },
      });
      
      // Filter records to only include Current Month + Last Month
      // BILL_MONTH is always the 1st day of the month
      
      // Helper to parse BILL_MONTH and get month start date
      const parseBillMonthToDate = (billMonth: string | null | undefined): Date | null => {
        if (!billMonth) return null;
        try {
          // Handle DD-MON-YYYY format (e.g., "01-JAN-2026")
          if (typeof billMonth === 'string' && billMonth.includes('-')) {
            const parts = billMonth.split('-');
            if (parts.length === 3) {
              const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
              const monthIndex = monthNames.indexOf(parts[1].toUpperCase());
              const year = parseInt(parts[2], 10);
              if (monthIndex !== -1 && !isNaN(year)) {
                // BILL_MONTH represents the 1st day of the month
                return new Date(year, monthIndex, 1);
              }
            }
          }
          // Fallback: try parsing as Date
          const date = new Date(billMonth);
          if (!isNaN(date.getTime())) {
            // Normalize to 1st day of month
            return new Date(date.getFullYear(), date.getMonth(), 1);
          }
          return null;
        } catch {
          return null;
        }
      };
      
      // Filter to only Current Month + Last Month
      const filteredRecords = records.filter((r: any) => {
        try {
          const billMonthStr = r.BILL_MONTH || r.bill_month;
          if (!billMonthStr) return false;
          
          const billMonthDate = parseBillMonthToDate(billMonthStr);
          if (!billMonthDate) return false;
          
          // Check if billMonth is within Current Month or Last Month range
          return billMonthDate >= lastMonthStart && billMonthDate < nextMonthStart;
        } catch (err) {
          console.warn('[Monthly Sales Data] Error filtering record:', err, r);
          return false;
        }
      });
      
      console.log(`[Monthly Sales Data] Filtered ${filteredRecords.length} records (Current + Last Month) from ${records.length} total records`);
      
      // Insert new records
      const dataToInsert = filteredRecords.map((r) => {
        try {
          // Parse BILL_MONTH to Date if it exists (format: DD-MON-YYYY)
          let billMonthDate: Date | null = null;
          if (r.BILL_MONTH || r.bill_month) {
            billMonthDate = parseBillMonthToDate(r.BILL_MONTH || r.bill_month);
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
        } catch (err) {
          console.warn('[Monthly Sales Data] Error mapping record:', err, r);
          return null;
        }
      }).filter((r): r is NonNullable<typeof r> => r !== null);

      // Batch insert in chunks of 1000
      const chunkSize = 1000;
      for (let i = 0; i < dataToInsert.length; i += chunkSize) {
        const chunk = dataToInsert.slice(i, i + chunkSize);
        await (prisma as any).salesData.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }
      
      console.log(`[Monthly Sales Data] Stored ${filteredRecords.length} records (Current + Last Month) in PostgreSQL`);
      return; // Success, exit retry loop
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      console.error(`[Monthly Sales Data] Error storing data in DB (attempt ${attempt}/${maxRetries}):`, errorMessage);
      
      // Check if it's a connection error
      if (errorMessage.includes("Connection must be open") || 
          errorMessage.includes("Connection closed") ||
          errorMessage.includes("Connection terminated") ||
          error.code === "P1001" ||
          error.code === "P1008") {
        const waitTime = 1000 * attempt;
        console.log(`[Monthly Sales Data] Connection error detected, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        try {
          await prisma.$disconnect().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
        continue; // Retry
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to store monthly sales data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// Helper function to read monthly sales data from PostgreSQL
async function getMonthlySalesDataFromDB(): Promise<any[]> {
  const DB_TIMEOUT_MS = 10000; // 10 seconds timeout
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database query timed out after 10 seconds'));
    }, DB_TIMEOUT_MS);
  });

  try {
    // Get Current Month + Last Month (2 months total)
    // BILL_MONTH is always the 1st day of the month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    currentMonthStart.setHours(0, 0, 0, 0);
    
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastMonthStart.setHours(0, 0, 0, 0);
    
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    nextMonthStart.setHours(0, 0, 0, 0);

    // Return records for Current Month OR Last Month only
    const records = await Promise.race([
      (prisma as any).salesData.findMany({
        where: {
          billMonth: {
            gte: lastMonthStart,
            lt: nextMonthStart,
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      timeoutPromise,
    ]);
    
    // Convert back to the format expected by the frontend
    return records.map((r: any) => ({
      SHRTNAME: r.shrtname || '',
      DEPT: r.dept || '',
      SMNO: r.smno || '',
      SM: r.sm || '',
      EMAIL: r.email || '',
      BILL_MONTH: r.billMonth ? format(new Date(r.billMonth), 'dd-MMM-yyyy').toUpperCase().replace(/-/g, '-') : null,
      BRAND: r.brand || '',
      TOTAL_SALE: r.totalSale.toString(),
      PR_DAYS: r.prDays.toString(),
      INHOUSE_SAL: r.inhouseSal.toString(),
      UPD_ON: r.updOn || '',
      // Also include lowercase versions for compatibility
      shrtname: r.shrtname || '',
      dept: r.dept || '',
      smno: r.smno || '',
      sm: r.sm || '',
      email: r.email || '',
      billMonth: r.billMonth ? r.billMonth.toISOString() : null,
      brand: r.brand || '',
      totalSale: r.totalSale,
      inhouseSal: r.inhouseSal,
      prDays: r.prDays,
      updOn: r.updOn || '',
    }));
  } catch (error: any) {
    console.error('[Monthly Sales Data] Error reading from database:', error);
    throw error;
  }
}

// Helper function to store sales data in PostgreSQL
async function storeSalesDataInDB(records: any[]): Promise<void> {
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await ensureDatabaseConnection();
      
      // Clear old data (replace all data on refresh)
      await (prisma as any).salesData.deleteMany({});
      
      // Insert new records
      const dataToInsert = records.map((r) => {
        // Parse BILL_MONTH to Date if it exists
        let billMonthDate: Date | null = null;
        if (r.BILL_MONTH) {
          try {
            billMonthDate = new Date(r.BILL_MONTH);
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
          totalSale: parseFloat(r.TOTAL_SALE || r.totalSale || '0') || 0,
          inhouseSal: parseFloat(r.INHOUSE_SAL || r.inhouseSal || '0') || 0,
          prDays: parseInt(r.PR_DAYS || r.prDays || '0', 10) || 0,
          billMonth: billMonthDate,
          updOn: r.UPD_ON || r.updOn || null,
        };
      });

      // Batch insert in chunks of 1000
      const chunkSize = 1000;
      for (let i = 0; i < dataToInsert.length; i += chunkSize) {
        const chunk = dataToInsert.slice(i, i + chunkSize);
        await (prisma as any).salesData.createMany({
          data: chunk,
          skipDuplicates: true,
        });
      }
      
      console.log(`[Sales Data] Stored ${records.length} records in PostgreSQL`);
      return; // Success, exit retry loop
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || String(error);
      console.error(`[Sales Data] Error storing data in DB (attempt ${attempt}/${maxRetries}):`, errorMessage);
      
      // Check if it's a connection error
      if (errorMessage.includes("Connection must be open") || 
          errorMessage.includes("Connection closed") ||
          errorMessage.includes("Connection terminated") ||
          error.code === "P1001" ||
          error.code === "P1008") {
        const waitTime = 1000 * attempt;
        console.log(`[Sales Data] Connection error detected, retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        try {
          await prisma.$disconnect().catch(() => {});
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
        continue; // Retry
      } else {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to store data after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}

// Helper function to read sales data from PostgreSQL
async function getSalesDataFromDB(): Promise<any[]> {
  const DB_TIMEOUT_MS = 10000; // 10 seconds timeout
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Database query timed out after 10 seconds'));
    }, DB_TIMEOUT_MS);
  });

  try {
    const records = await Promise.race([
      (prisma as any).salesData.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
      timeoutPromise,
    ]);
    
    // Convert back to the format expected by the frontend
    return records.map((r: any) => ({
      SMNO: r.smno || '',
      SM: r.sm || '',
      SHRTNAME: r.shrtname || '',
      DEPT: r.dept || '',
      BRAND: r.brand || '',
      EMAIL: r.email || '',
      TOTAL_SALE: r.totalSale.toString(),
      INHOUSE_SAL: r.inhouseSal.toString(),
      PR_DAYS: r.prDays.toString(),
      BILL_MONTH: r.billMonth ? r.billMonth.toISOString() : null,
      UPD_ON: r.updOn || '',
      // Also include lowercase versions for compatibility
      smno: r.smno || '',
      sm: r.sm || '',
      shrtname: r.shrtname || '',
      dept: r.dept || '',
      brand: r.brand || '',
      email: r.email || '',
      totalSale: r.totalSale,
      inhouseSal: r.inhouseSal,
      prDays: r.prDays,
      billMonth: r.billMonth ? r.billMonth.toISOString() : null,
      updOn: r.updOn || '',
    }));
  } catch (error: any) {
    console.error('[Sales Data] Error reading from database:', error);
    throw error;
  }
}

export function registerSalesRoutes(app: Express): void {
  // Refresh endpoint - fetch from API and store in DB
  app.post("/api/sales/refresh", requireAuth, async (req, res) => {
    try {
      console.log('[Sales API] Refresh requested - fetching from vendor API...');
      const records = await fetchSalesDataFromAPI();
      console.log(`[Sales API] Fetched ${records.length} records from API`);
      
      // Store in database
      await storeSalesDataInDB(records);
      
      res.json({
        success: true,
        message: `Successfully refreshed ${records.length} sales records`,
        recordCount: records.length,
      });
    } catch (error: any) {
      console.error("Sales refresh error:", error);
      res.status(500).json({
        success: false,
        message: `Failed to refresh sales data: ${error.message}`,
      });
    }
  });

  app.get("/api/sales", requireAuth, async (req, res) => {
    try {
      const { page = "1", limit = "100", dept, brand, search } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));

      // Read data from database
      let records: any[];
      try {
        records = await getSalesDataFromDB();
        if (records.length === 0) {
          // If DB is empty, try fetching from API and storing
          console.log('[Sales API] Database is empty, fetching from API...');
          records = await fetchSalesDataFromAPI();
          if (records.length > 0) {
            await storeSalesDataInDB(records).catch(err => {
              console.error('[Sales API] Failed to store initial data:', err);
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales API] Database read failed, falling back to API:', dbError);
        // Fallback to API if DB fails
        records = await fetchSalesDataFromAPI();
      }

      let totalSales = 0;
      let totalDays = 0;
      records.forEach((record: any) => {
        totalSales += parseFloat(record.TOTAL_SALE) || 0;
        totalDays += parseInt(record.PR_DAYS) || 0;
      });

      let filteredData = [...records];

      // Apply filters
      if (dept && dept !== 'all') {
        filteredData = filteredData.filter(r => r.DEPT === dept);
      }
      if (brand && brand !== 'all') {
        filteredData = filteredData.filter(r => r.BRAND === brand);
      }
      if (search && typeof search === 'string' && search.trim()) {
        const searchLower = search.toLowerCase();
        filteredData = filteredData.filter(r => 
          r.SM?.toLowerCase().includes(searchLower) ||
          r.SHRTNAME?.toLowerCase().includes(searchLower) ||
          r.SMNO?.toLowerCase().includes(searchLower) ||
          r.EMAIL?.toLowerCase().includes(searchLower)
        );
      }

      // Sort by total sale descending
      filteredData.sort((a, b) => (parseFloat(b.TOTAL_SALE) || 0) - (parseFloat(a.TOTAL_SALE) || 0));

      // Pagination
      const totalFiltered = filteredData.length;
      const skip = (pageNum - 1) * limitNum;
      const paginatedData = filteredData.slice(skip, skip + limitNum);

      // Get unique departments and brands for filters
      const departments = Array.from(new Set(records.map(r => r.DEPT).filter(Boolean))).sort();
      const brands = Array.from(new Set(records.map(r => r.BRAND).filter(Boolean))).sort();

      res.json({ 
        success: true, 
        data: paginatedData,
        summary: {
          totalSales,
          totalRecords: records.length,
          avgSale: records.length > 0 ? Math.round(totalSales / records.length) : 0,
          avgDays: records.length > 0 ? Math.round(totalDays / records.length) : 0,
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalFiltered,
          totalPages: Math.ceil(totalFiltered / limitNum),
          hasMore: skip + paginatedData.length < totalFiltered,
        },
        filters: { departments, brands }
      });
    } catch (error: any) {
      console.error("Sales API error:", error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to fetch sales data: ${error.message}` 
      });
    }
  });

  // Sales Dashboard - Aggregated data for executive dashboard
  app.get("/api/sales/dashboard", requireAuth, async (req, res) => {
    try {
      const { month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Employee login: restrict to last 2 months
      if (isEmployeeLogin && month && typeof month === 'string') {
        const requestedMonth = new Date(month);
        const now = new Date();
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (requestedMonth < twoMonthsAgo) {
          return res.status(403).json({ 
            success: false,
            message: "Access denied: You can only view sales from the last 2 months" 
          });
        }
      }
      
      // Read data from database
      let data: any[];
      try {
        data = await getSalesDataFromDB();
        if (data.length === 0) {
          // If DB is empty, try fetching from API and storing
          console.log('[Sales Dashboard] Database is empty, fetching from API...');
          data = await fetchSalesDataFromAPI();
          if (data.length > 0) {
            await storeSalesDataInDB(data).catch(err => {
              console.error('[Sales Dashboard] Failed to store initial data:', err);
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Dashboard] Database read failed, falling back to API:', dbError);
        // Fallback to API if DB fails
        data = await fetchSalesDataFromAPI();
      }
      
      // Filter by month if provided
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          const recordMonth = new Date(r.BILL_MONTH).toISOString().slice(0, 7);
          return recordMonth === month;
        });
      }

      // Calculate KPIs
      let totalSale = 0;
      let inhouseSale = 0;
      const staffSet = new Set<string>();
      const unitSet = new Set<string>();
      
      data.forEach(r => {
        totalSale += parseFloat(r.TOTAL_SALE) || 0;
        inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.SMNO) staffSet.add(r.SMNO);
        if (r.SHRTNAME) unitSet.add(r.SHRTNAME);
      });

      // Aggregate by unit
      const unitMap: Record<string, { totalSale: number; inhouseSale: number; staffCount: number; deptSet: Set<string> }> = {};
      data.forEach(r => {
        const unit = r.SHRTNAME || 'Unknown';
        if (!unitMap[unit]) {
          unitMap[unit] = { totalSale: 0, inhouseSale: 0, staffCount: 0, deptSet: new Set() };
        }
        unitMap[unit].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        unitMap[unit].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.DEPT) unitMap[unit].deptSet.add(r.DEPT);
      });

      // Count unique staff per unit
      const staffByUnit: Record<string, Set<string>> = {};
      data.forEach(r => {
        const unit = r.SHRTNAME || 'Unknown';
        if (!staffByUnit[unit]) staffByUnit[unit] = new Set();
        if (r.SMNO) staffByUnit[unit].add(r.SMNO);
      });

      const units = Object.entries(unitMap).map(([name, stats]) => ({
        name,
        totalSale: stats.totalSale,
        inhouseSale: stats.inhouseSale,
        staffCount: staffByUnit[name]?.size || 0,
        departmentCount: stats.deptSet.size,
      })).sort((a, b) => b.totalSale - a.totalSale);

      // Get available months from filtered data (employees only see months with their own sales)
      const monthsSet = new Set<string>();
      // For employees, use the already-filtered data; for MDO, use all data
      const monthSource = isEmployeeLogin ? data : data;
      const now_date = new Date();
      const twoMonthsAgo = new Date(now_date.getFullYear(), now_date.getMonth() - 1, 1);
      
      monthSource.forEach(r => {
        if (r.BILL_MONTH) {
          const monthDate = new Date(r.BILL_MONTH);
          // For employees, only include months within the allowed 2-month range
          if (!isEmployeeLogin || monthDate >= twoMonthsAgo) {
            monthsSet.add(monthDate.toISOString().slice(0, 7));
          }
        }
      });
      const availableMonths = Array.from(monthsSet).sort().reverse();

      // Top 5 staff
      const staffSales: Record<string, { name: string; totalSale: number; unit: string }> = {};
      data.forEach(r => {
        const smno = r.SMNO || 'unknown';
        if (!staffSales[smno]) {
          staffSales[smno] = { name: r.SM || r.SHRTNAME || smno, totalSale: 0, unit: r.SHRTNAME || '' };
        }
        staffSales[smno].totalSale += parseFloat(r.TOTAL_SALE) || 0;
      });
      const topStaff = Object.values(staffSales).sort((a, b) => b.totalSale - a.totalSale).slice(0, 5);

      // Monthly trend (use filtered data for employees)
      const monthlyTrend: Record<string, number> = {};
      data.forEach(r => {
        if (r.BILL_MONTH) {
          const m = new Date(r.BILL_MONTH).toISOString().slice(0, 7);
          monthlyTrend[m] = (monthlyTrend[m] || 0) + (parseFloat(r.TOTAL_SALE) || 0);
        }
      });
      const sliceCount = isEmployeeLogin ? 2 : 6;
      const trendData = Object.entries(monthlyTrend)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-sliceCount)
        .map(([month, sale]) => ({ month, sale }));

      // Calculate data date range
      let minDate: Date | null = null;
      let maxDate: Date | null = null;
      data.forEach((r: any) => {
        if (r.BILL_MONTH) {
          const billDate = new Date(r.BILL_MONTH);
          if (billDate && !isNaN(billDate.getTime())) {
            if (!minDate || billDate < minDate) minDate = billDate;
            if (!maxDate || billDate > maxDate) maxDate = billDate;
          }
        }
      });

      res.json({
        success: true,
        kpis: {
          totalSale,
          inhouseSale,
          externalSale: totalSale - inhouseSale,
          totalStaff: staffSet.size,
          totalUnits: unitSet.size,
        },
        units,
        topStaff,
        trendData,
        availableMonths,
        selectedMonth: month || null,
        dataDateRange: {
          from: minDate !== null ? (minDate as Date).toISOString() : null,
          to: maxDate !== null ? (maxDate as Date).toISOString() : null,
        },
      });
    } catch (error: any) {
      console.error("Sales dashboard error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get departments for a specific unit
  app.get("/api/sales/units/:unit/departments", requireAuth, async (req, res) => {
    try {
      const { unit } = req.params;
      const { month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Block employee access to this drill-down endpoint (they only see their own data)
      if (isEmployeeLogin) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied: This view is restricted to management users" 
        });
      }
      
      // Read data from database
      let data: any[];
      try {
        data = await getSalesDataFromDB();
        if (data.length === 0) {
          // If DB is empty, try fetching from API and storing
          data = await fetchSalesDataFromAPI();
          if (data.length > 0) {
            await storeSalesDataInDB(data).catch(err => {
              console.error('[Unit Departments] Failed to store initial data:', err);
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Unit Departments] Database read failed, falling back to API:', dbError);
        // Fallback to API if DB fails
        data = await fetchSalesDataFromAPI();
      }

      data = data.filter(r => r.SHRTNAME === unit);
      
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          return new Date(r.BILL_MONTH).toISOString().slice(0, 7) === month;
        });
      }

      // Aggregate by department
      const deptMap: Record<string, { totalSale: number; inhouseSale: number; staffSet: Set<string> }> = {};
      data.forEach(r => {
        const dept = r.DEPT || 'Unknown';
        if (!deptMap[dept]) {
          deptMap[dept] = { totalSale: 0, inhouseSale: 0, staffSet: new Set() };
        }
        deptMap[dept].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        deptMap[dept].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        if (r.SMNO) deptMap[dept].staffSet.add(r.SMNO);
      });

      const departments = Object.entries(deptMap).map(([name, stats]) => ({
        name,
        totalSale: stats.totalSale,
        inhouseSale: stats.inhouseSale,
        staffCount: stats.staffSet.size,
      })).sort((a, b) => b.totalSale - a.totalSale);

      res.json({ success: true, unit, departments });
    } catch (error: any) {
      console.error("Unit departments error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Get staff for a unit/department
  app.get("/api/sales/staff", requireAuth, async (req, res) => {
    try {
      const { unit, department, month } = req.query;
      const isEmployeeLogin = req.user!.loginType === "employee";
      const employeeCardNo = req.user!.employeeCardNo;
      
      // Block employee access to staff list (they only see their own data on dashboard)
      if (isEmployeeLogin) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied: This view is restricted to management users" 
        });
      }
      
      // Read data from database
      let data: any[];
      try {
        data = await getSalesDataFromDB();
        if (data.length === 0) {
          // If DB is empty, try fetching from API and storing
          data = await fetchSalesDataFromAPI();
          if (data.length > 0) {
            await storeSalesDataInDB(data).catch(err => {
              console.error('[Sales Staff] Failed to store initial data:', err);
            });
          }
        }
      } catch (dbError: any) {
        console.error('[Sales Staff] Database read failed, falling back to API:', dbError);
        // Fallback to API if DB fails
        data = await fetchSalesDataFromAPI();
      }
      
      if (unit && typeof unit === 'string') {
        data = data.filter(r => r.SHRTNAME === unit);
      }
      if (department && typeof department === 'string') {
        data = data.filter(r => r.DEPT === department);
      }
      if (month && typeof month === 'string') {
        data = data.filter(r => {
          if (!r.BILL_MONTH) return false;
          return new Date(r.BILL_MONTH).toISOString().slice(0, 7) === month;
        });
      }

      // Aggregate by staff
      const staffMap: Record<string, {
        smno: string;
        name: string;
        email: string;
        unit: string;
        department: string;
        totalSale: number;
        inhouseSale: number;
        presentDays: number;
        brands: Record<string, { sale: number; inhouse: number }>;
        lastUpdated: string;
      }> = {};

      data.forEach(r => {
        const smno = r.SMNO || 'unknown';
        if (!staffMap[smno]) {
          staffMap[smno] = {
            smno,
            name: r.SM || smno,
            email: r.EMAIL || '',
            unit: r.SHRTNAME || '',
            department: r.DEPT || '',
            totalSale: 0,
            inhouseSale: 0,
            presentDays: 0,
            brands: {},
            lastUpdated: r.UPD_ON || '',
          };
        }
        staffMap[smno].totalSale += parseFloat(r.TOTAL_SALE) || 0;
        staffMap[smno].inhouseSale += parseFloat(r.INHOUSE_SAL) || 0;
        staffMap[smno].presentDays += parseInt(r.PR_DAYS) || 0;
        
        // Track brand breakdown
        const brand = r.BRAND || 'Unknown';
        if (!staffMap[smno].brands[brand]) {
          staffMap[smno].brands[brand] = { sale: 0, inhouse: 0 };
        }
        staffMap[smno].brands[brand].sale += parseFloat(r.TOTAL_SALE) || 0;
        staffMap[smno].brands[brand].inhouse += parseFloat(r.INHOUSE_SAL) || 0;

        // Track latest update
        if (r.UPD_ON && r.UPD_ON > staffMap[smno].lastUpdated) {
          staffMap[smno].lastUpdated = r.UPD_ON;
        }
      });

      // Calculate performance and format response
      const staff = Object.values(staffMap).map(s => {
        const dailySale = s.presentDays > 0 ? s.totalSale / s.presentDays : 0;
        let performance: 'high' | 'average' | 'low' = 'average';
        if (s.totalSale <= 0) {
          performance = 'low';
        } else if (dailySale >= 5000) {
          performance = 'high';
        } else if (dailySale < 2000) {
          performance = 'low';
        }
        
        return {
          ...s,
          dailySale: Math.round(dailySale),
          performance,
          isNegative: s.totalSale < 0,
          brandList: Object.entries(s.brands).map(([name, data]) => ({
            name,
            sale: data.sale,
            inhouse: data.inhouse,
          })),
        };
      }).sort((a, b) => b.totalSale - a.totalSale);

      res.json({ success: true, staff });
    } catch (error: any) {
      console.error("Sales staff error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // Monthly Sales Data - Last 2 months from SM_MONTHLY table
  // Reads from DB first, only fetches from API if DB is empty
  app.get("/api/sales/monthly", requireAuth, async (req, res) => {
    try {
      // Read data from database first
      let records: any[];
      try {
        records = await getMonthlySalesDataFromDB();
        if (records.length === 0) {
          // If DB is empty, try fetching from API and storing
          console.log('[Monthly Sales API] Database is empty, fetching from API...');
          records = await fetchMonthlySalesDataFromAPI();
          if (records.length > 0) {
            await storeMonthlySalesDataInDB(records).catch(err => {
              console.error('[Monthly Sales API] Failed to store initial data:', err);
            });
            // Re-fetch from DB to get properly formatted data
            records = await getMonthlySalesDataFromDB();
          }
        }
      } catch (dbError: any) {
        console.error('[Monthly Sales API] Database read failed, falling back to API:', dbError);
        // Fallback to API if DB fails
        records = await fetchMonthlySalesDataFromAPI();
        // Format API response
        records = records.map((r: any) => ({
          SHRTNAME: r.SHRTNAME || r.shrtname || '',
          DEPT: r.DEPT || r.dept || '',
          SMNO: r.SMNO || r.smno || '',
          SM: r.SM || r.sm || '',
          EMAIL: r.EMAIL || r.email || '',
          BILL_MONTH: r.BILL_MONTH || r.bill_month || null,
          BRAND: r.BRAND || r.brand || '',
          TOTAL_SALE: r.TOTAL_SALE || r.total_sale || '0',
          PR_DAYS: r.PR_DAYS || r.pr_days || '0',
          INHOUSE_SAL: r.INHOUSE_SAL || r.inhouse_sal || '0',
          UPD_ON: r.UPD_ON || r.upd_on || null,
          shrtname: r.SHRTNAME || r.shrtname || '',
          dept: r.DEPT || r.dept || '',
          smno: r.SMNO || r.smno || '',
          sm: r.SM || r.sm || '',
          email: r.EMAIL || r.email || '',
          billMonth: r.BILL_MONTH || r.bill_month || null,
          brand: r.BRAND || r.brand || '',
          totalSale: parseFloat(r.TOTAL_SALE || r.total_sale || '0') || 0,
          prDays: parseInt(r.PR_DAYS || r.pr_days || '0', 10) || 0,
          inhouseSal: parseFloat(r.INHOUSE_SAL || r.inhouse_sal || '0') || 0,
          updOn: r.UPD_ON || r.upd_on || null,
        }));
      }

      // Calculate month metadata (monthKey, display, count)
      const monthMetadataMap = new Map<string, number>();
      records.forEach((r: any) => {
        const billMonth = r.BILL_MONTH || r.billMonth;
        if (billMonth) {
          try {
            // Parse BILL_MONTH - can be in various formats
            let monthDate: Date | null = null;
            
            // Handle DD-MON-YYYY format (e.g., "01-JAN-2026")
            if (typeof billMonth === 'string' && billMonth.includes('-')) {
              const parts = billMonth.split('-');
              if (parts.length === 3) {
                const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                const monthIndex = monthNames.indexOf(parts[1].toUpperCase());
                const year = parseInt(parts[2], 10);
                if (monthIndex !== -1 && !isNaN(year)) {
                  monthDate = new Date(year, monthIndex, 1);
                }
              }
            }
            
            // Handle yyyy-MM-DD format (ignore day, treat as month)
            if (!monthDate) {
              const dateObj = new Date(billMonth);
              if (!isNaN(dateObj.getTime())) {
                // Normalize to 1st day of month
                monthDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
              }
            }
            
            if (monthDate && !isNaN(monthDate.getTime())) {
              const monthKey = format(monthDate, 'yyyy-MM');
              monthMetadataMap.set(monthKey, (monthMetadataMap.get(monthKey) || 0) + 1);
            }
          } catch (e) {
            // Skip invalid dates
          }
        }
      });
      
      // Create month metadata array
      const availableMonths = Array.from(monthMetadataMap.entries())
        .map(([monthKey, count]) => {
          const monthDate = new Date(monthKey + '-01');
          return {
            monthKey,
            display: format(monthDate, 'MMM yyyy'),
            count,
          };
        })
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)); // Sort descending (newest first)

      res.json({
        success: true,
        data: records,
        recordCount: records.length,
        availableMonths, // Include month metadata
        message: `Successfully fetched ${records.length} monthly sales records`,
      });
    } catch (error: any) {
      console.error("Monthly sales API error:", error);
      res.status(500).json({
        success: false,
        message: `Failed to fetch monthly sales data: ${error.message}`,
      });
    }
  });

  // Refresh endpoint - fetch monthly sales data from API and store in DB
  app.post("/api/sales/monthly/refresh", requireAuth, async (req, res) => {
    try {
      console.log('[Monthly Sales API] Refresh requested - fetching from vendor API...');
      const records = await fetchMonthlySalesDataFromAPI();
      console.log(`[Monthly Sales API] Fetched ${records.length} records from API`);
      
      if (!records || records.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No data received from API',
        });
      }
      
      // Store in database
      await storeMonthlySalesDataInDB(records);
      
      res.json({
        success: true,
        message: `Successfully refreshed monthly sales records`,
        recordCount: records.length,
      });
    } catch (error: any) {
      console.error("Monthly sales refresh error:", error);
      const errorMessage = error?.message || String(error) || 'Unknown error occurred';
      console.error("Error details:", {
        message: errorMessage,
        stack: error?.stack,
        name: error?.name,
      });
      res.status(500).json({
        success: false,
        message: `Failed to refresh monthly sales data: ${errorMessage}`,
      });
    }
  });
}

