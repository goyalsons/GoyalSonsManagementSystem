-- Remove Role, Policy, UserRole, and RolePolicy tables
-- These tables are no longer needed

-- Drop foreign key constraints first
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_roleId_fkey";
ALTER TABLE "UserRole" DROP CONSTRAINT IF EXISTS "UserRole_userId_fkey";
ALTER TABLE "RolePolicy" DROP CONSTRAINT IF EXISTS "RolePolicy_roleId_fkey";
ALTER TABLE "RolePolicy" DROP CONSTRAINT IF EXISTS "RolePolicy_policyId_fkey";

-- Drop the tables
DROP TABLE IF EXISTS "RolePolicy";
DROP TABLE IF EXISTS "UserRole";
DROP TABLE IF EXISTS "Policy";
DROP TABLE IF EXISTS "Role";

