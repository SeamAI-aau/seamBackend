-- AlterTable
ALTER TABLE "JiraAccount" ADD COLUMN "accountId" TEXT,
ADD COLUMN "displayName" TEXT,
ADD COLUMN "emailAddress" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "jiraLastActivitySyncAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "JiraAccount_accountId_idx" ON "JiraAccount"("accountId");
