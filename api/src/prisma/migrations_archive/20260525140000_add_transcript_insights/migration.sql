-- Add insights and suggested actions to transcripts
ALTER TABLE "Transcript"
ADD COLUMN "insights" JSONB,
ADD COLUMN "suggestedActions" JSONB;
