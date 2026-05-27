-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'MEETING_EXTRACTION');

-- Add columns (nullable during backfill)
ALTER TABLE "Task" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "source" "TaskSource";

-- Backfill from linked meeting
UPDATE "Task" AS t
SET
  "projectId" = m."projectId",
  "createdById" = m."createdById",
  "source" = CASE
    WHEN m."audioUrl" = 'https://placeholder.seam.local/manual-task' THEN 'MANUAL'::"TaskSource"
    ELSE 'MEETING_EXTRACTION'::"TaskSource"
  END
FROM "Meeting" AS m
WHERE t."meetingId" = m."id";

-- Require project scope on every task
ALTER TABLE "Task" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "createdById" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- Manual tasks no longer reference placeholder meetings
ALTER TABLE "Task" ALTER COLUMN "meetingId" DROP NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "transcriptId" DROP NOT NULL;

UPDATE "Task"
SET "meetingId" = NULL, "transcriptId" = NULL
WHERE "source" = 'MANUAL';

-- Remove orphan placeholder transcripts
DELETE FROM "Transcript" AS tr
USING "Meeting" AS m
WHERE tr."meetingId" = m."id"
  AND m."audioUrl" = 'https://placeholder.seam.local/manual-task'
  AND NOT EXISTS (
    SELECT 1 FROM "Task" AS t WHERE t."transcriptId" = tr."id"
  );

-- Remove orphan placeholder meetings
DELETE FROM "Meeting" AS m
WHERE m."audioUrl" = 'https://placeholder.seam.local/manual-task'
  AND NOT EXISTS (
    SELECT 1 FROM "Task" AS t WHERE t."meetingId" = m."id"
  );

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX "Task_meetingId_idx" ON "Task"("meetingId");
