-- AlterTable
ALTER TABLE "Backing" ADD COLUMN "txHash" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "contractAddress" TEXT;

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "chainRegisteredAt" DATETIME;

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN "chainSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "LedgerTransaction" ADD COLUMN "txHash" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "txHash" TEXT;

-- AlterTable
ALTER TABLE "Tip" ADD COLUMN "txHash" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastFaucetAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "privyUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "walletAddress" TEXT;

-- AlterTable
ALTER TABLE "WatchSession" ADD COLUMN "settleTxHash" TEXT;
ALTER TABLE "WatchSession" ADD COLUMN "voucherExpiry" INTEGER;
ALTER TABLE "WatchSession" ADD COLUMN "voucherSignature" TEXT;
ALTER TABLE "WatchSession" ADD COLUMN "voucherUnits" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Backing_txHash_key" ON "Backing"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_contractAddress_key" ON "Campaign"("contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_txHash_key" ON "Tip"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_privyUserId_key" ON "User"("privyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

