-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- Clean up fake auto-generated emails: set them to NULL
UPDATE "User" SET "email" = NULL WHERE "email" LIKE '%@example.invalid';
