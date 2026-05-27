-- CreateEnum
CREATE TYPE "ProjectMemberStatus" AS ENUM ('PENDING', 'ACTIVE');

-- AlterTable: add new columns (email nullable first for backfill)
ALTER TABLE "ProjectMember" ADD COLUMN "email" TEXT;
ALTER TABLE "ProjectMember" ADD COLUMN "status" "ProjectMemberStatus" NOT NULL DEFAULT 'ACTIVE';

-- Backfill email from User for existing rows
UPDATE "ProjectMember" SET "email" = (SELECT "email" FROM "User" WHERE "User"."id" = "ProjectMember"."userId");

-- Make email NOT NULL
ALTER TABLE "ProjectMember" ALTER COLUMN "email" SET NOT NULL;

-- Make userId nullable (for PENDING invites)
ALTER TABLE "ProjectMember" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex: one invite/member per email per project
CREATE UNIQUE INDEX "ProjectMember_projectId_email_key" ON "ProjectMember"("projectId", "email");

-- AlterForeignKey: userId FK to ON DELETE CASCADE
ALTER TABLE "ProjectMember" DROP CONSTRAINT "ProjectMember_userId_fkey";
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
