import { prisma } from "../lib/prisma";

const CLEANUP_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const USED_OTP_RETENTION_MS = 1 * 60 * 1000; // delete used OTPs older than 1 minute

async function runOtpCleanup(): Promise<void> {
  try {
    const now = new Date();
    const expired = await prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const usedCutoff = new Date(now.getTime() - USED_OTP_RETENTION_MS);
    const usedDeleted = await prisma.otpCode.deleteMany({
      where: {
        used: true,
        createdAt: { lt: usedCutoff },
      },
    });
    const total = expired.count + usedDeleted.count;
    if (total > 0) {
      console.log(`[OTP cleanup] deleted ${total} rows (expired: ${expired.count}, used+old: ${usedDeleted.count})`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[OTP cleanup] run failed (non-fatal):", message);
  }
}

/**
 * Launch: OTP DB cleanup job; replace with cron/worker later.
 * Starts a timer that runs every 1 minute to delete expired and old used OtpCode rows.
 * Failures are logged once per run and do not crash the server.
 */
export function startOtpCleanup(): void {
  runOtpCleanup();
  setInterval(runOtpCleanup, CLEANUP_INTERVAL_MS);
}
