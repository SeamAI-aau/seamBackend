-- Project activity log and developer GitHub/Jira activity feed
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "ActivityLog_projectId_idx" ON "ActivityLog"("projectId");
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

CREATE INDEX "DeveloperActivity_projectId_idx" ON "DeveloperActivity"("projectId");
CREATE INDEX "DeveloperActivity_userId_idx" ON "DeveloperActivity"("userId");
CREATE INDEX "DeveloperActivity_occurredAt_idx" ON "DeveloperActivity"("occurredAt");
CREATE INDEX "DeveloperActivity_projectId_occurredAt_idx" ON "DeveloperActivity"("projectId", "occurredAt");
CREATE UNIQUE INDEX "DeveloperActivity_source_externalId_key" ON "DeveloperActivity"("source", "externalId");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeveloperActivity" ADD CONSTRAINT "DeveloperActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperActivity" ADD CONSTRAINT "DeveloperActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
