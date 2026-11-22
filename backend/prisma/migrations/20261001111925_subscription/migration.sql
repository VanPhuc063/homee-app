-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('OWNER_MONTHLY', 'OWNER_6MONTH', 'OWNER_9MONTH', 'OWNER_12MONTH', 'CONTRACTOR_MONTHLY', 'CONTRACTOR_10PROJECTS', 'CONTRACTOR_YEARLY', 'AI_PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStore" AS ENUM ('APPLE', 'GOOGLE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "store" "SubscriptionStore" NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "isAutoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "purchaseToken" TEXT,
    "transactionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_transactionId_key" ON "Subscription"("transactionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_plan_idx" ON "Subscription"("userId", "plan");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
