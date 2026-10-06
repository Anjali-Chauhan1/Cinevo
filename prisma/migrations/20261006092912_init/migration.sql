-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "platformRole" TEXT NOT NULL DEFAULT 'VIEWER',
    "region" TEXT NOT NULL DEFAULT 'IN',
    "kycStatus" TEXT NOT NULL DEFAULT 'NONE',
    "deviceHash" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "pendingWithdrawPaise" INTEGER NOT NULL DEFAULT 0,
    "withdrawRequestedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Creator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Emote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "glyph" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Emote_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "premiereAt" DATETIME,
    "earlyAccessUntil" DATETIME,
    "publicAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "videoVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Episode_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "rateRupeesPaiseSnapshot" INTEGER NOT NULL,
    "previewSecondsSnapshot" INTEGER NOT NULL,
    "capRupeesPaiseSnapshot" INTEGER NOT NULL,
    "freeReason" TEXT NOT NULL DEFAULT 'NONE',
    "cumulativeAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "lastVoucherAt" DATETIME,
    "secondsWatched" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "settledAmountPaise" INTEGER,
    "settledAt" DATETIME,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchSession_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WatchSession_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EpisodeAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "viewerId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "totalPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "capReached" BOOLEAN NOT NULL DEFAULT false,
    "secondsWatched" INTEGER NOT NULL DEFAULT 0,
    "firstWatchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EpisodeAccess_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EpisodeAccess_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "ratePerSecondPaiseScaled" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    "lastAccruedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pausedForLowBalance" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Subscription_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Subscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "episodeId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tip_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tip_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Tip_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "filmTitle" TEXT NOT NULL,
    "pitch" TEXT,
    "pitchVideoUrl" TEXT,
    "goalPaise" INTEGER NOT NULL,
    "deadline" DATETIME NOT NULL,
    "deliveryDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalBackedPaise" INTEGER NOT NULL DEFAULT 0,
    "totalReleasedPaise" INTEGER NOT NULL DEFAULT 0,
    "producerUnitsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "unitsRaisedPaise" INTEGER NOT NULL DEFAULT 0,
    "revenueToUnitsPaise" INTEGER NOT NULL DEFAULT 0,
    "accRevenuePerUnitScaled" BIGINT NOT NULL DEFAULT 0,
    "fundedEpisodeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "perks" TEXT NOT NULL,
    "backerLimit" INTEGER,
    "backedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CampaignTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "percentOfGoal" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "proofUrl" TEXT,
    "proofNote" TEXT,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "releasedAmountPaise" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Milestone_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Backing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT,
    "type" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "unitsGranted" INTEGER NOT NULL DEFAULT 0,
    "riskAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "riskAcknowledgedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Backing_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Backing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Backing_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CampaignTier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackerPass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "BackerPass_backingId_fkey" FOREIGN KEY ("backingId") REFERENCES "Backing" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BackerPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BackerPass_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProducerUnitHolding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "lastClaimedAccRevenuePerUnitScaled" BIGINT NOT NULL DEFAULT 0,
    "mintedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockUntil" DATETIME NOT NULL,
    CONSTRAINT "ProducerUnitHolding_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProducerUnitHolding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RevenueDistribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "accRevenuePerUnitScaledAfter" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevenueDistribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Premiere" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "viewerPeak" INTEGER NOT NULL DEFAULT 0,
    "slowModeSeconds" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Premiere_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HypeLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "goalType" TEXT NOT NULL,
    "goalValue" INTEGER NOT NULL,
    "unlockTitle" TEXT NOT NULL,
    "unlockAssetUrl" TEXT,
    "reachedAt" DATETIME,
    CONSTRAINT "HypeLevel_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HypeProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "tipTotalPaise" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "lastLevelReached" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HypeProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EpisodeReactionCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MESSAGE',
    "tipAmountPaise" INTEGER,
    "badges" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModeratorAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModeratorAssignment_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ModeratorAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    CONSTRAINT "ChatAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "tags" TEXT,
    "reviewerBadge" TEXT NOT NULL,
    "creatorReply" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PopularityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "episodeId" TEXT NOT NULL,
    "score" REAL NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'NONE',
    "breakdown" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PopularityScore_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

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
CREATE INDEX "Tip_creatorId_createdAt_idx" ON "Tip"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "Tip_episodeId_createdAt_idx" ON "Tip"("episodeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_fundedEpisodeId_key" ON "Campaign"("fundedEpisodeId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_campaignId_order_key" ON "Milestone"("campaignId", "order");

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
