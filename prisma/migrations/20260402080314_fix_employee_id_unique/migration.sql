-- DropIndex
DROP INDEX "User_employeeId_key";

-- CreateIndex
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");
