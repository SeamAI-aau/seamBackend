-- Add summary to transcripts
ALTER TABLE "Transcript"
ADD COLUMN "summary" JSONB;
