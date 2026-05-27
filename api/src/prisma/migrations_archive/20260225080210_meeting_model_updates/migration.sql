/*
  Warnings:

  - You are about to drop the column `transcript` on the `Meeting` table. All the data in the column will be lost.
  - Made the column `audioUrl` on table `Meeting` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'TASKS_EXTRACTED', 'FAILED');

-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "transcript",
ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'UPLOADED',
ALTER COLUMN "audioUrl" SET NOT NULL;

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "diarization" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_meetingId_version_key" ON "Transcript"("meetingId", "version");

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
