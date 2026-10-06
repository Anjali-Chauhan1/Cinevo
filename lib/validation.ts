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

export const voucherSchema = z.object({
  sessionToken: z.string().min(1),
  cumulativeAmountPaise: z.number().int().min(0),
});

export const depositSchema = z.object({ amountRupees: z.number().positive().max(10000) });
export const withdrawRequestSchema = z.object({ amountRupees: z.number().positive() });

export const tipSchema = z.object({
  creatorId: z.string().min(1),
  episodeId: z.string().optional(),
  amountRupees: z.number().min(10),
  message: z.string().max(120).optional(),
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

export function rupeesToPaiseInt(rupees: number): number {
  return Math.round(rupees * 100);
}

export { PAY_PER_MINUTE };
