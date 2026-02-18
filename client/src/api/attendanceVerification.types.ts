/** Attendance verification batch (create/load/submit) */
export interface VerificationBatch {
  id: string;
  monthStart: string; // YYYY-MM-DD
  createdAt: string;
  notes?: string | null;
  submittedAt?: string | null;
}

/** Verification status per employee/date */
export type VerificationStatus = "CORRECT" | "NOT_CORRECT";

export interface VerificationUpdate {
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: VerificationStatus;
  query?: string | null;
}

/** Verifications map key: employeeId_date */
export interface VerificationsMap {
  [key: string]: { status: VerificationStatus; query?: string | null };
}

/** Team member from my-team API */
export interface TeamMember {
  id: string;
  cardNumber: string | null;
  firstName: string;
  lastName: string | null;
  designation?: { name: string } | null;
  department?: { name: string } | null;
}

/** Attendance record from history API */
export interface AttendanceRecord {
  card_no: string;
  dt: string;
  Name: string;
  STATUS: string;
  t_in: string | null;
  t_out: string | null;
  result_t_in: string | null;
  result_t_out: string | null;
}

export interface AttendanceResponse {
  records: AttendanceRecord[];
  summary: { present: number; absent: number; halfDay: number; leave: number; total: number };
}

/** Manager my-queries: batch with tickets */
export interface MyQueriesTicket {
  id: string;
  employeeId: string;
  employeeName: string;
  cardNumber: string;
  date: string;
  query: string | null;
  hrStatus: string | null;
  hrRemark: string | null;
  reraiseRemark: string | null;
}

export interface MyQueriesBatch {
  id: string;
  monthStart: string;
  submittedAt: string | null;
  createdBy: { id: string; name: string; email: string } | null;
  tickets: MyQueriesTicket[];
}

/** HR ticket (for HR dashboard); batch fields optional when nested in HrQueryBatch */
export interface HrQueryTicket {
  id: string;
  batchId?: string;
  monthStart?: string;
  submittedAt?: string | null;
  createdByName?: string;
  employeeId: string;
  employeeName: string;
  cardNumber: string;
  date: string;
  query: string | null;
  hrStatus: string | null;
  hrRemark: string | null;
  reraiseRemark: string | null;
}

/** HR: member row for full verification list */
export interface HrMemberRow {
  employeeId: string;
  cardNumber: string;
  employeeName: string;
  correctDates: string;
  notCorrectDates: string;
  query: string;
}

/** HR: one card per submission (batch) */
export interface HrQueryBatch {
  id: string;
  monthStart: string;
  submittedAt: string | null;
  managerName: string;
  managerCardNo: string;
  managerUnitNo: string;
  tickets: HrQueryTicket[];
  members?: HrMemberRow[];
}

export type HrStatus = "IN_PROGRESS" | "NEED_INFO" | "RESOLVED" | "REJECTED";
