/*
  Warnings:

  - You are about to drop the column `externalId` on the `Task` table. All the data in the column will be lost.
  - Added the required column `transcriptId` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "externalId",
ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "transcriptId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
