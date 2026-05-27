-- CreateTable
CREATE TABLE "DeveloperActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeveloperActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeveloperActivity_projectId_idx" ON "DeveloperActivity"("projectId");

-- CreateIndex
CREATE INDEX "DeveloperActivity_userId_idx" ON "DeveloperActivity"("userId");

-- CreateIndex
CREATE INDEX "DeveloperActivity_occurredAt_idx" ON "DeveloperActivity"("occurredAt");

-- CreateIndex
CREATE INDEX "DeveloperActivity_projectId_occurredAt_idx" ON "DeveloperActivity"("projectId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperActivity_source_externalId_key" ON "DeveloperActivity"("source", "externalId");

-- AddForeignKey
ALTER TABLE "DeveloperActivity" ADD CONSTRAINT "DeveloperActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeveloperActivity" ADD CONSTRAINT "DeveloperActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
