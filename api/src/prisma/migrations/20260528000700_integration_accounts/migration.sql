-- Jira and GitHub OAuth account linkage per user
CREATE TABLE "JiraAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cloudId" TEXT NOT NULL,
    "siteUrl" TEXT,
    "accountId" TEXT,
    "displayName" TEXT,
    "emailAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GithubAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatarUrl" TEXT,
    "username" TEXT,

    CONSTRAINT "GithubAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraAccount_userId_key" ON "JiraAccount"("userId");
CREATE INDEX "JiraAccount_accountId_idx" ON "JiraAccount"("accountId");
CREATE UNIQUE INDEX "GithubAccount_userId_key" ON "GithubAccount"("userId");

ALTER TABLE "JiraAccount" ADD CONSTRAINT "JiraAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GithubAccount" ADD CONSTRAINT "GithubAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
