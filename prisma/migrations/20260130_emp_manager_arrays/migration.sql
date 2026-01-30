-- Migration: Convert emp_manager to use arrays for departments, designations, and org units
-- This allows one row per card number with multiple departments/designations/units

-- Step 1: Create a new table with the new schema
CREATE TABLE "emp_manager_new" (
    "mid" TEXT NOT NULL,
    "mcardno" TEXT NOT NULL,
    "mdepartmentIds" TEXT[] NOT NULL DEFAULT '{}',
    "mdesignationIds" TEXT[] NOT NULL DEFAULT '{}',
    "morgUnitIds" TEXT[] NOT NULL DEFAULT '{}',
    "mis_extinct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "emp_manager_new_pkey" PRIMARY KEY ("mid")
);

-- Step 2: Migrate data - combine multiple rows for same card number into one row with arrays
INSERT INTO "emp_manager_new" ("mid", "mcardno", "mdepartmentIds", "mdesignationIds", "morgUnitIds", "mis_extinct")
SELECT 
    MIN("mid") as "mid",
    "mcardno",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "mdepartmentId"), NULL) as "mdepartmentIds",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "mdesignationId"), NULL) as "mdesignationIds",
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "morgUnitId"), NULL) as "morgUnitIds",
    bool_or("mis_extinct") as "mis_extinct"
FROM "emp_manager"
GROUP BY "mcardno";

-- Step 3: Drop old table
DROP TABLE "emp_manager";

-- Step 4: Rename new table to original name
ALTER TABLE "emp_manager_new" RENAME TO "emp_manager";

-- Step 5: Create indexes
CREATE UNIQUE INDEX "emp_manager_mcardno_key" ON "emp_manager"("mcardno");
CREATE INDEX "emp_manager_mcardno_idx" ON "emp_manager"("mcardno");
CREATE INDEX "emp_manager_mis_extinct_idx" ON "emp_manager"("mis_extinct");
