-- Subscriber perks a creator controls: early access, sub-only emotes, merch.
-- Additive with defaults matching today's behaviour (subscribers already get
-- early access; emotes become subscriber-only as the build doc specifies).
ALTER TABLE "Creator" ADD COLUMN "subEarlyAccess" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Creator" ADD COLUMN "subOnlyEmotes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Creator" ADD COLUMN "merchUrl" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subMerchPerk" TEXT;
