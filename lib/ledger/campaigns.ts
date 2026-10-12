import { prisma } from "@/lib/db";
import {
  credit,
  debit,
  getOrCreateLedgerAccountId,
  getPlatformAccountId,
} from "@/lib/ledger/core";
import {
  PLATFORM_FEE_BPS,
  PRODUCER_UNITS,
  CampaignStatus,
  MilestoneStatus,
  BackingType,
  BackingStatus,
  LedgerTxType,
  KycStatus,
  NotificationType,
} from "@/lib/constants";
import { notify, notifyMany, campaignBackerIds } from "@/lib/notifications";
import { money } from "@/lib/format";

export class CampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignError";
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCampaign(
  creatorId: string,
  input: {
    filmTitle: string;
    pitch?: string;
    pitchVideoUrl?: string;
    goalCents: number;
    deadline: Date;
    deliveryDate: Date;
    producerUnitsEnabled: boolean;
    tiers: { name: string; priceCents: number; perks: string[]; backerLimit?: number }[];
    milestones: { label: string; percentOfGoal: number }[];
  }
) {
  if (input.goalCents <= 0) throw new CampaignError("Goal must be positive");
  if (input.deadline <= new Date()) throw new CampaignError("Deadline must be in the future");
  if (input.deliveryDate <= input.deadline) {
    throw new CampaignError("Delivery date must be after the fundraising deadline");
  }
  const percentSum = input.milestones.reduce((s, m) => s + m.percentOfGoal, 0);
  if (percentSum !== 100) {
    throw new CampaignError(`Milestone percentages must sum to 100 (got ${percentSum})`);
  }
  if (input.tiers.length === 0) throw new CampaignError("At least one perk tier is required");

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        creatorId,
        filmTitle: input.filmTitle,
        pitch: input.pitch,
        pitchVideoUrl: input.pitchVideoUrl,
        goalCents: input.goalCents,
        deadline: input.deadline,
        deliveryDate: input.deliveryDate,
        producerUnitsEnabled: input.producerUnitsEnabled,
        tiers: {
          create: input.tiers.map((t) => ({
            name: t.name,
            priceCents: t.priceCents,
            perks: JSON.stringify(t.perks),
            backerLimit: t.backerLimit,
          })),
        },
        milestones: {
          create: input.milestones.map((m, i) => ({
            order: i + 1,
            label: m.label,
            percentOfGoal: m.percentOfGoal,
          })),
        },
      },
      include: { tiers: true, milestones: true },
    });
    return campaign;
  });
}

// ---------------------------------------------------------------------------
// Backing (perk tiers + Producer Units)
// ---------------------------------------------------------------------------

export async function backCampaign(
  userId: string,
  campaignId: string,
  input:
    | { type: "PERK"; tierId: string; riskAcknowledged: boolean }
    | { type: "PRODUCER_UNIT"; amountCents: number; riskAcknowledged: boolean }
) {
  if (!input.riskAcknowledged) {
    throw new CampaignError("You must acknowledge the backing risk before continuing");
  }

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const creator = await tx.creator.findUniqueOrThrow({ where: { id: campaign.creatorId } });
    if (creator.userId === userId) throw new CampaignError("Creators can't back their own campaign");
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new CampaignError("This campaign is no longer accepting backers");
    }
    if (campaign.deadline <= new Date()) {
      throw new CampaignError("This campaign's deadline has passed");
    }

    let amountCents: number;
    let tierId: string | null = null;
    let unitsGranted = 0;

    if (input.type === "PERK") {
      const tier = await tx.campaignTier.findUniqueOrThrow({ where: { id: input.tierId } });
      if (tier.campaignId !== campaignId) throw new CampaignError("Tier does not belong to this campaign");
      if (tier.backerLimit !== null && tier.backedCount >= tier.backerLimit) {
        throw new CampaignError("This tier is sold out");
      }
      amountCents = tier.priceCents;
      tierId = tier.id;
      await tx.campaignTier.update({ where: { id: tier.id }, data: { backedCount: { increment: 1 } } });
    } else {
      // --- Producer Units: the regulated path, gated server-side ---
      if (!campaign.producerUnitsEnabled) {
        throw new CampaignError("Producer Units are not offered for this campaign");
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      // Region is read from the identity captured at signup, never from a
      // live IP lookup — a VPN can fake an IP but not a KYC'd identity.
      if (!PRODUCER_UNITS.PERMITTED_REGIONS.includes(user.region)) {
        throw new CampaignError("Producer Units are not available in your region");
      }
      if (user.kycStatus !== KycStatus.VERIFIED) {
        throw new CampaignError("Producer Units require KYC verification first");
      }
      if (input.amountCents <= 0) throw new CampaignError("Amount must be positive");
      if (input.amountCents % PRODUCER_UNITS.UNIT_PRICE_CENTS !== 0) {
        throw new CampaignError(
          `Producer Unit purchases must be in multiples of ${money(PRODUCER_UNITS.UNIT_PRICE_CENTS)}`
        );
      }

      const existingForUser = await tx.backing.aggregate({
        where: { campaignId, userId, type: BackingType.PRODUCER_UNIT, status: BackingStatus.ACTIVE },
        _sum: { amountCents: true },
      });
      const alreadyCommitted = existingForUser._sum.amountCents ?? 0;
      if (alreadyCommitted + input.amountCents > PRODUCER_UNITS.MAX_CENTS_PER_PERSON_PER_FILM) {
        throw new CampaignError(
          `Producer Units are capped at ${money(PRODUCER_UNITS.MAX_CENTS_PER_PERSON_PER_FILM)} per person per film`
        );
      }

      amountCents = input.amountCents;
      unitsGranted = amountCents / PRODUCER_UNITS.UNIT_PRICE_CENTS;
    }

    const payerAccountId = await getOrCreateLedgerAccountId(tx, userId);
    const platformAccountId = await getPlatformAccountId(tx);

    const backing = await tx.backing.create({
      data: {
        campaignId,
        userId,
        tierId,
        type: input.type,
        amountCents,
        unitsGranted,
        riskAcknowledged: true,
        riskAcknowledgedAt: new Date(),
      },
    });

    // Debit the backer, hold the funds in the platform's escrow pool — NOT
    // paid to the creator yet. This is the application-layer stand-in for
    // "money goes into the film's escrow, never directly to the creator."
    await debit(tx, payerAccountId, amountCents, LedgerTxType.BACKING_OUT, "CAMPAIGN", campaignId);
    await credit(tx, platformAccountId, amountCents, LedgerTxType.ESCROW_HOLD_IN, "CAMPAIGN", campaignId);

    const updatedCampaign = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        totalBackedCents: { increment: amountCents },
        ...(input.type === "PRODUCER_UNIT"
          ? { totalUnits: { increment: unitsGranted }, unitsRaisedCents: { increment: amountCents } }
          : {}),
      },
    });

    if (input.type === "PERK" && tierId) {
      await tx.backerPass.create({
        data: {
          backingId: backing.id,
          userId,
          campaignId,
          tierName: (await tx.campaignTier.findUniqueOrThrow({ where: { id: tierId } })).name,
        },
      });
    } else if (input.type === "PRODUCER_UNIT") {
      const existingHolding = await tx.producerUnitHolding.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
      });
      const lockUntil = new Date();
      lockUntil.setMonth(lockUntil.getMonth() + PRODUCER_UNITS.LOCK_UP_MONTHS);

      if (existingHolding) {
        await tx.producerUnitHolding.update({
          where: { id: existingHolding.id },
          data: { units: { increment: unitsGranted } },
        });
      } else {
        await tx.producerUnitHolding.create({
          data: {
            campaignId,
            userId,
            units: unitsGranted,
            // New holders start claiming from the CURRENT accRevenuePerUnit,
            // never from zero — they must never retroactively capture
            // revenue distributed before they bought in.
            lastClaimedAccRevenuePerUnitScaled: updatedCampaign.accRevenuePerUnitScaled,
            lockUntil,
          },
        });
      }
    }

    return backing;
  });
}

// ---------------------------------------------------------------------------
// Milestones: creator submits proof, admin approves, escrow releases.
// ---------------------------------------------------------------------------

export async function submitMilestoneProof(
  creatorId: string,
  milestoneId: string,
  proofUrl: string,
  proofNote?: string
) {
  const milestone = await prisma.milestone.findUniqueOrThrow({
    where: { id: milestoneId },
    include: { campaign: true },
  });
  if (milestone.campaign.creatorId !== creatorId) {
    throw new CampaignError("You don't own this campaign");
  }
  if (milestone.campaign.status !== CampaignStatus.FUNDED_PRODUCING) {
    throw new CampaignError("Milestones can only be submitted once the campaign is funded");
  }
  if (milestone.status !== MilestoneStatus.PENDING && milestone.status !== MilestoneStatus.REJECTED) {
    throw new CampaignError("This milestone has already been submitted or released");
  }
  // Enforce milestone order: can't submit stage 2 proof before stage 1 released.
  const prior = await prisma.milestone.findFirst({
    where: { campaignId: milestone.campaignId, order: { lt: milestone.order } },
  });
  if (prior && prior.status !== MilestoneStatus.RELEASED) {
    throw new CampaignError("Submit and release earlier milestones first");
  }

  return prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: MilestoneStatus.SUBMITTED, proofUrl, proofNote, submittedAt: new Date() },
  });
}

/**
 * Admin-approved milestone release (MVP control, per the design doc — a
 * backer vote is the documented roadmap replacement). Releases this
 * milestone's percentage of the FINAL totalBackedCents (frozen once the
 * campaign left ACTIVE), fee-adjusted 90/10 creator/platform, from the
 * escrow pool held in the platform account.
 */
export async function approveMilestone(adminUserId: string, milestoneId: string) {
  return prisma.$transaction(async (tx) => {
    const milestone = await tx.milestone.findUniqueOrThrow({
      where: { id: milestoneId },
      include: { campaign: true },
    });
    if (milestone.status !== MilestoneStatus.SUBMITTED) {
      throw new CampaignError("Only submitted milestones can be approved");
    }

    const grossRelease = Math.round(
      (milestone.campaign.totalBackedCents * milestone.percentOfGoal) / 100
    );
    const remainingEscrow = milestone.campaign.totalBackedCents - milestone.campaign.totalReleasedCents;
    const release = Math.min(grossRelease, remainingEscrow); // rounding-safety clamp

    const platformAccountId = await getPlatformAccountId(tx);
    const creator = await tx.creator.findUniqueOrThrow({ where: { id: milestone.campaign.creatorId } });
    const creatorAccountId = await getOrCreateLedgerAccountId(tx, creator.userId);

    const platformFee = Math.round((release * PLATFORM_FEE_BPS) / 10000);
    const creatorNet = release - platformFee;

    // Only the creator's net leaves the escrow pool; the fee portion was
    // already sitting in the platform account from ESCROW_HOLD_IN and simply
    // stays there (no extra entry needed — see transferWithFee for contrast,
    // this path starts from an escrow hold rather than a live payer balance).
    await debit(tx, platformAccountId, creatorNet, LedgerTxType.ESCROW_RELEASE_OUT, "MILESTONE", milestoneId);
    await credit(tx, creatorAccountId, creatorNet, LedgerTxType.MILESTONE_RELEASE_IN, "MILESTONE", milestoneId);

    await tx.campaign.update({
      where: { id: milestone.campaignId },
      data: { totalReleasedCents: { increment: release } },
    });

    const updatedMilestone = await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        status: MilestoneStatus.RELEASED,
        releasedAmountCents: release,
        reviewedAt: new Date(),
        reviewedBy: adminUserId,
      },
    });

    const allMilestones = await tx.milestone.findMany({ where: { campaignId: milestone.campaignId } });
    if (allMilestones.every((m) => m.id === milestoneId || m.status === MilestoneStatus.RELEASED)) {
      await tx.campaign.update({
        where: { id: milestone.campaignId },
        data: { status: CampaignStatus.DELIVERED },
      });
    }

    return updatedMilestone;
  });
}

export async function rejectMilestone(adminUserId: string, milestoneId: string, reason: string) {
  const milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
  if (milestone.status !== MilestoneStatus.SUBMITTED) {
    throw new CampaignError("Only submitted milestones can be rejected");
  }
  return prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: MilestoneStatus.REJECTED, proofNote: reason, reviewedAt: new Date(), reviewedBy: adminUserId },
  });
}

// ---------------------------------------------------------------------------
// Deadline sweep: ACTIVE -> FUNDED_PRODUCING | FAILED_REFUNDING, and the
// missed-delivery-date failsafe.
// ---------------------------------------------------------------------------

export async function sweepCampaignDeadlines() {
  const now = new Date();
  const touched: string[] = [];

  const expiredActive = await prisma.campaign.findMany({
    where: { status: CampaignStatus.ACTIVE, deadline: { lte: now } },
  });
  for (const c of expiredActive) {
    const met = c.totalBackedCents >= c.goalCents;
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status: met ? CampaignStatus.FUNDED_PRODUCING : CampaignStatus.FAILED_REFUNDING },
    });
    touched.push(c.id);
    await notifyCampaignOutcome(c.id, met ? "FUNDED" : "GOAL_MISSED");
  }

  const missedDelivery = await prisma.campaign.findMany({
    where: { status: CampaignStatus.FUNDED_PRODUCING, deliveryDate: { lte: now } },
  });
  for (const c of missedDelivery) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: CampaignStatus.FAILED_REFUNDING } });
    touched.push(c.id);
    await notifyCampaignOutcome(c.id, "DELIVERY_MISSED");
  }

  return touched;
}

/** Tells the creator and every backer how a campaign ended. Deduped per
 * campaign and outcome, because overlapping sweeps can both see the change. */
export async function notifyCampaignOutcome(campaignId: string, outcome: "FUNDED" | "GOAL_MISSED" | "DELIVERY_MISSED") {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { creator: true } });
  const link = `/back/${campaign.id}`;
  const funded = outcome === "FUNDED";
  const type = funded ? NotificationType.CAMPAIGN_FUNDED : NotificationType.CAMPAIGN_FAILED;

  await notify(campaign.creator.userId, {
    type,
    title: funded
      ? `${campaign.filmTitle} is funded!`
      : outcome === "GOAL_MISSED"
        ? `${campaign.filmTitle} didn't reach its goal`
        : `${campaign.filmTitle} missed its delivery date`,
    body: funded ? "Submit proof for your first milestone to start receiving funds." : "Backers can now claim refunds.",
    link,
    dedupeKey: `campaign:${campaign.id}:${outcome}:creator`,
  });
  await notifyMany(await campaignBackerIds(campaign.id), (userId) => ({
    type,
    title: funded ? `${campaign.filmTitle} is funded` : `Refund available for ${campaign.filmTitle}`,
    body: funded
      ? "The film you backed hit its goal. You'll hear as each milestone completes."
      : "The campaign didn't succeed. Claim your refund on the campaign page.",
    link,
    dedupeKey: `campaign:${campaign.id}:${outcome}:${userId}`,
  }));
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/**
 * Refunds one backer's proportional share of whatever escrow is still
 * UNRELEASED. Money already paid out to the creator via an approved
 * milestone can't be clawed back, so every active backer gets the same
 * fraction refunded: (totalBacked - totalReleased) / totalBacked. This is
 * the practical, can't-go-negative reading of "every backer can claim a
 * full refund" once some production funding has already been spent.
 */
export async function claimRefund(userId: string, campaignId: string) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (campaign.status !== CampaignStatus.FAILED_REFUNDING) {
      throw new CampaignError("This campaign is not in a refundable state");
    }

    const backing = await tx.backing.findFirst({
      where: { campaignId, userId, status: BackingStatus.ACTIVE },
    });
    if (!backing) throw new CampaignError("You have no active backing to refund on this campaign");

    const unreleasedFraction =
      campaign.totalBackedCents > 0
        ? (campaign.totalBackedCents - campaign.totalReleasedCents) / campaign.totalBackedCents
        : 0;
    const refundAmount = Math.round(backing.amountCents * unreleasedFraction);

    const platformAccountId = await getPlatformAccountId(tx);
    const backerAccountId = await getOrCreateLedgerAccountId(tx, userId);

    if (refundAmount > 0) {
      await debit(tx, platformAccountId, refundAmount, LedgerTxType.ESCROW_REFUND_OUT, "CAMPAIGN", campaignId);
      await credit(tx, backerAccountId, refundAmount, LedgerTxType.BACKING_REFUND_IN, "CAMPAIGN", campaignId);
    }

    await tx.backing.update({
      where: { id: backing.id },
      data: { status: BackingStatus.REFUNDED, refundedAt: new Date() },
    });

    const pass = await tx.backerPass.findUnique({ where: { backingId: backing.id } });
    if (pass) await tx.backerPass.update({ where: { id: pass.id }, data: { revoked: true } });

    if (backing.type === BackingType.PRODUCER_UNIT) {
      const holding = await tx.producerUnitHolding.findUnique({
        where: { campaignId_userId: { campaignId, userId } },
      });
      if (holding) {
        await tx.campaign.update({
          where: { id: campaignId },
          data: { totalUnits: { decrement: holding.units } },
        });
        await tx.producerUnitHolding.delete({ where: { id: holding.id } });
      }
    }

    const remainingActive = await tx.backing.count({
      where: { campaignId, status: BackingStatus.ACTIVE },
    });
    if (remainingActive === 0) {
      await tx.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.REFUNDED } });
    }

    return { refundAmount };
  });
}

// ---------------------------------------------------------------------------
// Revenue waterfall — routes a chunk of PAY-PER-MINUTE viewer revenue through
// the Producer Unit split instead of the plain 90/10 creator/platform cut.
// Called from lib/ledger/vault.ts settleSession() when the episode being
// paid for is the film a Producer-Unit-bearing campaign funded.
// ---------------------------------------------------------------------------

export async function distributeFilmRevenue(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  campaignId: string,
  grossAmountCents: number,
  creatorAccountId: string,
  refType: string,
  refId: string
) {
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const platformAccountId = await getPlatformAccountId(tx);

  if (campaign.totalUnits <= 0) {
    // No units outstanding (e.g. all refunded) — fall back to the plain split.
    const fee = Math.round((grossAmountCents * PLATFORM_FEE_BPS) / 10000);
    const net = grossAmountCents - fee;
    await credit(tx, creatorAccountId, net, LedgerTxType.VOUCHER_SETTLE, refType, refId);
    await credit(tx, platformAccountId, fee, LedgerTxType.PLATFORM_FEE_IN, refType, refId);
    return { creatorCents: net, platformCents: fee, unitsCents: 0 };
  }

  const recoupThreshold = Math.round(
    (campaign.unitsRaisedCents * PRODUCER_UNITS.RECOUP_MULTIPLIER_BPS) / 10000
  );
  const alreadyToUnits = campaign.revenueToUnitsCents;

  const splitAt = (amount: number, unitsBps: number, creatorBps: number, platformBps: number) => {
    const unitsCents = Math.round((amount * unitsBps) / 10000);
    const platformCents = Math.round((amount * platformBps) / 10000);
    const creatorCents = amount - unitsCents - platformCents; // dust -> creator
    return { unitsCents, creatorCents, platformCents };
  };

  let stage1Amount = 0;
  let stage2Amount = grossAmountCents;

  if (alreadyToUnits < recoupThreshold) {
    // How much gross revenue keeps the units' 50% share within the
    // remaining room under the recoupment threshold?
    const roomUnderThreshold = recoupThreshold - alreadyToUnits;
    const stage1Capacity = Math.floor(
      (roomUnderThreshold * 10000) / PRODUCER_UNITS.STAGE1_UNITS_BPS
    );
    stage1Amount = Math.min(grossAmountCents, stage1Capacity);
    stage2Amount = grossAmountCents - stage1Amount;
  }

  const s1 = splitAt(
    stage1Amount,
    PRODUCER_UNITS.STAGE1_UNITS_BPS,
    PRODUCER_UNITS.STAGE1_CREATOR_BPS,
    PRODUCER_UNITS.STAGE1_PLATFORM_BPS
  );
  const s2 = splitAt(
    stage2Amount,
    PRODUCER_UNITS.STAGE2_UNITS_BPS,
    PRODUCER_UNITS.STAGE2_CREATOR_BPS,
    PRODUCER_UNITS.STAGE2_PLATFORM_BPS
  );

  const unitsCents = s1.unitsCents + s2.unitsCents;
  const creatorCents = s1.creatorCents + s2.creatorCents;
  const platformCents = s1.platformCents + s2.platformCents;

  await credit(tx, creatorAccountId, creatorCents, LedgerTxType.VOUCHER_SETTLE, refType, refId);
  await credit(tx, platformAccountId, platformCents, LedgerTxType.PLATFORM_FEE_IN, refType, refId);

  if (unitsCents > 0) {
    await credit(tx, platformAccountId, unitsCents, LedgerTxType.REVENUE_POOL_HOLD, "CAMPAIGN", campaignId);
    const accDelta = Math.floor((unitsCents * 1_000_000) / campaign.totalUnits);
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        revenueToUnitsCents: { increment: unitsCents },
        accRevenuePerUnitScaled: { increment: BigInt(accDelta) },
      },
    });
    await tx.revenueDistribution.create({
      data: {
        campaignId,
        amountCents: unitsCents,
        accRevenuePerUnitScaledAfter: updated.accRevenuePerUnitScaled,
      },
    });
  }

  return { creatorCents, platformCents, unitsCents };
}

export async function claimRevenue(userId: string, campaignId: string) {
  return prisma.$transaction(async (tx) => {
    const holding = await tx.producerUnitHolding.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });
    if (!holding) throw new CampaignError("You don't hold Producer Units in this campaign");

    const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const deltaScaled = campaign.accRevenuePerUnitScaled - holding.lastClaimedAccRevenuePerUnitScaled;
    const claimable = Number((BigInt(holding.units) * deltaScaled) / 1_000_000n);

    if (claimable <= 0) throw new CampaignError("Nothing to claim yet");

    const platformAccountId = await getPlatformAccountId(tx);
    const holderAccountId = await getOrCreateLedgerAccountId(tx, userId);

    await debit(tx, platformAccountId, claimable, LedgerTxType.REVENUE_POOL_RELEASE, "CAMPAIGN", campaignId);
    await credit(tx, holderAccountId, claimable, LedgerTxType.REVENUE_CLAIM_IN, "CAMPAIGN", campaignId);

    await tx.producerUnitHolding.update({
      where: { id: holding.id },
      data: { lastClaimedAccRevenuePerUnitScaled: campaign.accRevenuePerUnitScaled },
    });

    return { claimedCents: claimable };
  });
}

export async function linkCampaignToEpisode(creatorId: string, campaignId: string, episodeId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== creatorId) throw new CampaignError("You don't own this campaign");
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  if (episode.creatorId !== creatorId) throw new CampaignError("You don't own this episode");
  const failedStatuses: string[] = [CampaignStatus.FAILED_REFUNDING, CampaignStatus.REFUNDED, CampaignStatus.CANCELLED];
  if (failedStatuses.includes(campaign.status)) {
    throw new CampaignError("This campaign didn't succeed, so it can't share in the film's revenue");
  }
  const alreadyLinked = await prisma.campaign.findUnique({ where: { fundedEpisodeId: episodeId } });
  if (alreadyLinked && alreadyLinked.id !== campaignId) {
    throw new CampaignError(`This episode already shares revenue with "${alreadyLinked.filmTitle}"`);
  }

  return prisma.campaign.update({ where: { id: campaignId }, data: { fundedEpisodeId: episodeId } });
}

/** Stops routing an episode's revenue through a campaign's waterfall. */
export async function unlinkCampaignFromEpisode(creatorId: string, campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== creatorId) throw new CampaignError("You don't own this campaign");
  return prisma.campaign.update({ where: { id: campaignId }, data: { fundedEpisodeId: null } });
}
