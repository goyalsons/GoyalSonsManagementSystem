-- Migration: Add UiPage model for UI-driven policy management
-- Run this manually if automatic migration fails

-- Create UiPage table
CREATE TABLE IF NOT EXISTS "UiPage" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "policyPrefix" TEXT NOT NULL,
    "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiPage_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "UiPage_pageKey_key" ON "UiPage"("pageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "UiPage_path_key" ON "UiPage"("path");

-- Create indexes
CREATE INDEX IF NOT EXISTS "UiPage_isActive_idx" ON "UiPage"("isActive");
CREATE INDEX IF NOT EXISTS "UiPage_order_idx" ON "UiPage"("order");

-- Add pageId column to Policy table
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "pageId" TEXT;

-- Create foreign key
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_pageId_fkey" 
    FOREIGN KEY ("pageId") REFERENCES "UiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index on pageId
CREATE INDEX IF NOT EXISTS "Policy_pageId_idx" ON "Policy"("pageId");
