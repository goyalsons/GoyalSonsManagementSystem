-- Enforce single role per user: remove duplicate UserRole rows (keep one per userId), then add unique constraint.
-- Step 1: Delete duplicate rows, keeping one per userId (the one with smallest roleId for determinism).
DELETE FROM "UserRole" a
USING "UserRole" b
WHERE a."userId" = b."userId"
  AND (a."roleId" > b."roleId" OR (a."roleId" = b."roleId" AND a."createdAt" > b."createdAt"));

-- Step 2: Add unique constraint on userId.
CREATE UNIQUE INDEX "UserRole_userId_key" ON "UserRole"("userId");
