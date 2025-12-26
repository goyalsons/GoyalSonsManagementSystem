-- Verify emp_manager table exists and show its structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'emp_manager'
ORDER BY ordinal_position;

-- Check if table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'emp_manager'
) AS table_exists;

-- Show sample data if any
SELECT * FROM "emp_manager" LIMIT 5;

