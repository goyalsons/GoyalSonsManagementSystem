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

function loadCredentials(): {
  project_id: string;
  private_key: string;
  client_email: string;
} {
  const envValue = process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!envValue) {
    console.error("[BigQuery] No credentials found in environment variables");
    console.error("[BigQuery] Checked: BIGQUERY_CREDENTIALS and GOOGLE_APPLICATION_CREDENTIALS");
    throw new Error("BIGQUERY_CREDENTIALS environment variable is not set. Please add it in Railway environment variables.");
  }

  let raw = envValue.trim();
  console.log(`[BigQuery] Found credentials, length: ${raw.length} chars, starts with: ${raw.substring(0, 20)}...`);

  // If env points to a file path, read it (for local development)
  const asPath = path.resolve(raw);
  if (!raw.startsWith("{") && fs.existsSync(asPath)) {
    console.log(`[BigQuery] Reading credentials from file: ${asPath}`);
    raw = fs.readFileSync(asPath, "utf8").trim();
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch (parseError: unknown) {
    const parseMsg = parseError instanceof Error ? parseError.message : String(parseError);
    console.error("[BigQuery] JSON parse error:", parseMsg);
    console.error("[BigQuery] First 100 chars of raw value:", raw.substring(0, 100));
    throw new Error(`Failed to parse BIGQUERY_CREDENTIALS as JSON: ${parseMsg}`);
  }

  if (typeof credentials.private_key === "string") {
    // Fix escaped newlines (common in Railway environment variables)
    // Handle multiple levels of escaping that can occur
    let privateKey = credentials.private_key;
    
    // Store original for debugging
    const originalKey = privateKey;
    const hadEscapedNewlines = privateKey.includes('\\n') || privateKey.includes('\\r');
    
    // Step 1: Handle all possible escape sequences (in order of specificity)
    // Handle triple-escaped (rare but possible)
    privateKey = privateKey.replace(/\\\\\\n/g, "\n");
    privateKey = privateKey.replace(/\\\\\\r\\\\\\n/g, "\n");
    privateKey = privateKey.replace(/\\\\\\r/g, "");
    
    // Handle double-escaped (when JSON.stringify is called on already escaped strings)
    privateKey = privateKey.replace(/\\\\n/g, "\n");
    privateKey = privateKey.replace(/\\\\r\\\\n/g, "\n");
    privateKey = privateKey.replace(/\\\\r/g, "");
    
    // Handle single-escaped (common in JSON strings stored in env vars)
    privateKey = privateKey.replace(/\\r\\n/g, "\n");
    privateKey = privateKey.replace(/\\n/g, "\n");
    privateKey = privateKey.replace(/\\r/g, "");
    
    // Handle actual carriage returns + newlines (Windows-style)
    privateKey = privateKey.replace(/\r\n/g, "\n");
    privateKey = privateKey.replace(/\r/g, "");
    
    // Step 2: Handle cases where spaces might be used instead of newlines
    // Some systems might replace newlines with spaces in the private key
    // Look for patterns like "BEGIN PRIVATE KEY----- " followed by base64-like content
    if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      // Try to restore newlines by looking for the pattern
      privateKey = privateKey.replace(/-----BEGIN PRIVATE KEY-----\s+/g, "-----BEGIN PRIVATE KEY-----\n");
      privateKey = privateKey.replace(/\s+-----END PRIVATE KEY-----/g, "\n-----END PRIVATE KEY-----");
      // Base64 lines are typically 64 characters, try to insert newlines every 64 chars in the key content
      const beginMarker = "-----BEGIN PRIVATE KEY-----";
      const endMarker = "-----END PRIVATE KEY-----";
      const beginIdx = privateKey.indexOf(beginMarker);
      const endIdx = privateKey.indexOf(endMarker);
      if (beginIdx !== -1 && endIdx !== -1 && beginIdx < endIdx) {
        const beforeBegin = privateKey.substring(0, beginIdx + beginMarker.length);
        const keyContent = privateKey.substring(beginIdx + beginMarker.length, endIdx).trim();
        const afterEnd = privateKey.substring(endIdx);
        // Insert newlines every 64 characters in the key content
        const formattedContent = keyContent.replace(/(.{64})/g, '$1\n').trim();
        privateKey = beforeBegin + '\n' + formattedContent + '\n' + afterEnd;
      }
    }
    
    // Step 3: Ensure BEGIN and END markers are on separate lines
    // Remove any whitespace around markers first
    privateKey = privateKey.replace(/\s*-----BEGIN PRIVATE KEY-----\s*/g, "-----BEGIN PRIVATE KEY-----\n");
    privateKey = privateKey.replace(/\s*-----END PRIVATE KEY-----\s*/g, "\n-----END PRIVATE KEY-----");
    
    // Step 4: Clean up the key content - ensure proper line breaks
    // The key content should be base64-encoded and typically has newlines every 64 characters
    const beginMarker = "-----BEGIN PRIVATE KEY-----";
    const endMarker = "-----END PRIVATE KEY-----";
    const beginIdx = privateKey.indexOf(beginMarker);
    const endIdx = privateKey.indexOf(endMarker);
    
    if (beginIdx !== -1 && endIdx !== -1 && beginIdx < endIdx) {
      const beforeBegin = privateKey.substring(0, beginIdx + beginMarker.length);
      let keyContent = privateKey.substring(beginIdx + beginMarker.length, endIdx).trim();
      const afterEnd = privateKey.substring(endIdx);
      
      // Remove all existing whitespace/newlines from key content
      keyContent = keyContent.replace(/\s+/g, '');
      
      // Re-format with newlines every 64 characters (standard PEM format)
      // Split into chunks of 64 characters
      let formattedContent = '';
      for (let i = 0; i < keyContent.length; i += 64) {
        if (i > 0) formattedContent += '\n';
        formattedContent += keyContent.substring(i, i + 64);
      }
      
      privateKey = beforeBegin + '\n' + formattedContent + '\n' + afterEnd;
    }
    
    // Step 5: Clean up any excessive newlines (more than 2 consecutive)
    privateKey = privateKey.replace(/\n{3,}/g, "\n\n");
    
    // Step 6: Remove leading/trailing whitespace but preserve structure
    privateKey = privateKey.trim();
    
    // Step 7: Validate the key has the proper markers
    if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
      console.error("[BigQuery] Private key format validation failed - missing BEGIN/END markers");
      console.error("[BigQuery] Original key preview:", originalKey.substring(0, 100));
      throw new Error("Invalid private key format: missing BEGIN or END markers");
    }
    
    // Step 8: Validate the key structure (should have BEGIN, content, END)
    const beginIndex = privateKey.indexOf("-----BEGIN PRIVATE KEY-----");
    const endIndex = privateKey.indexOf("-----END PRIVATE KEY-----");
    if (beginIndex >= endIndex || beginIndex === -1 || endIndex === -1) {
      console.error("[BigQuery] Private key format validation failed - invalid structure");
      throw new Error("Invalid private key format: BEGIN and END markers in wrong order");
    }
    
    // Step 9: Extract the key content to verify it's not empty
    const keyContent = privateKey.substring(beginIndex + "-----BEGIN PRIVATE KEY-----".length, endIndex).trim();
    if (keyContent.length < 100) {
      console.error("[BigQuery] Private key format validation failed - key content too short");
      console.error("[BigQuery] Key content length:", keyContent.length);
      throw new Error("Invalid private key format: key content appears to be empty or corrupted");
    }
    
    // Step 10: Final validation - ensure proper PEM format
    // PEM format should be: BEGIN marker, newline, base64 content (with newlines), newline, END marker
    if (!privateKey.match(/-----BEGIN PRIVATE KEY-----\n/)) {
      console.error("[BigQuery] Private key format validation failed - missing newline after BEGIN marker");
      throw new Error("Invalid private key format: missing newline after BEGIN marker");
    }
    if (!privateKey.match(/\n-----END PRIVATE KEY-----/)) {
      console.error("[BigQuery] Private key format validation failed - missing newline before END marker");
      throw new Error("Invalid private key format: missing newline before END marker");
    }
    
    credentials.private_key = privateKey;
    console.log(`[BigQuery] Private key normalized: length=${privateKey.length}, had escaped newlines=${hadEscapedNewlines}, key content length=${keyContent.length}`);
  }

  if (!credentials.project_id || !credentials.private_key || !credentials.client_email) {
    console.error("[BigQuery] Missing required fields:", {
      hasProjectId: !!credentials.project_id,
      hasPrivateKey: !!credentials.private_key,
      hasClientEmail: !!credentials.client_email
    });
    throw new Error("Missing required fields in credentials (project_id, private_key, or client_email)");
  }

  console.log(`[BigQuery] Credentials loaded successfully for project: ${credentials.project_id}`);
  return credentials;
}

export function getBigQueryClient(): BigQuery {
  if (!bigQueryClient) {
    try {
      const credentials = loadCredentials();
      console.log(`[BigQuery] Initializing client for project: ${credentials.project_id}`);
      console.log(`[BigQuery] Service account: ${credentials.client_email}`);
      bigQueryClient = new BigQuery({
        projectId: credentials.project_id,
        credentials,
      });
      console.log(`[BigQuery] Client initialized successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error("[BigQuery] Credentials error:", errorMessage);
      if (errorStack) {
        console.error("[BigQuery] Error stack:", errorStack);
      }
      
      // Check for specific decoder errors (PEM/DER decoding failures)
      const isDecoderError = 
        errorMessage.includes("DECODER") || 
        errorMessage.includes("decoder") || 
        errorMessage.includes("1E08010C") ||
        errorMessage.includes("error:1E08010C") ||
        errorMessage.includes("PEM") ||
        errorMessage.includes("private key") ||
        errorMessage.includes("parse");
      
      if (isDecoderError) {
        console.error("[BigQuery] Detected decoder/parsing error - likely newline encoding issue");
        console.error("[BigQuery] Available env vars:", {
          hasBIGQUERY_CREDENTIALS: !!process.env.BIGQUERY_CREDENTIALS,
          hasGOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
          BIGQUERY_CREDENTIALS_length: process.env.BIGQUERY_CREDENTIALS?.length || 0,
          GOOGLE_APPLICATION_CREDENTIALS_value: process.env.GOOGLE_APPLICATION_CREDENTIALS || "not set"
        });
        throw new Error(`BigQuery credentials error: Please check BIGQUERY_CREDENTIALS environment variable format. Private key may have incorrect newline encoding. Original error: ${errorMessage}`);
      }
      
      console.error("[BigQuery] Available env vars:", {
        hasBIGQUERY_CREDENTIALS: !!process.env.BIGQUERY_CREDENTIALS,
        hasGOOGLE_APPLICATION_CREDENTIALS: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        BIGQUERY_CREDENTIALS_length: process.env.BIGQUERY_CREDENTIALS?.length || 0,
        GOOGLE_APPLICATION_CREDENTIALS_value: process.env.GOOGLE_APPLICATION_CREDENTIALS || "not set"
      });
      throw new Error(`Invalid BIGQUERY_CREDENTIALS: ${errorMessage}`);
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
  
  const records = (rows as unknown[]).map((row: any) => {
    const normalized: Partial<AttendanceRecord> = { ...row };
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
    return normalized as AttendanceRecord;
  });
  
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
  try {
    const envValue = process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!envValue) {
      console.log("[BigQuery Config Check] ❌ No credentials found in environment variables");
      return false;
    }
    
    console.log(`[BigQuery Config Check] ✅ Found credentials, length: ${envValue.length} chars`);
    
    // Check if it's a file path
    const trimmed = envValue.trim();
    const asPath = path.resolve(trimmed);
    if (!trimmed.startsWith("{") && fs.existsSync(asPath)) {
      // It's a file path, try to read and parse it (for local development)
      console.log(`[BigQuery Config Check] 📁 Reading from file: ${asPath}`);
      try {
        const raw = fs.readFileSync(asPath, "utf8").trim();
        const creds = JSON.parse(raw);
        const hasRequired = !!(creds.project_id && creds.client_email && creds.private_key);
        console.log(`[BigQuery Config Check] ${hasRequired ? "✅" : "❌"} Required fields:`, {
          hasProjectId: !!creds.project_id,
          hasClientEmail: !!creds.client_email,
          hasPrivateKey: !!creds.private_key
        });
        return hasRequired;
      } catch (fileError: unknown) {
        const errMsg = fileError instanceof Error ? fileError.message : String(fileError);
        console.error(`[BigQuery Config Check] ❌ File read/parse error: ${errMsg}`);
        return false;
      }
    }
    
    // It's a JSON string (expected format for Railway)
    console.log(`[BigQuery Config Check] 📝 Parsing JSON string (starts with: ${trimmed.substring(0, 30)}...)`);
    try {
      const creds = JSON.parse(trimmed);
      const hasRequired = !!(creds.project_id && creds.client_email && creds.private_key);
      console.log(`[BigQuery Config Check] ${hasRequired ? "✅" : "❌"} Required fields:`, {
        hasProjectId: !!creds.project_id,
        hasClientEmail: !!creds.client_email,
        hasPrivateKey: !!creds.private_key,
        projectId: creds.project_id || "missing",
        clientEmail: creds.client_email || "missing"
      });
      if (hasRequired) {
        console.log(`[BigQuery Config Check] ✅ BigQuery is configured for project: ${creds.project_id}`);
      } else {
        console.error(`[BigQuery Config Check] ❌ Missing required credential fields`);
      }
      return hasRequired;
    } catch (parseError: unknown) {
      const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
      console.error(`[BigQuery Config Check] ❌ JSON parse error: ${errMsg}`);
      console.error(`[BigQuery Config Check] First 100 chars of value: ${trimmed.substring(0, 100)}`);
      return false;
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[BigQuery Config Check] ❌ Unexpected error: ${errMsg}`);
    return false;
  }
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
  // Get current time in IST timezone
  const now = new Date();
  // IST is UTC+5:30, so we need to get the local time in IST
  // Use toLocaleString to get IST date string
  const istDateString = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // Convert from DD/MM/YYYY to YYYY-MM-DD
  const [day, month, year] = istDateString.split('/');
  return `${year}-${month}-${day}`;
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
  const rawRows = rows as unknown[];
  if (rawRows.length > 0) {
    console.log(`[BigQuery] Sample raw record:`, JSON.stringify(rawRows[0], null, 2));
  }
  
  rawRows.forEach((row: any, idx: number) => {
    const normalized: Partial<AttendanceRecord> = { ...row };
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
    } else {
      console.warn(`[BigQuery] Record ${idx} has null/undefined card_no, skipping`);
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
/**
 * Parse time string and combine with a specific date
 */
export function parseTimeToDateTimeWithDate(timeStr: string | { value: string } | null | undefined, baseDate: Date): Date | null {
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
  const seconds = parts.length > 2 ? parseInt(parts[2], 10) : 0;
  
  if (isNaN(hours) || isNaN(minutes)) return null;
  
  // Combine with the provided base date
  const result = new Date(baseDate);
  result.setHours(hours, minutes, seconds, 0);
  return result;
}

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
