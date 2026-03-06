-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "jiraIssueKey" TEXT;

-- CreateTable
CREATE TABLE "JiraAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cloudId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraAccount_userId_key" ON "JiraAccount"("userId");

-- AddForeignKey
ALTER TABLE "JiraAccount" ADD CONSTRAINT "JiraAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
