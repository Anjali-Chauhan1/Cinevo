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
} from "@/lib/constants";

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
    goalPaise: number;
    deadline: Date;
    deliveryDate: Date;
    producerUnitsEnabled: boolean;
    tiers: { name: string; pricePaise: number; perks: string[]; backerLimit?: number }[];
    milestones: { label: string; percentOfGoal: number }[];
  }
) {
  if (input.goalPaise <= 0) throw new CampaignError("Goal must be positive");
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
        goalPaise: input.goalPaise,
        deadline: input.deadline,
        deliveryDate: input.deliveryDate,
        producerUnitsEnabled: input.producerUnitsEnabled,
        tiers: {
          create: input.tiers.map((t) => ({
            name: t.name,
            pricePaise: t.pricePaise,
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
    | { type: "PRODUCER_UNIT"; amountPaise: number; riskAcknowledged: boolean }
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

    let amountPaise: number;
    let tierId: string | null = null;
    let unitsGranted = 0;

    if (input.type === "PERK") {
      const tier = await tx.campaignTier.findUniqueOrThrow({ where: { id: input.tierId } });
      if (tier.campaignId !== campaignId) throw new CampaignError("Tier does not belong to this campaign");
      if (tier.backerLimit !== null && tier.backedCount >= tier.backerLimit) {
        throw new CampaignError("This tier is sold out");
      }
      amountPaise = tier.pricePaise;
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
      if (input.amountPaise <= 0) throw new CampaignError("Amount must be positive");
      if (input.amountPaise % PRODUCER_UNITS.UNIT_PRICE_PAISE !== 0) {
        throw new CampaignError(
          `Producer Unit purchases must be in multiples of ${PRODUCER_UNITS.UNIT_PRICE_PAISE / 100} rupees`
        );
      }

      const existingForUser = await tx.backing.aggregate({
        where: { campaignId, userId, type: BackingType.PRODUCER_UNIT, status: BackingStatus.ACTIVE },
        _sum: { amountPaise: true },
      });
      const alreadyCommitted = existingForUser._sum.amountPaise ?? 0;
      if (alreadyCommitted + input.amountPaise > PRODUCER_UNITS.MAX_PAISE_PER_PERSON_PER_FILM) {
        throw new CampaignError(
          `Producer Units are capped at ${PRODUCER_UNITS.MAX_PAISE_PER_PERSON_PER_FILM / 100} rupees per person per film`
        );
      }

      amountPaise = input.amountPaise;
      unitsGranted = amountPaise / PRODUCER_UNITS.UNIT_PRICE_PAISE;
    }

    const payerAccountId = await getOrCreateLedgerAccountId(tx, userId);
    const platformAccountId = await getPlatformAccountId(tx);

    const backing = await tx.backing.create({
      data: {
        campaignId,
        userId,
        tierId,
        type: input.type,
        amountPaise,
        unitsGranted,
        riskAcknowledged: true,
        riskAcknowledgedAt: new Date(),
      },
    });

    // Debit the backer, hold the funds in the platform's escrow pool — NOT
    // paid to the creator yet. This is the application-layer stand-in for
    // "money goes into the film's escrow, never directly to the creator."
    await debit(tx, payerAccountId, amountPaise, LedgerTxType.BACKING_OUT, "CAMPAIGN", campaignId);
    await credit(tx, platformAccountId, amountPaise, LedgerTxType.ESCROW_HOLD_IN, "CAMPAIGN", campaignId);

    const updatedCampaign = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        totalBackedPaise: { increment: amountPaise },
        ...(input.type === "PRODUCER_UNIT"
          ? { totalUnits: { increment: unitsGranted }, unitsRaisedPaise: { increment: amountPaise } }
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
 * milestone's percentage of the FINAL totalBackedPaise (frozen once the
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
      (milestone.campaign.totalBackedPaise * milestone.percentOfGoal) / 100
    );
    const remainingEscrow = milestone.campaign.totalBackedPaise - milestone.campaign.totalReleasedPaise;
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
      data: { totalReleasedPaise: { increment: release } },
    });

    const updatedMilestone = await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        status: MilestoneStatus.RELEASED,
        releasedAmountPaise: release,
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
    const met = c.totalBackedPaise >= c.goalPaise;
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status: met ? CampaignStatus.FUNDED_PRODUCING : CampaignStatus.FAILED_REFUNDING },
    });
    touched.push(c.id);
  }

  const missedDelivery = await prisma.campaign.findMany({
    where: { status: CampaignStatus.FUNDED_PRODUCING, deliveryDate: { lte: now } },
  });
  for (const c of missedDelivery) {
    await prisma.campaign.update({ where: { id: c.id }, data: { status: CampaignStatus.FAILED_REFUNDING } });
    touched.push(c.id);
  }

  return touched;
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
      campaign.totalBackedPaise > 0
        ? (campaign.totalBackedPaise - campaign.totalReleasedPaise) / campaign.totalBackedPaise
        : 0;
    const refundAmount = Math.round(backing.amountPaise * unreleasedFraction);

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
  grossAmountPaise: number,
  creatorAccountId: string,
  refType: string,
  refId: string
) {
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const platformAccountId = await getPlatformAccountId(tx);

  if (campaign.totalUnits <= 0) {
    // No units outstanding (e.g. all refunded) — fall back to the plain split.
    const fee = Math.round((grossAmountPaise * PLATFORM_FEE_BPS) / 10000);
    const net = grossAmountPaise - fee;
    await credit(tx, creatorAccountId, net, LedgerTxType.VOUCHER_SETTLE, refType, refId);
    await credit(tx, platformAccountId, fee, LedgerTxType.PLATFORM_FEE_IN, refType, refId);
    return { creatorPaise: net, platformPaise: fee, unitsPaise: 0 };
  }

  const recoupThreshold = Math.round(
    (campaign.unitsRaisedPaise * PRODUCER_UNITS.RECOUP_MULTIPLIER_BPS) / 10000
  );
  const alreadyToUnits = campaign.revenueToUnitsPaise;

  const splitAt = (amount: number, unitsBps: number, creatorBps: number, platformBps: number) => {
    const unitsPaise = Math.round((amount * unitsBps) / 10000);
    const platformPaise = Math.round((amount * platformBps) / 10000);
    const creatorPaise = amount - unitsPaise - platformPaise; // dust -> creator
    return { unitsPaise, creatorPaise, platformPaise };
  };

  let stage1Amount = 0;
  let stage2Amount = grossAmountPaise;

  if (alreadyToUnits < recoupThreshold) {
    // How much gross revenue keeps the units' 50% share within the
    // remaining room under the recoupment threshold?
    const roomUnderThreshold = recoupThreshold - alreadyToUnits;
    const stage1Capacity = Math.floor(
      (roomUnderThreshold * 10000) / PRODUCER_UNITS.STAGE1_UNITS_BPS
    );
    stage1Amount = Math.min(grossAmountPaise, stage1Capacity);
    stage2Amount = grossAmountPaise - stage1Amount;
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

  const unitsPaise = s1.unitsPaise + s2.unitsPaise;
  const creatorPaise = s1.creatorPaise + s2.creatorPaise;
  const platformPaise = s1.platformPaise + s2.platformPaise;

  await credit(tx, creatorAccountId, creatorPaise, LedgerTxType.VOUCHER_SETTLE, refType, refId);
  await credit(tx, platformAccountId, platformPaise, LedgerTxType.PLATFORM_FEE_IN, refType, refId);

  if (unitsPaise > 0) {
    await credit(tx, platformAccountId, unitsPaise, LedgerTxType.REVENUE_POOL_HOLD, "CAMPAIGN", campaignId);
    const accDelta = Math.floor((unitsPaise * 1_000_000) / campaign.totalUnits);
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        revenueToUnitsPaise: { increment: unitsPaise },
        accRevenuePerUnitScaled: { increment: BigInt(accDelta) },
      },
    });
    await tx.revenueDistribution.create({
      data: {
        campaignId,
        amountPaise: unitsPaise,
        accRevenuePerUnitScaledAfter: updated.accRevenuePerUnitScaled,
      },
    });
  }

  return { creatorPaise, platformPaise, unitsPaise };
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

    return { claimedPaise: claimable };
  });
}

export async function linkCampaignToEpisode(creatorId: string, campaignId: string, episodeId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.creatorId !== creatorId) throw new CampaignError("You don't own this campaign");
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  if (episode.creatorId !== creatorId) throw new CampaignError("You don't own this episode");

  return prisma.campaign.update({ where: { id: campaignId }, data: { fundedEpisodeId: episodeId } });
}
