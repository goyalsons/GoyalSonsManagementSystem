-- Add UiPage table and link Policy.pageId safely

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

CREATE UNIQUE INDEX IF NOT EXISTS "UiPage_pageKey_key" ON "UiPage"("pageKey");
CREATE UNIQUE INDEX IF NOT EXISTS "UiPage_path_key" ON "UiPage"("path");
CREATE INDEX IF NOT EXISTS "UiPage_isActive_idx" ON "UiPage"("isActive");
CREATE INDEX IF NOT EXISTS "UiPage_order_idx" ON "UiPage"("order");

ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "pageId" TEXT;

DO $$
BEGIN
    ALTER TABLE "Policy"
    ADD CONSTRAINT "Policy_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "UiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Policy_pageId_idx" ON "Policy"("pageId");
