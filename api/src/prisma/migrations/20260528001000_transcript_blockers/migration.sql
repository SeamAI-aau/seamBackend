-- Blockers from meeting transcripts and system events (CI, inactivity)
CREATE TABLE "TranscriptBlocker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "projectId" TEXT NOT NULL,
    "category" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptBlocker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TranscriptBlocker_projectId_idx" ON "TranscriptBlocker"("projectId");

ALTER TABLE "TranscriptBlocker" ADD CONSTRAINT "TranscriptBlocker_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TranscriptBlocker" ADD CONSTRAINT "TranscriptBlocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
