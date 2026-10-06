import { prisma } from "@/lib/db";
import { getOrCreateLedgerAccountId, transferWithFee } from "@/lib/ledger/core";
import { PLATFORM_FEE_BPS, LedgerTxType } from "@/lib/constants";

const RATE_SCALE = 1_000_000; // ratePerSecond is stored scaled by 1e6 for sub-paise precision
const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

export class SubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionError";
  }
}

function ratePerSecondScaled(monthlyPricePaise: number): number {
  return Math.round((monthlyPricePaise * RATE_SCALE) / SECONDS_PER_MONTH);
}

/**
 * Lazily settles elapsed time on one subscription. This is the "amount owed
 * is computed when anyone touches it" design from the doc — no per-second
 * transaction ever runs. If the fan can't cover what's owed, we charge
 * whatever balance IS available and pause rather than letting debt accrue
 * indefinitely or silently keep granting free access.
 */
async function touchSubscription(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  subscription: {
    id: string;
    fanId: string;
    creatorId: string;
    ratePerSecondPaiseScaled: number;
    lastAccruedAt: Date;
    active: boolean;
  }
) {
  if (!subscription.active) return subscription;

  const now = new Date();
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - subscription.lastAccruedAt.getTime()) / 1000)
  );
  if (elapsedSeconds === 0) return subscription;

  const owedPaise = Math.floor(
    (elapsedSeconds * subscription.ratePerSecondPaiseScaled) / RATE_SCALE
  );
  if (owedPaise === 0) {
    // Not enough elapsed time to owe a whole paise yet — advance the clock a
    // little so we don't re-derive the same sub-paise remainder forever, but
    // only by what we've actually "spent" of it (none, here).
    return subscription;
  }

  const fanAccountId = await getOrCreateLedgerAccountId(tx, subscription.fanId);
  const creatorUser = await tx.creator.findUniqueOrThrow({ where: { id: subscription.creatorId } });
  const creatorAccountId = await getOrCreateLedgerAccountId(tx, creatorUser.userId);
  const fanAccount = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: fanAccountId } });
  const freeBalance = fanAccount.balancePaise - fanAccount.pendingWithdrawPaise;

  const chargeable = Math.min(owedPaise, Math.max(freeBalance, 0));

  if (chargeable > 0) {
    await transferWithFee(tx, {
      fromAccountId: fanAccountId,
      toAccountId: creatorAccountId,
      totalAmountPaise: chargeable,
      feeBps: PLATFORM_FEE_BPS,
      debitType: LedgerTxType.SUB_STREAM_OUT,
      creditType: LedgerTxType.SUB_STREAM_IN,
      feeType: LedgerTxType.PLATFORM_FEE_IN,
      refType: "SUBSCRIPTION",
      refId: subscription.id,
    });
  }

  const insufficientFunds = chargeable < owedPaise;
  return tx.subscription.update({
    where: { id: subscription.id },
    data: {
      lastAccruedAt: now,
      active: !insufficientFunds,
      pausedForLowBalance: insufficientFunds,
      cancelledAt: insufficientFunds ? now : undefined,
    },
  });
}

export async function subscribe(fanId: string, creatorId: string) {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  if (creator.userId === fanId) {
    throw new SubscriptionError("Creators can't subscribe to their own channel");
  }

  return prisma.$transaction(async (tx) => {
    await getOrCreateLedgerAccountId(tx, fanId);
    const existing = await tx.subscription.findUnique({
      where: { fanId_creatorId: { fanId, creatorId } },
    });

    const rate = ratePerSecondScaled(creator.subPriceRupeesPaise);

    if (!existing) {
      return tx.subscription.create({
        data: { fanId, creatorId, ratePerSecondPaiseScaled: rate, active: true },
      });
    }

    if (existing.active) return existing; // already subscribed, idempotent

    // Resuming: restart the accrual clock from now so no backdated charge
    // is ever taken for the time the subscription was cancelled/paused.
    return tx.subscription.update({
      where: { id: existing.id },
      data: {
        active: true,
        cancelledAt: null,
        pausedForLowBalance: false,
        lastAccruedAt: new Date(),
        ratePerSecondPaiseScaled: rate,
      },
    });
  });
}

export async function cancelSubscription(fanId: string, creatorId: string) {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { fanId_creatorId: { fanId, creatorId } } });
    if (!sub || !sub.active) throw new SubscriptionError("No active subscription to cancel");

    const settled = await touchSubscription(tx, sub);
    return tx.subscription.update({
      where: { id: settled.id },
      data: { active: false, cancelledAt: new Date() },
    });
  });
}

/** Settles elapsed accrual and returns whether the fan is currently subscribed. */
export async function isActiveSubscriber(fanId: string, creatorId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { fanId_creatorId: { fanId, creatorId } } });
  if (!sub) return false;
  if (!sub.active) return false;
  const settled = await prisma.$transaction((tx) => touchSubscription(tx, sub));
  return settled.active;
}

/** Sweep every active subscription — call from the scheduled-jobs route. */
export async function sweepAllSubscriptions() {
  const active = await prisma.subscription.findMany({ where: { active: true } });
  const results = [];
  for (const sub of active) {
    results.push(await prisma.$transaction((tx) => touchSubscription(tx, sub)));
  }
  return results;
}
