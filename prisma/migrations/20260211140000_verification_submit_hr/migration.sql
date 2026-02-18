-- AlterTable
ALTER TABLE "AttendanceVerificationBatch" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AttendanceVerification" ADD COLUMN IF NOT EXISTS "hrStatus" TEXT;
ALTER TABLE "AttendanceVerification" ADD COLUMN IF NOT EXISTS "hrRemark" TEXT;
ALTER TABLE "AttendanceVerification" ADD COLUMN IF NOT EXISTS "reraiseRemark" TEXT;
