-- Ensure Policy.isActive exists
ALTER TABLE "Policy"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Ensure User.policyVersion exists
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "policyVersion" INTEGER NOT NULL DEFAULT 1;
