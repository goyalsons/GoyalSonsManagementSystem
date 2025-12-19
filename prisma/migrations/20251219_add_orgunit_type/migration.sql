-- Add missing "type" column to OrgUnit for production DBs that predate this field
ALTER TABLE "OrgUnit"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'functional';

