-- AlterTable: Make User.passwordHash optional for Google OAuth–only users
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
