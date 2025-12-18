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
