-- CreateTable
CREATE TABLE "AttendanceVerification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceVerification_employeeId_idx" ON "AttendanceVerification"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceVerification_date_idx" ON "AttendanceVerification"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceVerification_employeeId_date_key" ON "AttendanceVerification"("employeeId", "date");
