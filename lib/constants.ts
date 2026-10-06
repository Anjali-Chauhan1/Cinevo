// Single source of truth for every "enum-like" string stored in SQLite
// (Prisma's sqlite connector has no native enum type) and for the business
// constants the design doc pins down (rate bands, caps, fee splits, etc).
// Anything that looks like a magic number elsewhere in the codebase should
// trace back to here.

export const PLATFORM_FEE_BPS = 1000; // 10% platform fee, basis points (10000 = 100%)
export const CREATOR_SHARE_BPS = 9000; // 90% to creator on tips/subs/perk-only revenue

export const PAY_PER_MINUTE = {
  MIN_RATE_PAISE: 10, // ₹0.10/min
  MAX_RATE_PAISE: 200, // ₹2.00/min
  DEFAULT_PREVIEW_SECONDS: 120,
  VOUCHER_INTERVAL_SECONDS: 10,
  // If no fresh voucher arrives within this window, the server treats the
  // session as abandoned (crashed tab, lost connection) and auto-settles the
  // last voucher on file instead of waiting indefinitely.
  AUTO_SETTLE_TIMEOUT_SECONDS: 60,
  SEGMENT_URL_TTL_SECONDS: 30,
} as const;

export const WALLET = {
  WITHDRAW_DELAY_MINUTES: 10,
} as const;

export const PRODUCER_UNITS = {
  MAX_PAISE_PER_PERSON_PER_FILM: 500_000, // ₹5,000
  LOCK_UP_MONTHS: 12,
  UNIT_PRICE_PAISE: 10_000, // ₹100 per unit (demo convention)
  // Stage 1 split (until unit holders recoup principal + 20%)
  RECOUP_MULTIPLIER_BPS: 12000, // 120% of amount raised
  STAGE1_UNITS_BPS: 5000, // 50%
  STAGE1_CREATOR_BPS: 4000, // 40%
  STAGE1_PLATFORM_BPS: 1000, // 10%
  STAGE2_UNITS_BPS: 2000, // 20%
  STAGE2_CREATOR_BPS: 7000, // 70%
  STAGE2_PLATFORM_BPS: 1000, // 10%
  // Regions allowed to see/hold Producer Units at all. Everyone else only
  // ever sees perk tiers — enforced server-side, never just hidden in UI.
  PERMITTED_REGIONS: ["US"] as string[],
} as const;

export const POPULARITY_WEIGHTS = {
  WATCH_MINUTES: 0.3,
  COMPLETION_RATE: 0.2,
  VERIFIED_RATING: 0.2,
  UNIQUE_SUPPORTERS: 0.2,
  REACTIONS_CHAT: 0.1,
} as const;

export const REVIEW = {
  MIN_WATCH_FRACTION: 0.5,
  SHORT_FILM_THRESHOLD_SECONDS: 600, // under 10 min must watch 100%
} as const;

export const CHAT = {
  DEFAULT_RATE_LIMIT_PER_10S: 5,
  TIP_MESSAGE_MAX_LEN: 120,
} as const;

// ---------------------------------------------------------------------------
// Enum-like string unions (mirrors Prisma schema comments)
// ---------------------------------------------------------------------------

export const PlatformRole = { VIEWER: "VIEWER", ADMIN: "ADMIN" } as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const Region = { IN: "IN", US: "US", OTHER: "OTHER" } as const;
export type Region = (typeof Region)[keyof typeof Region];

export const KycStatus = {
  NONE: "NONE",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;

export const VerificationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export const EpisodeStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  PREMIERING: "PREMIERING",
  EARLY_ACCESS: "EARLY_ACCESS",
  PUBLIC: "PUBLIC",
} as const;
export type EpisodeStatus = (typeof EpisodeStatus)[keyof typeof EpisodeStatus];

export const FreeReason = {
  NONE: "NONE",
  SUBSCRIBER: "SUBSCRIBER",
  BACKER_PASS: "BACKER_PASS",
  FREE_EPISODE: "FREE_EPISODE",
  ALREADY_PAID: "ALREADY_PAID",
} as const;

export const WatchSessionStatus = {
  ACTIVE: "ACTIVE",
  SETTLED: "SETTLED",
  EXPIRED: "EXPIRED",
} as const;

export const CampaignStatus = {
  ACTIVE: "ACTIVE",
  FUNDED_PRODUCING: "FUNDED_PRODUCING",
  DELIVERED: "DELIVERED",
  FAILED_REFUNDING: "FAILED_REFUNDING",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;

export const MilestoneStatus = {
  PENDING: "PENDING",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  RELEASED: "RELEASED",
  REJECTED: "REJECTED",
} as const;

export const BackingType = { PERK: "PERK", PRODUCER_UNIT: "PRODUCER_UNIT" } as const;
export const BackingStatus = { ACTIVE: "ACTIVE", REFUNDED: "REFUNDED" } as const;

export const PremiereStatus = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  ENDED: "ENDED",
} as const;

export const ChatMessageType = {
  MESSAGE: "MESSAGE",
  TIP_HIGHLIGHT: "TIP_HIGHLIGHT",
  SYSTEM: "SYSTEM",
  POLL: "POLL",
} as const;

export const ChatActionType = {
  DELETE: "DELETE",
  TIMEOUT: "TIMEOUT",
  BAN: "BAN",
  SLOW_MODE_ON: "SLOW_MODE_ON",
  SLOW_MODE_OFF: "SLOW_MODE_OFF",
} as const;

export const ReviewerBadge = {
  VIEWER: "VIEWER",
  SUBSCRIBER: "SUBSCRIBER",
  BACKER: "BACKER",
} as const;

export const PopularityLevel = {
  NONE: "NONE",
  RISING: "RISING",
  HOT: "HOT",
  TRENDING: "TRENDING",
  FAN_FAVOURITE: "FAN_FAVOURITE",
} as const;

export const ReportStatus = {
  OPEN: "OPEN",
  REVIEWED: "REVIEWED",
  ACTIONED: "ACTIONED",
  DISMISSED: "DISMISSED",
} as const;

export const LedgerTxType = {
  DEPOSIT: "DEPOSIT",
  VOUCHER_SETTLE: "VOUCHER_SETTLE",
  TIP_OUT: "TIP_OUT",
  TIP_IN: "TIP_IN",
  SUB_STREAM_OUT: "SUB_STREAM_OUT",
  SUB_STREAM_IN: "SUB_STREAM_IN",
  BACKING_OUT: "BACKING_OUT",
  BACKING_REFUND_IN: "BACKING_REFUND_IN",
  ESCROW_HOLD_IN: "ESCROW_HOLD_IN",
  ESCROW_RELEASE_OUT: "ESCROW_RELEASE_OUT",
  ESCROW_REFUND_OUT: "ESCROW_REFUND_OUT",
  MILESTONE_RELEASE_IN: "MILESTONE_RELEASE_IN",
  REVENUE_POOL_HOLD: "REVENUE_POOL_HOLD",
  REVENUE_POOL_RELEASE: "REVENUE_POOL_RELEASE",
  REVENUE_CLAIM_IN: "REVENUE_CLAIM_IN",
  PLATFORM_FEE_IN: "PLATFORM_FEE_IN",
  WITHDRAW_REQUEST: "WITHDRAW_REQUEST",
  WITHDRAW_COMPLETE: "WITHDRAW_COMPLETE",
  WITHDRAW_CANCEL: "WITHDRAW_CANCEL",
  GRANT: "GRANT",
} as const;

/** A single platform "operator" ledger account that collects the 10% fee. */
export const PLATFORM_LEDGER_EMAIL = "platform@cinevo.internal";

export function paiseToRupeeLabel(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const decimals = (abs % 100).toString().padStart(2, "0");
  return `${sign}₹${rupees.toLocaleString("en-IN")}.${decimals}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
