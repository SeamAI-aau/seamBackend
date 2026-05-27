-- AlterTable
ALTER TABLE "Task" ADD COLUMN "jiraSyncLastError" TEXT;

-- CreateTable
CREATE TABLE "GithubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubWebhookDelivery_deliveryId_key" ON "GithubWebhookDelivery"("deliveryId");
