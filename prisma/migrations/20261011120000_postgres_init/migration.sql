-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "platformRole" TEXT NOT NULL DEFAULT 'VIEWER',
    "region" TEXT NOT NULL DEFAULT 'IN',
    "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
    "deviceHash" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "privyUserId" TEXT,
    "walletAddress" TEXT,
    "lastFaucetAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "country" TEXT NOT NULL,
    "idType" TEXT NOT NULL,
    "idNumberLast4" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "selfieKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "pendingWithdrawPaise" INTEGER NOT NULL DEFAULT 0,
    "withdrawRequestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txHash" TEXT,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "bio" TEXT,
    "bannerUrl" TEXT,
    "socialLinks" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verificationNote" TEXT,
    "verificationDocUrl" TEXT,
    "subPriceRupeesPaise" INTEGER NOT NULL DEFAULT 4900,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainRegisteredAt" TIMESTAMP(3),

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emote" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "glyph" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Emote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoKey" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "castCredits" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "rateRupeesPaise" INTEGER NOT NULL DEFAULT 0,
    "previewSeconds" INTEGER NOT NULL DEFAULT 120,
    "capRupeesPaise" INTEGER NOT NULL DEFAULT 1500,
    "premiereAt" TIMESTAMP(3),
    "earlyAccessUntil" TIMESTAMP(3),
    "publicAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "videoVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "rateRupeesPaiseSnapshot" INTEGER NOT NULL,
    "previewSecondsSnapshot" INTEGER NOT NULL,
    "capRupeesPaiseSnapshot" INTEGER NOT NULL,
    "freeReason" TEXT NOT NULL DEFAULT 'NONE',
    "cumulativeAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "lastVoucherAt" TIMESTAMP(3),
    "secondsWatched" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settledAmountPaise" INTEGER,
    "settledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherUnits" TEXT,
    "voucherExpiry" INTEGER,
    "voucherSignature" TEXT,
    "settleTxHash" TEXT,

    CONSTRAINT "WatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeAccess" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "totalPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "capReached" BOOLEAN NOT NULL DEFAULT false,
    "secondsWatched" INTEGER NOT NULL DEFAULT 0,
    "firstWatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpisodeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "ratePerSecondPaiseScaled" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txHash" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "lastAccruedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pausedForLowBalance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "episodeId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txHash" TEXT,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "filmTitle" TEXT NOT NULL,
    "pitch" TEXT,
    "pitchVideoUrl" TEXT,
    "goalPaise" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalBackedPaise" INTEGER NOT NULL DEFAULT 0,
    "totalReleasedPaise" INTEGER NOT NULL DEFAULT 0,
    "producerUnitsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "unitsRaisedPaise" INTEGER NOT NULL DEFAULT 0,
    "revenueToUnitsPaise" INTEGER NOT NULL DEFAULT 0,
    "accRevenuePerUnitScaled" BIGINT NOT NULL DEFAULT 0,
    "fundedEpisodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractAddress" TEXT,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTier" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "perks" TEXT NOT NULL,
    "backerLimit" INTEGER,
    "backedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percentOfGoal" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proofUrl" TEXT,
    "proofNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "releasedAmountPaise" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backing" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "unitsGranted" INTEGER NOT NULL DEFAULT 0,
    "riskAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "riskAcknowledgedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "txHash" TEXT,

    CONSTRAINT "Backing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackerPass" (
    "id" TEXT NOT NULL,
    "backingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BackerPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProducerUnitHolding" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "lastClaimedAccRevenuePerUnitScaled" BIGINT NOT NULL DEFAULT 0,
    "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProducerUnitHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueDistribution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "accRevenuePerUnitScaledAfter" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Premiere" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "viewerPeak" INTEGER NOT NULL DEFAULT 0,
    "slowModeSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Premiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypeLevel" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "goalType" TEXT NOT NULL,
    "goalValue" INTEGER NOT NULL,
    "unlockTitle" TEXT NOT NULL,
    "unlockAssetUrl" TEXT,
    "reachedAt" TIMESTAMP(3),

    CONSTRAINT "HypeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HypeProgress" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "tipTotalPaise" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastLevelReached" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HypeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeReactionCount" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EpisodeReactionCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MESSAGE',
    "tipAmountPaise" INTEGER,
    "badges" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeratorAssignment" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModeratorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAction" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ChatAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "tags" TEXT,
    "reviewerBadge" TEXT NOT NULL,
    "creatorReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularityScore" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'NONE',
    "breakdown" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_privyUserId_key" ON "User"("privyUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "KycSubmission_userId_idx" ON "KycSubmission"("userId");

-- CreateIndex
CREATE INDEX "KycSubmission_status_idx" ON "KycSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_userId_key" ON "LedgerAccount"("userId");

-- CreateIndex
CREATE INDEX "LedgerTransaction_accountId_createdAt_idx" ON "LedgerTransaction"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_userId_key" ON "Creator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Creator_handle_key" ON "Creator"("handle");

-- CreateIndex
CREATE INDEX "Creator_verificationStatus_idx" ON "Creator"("verificationStatus");

-- CreateIndex
CREATE INDEX "Episode_creatorId_status_idx" ON "Episode"("creatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WatchSession_sessionToken_key" ON "WatchSession"("sessionToken");

-- CreateIndex
CREATE INDEX "WatchSession_viewerId_episodeId_status_idx" ON "WatchSession"("viewerId", "episodeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeAccess_viewerId_episodeId_key" ON "EpisodeAccess"("viewerId", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_fanId_creatorId_key" ON "Subscription"("fanId", "creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Tip_txHash_key" ON "Tip"("txHash");

-- CreateIndex
CREATE INDEX "Tip_creatorId_createdAt_idx" ON "Tip"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Tip_episodeId_createdAt_idx" ON "Tip"("episodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_fundedEpisodeId_key" ON "Campaign"("fundedEpisodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_contractAddress_key" ON "Campaign"("contractAddress");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_campaignId_order_key" ON "Milestone"("campaignId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Backing_txHash_key" ON "Backing"("txHash");

-- CreateIndex
CREATE INDEX "Backing_campaignId_userId_idx" ON "Backing"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BackerPass_backingId_key" ON "BackerPass"("backingId");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerUnitHolding_campaignId_userId_key" ON "ProducerUnitHolding"("campaignId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Premiere_episodeId_key" ON "Premiere"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "HypeLevel_episodeId_level_key" ON "HypeLevel"("episodeId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "HypeProgress_episodeId_key" ON "HypeProgress"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeReactionCount_episodeId_userId_key" ON "EpisodeReactionCount"("episodeId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_episodeId_createdAt_idx" ON "ChatMessage"("episodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModeratorAssignment_creatorId_userId_key" ON "ModeratorAssignment"("creatorId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_episodeId_userId_key" ON "Review"("episodeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularityScore_episodeId_key" ON "PopularityScore"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creator" ADD CONSTRAINT "Creator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emote" ADD CONSTRAINT "Emote_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSession" ADD CONSTRAINT "WatchSession_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeAccess" ADD CONSTRAINT "EpisodeAccess_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeAccess" ADD CONSTRAINT "EpisodeAccess_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTier" ADD CONSTRAINT "CampaignTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backing" ADD CONSTRAINT "Backing_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backing" ADD CONSTRAINT "Backing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Backing" ADD CONSTRAINT "Backing_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CampaignTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackerPass" ADD CONSTRAINT "BackerPass_backingId_fkey" FOREIGN KEY ("backingId") REFERENCES "Backing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackerPass" ADD CONSTRAINT "BackerPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackerPass" ADD CONSTRAINT "BackerPass_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerUnitHolding" ADD CONSTRAINT "ProducerUnitHolding_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProducerUnitHolding" ADD CONSTRAINT "ProducerUnitHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueDistribution" ADD CONSTRAINT "RevenueDistribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premiere" ADD CONSTRAINT "Premiere_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypeLevel" ADD CONSTRAINT "HypeLevel_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HypeProgress" ADD CONSTRAINT "HypeProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorAssignment" ADD CONSTRAINT "ModeratorAssignment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorAssignment" ADD CONSTRAINT "ModeratorAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAction" ADD CONSTRAINT "ChatAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularityScore" ADD CONSTRAINT "PopularityScore_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

