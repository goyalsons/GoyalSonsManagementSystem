-- CreateTable
CREATE TABLE "SalesStaffSummary" (
    "id" TEXT NOT NULL,
    "dat" TEXT NOT NULL,
    "unit" TEXT,
    "smno" TEXT NOT NULL,
    "sm" TEXT,
    "divi" TEXT,
    "btype" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "netSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updon" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesStaffSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesStaffSummary_smno_idx" ON "SalesStaffSummary"("smno");

-- CreateIndex
CREATE INDEX "SalesStaffSummary_dat_idx" ON "SalesStaffSummary"("dat");

-- CreateIndex
CREATE INDEX "SalesStaffSummary_unit_idx" ON "SalesStaffSummary"("unit");

-- CreateIndex
CREATE INDEX "SalesStaffSummary_updatedAt_idx" ON "SalesStaffSummary"("updatedAt");
