-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "audioPublicId" TEXT;

-- CreateTable
CREATE TABLE "TranscriptBlocker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptBlocker_projectId_idx" ON "TranscriptBlocker"("projectId");

-- AddForeignKey
ALTER TABLE "TranscriptBlocker" ADD CONSTRAINT "TranscriptBlocker_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptBlocker" ADD CONSTRAINT "TranscriptBlocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
