-- Fix column names to match camelCase (PostgreSQL converts unquoted to lowercase)
-- This script will rename columns if they exist in lowercase

DO $$
BEGIN
    -- Rename columns if they exist in lowercase
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emp_manager' AND column_name = 'mdepartmentid') THEN
        ALTER TABLE emp_manager RENAME COLUMN mdepartmentid TO "mdepartmentId";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emp_manager' AND column_name = 'mdesignationid') THEN
        ALTER TABLE emp_manager RENAME COLUMN mdesignationid TO "mdesignationId";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'emp_manager' AND column_name = 'morgunitid') THEN
        ALTER TABLE emp_manager RENAME COLUMN morgunitid TO "morgUnitId";
    END IF;
END $$;

