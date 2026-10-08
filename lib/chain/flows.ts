import { prisma } from "@/lib/db";
import { CampaignStatus, FreeReason, MilestoneStatus, WatchSessionStatus } from "@/lib/constants";
import { ChainError } from "@/lib/chain/server";
import {
  claimSubscriptionOnchain,
  releaseMilestoneOnchain,
  settleVoucherOnchain,
  syncCampaignStateOnchain,
  ONCHAIN_STATE_TO_STATUS,
} from "@/lib/chain/operator";
import { notifyCampaignOutcome } from "@/lib/ledger/campaigns";

/**
 * Onchain-mode versions of the multi-step flows the demo ledger runs in the
 * database: the chain moves the money, then the database records the
 * outcome (statuses, watch time, totals) without touching balances itself.
 */

// Charge accrued subscriptions at most this often per subscription in the
// periodic sweep (every charge is a transaction).
const SUBSCRIPTION_CLAIM_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Settles a watch session: the signed voucher onchain, then the session record. */
export async function settleSessionOnchainFlow(sessionId: string) {
  const session = await prisma.watchSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (session.status !== WatchSessionStatus.ACTIVE) return session;

  let paidPaise = 0;
  let txHash: string | null = null;
  if (session.freeReason === FreeReason.NONE && session.voucherSignature) {
    try {
      const result = await settleVoucherOnchain(session.id);
      paidPaise = result?.paidPaise ?? 0;
      txHash = result?.txHash ?? null;
    } catch (err) {
      // A racing settle (viewer pressed stop while the sweep ran) already
      // collected this voucher; anything else must be retried, so rethrow.
      if (!(err instanceof ChainError && err.message.includes("StaleVoucher"))) throw err;
    }
  }

  // Only one caller gets to close the session and record watch time.
  const closed = await prisma.watchSession.updateMany({
    where: { id: session.id, status: WatchSessionStatus.ACTIVE },
    data: {
      status: WatchSessionStatus.SETTLED,
      settledAmountPaise: paidPaise,
      settledAt: new Date(),
      settleTxHash: txHash,
    },
  });
  if (closed.count === 1) {
    const access = await prisma.episodeAccess.upsert({
      where: { viewerId_episodeId: { viewerId: session.viewerId, episodeId: session.episodeId } },
      create: { viewerId: session.viewerId, episodeId: session.episodeId, totalPaidPaise: paidPaise, secondsWatched: session.secondsWatched },
      update: { totalPaidPaise: { increment: paidPaise }, secondsWatched: { increment: session.secondsWatched } },
    });
    // The chain stops charging at the cap; paise rounding can leave us a
    // paisa short of the off-chain cap figure, hence the tolerance.
    if (session.freeReason === FreeReason.NONE && access.totalPaidPaise >= session.capRupeesPaiseSnapshot - 1 && !access.capReached) {
      await prisma.episodeAccess.update({ where: { id: access.id }, data: { capReached: true } });
    }
  }
  return prisma.watchSession.findUniqueOrThrow({ where: { id: session.id } });
}

/** Admin approves a milestone: release onchain, then record it (no ledger writes here). */
export async function approveMilestoneOnchainFlow(adminUserId: string, milestoneId: string) {
  const milestone = await prisma.milestone.findUniqueOrThrow({ where: { id: milestoneId } });
  if (milestone.status !== MilestoneStatus.SUBMITTED) throw new ChainError("Only submitted milestones can be approved");

  const { amountPaise } = await releaseMilestoneOnchain(milestoneId);
  await prisma.campaign.update({ where: { id: milestone.campaignId }, data: { totalReleasedPaise: { increment: amountPaise } } });
  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: MilestoneStatus.RELEASED, releasedAmountPaise: amountPaise, reviewedAt: new Date(), reviewedBy: adminUserId },
  });
  const all = await prisma.milestone.findMany({ where: { campaignId: milestone.campaignId } });
  if (all.every((m) => m.status === MilestoneStatus.RELEASED)) {
    await prisma.campaign.update({ where: { id: milestone.campaignId }, data: { status: CampaignStatus.DELIVERED } });
  }
  return updated;
}

/**
 * Runs when a user requests a withdrawal: settles their open watch sessions
 * and charges their subscriptions inside the vault's withdraw delay, so that
 * money can't leave with the withdrawal.
 */
export async function settleBeforeWithdraw(userId: string) {
  const [sessions, subs] = await Promise.all([
    prisma.watchSession.findMany({ where: { viewerId: userId, status: WatchSessionStatus.ACTIVE } }),
    prisma.subscription.findMany({ where: { fanId: userId, active: true } }),
  ]);
  for (const s of sessions) await settleSessionOnchainFlow(s.id);
  for (const sub of subs) await claimSubscriptionOnchain(sub.id);
}

/** Periodic sweep, onchain mode: subscriptions due a charge, and campaign deadlines. */
export async function sweepOnchain() {
  const due = await prisma.subscription.findMany({
    where: { active: true, lastAccruedAt: { lt: new Date(Date.now() - SUBSCRIPTION_CLAIM_INTERVAL_MS) } },
    take: 20,
  });
  let subscriptionsCharged = 0;
  for (const sub of due) {
    try {
      await claimSubscriptionOnchain(sub.id);
      subscriptionsCharged += 1;
    } catch (err) {
      console.error("subscription claim failed", sub.id, err);
    }
  }

  // The chain decides funded/failed (its totals are in stablecoin units).
  const open = await prisma.campaign.findMany({
    where: {
      contractAddress: { not: null },
      OR: [
        { status: CampaignStatus.ACTIVE, deadline: { lte: new Date() } },
        { status: CampaignStatus.FUNDED_PRODUCING, deliveryDate: { lte: new Date() } },
      ],
    },
  });
  const campaignsUpdated: string[] = [];
  for (const c of open) {
    try {
      const state = await syncCampaignStateOnchain(c.id);
      if (state === null || state === undefined) continue;
      const status = ONCHAIN_STATE_TO_STATUS[Number(state)];
      if (status && status !== c.status) {
        await prisma.campaign.update({ where: { id: c.id }, data: { status } });
        campaignsUpdated.push(c.id);
        if (status === CampaignStatus.FUNDED_PRODUCING) await notifyCampaignOutcome(c.id, "FUNDED");
        if (status === CampaignStatus.FAILED_REFUNDING) {
          await notifyCampaignOutcome(c.id, c.status === CampaignStatus.ACTIVE ? "GOAL_MISSED" : "DELIVERY_MISSED");
        }
      }
    } catch (err) {
      console.error("campaign sync failed", c.id, err);
    }
  }
  return { subscriptionsCharged, campaignsUpdated };
}
