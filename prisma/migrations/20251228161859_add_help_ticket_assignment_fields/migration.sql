-- AlterTable: Add new fields to HelpTicket without deleting existing data
-- All new fields are nullable or have defaults to preserve existing records

-- Add raisedByRole column with default value
ALTER TABLE "HelpTicket" ADD COLUMN IF NOT EXISTS "raisedByRole" TEXT NOT NULL DEFAULT 'EMPLOYEE';

-- Add managerId column (nullable)
ALTER TABLE "HelpTicket" ADD COLUMN IF NOT EXISTS "managerId" TEXT;

-- Add assignedToRole column with default value
ALTER TABLE "HelpTicket" ADD COLUMN IF NOT EXISTS "assignedToRole" TEXT NOT NULL DEFAULT 'MDO';

-- Add assignedToId column (nullable)
ALTER TABLE "HelpTicket" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "HelpTicket_assignedToRole_idx" ON "HelpTicket"("assignedToRole");
CREATE INDEX IF NOT EXISTS "HelpTicket_assignedToId_idx" ON "HelpTicket"("assignedToId");
CREATE INDEX IF NOT EXISTS "HelpTicket_managerId_idx" ON "HelpTicket"("managerId");

