-- GitHub pull request IDs exceed PostgreSQL INTEGER max (2^31 - 1).
ALTER TABLE "PullRequest" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;
