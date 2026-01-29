-- AlterTable: Add new fields to HelpTicket without deleting existing data
-- All new fields are nullable or have defaults to preserve existing records

-- Ensure HelpTicket table exists for shadow migrations
CREATE TABLE IF NOT EXISTS "HelpTicket" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'attendance',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "relatedData" JSONB,
    "response" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HelpTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HelpTicket_employeeId_idx" ON "HelpTicket"("employeeId");
CREATE INDEX IF NOT EXISTS "HelpTicket_status_idx" ON "HelpTicket"("status");
CREATE INDEX IF NOT EXISTS "HelpTicket_createdAt_idx" ON "HelpTicket"("createdAt");

DO $$
BEGIN
    ALTER TABLE "HelpTicket"
    ADD CONSTRAINT "HelpTicket_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "HelpTicket"
    ADD CONSTRAINT "HelpTicket_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

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

