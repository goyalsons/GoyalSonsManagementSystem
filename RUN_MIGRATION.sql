-- ============================================
-- IMPORTANT: Run this SQL in your PostgreSQL database
-- ============================================
-- This adds the new columns to HelpTicket table WITHOUT deleting existing data
-- 
-- How to run:
-- 1. Open your database client (pgAdmin, DBeaver, Railway Dashboard SQL Editor, etc.)
-- 2. Connect to your database
-- 3. Copy and paste this entire file and run it
-- ============================================

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

-- ============================================
-- After running this, restart your server
-- ============================================

