/**
 * In-process background job runner for sync triggers.
 *
 * Guarantees:
 * - API returns immediately (caller should respond 202).
 * - Jobs are throttled (default concurrency = 1).
 * - Exceptions are caught/logged; job runner keeps going.
 *
 * NOTE:
 * - This is process-local. In multi-instance setups, move to a real queue (BullMQ)
 *   and an external worker.
 */

import { triggerManualSync } from "../auto-sync";

type Job = { type: "manual-sync"; routeId: string };

const queue: Job[] = [];
let inFlight = 0;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.SYNC_JOB_CONCURRENCY || "1"));

function pump(): void {
  if (inFlight >= MAX_CONCURRENCY) return;
  const job = queue.shift();
  if (!job) return;

  inFlight += 1;
  setImmediate(async () => {
    try {
      if (job.type === "manual-sync") {
        await triggerManualSync(job.routeId);
      }
    } catch (err) {
      console.error("[SyncJobs] Job failed:", job, err);
    } finally {
      inFlight = Math.max(inFlight - 1, 0);
      // Continue processing without blocking the event loop.
      setImmediate(pump);
    }
  });
}

export function enqueueManualSync(routeId: string): void {
  queue.push({ type: "manual-sync", routeId });
  // Kick the worker loop without blocking request.
  setImmediate(pump);
}

