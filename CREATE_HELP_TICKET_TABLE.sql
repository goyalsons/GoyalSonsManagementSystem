-- ============================================
-- CREATE HelpTicket TABLE
-- ============================================
-- This creates the HelpTicket table with all required columns
-- Run this SQL in your database if Prisma migrations aren't working
-- ============================================

-- Create HelpTicket table
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
    -- New fields for role-based assignment
    "raisedByRole" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "managerId" TEXT,
    "assignedToRole" TEXT NOT NULL DEFAULT 'MDO',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpTicket_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "HelpTicket_employeeId_idx" ON "HelpTicket"("employeeId");
CREATE INDEX IF NOT EXISTS "HelpTicket_status_idx" ON "HelpTicket"("status");
CREATE INDEX IF NOT EXISTS "HelpTicket_createdAt_idx" ON "HelpTicket"("createdAt");
CREATE INDEX IF NOT EXISTS "HelpTicket_assignedToRole_idx" ON "HelpTicket"("assignedToRole");
CREATE INDEX IF NOT EXISTS "HelpTicket_assignedToId_idx" ON "HelpTicket"("assignedToId");
CREATE INDEX IF NOT EXISTS "HelpTicket_managerId_idx" ON "HelpTicket"("managerId");

-- Add foreign key constraints
DO $$ 
BEGIN
    -- Add foreign key to Employee
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'HelpTicket_employeeId_fkey'
    ) THEN
        ALTER TABLE "HelpTicket" 
        ADD CONSTRAINT "HelpTicket_employeeId_fkey" 
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    -- Add foreign key to User (resolvedBy)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'HelpTicket_resolvedById_fkey'
    ) THEN
        ALTER TABLE "HelpTicket" 
        ADD CONSTRAINT "HelpTicket_resolvedById_fkey" 
        FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ============================================
-- After running this, restart your server
-- ============================================

