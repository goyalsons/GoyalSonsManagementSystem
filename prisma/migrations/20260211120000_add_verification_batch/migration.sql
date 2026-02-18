-- CreateTable
CREATE TABLE "AttendanceVerificationBatch" (
    "id" TEXT NOT NULL,
    "monthStart" DATE NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "AttendanceVerificationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceVerificationBatch_monthStart_idx" ON "AttendanceVerificationBatch"("monthStart");

-- CreateIndex
CREATE INDEX "AttendanceVerificationBatch_createdByUserId_idx" ON "AttendanceVerificationBatch"("createdByUserId");

-- AddForeignKey
ALTER TABLE "AttendanceVerificationBatch" ADD CONSTRAINT "AttendanceVerificationBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create legacy batch for existing data (monthStart = 2025-01-01)
INSERT INTO "AttendanceVerificationBatch" ("id", "monthStart", "createdAt")
VALUES ('legacy_batch_20250101', '2025-01-01'::date, CURRENT_TIMESTAMP);

-- Add batchId column as nullable first
ALTER TABLE "AttendanceVerification" ADD COLUMN "batchId" TEXT;

-- Backfill existing rows with legacy batch
UPDATE "AttendanceVerification" SET "batchId" = 'legacy_batch_20250101' WHERE "batchId" IS NULL;

-- Make batchId required
ALTER TABLE "AttendanceVerification" ALTER COLUMN "batchId" SET NOT NULL;

-- Drop old unique constraint
DROP INDEX IF EXISTS "AttendanceVerification_employeeId_date_key";

-- Add new unique constraint
CREATE UNIQUE INDEX "AttendanceVerification_batchId_employeeId_date_key" ON "AttendanceVerification"("batchId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceVerification_batchId_idx" ON "AttendanceVerification"("batchId");

-- AddForeignKey
ALTER TABLE "AttendanceVerification" ADD CONSTRAINT "AttendanceVerification_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "AttendanceVerificationBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
