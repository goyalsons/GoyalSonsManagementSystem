import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type {
  VerificationBatch,
  VerificationUpdate,
  VerificationsMap,
  MyQueriesBatch,
  HrQueryTicket,
  HrQueryBatch,
  HrStatus,
} from "./attendanceVerification.types";

const PREFIX = "/attendance";

/** Create batch for month (POST) */
export async function createVerificationBatch(monthStart: string, notes?: string) {
  const res = await apiPost<{ success: boolean; batch: VerificationBatch }>(
    `${PREFIX}/verification-batches`,
    { monthStart, notes }
  );
  return res;
}

/** Load batch for month (GET) - returns { batch } or { batch: null } */
export async function getVerificationBatchByMonth(monthStart: string) {
  const res = await apiGet<{ batch: VerificationBatch | null }>(
    `${PREFIX}/verification-batches?monthStart=${encodeURIComponent(monthStart)}`
  );
  return res;
}

/** Manager submit modal: name, card no, unit no */
export async function getSubmitContext() {
  return apiGet<{ managerName: string; managerCardNo: string; managerUnitNo: string }>(
    `${PREFIX}/submit-context`
  );
}

/** Create or get batch: try GET first, then POST if null */
export async function createOrLoadBatch(monthStart: string) {
  const { batch } = await getVerificationBatchByMonth(monthStart);
  if (batch) return batch;
  const { batch: created } = await createVerificationBatch(monthStart);
  return created;
}

/** Submit batch to HR (locks editing) */
export async function submitBatch(batchId: string) {
  return apiPost<{ success: boolean; submittedAt: string }>(
    `${PREFIX}/verification-batches/${batchId}/submit`,
    {}
  );
}

/** Reopen batch for editing (Store Manager – own batch only) */
export async function unsubmitBatch(batchId: string) {
  return apiPost<{ success: boolean }>(
    `${PREFIX}/verification-batches/${batchId}/unsubmit`,
    {}
  );
}

/** Permanently delete batch (manager only). HR list will no longer show it. */
export async function deleteBatch(batchId: string) {
  return apiDelete<{ success: boolean }>(`${PREFIX}/verification-batches/${batchId}`);
}

/** Get verifications for batch or date range */
export async function getVerifications(params: { batchId?: string; from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params.batchId) q.set("batchId", params.batchId);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  return apiGet<{ verifications: VerificationsMap }>(`${PREFIX}/team-verifications?${q.toString()}`);
}

/** Clear all verifications for a batch (DB + local) */
export async function clearVerifications(batchId: string) {
  return apiPost<{ success: boolean; deleted: number }>(
    `${PREFIX}/team-verifications/clear`,
    { batchId }
  );
}

/** Save verification updates */
export async function saveVerifications(batchId: string, updates: VerificationUpdate[]) {
  return apiPost<{ success: boolean; updated: number; results: unknown[] }>(
    `${PREFIX}/team-verifications`,
    { batchId, updates }
  );
}

/** My Queries: manager's batches with tickets */
export async function getMyQueries() {
  return apiGet<{ batches: MyQueriesBatch[] }>(`${PREFIX}/my-queries`);
}

/** Accept ticket (manager) */
export async function acceptTicket(ticketId: string) {
  return apiPost<{ success: boolean }>(`${PREFIX}/my-queries/${ticketId}/accept`, {});
}

/** Re-raise ticket (manager) */
export async function reraiseTicket(ticketId: string, remark: string) {
  return apiPost<{ success: boolean }>(`${PREFIX}/my-queries/${ticketId}/reraise`, { remark });
}

/** HR: fetch single batch by ID */
export async function getHrQueryBatch(batchId: string) {
  return apiGet<{ batch: HrQueryBatch }>(`${PREFIX}/hr/queries/batch/${batchId}`);
}

/** HR: permanently delete a submission batch */
export async function deleteHrQueryBatch(batchId: string) {
  return apiDelete<{ success: boolean }>(`${PREFIX}/hr/queries/batch/${batchId}`);
}

/** HR: list batches (per-submission cards) with optional filters */
export async function getHrQueries(params?: {
  month?: string;
  branch?: string;
  status?: string;
  search?: string;
}) {
  const q = new URLSearchParams();
  if (params?.month) q.set("month", params.month);
  if (params?.branch) q.set("branch", params.branch);
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiGet<{ batches: HrQueryBatch[] }>(`${PREFIX}/hr/queries${suffix}`);
}

/** Manager: dismiss resolved item from verification list (soft-hide) */
export async function dismissTicket(ticketId: string) {
  return apiPost<{ success: boolean }>(`${PREFIX}/my-queries/${ticketId}/dismiss`, {});
}

/** HR: resolve ticket (set status + remark) */
export async function resolveHrQuery(ticketId: string, hrStatus: HrStatus, hrRemark: string) {
  return apiPatch<{ success: boolean }>(`${PREFIX}/hr/queries/${ticketId}`, {
    hrStatus,
    hrRemark,
  });
}
