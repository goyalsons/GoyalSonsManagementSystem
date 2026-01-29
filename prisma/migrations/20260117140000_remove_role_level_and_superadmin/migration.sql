-- Remove role level and superadmin columns
ALTER TABLE "Role" DROP COLUMN IF EXISTS "level";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isSuperAdmin";
