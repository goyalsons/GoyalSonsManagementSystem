-- CreateTable
CREATE TABLE IF NOT EXISTS "SalesData" (
    "id" TEXT NOT NULL,
    "smno" TEXT,
    "sm" TEXT,
    "shrtname" TEXT,
    "dept" TEXT,
    "brand" TEXT,
    "email" TEXT,
    "totalSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inhouseSal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prDays" INTEGER NOT NULL DEFAULT 0,
    "billMonth" TIMESTAMP(3),
    "updOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_smno_idx" ON "SalesData"("smno");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_shrtname_idx" ON "SalesData"("shrtname");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_dept_idx" ON "SalesData"("dept");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_brand_idx" ON "SalesData"("brand");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_billMonth_idx" ON "SalesData"("billMonth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalesData_updatedAt_idx" ON "SalesData"("updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emp_manager_mdepartmentId_idx" ON "emp_manager"("mdepartmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emp_manager_mdesignationId_idx" ON "emp_manager"("mdesignationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emp_manager_morgUnitId_idx" ON "emp_manager"("morgUnitId");
