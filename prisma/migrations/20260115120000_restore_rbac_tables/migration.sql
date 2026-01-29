-- Migration: restore_rbac_tables
-- Ensure RBAC tables exist for shadow database replay

CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Policy" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE TABLE IF NOT EXISTS "RolePolicy" (
    "roleId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePolicy_pkey" PRIMARY KEY ("roleId","policyId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "Policy_key_key" ON "Policy"("key");
CREATE INDEX IF NOT EXISTS "UserRole_userId_idx" ON "UserRole"("userId");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE INDEX IF NOT EXISTS "RolePolicy_roleId_idx" ON "RolePolicy"("roleId");
CREATE INDEX IF NOT EXISTS "RolePolicy_policyId_idx" ON "RolePolicy"("policyId");

DO $$
BEGIN
    ALTER TABLE "UserRole"
    ADD CONSTRAINT "UserRole_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "UserRole"
    ADD CONSTRAINT "UserRole_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "RolePolicy"
    ADD CONSTRAINT "RolePolicy_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "RolePolicy"
    ADD CONSTRAINT "RolePolicy_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
