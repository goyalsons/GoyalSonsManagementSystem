-- Check if the new columns exist in HelpTicket table
-- Run this in your PostgreSQL database client (pgAdmin, DBeaver, psql, etc.)

-- Method 1: Check table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'HelpTicket' 
  AND column_name IN ('raisedByRole', 'managerId', 'assignedToRole', 'assignedToId')
ORDER BY column_name;

-- Method 2: Check all columns in HelpTicket table
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'HelpTicket'
ORDER BY ordinal_position;

-- Method 3: Check indexes
SELECT 
    indexname, 
    indexdef
FROM pg_indexes 
WHERE tablename = 'HelpTicket' 
  AND indexname LIKE '%assignedToRole%' 
   OR indexname LIKE '%assignedToId%' 
   OR indexname LIKE '%managerId%';

-- Method 4: Count records to ensure data is preserved
SELECT COUNT(*) as total_tickets FROM "HelpTicket";

-- Method 5: Sample data to see if new columns have default values
SELECT 
    id, 
    subject, 
    "raisedByRole", 
    "managerId", 
    "assignedToRole", 
    "assignedToId",
    "createdAt"
FROM "HelpTicket" 
ORDER BY "createdAt" DESC 
LIMIT 5;

