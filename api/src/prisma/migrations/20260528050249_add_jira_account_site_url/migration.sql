/*
  Warnings:

  - A unique constraint covering the columns `[projectId,jiraIssueKey]` on the table `Task` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'JIRA_IMPORT';

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_meetingId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_transcriptId_fkey";

-- AlterTable
ALTER TABLE "JiraAccount" ADD COLUMN     "siteUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_jiraIssueKey_key" ON "Task"("projectId", "jiraIssueKey");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
