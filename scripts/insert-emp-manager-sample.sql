-- Insert sample data into emp_manager table
-- This matches the structure requested by the user

INSERT INTO "emp_manager" ("mid", "mcardno", "mdepartmentId", "mdesignationId", "morgUnitId", "mis_extinct")
VALUES 
  ('45455', '11017', '077d0ed7-d84c-43bc-bf7f-8785a2657aa8', NULL, NULL, false)
ON CONFLICT ("mid") DO UPDATE SET
  "mcardno" = EXCLUDED."mcardno",
  "mdepartmentId" = EXCLUDED."mdepartmentId",
  "mdesignationId" = EXCLUDED."mdesignationId",
  "morgUnitId" = EXCLUDED."morgUnitId",
  "mis_extinct" = EXCLUDED."mis_extinct";

-- Verify the data
SELECT * FROM "emp_manager" WHERE "mid" = '45455';

-- Show all records
SELECT * FROM "emp_manager" ORDER BY "mid";

