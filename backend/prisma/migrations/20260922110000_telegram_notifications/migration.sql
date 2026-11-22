-- AlterTable: kênh thông báo Telegram (Requirements v2.1 §9)
ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "telegramLinkCode" TEXT;

CREATE UNIQUE INDEX "User_telegramLinkCode_key" ON "User"("telegramLinkCode");
