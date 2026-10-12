import { z } from "zod";
import { PAY_PER_MINUTE } from "@/lib/constants";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2).max(50),
  region: z.enum(["IN", "US", "OTHER"]).default("IN"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const creatorOnboardSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  channelName: z.string().min(2).max(60),
  bio: z.string().max(500).optional(),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  socialLinks: z.array(z.string()).max(5).optional(),
  verificationDocUrl: z.string().min(1, "A verification link or document is required"),
  subPriceDollars: z.number().min(0).max(99).default(4.99),
});

export const creatorSettingsSchema = z.object({
  bio: z.string().max(500).optional(),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  subPriceDollars: z.number().min(0).max(99).optional(),
  socialLinks: z.array(z.string()).max(5).optional(),
  // Subscriber perks
  subEarlyAccess: z.boolean().optional(),
  subOnlyEmotes: z.boolean().optional(),
  merchUrl: z.string().trim().url("Enter a full store link, starting with https://").max(300).optional().or(z.literal("")),
  subMerchPerk: z.string().trim().max(200, "Keep the subscriber perk under 200 characters").optional(),
});

export const episodeCreateSchema = z
  .object({
    title: z.string().min(2).max(120),
    description: z.string().max(2000).optional(),
    videoKey: z.string().min(1),
    thumbnailUrl: z.string().optional(),
    durationSeconds: z.number().int().min(10),
    castCredits: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
    isPaid: z.boolean(),
    rateDollars: z.number().min(0.01).max(0.25).optional(),
    previewSeconds: z.number().int().min(0).max(600).optional(),
    capDollars: z.number().min(0.25).max(20).optional(),
    premiereAt: z.string().datetime().optional(),
    earlyAccessUntil: z.string().datetime().optional(),
    publicAt: z.string().datetime().optional(),
  })
  .refine((d) => !d.isPaid || d.rateDollars !== undefined, {
    message: "A rate is required for paid episodes",
    path: ["rateDollars"],
  });

const RATE_MESSAGE = "Rate must be between $0.01 and $0.25 per minute";

const castCreditsInput = z.array(z.object({ name: z.string().trim().min(1).max(80), role: z.string().trim().min(1).max(60) })).max(40);

/** Everything a creator can change from the episode editor. All optional. */
export const episodeUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  thumbnailUrl: z.string().max(500).optional(),
  castCredits: castCreditsInput.optional(),
  // Replacing the video: a key from POST /api/uploads/video, plus its length.
  videoKey: z.string().min(1).max(500).optional(),
  durationSeconds: z.number().int().min(10).optional(),
  isPaid: z.boolean().optional(),
  rateDollars: z.number().min(0.01, RATE_MESSAGE).max(0.25, RATE_MESSAGE).optional(),
  previewSeconds: z.number().int().min(0).max(600, "The free preview can be at most 10 minutes").optional(),
  capDollars: z.number().min(0.25, "The price cap must be at least $0.25").max(20, "The price cap can be at most $20").optional(),
  premiereAt: z.string().datetime().nullable().optional(),
  earlyAccessUntil: z.string().datetime().nullable().optional(),
  publicAt: z.string().datetime().nullable().optional(),
  // Leaving DRAFT: "NOW" releases publicly straight away; "SCHEDULE" uses the dates above.
  publish: z.enum(["NOW", "SCHEDULE"]).optional(),
});

export const hypeLevelsSchema = z.object({
  levels: z
    .array(
      z.object({
        goalType: z.enum(["TIPS", "REACTIONS"]),
        // Dollars for TIPS, a count for REACTIONS.
        goalValue: z.number().positive().max(10_000_000),
        unlockTitle: z.string().trim().min(2).max(80),
        unlockAssetUrl: z.string().trim().max(500).optional().or(z.literal("")),
      })
    )
    .max(3),
});

export const voucherSchema = z.object({
  sessionToken: z.string().min(1),
  cumulativeAmountCents: z.number().int().min(0),
  // Seconds of video actually played since the previous tick.
  playedSeconds: z.number().min(0).max(120).optional(),
});

export const depositSchema = z.object({ amountDollars: z.number().positive().max(500) });
export const withdrawRequestSchema = z.object({ amountDollars: z.number().positive() });

export const tipSchema = z.object({
  creatorId: z.string().min(1),
  episodeId: z.string().optional(),
  amountDollars: z.number().min(1, "The minimum tip is $1"),
  message: z.string().max(120).optional(),
  // Onchain mode: the tip transaction the fan's wallet already sent.
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export const campaignTierInput = z.object({
  name: z.string().min(2).max(40),
  priceDollars: z.number().positive(),
  perks: z.array(z.string()).min(1),
  backerLimit: z.number().int().positive().optional(),
});

export const campaignMilestoneInput = z.object({
  label: z.string().min(2).max(120),
  percentOfGoal: z.number().int().min(1).max(100),
});

export const campaignCreateSchema = z.object({
  filmTitle: z.string().min(2).max(120),
  pitch: z.string().max(2000).optional(),
  pitchVideoUrl: z.string().optional(),
  goalDollars: z.number().positive(),
  deadline: z.string().datetime(),
  deliveryDate: z.string().datetime(),
  producerUnitsEnabled: z.boolean().default(false),
  tiers: z.array(campaignTierInput).min(1).max(6),
  milestones: z.array(campaignMilestoneInput).min(1).max(8),
});

export const backPerkSchema = z.object({
  type: z.literal("PERK"),
  tierId: z.string().min(1),
  riskAcknowledged: z.literal(true),
});
export const backUnitSchema = z.object({
  type: z.literal("PRODUCER_UNIT"),
  amountDollars: z.number().positive(),
  riskAcknowledged: z.literal(true),
});
export const backCampaignSchema = z.discriminatedUnion("type", [backPerkSchema, backUnitSchema]);

export const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  text: z.string().max(300).optional(),
  tags: z.array(z.string()).max(5).optional(),
});

export const reportSchema = z.object({
  targetType: z.enum(["EPISODE", "REVIEW", "CHAT_MESSAGE", "CREATOR"]),
  targetId: z.string().min(1),
  reason: z.string().min(3).max(500),
});

export const milestoneSubmitSchema = z.object({
  proofUrl: z.string().min(1),
  proofNote: z.string().max(1000).optional(),
});

/** Onchain mode: the hash of a transaction the user's wallet sent. */
export const txHashSchema = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Missing transaction hash") });

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export { PAY_PER_MINUTE };
