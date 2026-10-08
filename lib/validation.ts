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
  subPriceRupees: z.number().min(0).max(999).default(49),
});

export const creatorSettingsSchema = z.object({
  bio: z.string().max(500).optional(),
  bannerUrl: z.string().url().optional().or(z.literal("")),
  subPriceRupees: z.number().min(0).max(999).optional(),
  socialLinks: z.array(z.string()).max(5).optional(),
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
    rateRupees: z.number().min(0.1).max(2).optional(),
    previewSeconds: z.number().int().min(0).max(600).optional(),
    capRupees: z.number().min(1).max(500).optional(),
    premiereAt: z.string().datetime().optional(),
    earlyAccessUntil: z.string().datetime().optional(),
    publicAt: z.string().datetime().optional(),
  })
  .refine((d) => !d.isPaid || d.rateRupees !== undefined, {
    message: "A rate is required for paid episodes",
    path: ["rateRupees"],
  });

const RATE_MESSAGE = "Rate must be between ₹0.10 and ₹2 per minute";

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
  rateRupees: z.number().min(0.1, RATE_MESSAGE).max(2, RATE_MESSAGE).optional(),
  previewSeconds: z.number().int().min(0).max(600, "The free preview can be at most 10 minutes").optional(),
  capRupees: z.number().min(1, "The price cap must be at least ₹1").max(500, "The price cap can be at most ₹500").optional(),
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
        // Rupees for TIPS, a count for REACTIONS.
        goalValue: z.number().positive().max(10_000_000),
        unlockTitle: z.string().trim().min(2).max(80),
        unlockAssetUrl: z.string().trim().max(500).optional().or(z.literal("")),
      })
    )
    .max(3),
});

export const voucherSchema = z.object({
  sessionToken: z.string().min(1),
  cumulativeAmountPaise: z.number().int().min(0),
  // Seconds of video actually played since the previous tick.
  playedSeconds: z.number().min(0).max(120).optional(),
});

export const depositSchema = z.object({ amountRupees: z.number().positive().max(10000) });
export const withdrawRequestSchema = z.object({ amountRupees: z.number().positive() });

export const tipSchema = z.object({
  creatorId: z.string().min(1),
  episodeId: z.string().optional(),
  amountRupees: z.number().min(10),
  message: z.string().max(120).optional(),
  // Onchain mode: the tip transaction the fan's wallet already sent.
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

export const campaignTierInput = z.object({
  name: z.string().min(2).max(40),
  priceRupees: z.number().positive(),
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
  goalRupees: z.number().positive(),
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
  amountRupees: z.number().positive(),
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

export function rupeesToPaiseInt(rupees: number): number {
  return Math.round(rupees * 100);
}

export { PAY_PER_MINUTE };
