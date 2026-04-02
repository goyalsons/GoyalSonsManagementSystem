-- Drop the non-partial index created during the previous migration
DROP INDEX IF EXISTS "User_employeeId_idx";

-- Enforce uniqueness only for non-null employeeId values.
-- This allows multiple NULLs but prevents linking the same employee to multiple users.
CREATE UNIQUE INDEX "User_employeeId_unique_non_null"
ON "User" ("employeeId")
WHERE "employeeId" IS NOT NULL;

