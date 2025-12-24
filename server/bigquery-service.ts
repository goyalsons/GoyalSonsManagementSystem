import { BigQuery } from "@google-cloud/bigquery";
import fs from "fs";
import path from "path";

interface AttendanceRecord {
  card_no: string;
  dt: string;
  month_dt: string;
  POLICY_NAME: string;
  Name: string;
  branch_code: string;
  DEPT_CODE: string;
  DESIGN_CODE: string;
  t_in: string | null;
  t_out: string | null;
  entry_type: string | null;
  STATUS: string;
  status_remarks: string | null;
  CORRECTION_REASON: string | null;
  last_change_on: string | null;
  last_calulation_on: string | null;
  REC_STATUS: string | null;
  key: string | null;
  crr_in: string | null;
  crr_out: string | null;
  crr_status: string | null;
  crr_approval: string | null;
  result_t_in: string | null;
  result_t_out: string | null;
  P: number;
  A: number;
  HD: number;
  MIS: number;
  L: number;
  AA: number;
  E: number;
  C: number;
}

interface AttendanceSummary {
  present: number;
  absent: number;
  halfDay: number;
  leave: number;
  total: number;
}

interface CacheEntry {
  data: { records: AttendanceRecord[]; summary: AttendanceSummary };
  timestamp: number;
}

let bigQueryClient: BigQuery | null = null;
const attendanceCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

function loadCredentials(): any {
  const envValue = process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envValue) {
    throw new Error("BIGQUERY_CREDENTIALS environment variable is not set");
  }

  let raw = envValue.trim();

  // If env points to a file path, read it
  const asPath = path.resolve(raw);
  if (!raw.startsWith("{") && fs.existsSync(asPath)) {
    raw = fs.readFileSync(asPath, "utf8").trim();
  }

  const credentials = JSON.parse(raw);
  if (typeof credentials.private_key === "string") {
    if (credentials.private_key.includes("\\r\\n")) {
      credentials.private_key = credentials.private_key.replace(/\\r\\n/g, "\n");
    } else if (credentials.private_key.includes("\\n")) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    credentials.private_key = credentials.private_key.replace(/\r\n/g, "\n");
  }

  if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
    throw new Error("Missing required fields in credentials (project_id, private_key, or client_email)");
  }

  return credentials;
}

function getBigQueryClient(): BigQuery {
  if (!bigQueryClient) {
    try {
      const credentials = loadCredentials();
      bigQueryClient = new BigQuery({
        projectId: credentials.project_id,
        credentials,
      });
    } catch (error: any) {
      console.error("BigQuery credentials error:", error);
      throw new Error(`Invalid BIGQUERY_CREDENTIALS: ${error.message || error}`);
    }
  }
  return bigQueryClient;
}

function getCacheKey(cardNo: string, monthDate?: string): string {
  return `${cardNo}-${monthDate || 'all'}`;
}

export async function getMemberAttendance(
  cardNo: string,
  monthDate?: string
): Promise<{ records: AttendanceRecord[]; summary: AttendanceSummary }> {
  const cacheKey = getCacheKey(cardNo, monthDate);
  const cached = attendanceCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[BigQuery] Cache hit for card ${cardNo}, month: ${monthDate || 'all'}`);
    return cached.data;
  }
  
  const client = getBigQueryClient();
  
  const projectId = 'quickstart-1587217624038';
  const datasetId = 'hrms';
  const tableId = 'ATTENDENCE_SUMMARY';
  
  let query = `
    SELECT * 
    FROM \`${projectId}.${datasetId}.${tableId}\` 
    WHERE card_no = @cardNo
    AND dt <= CURRENT_DATE('Asia/Kolkata')
  `;
  
  const params: { cardNo: string; monthDate?: string } = { cardNo };
  
  if (monthDate) {
    const date = new Date(monthDate);
    const firstDayOfMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    query += ` AND month_dt = DATE(@monthDate)`;
    params.monthDate = firstDayOfMonth;
  }
  
  query += ` ORDER BY dt ASC LIMIT 1000`;

  const options = {
    query,
    params,
    location: 'us-central1',
  };

  console.log(`[BigQuery] Querying attendance for card ${cardNo}, month: ${monthDate || 'all'}`);

  const [rows] = await client.query(options);
  
  const records = (rows as any[]).map(row => {
    const normalized: any = { ...row };
    if (row.dt && typeof row.dt === 'object' && row.dt.value) {
      normalized.dt = row.dt.value;
    }
    if (row.month_dt && typeof row.month_dt === 'object' && row.month_dt.value) {
      normalized.month_dt = row.month_dt.value;
    }
    if (row.t_in && typeof row.t_in === 'object' && row.t_in.value) {
      normalized.t_in = row.t_in.value;
    }
    if (row.t_out && typeof row.t_out === 'object' && row.t_out.value) {
      normalized.t_out = row.t_out.value;
    }
    if (row.result_t_in && typeof row.result_t_in === 'object' && row.result_t_in.value) {
      normalized.result_t_in = row.result_t_in.value;
    }
    if (row.result_t_out && typeof row.result_t_out === 'object' && row.result_t_out.value) {
      normalized.result_t_out = row.result_t_out.value;
    }
    return normalized;
  }) as AttendanceRecord[];
  
  console.log(`[BigQuery] Found ${records.length} records for card ${cardNo}`);
  
  const summary: AttendanceSummary = {
    present: records.filter(r => r.P === 1).length,
    absent: records.filter(r => r.A === 1).length,
    halfDay: records.filter(r => r.HD === 1).length,
    leave: records.filter(r => r.L === 1).length,
    total: records.length,
  };
  
  const result = { records, summary };
  attendanceCache.set(cacheKey, { data: result, timestamp: Date.now() });
  
  return result;
}

export async function getEmployeeAttendance(
  cardNo: string,
  monthDate?: string
): Promise<{ records: AttendanceRecord[]; summary: AttendanceSummary }> {
  return getMemberAttendance(cardNo, monthDate);
}

export function isBigQueryConfigured(): boolean {
  return !!process.env.BIGQUERY_CREDENTIALS;
}

export function clearAttendanceCache(): void {
  attendanceCache.clear();
  console.log('[BigQuery] Cache cleared');
}

// Cache for today's attendance - DISABLED for real-time accuracy
let todayAttendanceCache: { data: Map<string, AttendanceRecord>; timestamp: number; dateKey: string } | null = null;
const TODAY_CACHE_TTL = 30 * 1000; // 30 seconds cache only (was 2 minutes)

/**
 * Normalize card number for matching - handles leading zeros, whitespace, type conversion
 */
export function normalizeCardNumber(cardNo: string | number | null | undefined): string {
  if (cardNo === null || cardNo === undefined) return '';
  // Convert to string, trim whitespace, remove leading zeros for numeric comparison
  const str = String(cardNo).trim();
  // If it's purely numeric, remove leading zeros
  if (/^\d+$/.test(str)) {
    return String(parseInt(str, 10));
  }
  return str.toLowerCase();
}

/**
 * Get today's date in IST timezone (Asia/Kolkata) as YYYY-MM-DD string
 */
export function getTodayDateIST(): string {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  return istDate.toISOString().split('T')[0];
}

/**
 * Get today's attendance for all employees from BigQuery
 * Returns a Map keyed by NORMALIZED card_no for easy lookup
 */
export async function getTodayAttendanceFromBigQuery(): Promise<Map<string, AttendanceRecord>> {
  const todayIST = getTodayDateIST();
  
  // Check cache - invalidate if date changed or expired
  if (todayAttendanceCache && 
      todayAttendanceCache.dateKey === todayIST &&
      Date.now() - todayAttendanceCache.timestamp < TODAY_CACHE_TTL) {
    console.log(`[BigQuery] Cache hit for today's attendance (${todayAttendanceCache.data.size} records, date: ${todayIST})`);
    return todayAttendanceCache.data;
  }
  
  const client = getBigQueryClient();
  
  const projectId = 'quickstart-1587217624038';
  const datasetId = 'hrms';
  const tableId = 'ATTENDENCE_SUMMARY';
  
  // Query for today's date in IST timezone
  const query = `
    SELECT * 
    FROM \`${projectId}.${datasetId}.${tableId}\` 
    WHERE dt = CURRENT_DATE('Asia/Kolkata')
  `;

  const options = {
    query,
    location: 'us-central1',
  };

  console.log(`[BigQuery] Fetching today's attendance (IST date: ${todayIST})...`);
  const startTime = Date.now();

  const [rows] = await client.query(options);
  
  const attendanceMap = new Map<string, AttendanceRecord>();
  
  // Debug: Log first few records
  const rawRows = rows as any[];
  if (rawRows.length > 0) {
    console.log(`[BigQuery] Sample raw record:`, JSON.stringify(rawRows[0], null, 2));
  }
  
  rawRows.forEach((row, idx) => {
    const normalized: any = { ...row };
    // Normalize date/time fields from BigQuery DATE/TIME objects
    if (row.dt && typeof row.dt === 'object' && row.dt.value) {
      normalized.dt = row.dt.value;
    }
    if (row.month_dt && typeof row.month_dt === 'object' && row.month_dt.value) {
      normalized.month_dt = row.month_dt.value;
    }
    if (row.t_in && typeof row.t_in === 'object' && row.t_in.value) {
      normalized.t_in = row.t_in.value;
    }
    if (row.t_out && typeof row.t_out === 'object' && row.t_out.value) {
      normalized.t_out = row.t_out.value;
    }
    if (row.result_t_in && typeof row.result_t_in === 'object' && row.result_t_in.value) {
      normalized.result_t_in = row.result_t_in.value;
    }
    if (row.result_t_out && typeof row.result_t_out === 'object' && row.result_t_out.value) {
      normalized.result_t_out = row.result_t_out.value;
    }
    
    // Key by NORMALIZED card number for matching
    if (normalized.card_no !== null && normalized.card_no !== undefined) {
      const normalizedCardNo = normalizeCardNumber(normalized.card_no);
      attendanceMap.set(normalizedCardNo, normalized as AttendanceRecord);
      
      // Debug first 3 records
      if (idx < 3) {
        console.log(`[BigQuery] Record ${idx}: card_no="${normalized.card_no}" -> normalized="${normalizedCardNo}", P=${normalized.P}, STATUS="${normalized.STATUS}"`);
      }
    }
  });
  
  const elapsed = Date.now() - startTime;
  console.log(`[BigQuery] Found ${attendanceMap.size} attendance records for today (${elapsed}ms)`);
  
  // Cache the result with date key
  todayAttendanceCache = { data: attendanceMap, timestamp: Date.now(), dateKey: todayIST };
  
  return attendanceMap;
}

/**
 * Clear today's attendance cache (call when data is synced)
 */
export function clearTodayAttendanceCache(): void {
  todayAttendanceCache = null;
  console.log('[BigQuery] Today attendance cache cleared');
}

/**
 * Parse BigQuery time string (HH:MM:SS) to full ISO datetime for today
 * Handles: "10:30:45", {value: "10:30:45"}, null, "null"
 */
export function parseTimeToDateTime(timeStr: string | { value: string } | null | undefined): Date | null {
  if (!timeStr) return null;
  
  // Handle BigQuery value object format
  let timeValue: string;
  if (typeof timeStr === 'object' && 'value' in timeStr) {
    timeValue = timeStr.value;
  } else {
    timeValue = String(timeStr);
  }
  
  // Handle "null" string or empty values
  if (!timeValue || timeValue === "null" || timeValue.trim() === "") {
    return null;
  }
  
  // Parse HH:MM:SS format
  const parts = timeValue.split(':');
  if (parts.length < 2) return null;
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parts[2] ? parseInt(parts[2], 10) : 0;
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  // Create date for today in IST timezone
  const todayIST = getTodayDateIST(); // YYYY-MM-DD
  const dateTime = new Date(`${todayIST}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}+05:30`);
  
  return dateTime;
}
