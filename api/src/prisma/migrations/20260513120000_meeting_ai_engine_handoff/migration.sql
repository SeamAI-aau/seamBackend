-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN "externalJobId" TEXT,
ADD COLUMN "processingEngine" TEXT,
ADD COLUMN "processingStartedAt" TIMESTAMP(3),
ADD COLUMN "lastProcessingError" TEXT;
