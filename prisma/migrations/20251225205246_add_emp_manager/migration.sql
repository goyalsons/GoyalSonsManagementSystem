-- CreateTable
CREATE TABLE IF NOT EXISTS "emp_manager" (
    "mid" TEXT NOT NULL,
    "mcardno" TEXT NOT NULL,
    "mdepartmentId" TEXT,
    "mdesignationId" TEXT,
    "morgUnitId" TEXT,
    "mis_extinct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "emp_manager_pkey" PRIMARY KEY ("mid")
);

-- Drop table if exists and recreate to fix column names
DROP TABLE IF EXISTS "emp_manager" CASCADE;

CREATE TABLE "emp_manager" (
    "mid" TEXT NOT NULL,
    "mcardno" TEXT NOT NULL,
    "mdepartmentId" TEXT,
    "mdesignationId" TEXT,
    "morgUnitId" TEXT,
    "mis_extinct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "emp_manager_pkey" PRIMARY KEY ("mid")
);

-- CreateIndex
CREATE INDEX "emp_manager_mcardno_idx" ON "emp_manager"("mcardno");

-- CreateIndex
CREATE INDEX "emp_manager_mdepartmentId_idx" ON "emp_manager"("mdepartmentId") WHERE "mdepartmentId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "emp_manager_mdesignationId_idx" ON "emp_manager"("mdesignationId") WHERE "mdesignationId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "emp_manager_morgUnitId_idx" ON "emp_manager"("morgUnitId") WHERE "morgUnitId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "emp_manager_mis_extinct_idx" ON "emp_manager"("mis_extinct");

