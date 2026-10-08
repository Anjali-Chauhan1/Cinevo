import type { Address, Hex } from "viem";
import { prisma } from "@/lib/db";
import { BackingStatus, BackingType, LedgerTxType, PRODUCER_UNITS } from "@/lib/constants";
import { getAddresses, toChainId, unitsToPaise } from "@/lib/chain/config";
import { ChainError, eventsFrom, waitForUserTx } from "@/lib/chain/server";
import { mirror } from "@/lib/chain/mirror";
import { CHAIN_TIER_ORDER, mirrorSubscriptionCharges } from "@/lib/chain/operator";
import { filmCampaignAbi, subscriptionsAbi, tipsAbi, vaultAbi } from "@/lib/chain/abis";

/**
 * Confirming transactions the USER's wallet sent (subscribe, tip, back,
 * refund, withdraw...). The browser sends the transaction, then posts its
 * hash here; we wait for the receipt, check the expected event was emitted
 * by our contract FOR THIS USER'S WALLET, and only then record it. A hash can
 * only ever be recorded once.
 */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function userWallet(userId: string): Promise<Address> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.walletAddress) throw new ChainError("Your account has no wallet yet");
  return user.walletAddress as Address;
}

// ---------------------------------------------------------------------------
// Tips
// ---------------------------------------------------------------------------

/** Returns the tip and whether this call recorded it (false = a replay). */
export async function confirmTip(userId: string, txHash: Hex, opts: { creatorId: string; episodeId?: string; message?: string }) {
  const existing = await prisma.tip.findUnique({ where: { txHash } });
  if (existing) {
    // A replayed hash only ever returns the caller's own tip.
    if (existing.fanId !== userId) throw new ChainError("That transaction isn't a tip from you to this creator");
    return { tip: existing, created: false };
  }

  const [fanWallet, creator] = await Promise.all([
    userWallet(userId),
    prisma.creator.findUniqueOrThrow({ where: { id: opts.creatorId }, include: { user: true } }),
  ]);
  const { tips } = getAddresses();
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, tipsAbi, tips).find((e) => e.eventName === "Tipped");
  const args = event?.args as { fan: Address; creator: Address; amount: bigint; toCreator: bigint } | undefined;
  if (!args || !same(args.fan, fanWallet) || !same(args.creator, creator.user.walletAddress ?? "")) {
    throw new ChainError("That transaction isn't a tip from you to this creator");
  }

  const amountPaise = unitsToPaise(args.amount);
  const tip = await prisma.tip.create({
    data: {
      fanId: userId,
      creatorId: creator.id,
      episodeId: opts.episodeId ?? null,
      amountPaise,
      message: opts.message?.slice(0, 120) ?? null,
      txHash,
    },
  });
  await mirror({ userId, type: LedgerTxType.TIP_OUT, amountPaise: -amountPaise, txHash, refType: "TIP", refId: tip.id });
  await mirror({ userId: creator.userId, type: LedgerTxType.TIP_IN, amountPaise: unitsToPaise(args.toCreator), txHash, refType: "TIP", refId: tip.id });
  return { tip, created: true };
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

export async function confirmSubscribe(userId: string, creatorId: string, txHash: Hex) {
  const [fanWallet, creator] = await Promise.all([
    userWallet(userId),
    prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: true } }),
  ]);
  const { subscriptions } = getAddresses();
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, subscriptionsAbi, subscriptions).find((e) => e.eventName === "Subscribed");
  const args = event?.args as { fan: Address; creator: Address } | undefined;
  if (!args || !same(args.fan, fanWallet) || !same(args.creator, creator.user.walletAddress ?? "")) {
    throw new ChainError("That transaction isn't your subscription to this creator");
  }
  const now = new Date();
  // Same per-second rate the demo ledger stores (paise per second, ×1e6).
  const ratePerSecondPaiseScaled = Math.round((creator.subPriceRupeesPaise * 1_000_000) / (30 * 24 * 3600));
  return prisma.subscription.upsert({
    where: { fanId_creatorId: { fanId: userId, creatorId } },
    create: { fanId: userId, creatorId, ratePerSecondPaiseScaled, active: true, startedAt: now, lastAccruedAt: now, txHash },
    update: { active: true, cancelledAt: null, pausedForLowBalance: false, startedAt: now, lastAccruedAt: now, txHash },
  });
}

export async function confirmCancel(userId: string, creatorId: string, txHash: Hex) {
  const [fanWallet, creator, sub] = await Promise.all([
    userWallet(userId),
    prisma.creator.findUniqueOrThrow({ where: { id: creatorId }, include: { user: true } }),
    prisma.subscription.findUniqueOrThrow({ where: { fanId_creatorId: { fanId: userId, creatorId } } }),
  ]);
  const { subscriptions } = getAddresses();
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, subscriptionsAbi, subscriptions).find((e) => e.eventName === "Cancelled");
  const args = event?.args as { fan: Address; creator: Address } | undefined;
  if (!args || !same(args.fan, fanWallet) || !same(args.creator, creator.user.walletAddress ?? "")) {
    throw new ChainError("That transaction isn't your cancellation for this creator");
  }
  await mirrorSubscriptionCharges(txHash, receipt.logs, sub.id);
  return prisma.subscription.update({ where: { id: sub.id }, data: { active: false, cancelledAt: new Date(), txHash } });
}

// ---------------------------------------------------------------------------
// Backing a film (from the vault balance)
// ---------------------------------------------------------------------------

export async function confirmBacking(userId: string, campaignId: string, txHash: Hex) {
  const existing = await prisma.backing.findUnique({ where: { txHash } });
  if (existing) {
    if (existing.userId !== userId) throw new ChainError("That transaction isn't your backing of this film");
    return existing;
  }

  const [backerWallet, campaign] = await Promise.all([
    userWallet(userId),
    prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, include: { tiers: { orderBy: CHAIN_TIER_ORDER } } }),
  ]);
  if (!campaign.contractAddress) throw new ChainError("This campaign isn't onchain");
  const receipt = await waitForUserTx(txHash);
  const events = eventsFrom(receipt, filmCampaignAbi, campaign.contractAddress as Address);
  const backed = events.find((e) => e.eventName === "Backed")?.args as
    | { backer: Address; tier: number; amount: bigint }
    | undefined;
  const units = events.find((e) => e.eventName === "UnitsPurchased")?.args as
    | { backer: Address; units: bigint; cost: bigint }
    | undefined;
  const found = backed ?? units;
  if (!found || !same(found.backer, backerWallet)) throw new ChainError("That transaction isn't your backing of this film");

  const amountPaise = unitsToPaise(backed ? backed.amount : units!.cost);
  const tier = backed ? campaign.tiers[Number(backed.tier)] : null;
  const unitsGranted = units ? Number(units.units) : 0;

  const backing = await prisma.$transaction(async (tx) => {
    const created = await tx.backing.create({
      data: {
        campaignId,
        userId,
        tierId: tier?.id ?? null,
        type: backed ? BackingType.PERK : BackingType.PRODUCER_UNIT,
        amountPaise,
        unitsGranted,
        riskAcknowledged: true,
        riskAcknowledgedAt: new Date(),
        txHash,
      },
    });
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        totalBackedPaise: { increment: amountPaise },
        ...(units ? { totalUnits: { increment: unitsGranted }, unitsRaisedPaise: { increment: amountPaise } } : {}),
      },
    });
    if (tier) {
      await tx.campaignTier.update({ where: { id: tier.id }, data: { backedCount: { increment: 1 } } });
      await tx.backerPass.create({ data: { backingId: created.id, userId, campaignId, tierName: tier.name } });
    } else {
      const lockUntil = new Date();
      lockUntil.setMonth(lockUntil.getMonth() + PRODUCER_UNITS.LOCK_UP_MONTHS);
      await tx.producerUnitHolding.upsert({
        where: { campaignId_userId: { campaignId, userId } },
        create: { campaignId, userId, units: unitsGranted, lockUntil, lastClaimedAccRevenuePerUnitScaled: campaign.accRevenuePerUnitScaled },
        update: { units: { increment: unitsGranted } },
      });
    }
    return created;
  });
  await mirror({ userId, type: LedgerTxType.BACKING_OUT, amountPaise: -amountPaise, txHash, refType: "CAMPAIGN", refId: campaignId });
  return backing;
}

export async function confirmRefund(userId: string, campaignId: string, txHash: Hex) {
  const [backerWallet, campaign] = await Promise.all([userWallet(userId), prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })]);
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, filmCampaignAbi, campaign.contractAddress as Address).find((e) => e.eventName === "Refunded");
  const args = event?.args as { backer: Address; amount: bigint } | undefined;
  if (!args || !same(args.backer, backerWallet)) throw new ChainError("That transaction isn't your refund from this film");

  const amountPaise = unitsToPaise(args.amount);
  await prisma.$transaction(async (tx) => {
    const backings = await tx.backing.findMany({ where: { campaignId, userId, status: BackingStatus.ACTIVE } });
    await tx.backing.updateMany({
      where: { id: { in: backings.map((b) => b.id) } },
      data: { status: BackingStatus.REFUNDED, refundedAt: new Date() },
    });
    await tx.backerPass.updateMany({ where: { campaignId, userId }, data: { revoked: true } });
    await tx.producerUnitHolding.deleteMany({ where: { campaignId, userId } });
  });
  await mirror({ userId, type: LedgerTxType.BACKING_REFUND_IN, amountPaise, txHash, refType: "CAMPAIGN", refId: campaignId });
  return { refundedPaise: amountPaise };
}

export async function confirmRevenueClaim(userId: string, campaignId: string, txHash: Hex) {
  const [holderWallet, campaign] = await Promise.all([userWallet(userId), prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })]);
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, filmCampaignAbi, campaign.contractAddress as Address).find((e) => e.eventName === "RevenueClaimed");
  const args = event?.args as { holder: Address; amount: bigint } | undefined;
  if (!args || !same(args.holder, holderWallet)) throw new ChainError("That transaction isn't your revenue claim");
  const claimedPaise = unitsToPaise(args.amount);
  await mirror({ userId, type: LedgerTxType.REVENUE_CLAIM_IN, amountPaise: claimedPaise, txHash, refType: "CAMPAIGN", refId: campaignId });
  return { claimedPaise };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export async function confirmWithdrawEvent(userId: string, txHash: Hex, kind: "WithdrawRequested" | "Withdrawn" | "WithdrawCancelled") {
  const walletAddress = await userWallet(userId);
  const { vault } = getAddresses();
  const receipt = await waitForUserTx(txHash);
  const event = eventsFrom(receipt, vaultAbi, vault).find((e) => e.eventName === kind);
  const args = event?.args as { account: Address; amount?: bigint } | undefined;
  if (!args || !same(args.account, walletAddress)) throw new ChainError("That transaction isn't your withdrawal");
  if (kind === "Withdrawn") {
    await mirror({ userId, type: LedgerTxType.WITHDRAW_COMPLETE, amountPaise: -unitsToPaise(args.amount ?? 0n), txHash });
  }
  return { amountPaise: unitsToPaise(args.amount ?? 0n) };
}

/** The onchain id a tip uses for "which film" (zero for a channel tip). */
export const tipFilmId = (episodeId?: string | null): Hex =>
  episodeId ? toChainId(episodeId) : "0x0000000000000000000000000000000000000000000000000000000000000000";
