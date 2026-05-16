-- CreateEnum
CREATE TYPE "JiraProposalAction" AS ENUM ('CREATE', 'TRANSITION');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "jiraProposalAction" "JiraProposalAction",
ADD COLUMN     "jiraProposalIssueKey" TEXT,
ADD COLUMN     "jiraProposalTransitionId" TEXT,
ADD COLUMN     "jiraProposalTargetStatus" TEXT;
