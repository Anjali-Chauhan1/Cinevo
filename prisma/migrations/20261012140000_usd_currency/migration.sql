-- Switch money from Indian rupees (paise) to US dollars (cents).
-- Columns are renamed *Paise -> *Cents and every stored amount is converted
-- at 83 INR per USD, rounded to the nearest cent. Paid prices never round
-- down to zero.

-- LedgerAccount
ALTER TABLE "LedgerAccount" RENAME COLUMN "balancePaise" TO "balanceCents";
ALTER TABLE "LedgerAccount" RENAME COLUMN "pendingWithdrawPaise" TO "pendingWithdrawCents";
UPDATE "LedgerAccount" SET
  "balanceCents" = ROUND("balanceCents" / 83.0)::int,
  "pendingWithdrawCents" = ROUND("pendingWithdrawCents" / 83.0)::int;

-- LedgerTransaction
ALTER TABLE "LedgerTransaction" RENAME COLUMN "amountPaise" TO "amountCents";
UPDATE "LedgerTransaction" SET
  "amountCents" = ROUND("amountCents" / 83.0)::int,
  "balanceAfter" = ROUND("balanceAfter" / 83.0)::int;

-- Creator
ALTER TABLE "Creator" RENAME COLUMN "subPriceRupeesPaise" TO "subPriceCents";
ALTER TABLE "Creator" ALTER COLUMN "subPriceCents" SET DEFAULT 499;
UPDATE "Creator" SET "subPriceCents" = CASE
  WHEN "subPriceCents" > 0 THEN GREATEST(1, ROUND("subPriceCents" / 83.0)::int) ELSE 0 END;

-- Episode
ALTER TABLE "Episode" RENAME COLUMN "rateRupeesPaise" TO "rateCents";
ALTER TABLE "Episode" RENAME COLUMN "capRupeesPaise" TO "capCents";
ALTER TABLE "Episode" ALTER COLUMN "capCents" SET DEFAULT 200;
UPDATE "Episode" SET
  "rateCents" = CASE WHEN "rateCents" > 0 THEN GREATEST(1, ROUND("rateCents" / 83.0)::int) ELSE 0 END,
  "capCents" = GREATEST(25, ROUND("capCents" / 83.0)::int);

-- WatchSession
ALTER TABLE "WatchSession" RENAME COLUMN "rateRupeesPaiseSnapshot" TO "rateCentsSnapshot";
ALTER TABLE "WatchSession" RENAME COLUMN "capRupeesPaiseSnapshot" TO "capCentsSnapshot";
ALTER TABLE "WatchSession" RENAME COLUMN "cumulativeAmountPaise" TO "cumulativeAmountCents";
ALTER TABLE "WatchSession" RENAME COLUMN "settledAmountPaise" TO "settledAmountCents";
UPDATE "WatchSession" SET
  "rateCentsSnapshot" = CASE WHEN "rateCentsSnapshot" > 0 THEN GREATEST(1, ROUND("rateCentsSnapshot" / 83.0)::int) ELSE 0 END,
  "capCentsSnapshot" = CASE WHEN "capCentsSnapshot" > 0 THEN GREATEST(1, ROUND("capCentsSnapshot" / 83.0)::int) ELSE 0 END,
  "cumulativeAmountCents" = ROUND("cumulativeAmountCents" / 83.0)::int,
  "settledAmountCents" = ROUND("settledAmountCents" / 83.0)::int;

-- EpisodeAccess
ALTER TABLE "EpisodeAccess" RENAME COLUMN "totalPaidPaise" TO "totalPaidCents";
UPDATE "EpisodeAccess" SET "totalPaidCents" = ROUND("totalPaidCents" / 83.0)::int;

-- Subscription (per-second rate, scaled by 1e6)
ALTER TABLE "Subscription" RENAME COLUMN "ratePerSecondPaiseScaled" TO "ratePerSecondCentsScaled";
UPDATE "Subscription" SET "ratePerSecondCentsScaled" = ROUND("ratePerSecondCentsScaled" / 83.0)::int;

-- Tip
ALTER TABLE "Tip" RENAME COLUMN "amountPaise" TO "amountCents";
UPDATE "Tip" SET "amountCents" = ROUND("amountCents" / 83.0)::int;

-- Campaign
ALTER TABLE "Campaign" RENAME COLUMN "goalPaise" TO "goalCents";
ALTER TABLE "Campaign" RENAME COLUMN "totalBackedPaise" TO "totalBackedCents";
ALTER TABLE "Campaign" RENAME COLUMN "totalReleasedPaise" TO "totalReleasedCents";
ALTER TABLE "Campaign" RENAME COLUMN "unitsRaisedPaise" TO "unitsRaisedCents";
ALTER TABLE "Campaign" RENAME COLUMN "revenueToUnitsPaise" TO "revenueToUnitsCents";
UPDATE "Campaign" SET
  "goalCents" = GREATEST(1, ROUND("goalCents" / 83.0)::int),
  "totalBackedCents" = ROUND("totalBackedCents" / 83.0)::int,
  "totalReleasedCents" = ROUND("totalReleasedCents" / 83.0)::int,
  "unitsRaisedCents" = ROUND("unitsRaisedCents" / 83.0)::int,
  "revenueToUnitsCents" = ROUND("revenueToUnitsCents" / 83.0)::int,
  "accRevenuePerUnitScaled" = ROUND("accRevenuePerUnitScaled" / 83.0)::bigint;

-- CampaignTier
ALTER TABLE "CampaignTier" RENAME COLUMN "pricePaise" TO "priceCents";
UPDATE "CampaignTier" SET "priceCents" = GREATEST(1, ROUND("priceCents" / 83.0)::int);

-- Milestone
ALTER TABLE "Milestone" RENAME COLUMN "releasedAmountPaise" TO "releasedAmountCents";
UPDATE "Milestone" SET "releasedAmountCents" = ROUND("releasedAmountCents" / 83.0)::int;

-- Backing
ALTER TABLE "Backing" RENAME COLUMN "amountPaise" TO "amountCents";
UPDATE "Backing" SET "amountCents" = ROUND("amountCents" / 83.0)::int;

-- ProducerUnitHolding
UPDATE "ProducerUnitHolding" SET
  "lastClaimedAccRevenuePerUnitScaled" = ROUND("lastClaimedAccRevenuePerUnitScaled" / 83.0)::bigint;

-- RevenueDistribution
ALTER TABLE "RevenueDistribution" RENAME COLUMN "amountPaise" TO "amountCents";
UPDATE "RevenueDistribution" SET
  "amountCents" = ROUND("amountCents" / 83.0)::int,
  "accRevenuePerUnitScaledAfter" = ROUND("accRevenuePerUnitScaledAfter" / 83.0)::bigint;

-- HypeLevel: only tip goals are money; reaction goals are counts
UPDATE "HypeLevel" SET "goalValue" = GREATEST(1, ROUND("goalValue" / 83.0)::int) WHERE "goalType" = 'TIPS';

-- HypeProgress
ALTER TABLE "HypeProgress" RENAME COLUMN "tipTotalPaise" TO "tipTotalCents";
UPDATE "HypeProgress" SET "tipTotalCents" = ROUND("tipTotalCents" / 83.0)::int;

-- ChatMessage
ALTER TABLE "ChatMessage" RENAME COLUMN "tipAmountPaise" TO "tipAmountCents";
UPDATE "ChatMessage" SET "tipAmountCents" = ROUND("tipAmountCents" / 83.0)::int;
