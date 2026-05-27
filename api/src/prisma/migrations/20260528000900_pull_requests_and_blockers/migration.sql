-- Synced GitHub pull requests and PR-derived blockers
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "githubId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "state" "PullRequestState" NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reviewRequestedAt" TIMESTAMP(3),
    "requestedReviewerLogins" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "prCreatedAt" TIMESTAMP(3) NOT NULL,
    "prUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Blocker" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "type" "BlockerType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blocker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PullRequest_githubId_key" ON "PullRequest"("githubId");
CREATE UNIQUE INDEX "Blocker_pullRequestId_type_key" ON "Blocker"("pullRequestId", "type");

ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Blocker" ADD CONSTRAINT "Blocker_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
