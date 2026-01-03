-- Script to resolve failed Prisma migration
-- Run this in Railway Database Console (Connect → Query)

-- Step 1: Check if columns exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'HelpTicket' 
            AND column_name = 'raisedByRole'
        ) THEN 'Columns EXIST - Mark migration as APPLIED'
        ELSE 'Columns DON''T EXIST - Mark migration as ROLLED BACK'
    END as action_needed;

-- Step 2A: If columns EXIST (run this if Step 1 shows "Columns EXIST")
-- UPDATE "_prisma_migrations" 
-- SET finished_at = NOW(),
--     applied_steps_count = 1
-- WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
-- AND finished_at IS NULL;

-- Step 2B: If columns DON'T EXIST (run this if Step 1 shows "Columns DON'T EXIST")
-- DELETE FROM "_prisma_migrations"
-- WHERE migration_name = '20251228161859_add_help_ticket_assignment_fields'
-- AND finished_at IS NULL;

-- After running Step 2A or 2B, redeploy your Railway service

