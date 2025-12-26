-- Insert sample data into emp_manager table
INSERT INTO emp_manager (mid, mcardno, mdepartmentId, mdesignationId, morgUnitId, mis_extinct)
VALUES 
  ('45455', '11017', '077d0ed7-d84c-43bc-bf7f-8785a2657aa8', NULL, NULL, false)
ON CONFLICT (mid) DO NOTHING;

-- Verify the data
SELECT * FROM emp_manager;

