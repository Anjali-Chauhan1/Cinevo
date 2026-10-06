import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import {
  credit,
  debit,
  getOrCreateLedgerAccountId,
  getPlatformAccountId,
  InsufficientBalanceError,
} from "@/lib/ledger/core";
import { distributeFilmRevenue } from "@/lib/ledger/campaigns";
import {
  CampaignStatus,
  PLATFORM_FEE_BPS,
  PAY_PER_MINUTE,
  WALLET,
  FreeReason,
  WatchSessionStatus,
  LedgerTxType,
  EpisodeStatus,
} from "@/lib/constants";

export class EpisodeAccessDeniedError extends Error {
  constructor(message = "This episode is not available to you yet") {
    super(message);
    this.name = "EpisodeAccessDeniedError";
  }
}

/**
 * Determines why (if at all) a viewer gets this episode for free, and
 * whether they're allowed to watch it at this stage of its release at all.
 * This is the single access-control decision point referenced by both
 * session start AND the periodic re-check while a session is live.
 */
async function resolveAccess(
  tx: typeof prisma,
  viewerId: string,
  episode: {
    id: string;
    creatorId: string;
    isPaid: boolean;
    status: string;
    capRupeesPaise: number;
  }
): Promise<{ allowed: boolean; freeReason: string }> {
  const isGatedStage =
    episode.status === EpisodeStatus.PREMIERING || episode.status === EpisodeStatus.EARLY_ACCESS;
  const isDraftOrScheduled =
    episode.status === EpisodeStatus.DRAFT || episode.status === EpisodeStatus.SCHEDULED;

  if (isDraftOrScheduled) return { allowed: false, freeReason: FreeReason.NONE };

  // Subscribers to this creator always watch free, at any release stage.
  const sub = await tx.subscription.findUnique({
    where: { fanId_creatorId: { fanId: viewerId, creatorId: episode.creatorId } },
  });
  if (sub?.active) return { allowed: true, freeReason: FreeReason.SUBSCRIBER };

  if (isGatedStage) {
    // Premiere / early access: only subscribers (checked above) or backer
    // pass holders for one of this creator's campaigns may watch at all.
    const pass = await tx.backerPass.findFirst({
      where: { userId: viewerId, revoked: false, campaign: { creatorId: episode.creatorId } },
    });
    if (pass) return { allowed: true, freeReason: FreeReason.BACKER_PASS };
    return { allowed: false, freeReason: FreeReason.NONE };
  }

  // Public stage.
  if (!episode.isPaid) return { allowed: true, freeReason: FreeReason.FREE_EPISODE };

  const access = await tx.episodeAccess.findUnique({
    where: { viewerId_episodeId: { viewerId, episodeId: episode.id } },
  });
  if (access?.capReached) return { allowed: true, freeReason: FreeReason.ALREADY_PAID };

  return { allowed: true, freeReason: FreeReason.NONE }; // must pay-per-minute
}

/**
 * Opens (or resumes) a watch session. Idempotent per (viewer, episode): if an
 * ACTIVE session already exists, it's returned as-is rather than creating a
 * second one — this is what stops a viewer double-dipping free preview
 * minutes or running two billing clocks on the same episode from two tabs.
 */
export async function startWatchSession(viewerId: string, episodeId: string) {
  return prisma.$transaction(async (tx) => {
    const episode = await tx.episode.findUniqueOrThrow({ where: { id: episodeId } });

    const existing = await tx.watchSession.findFirst({
      where: { viewerId, episodeId, status: WatchSessionStatus.ACTIVE },
    });
    if (existing) return existing;

    const { allowed, freeReason } = await resolveAccess(tx as unknown as typeof prisma, viewerId, episode);
    if (!allowed) throw new EpisodeAccessDeniedError();

    await getOrCreateLedgerAccountId(tx, viewerId);

    return tx.watchSession.create({
      data: {
        sessionToken: randomUUID(),
        viewerId,
        episodeId,
        rateRupeesPaiseSnapshot: episode.rateRupeesPaise,
        previewSecondsSnapshot: episode.previewSeconds,
        capRupeesPaiseSnapshot: episode.capRupeesPaise,
        freeReason,
      },
    });
  });
}

export class VoucherRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoucherRejectedError";
  }
}

/**
 * Accepts one voucher tick (the demo stand-in for an EIP-712 signed voucher).
 * `cumulativeAmountPaise` must be the TOTAL owed for the session so far, and
 * must only ever increase — this is the replay-protection + monotonicity
 * invariant from the onchain design, enforced here instead of in Solidity.
 */
export async function submitVoucher(
  sessionToken: string,
  viewerId: string,
  cumulativeAmountPaise: number
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.watchSession.findUnique({ where: { sessionToken } });
    if (!session || session.viewerId !== viewerId) {
      throw new VoucherRejectedError("Unknown session");
    }
    if (session.status !== WatchSessionStatus.ACTIVE) {
      throw new VoucherRejectedError("Session is no longer active");
    }

    // Free sessions (subscriber/backer-pass/free-episode/already-paid) still
    // send heartbeats so we can track watch time for reviews/popularity, but
    // never move money and never exceed a cap that doesn't apply to them.
    if (session.freeReason !== FreeReason.NONE) {
      return tx.watchSession.update({
        where: { id: session.id },
        data: {
          secondsWatched: { increment: PAY_PER_MINUTE.VOUCHER_INTERVAL_SECONDS },
          lastVoucherAt: new Date(),
        },
      });
    }

    if (cumulativeAmountPaise <= session.cumulativeAmountPaise) {
      // Stale, replayed, or clock-skewed voucher — reject, don't just ignore,
      // so the client surfaces it instead of silently stalling playback.
      throw new VoucherRejectedError(
        "Voucher amount must exceed the amount already billed for this session"
      );
    }

    // Clamp to the per-episode cap — once reached, the rest of the episode
    // is free, mirroring the onchain "pays only the highest valid signed
    // amount ... never more than the deposit" rule, applied to the cap here.
    const clamped = Math.min(cumulativeAmountPaise, session.capRupeesPaiseSnapshot);

    // Cross-session overspend guard: sum every OTHER currently-active paid
    // session's running total for this viewer and make sure their free
    // balance still covers this session's new total too. Without this, a
    // viewer could open the same (or different) paid episodes in multiple
    // tabs and commit to spending more than their balance holds.
    const account = await tx.ledgerAccount.findUnique({ where: { userId: viewerId } });
    const freeBalance = (account?.balancePaise ?? 0) - (account?.pendingWithdrawPaise ?? 0);

    const otherActive = await tx.watchSession.findMany({
      where: {
        viewerId,
        status: WatchSessionStatus.ACTIVE,
        freeReason: FreeReason.NONE,
        id: { not: session.id },
      },
      select: { cumulativeAmountPaise: true },
    });
    const otherCommitted = otherActive.reduce((sum, s) => sum + s.cumulativeAmountPaise, 0);

    if (freeBalance < otherCommitted + clamped) {
      throw new InsufficientBalanceError(
        "Balance can't cover this session alongside your other active sessions — top up to keep watching"
      );
    }

    return tx.watchSession.update({
      where: { id: session.id },
      data: {
        cumulativeAmountPaise: clamped,
        secondsWatched: { increment: PAY_PER_MINUTE.VOUCHER_INTERVAL_SECONDS },
        lastVoucherAt: new Date(),
      },
    });
  });
}

/**
 * Settles the session's latest voucher in one atomic transfer and closes it.
 * Safe to call more than once — settling an already-SETTLED session is a
 * no-op, which is what lets both "viewer clicks stop" and the stale-session
 * sweep race harmlessly against each other.
 */
export async function settleSession(
  sessionId: string,
  trigger: "VIEWER_STOP" | "AUTO_TIMEOUT" | "CAP_REACHED" = "VIEWER_STOP"
) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.watchSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (session.status !== WatchSessionStatus.ACTIVE) return session; // already settled

    const episode = await tx.episode.findUniqueOrThrow({ where: { id: session.episodeId } });

    let settledAmount = 0;
    if (session.freeReason === FreeReason.NONE && session.cumulativeAmountPaise > 0) {
      const viewerAccountId = await getOrCreateLedgerAccountId(tx, session.viewerId);
      const creatorUser = await tx.creator.findUniqueOrThrow({ where: { id: episode.creatorId } });
      const creatorAccountId = await getOrCreateLedgerAccountId(tx, creatorUser.userId);

      // Best-effort settlement: if concurrent sessions already consumed some
      // of the balance since this voucher was last validated, settle what's
      // actually available rather than throwing and leaving the session
      // stuck open forever. The shortfall is recorded in the audit meta.
      const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: viewerAccountId } });
      const freeBalance = account.balancePaise - account.pendingWithdrawPaise;
      settledAmount = Math.min(session.cumulativeAmountPaise, Math.max(freeBalance, 0));

      if (settledAmount > 0) {
        // Debit the viewer once, then route the payout: straight 90/10 to
        // the creator/platform normally, or through the Producer Unit
        // revenue waterfall if this episode is the film a unit-bearing
        // campaign funded (see lib/ledger/campaigns.ts).
        await debit(tx, viewerAccountId, settledAmount, LedgerTxType.VOUCHER_SETTLE, "EPISODE", episode.id, {
          sessionId: session.id,
          trigger,
          shortfall: session.cumulativeAmountPaise - settledAmount,
        });

        const fundingCampaign = await tx.campaign.findUnique({
          where: { fundedEpisodeId: episode.id },
        });
        const waterfallActive =
          fundingCampaign &&
          fundingCampaign.producerUnitsEnabled &&
          fundingCampaign.totalUnits > 0 &&
          (fundingCampaign.status === CampaignStatus.FUNDED_PRODUCING ||
            fundingCampaign.status === CampaignStatus.DELIVERED);

        if (waterfallActive && fundingCampaign) {
          await distributeFilmRevenue(
            tx,
            fundingCampaign.id,
            settledAmount,
            creatorAccountId,
            "EPISODE",
            episode.id
          );
        } else {
          const platformAccountId = await getPlatformAccountId(tx);
          const feePaise = Math.round((settledAmount * PLATFORM_FEE_BPS) / 10000);
          const netPaise = settledAmount - feePaise;
          await credit(tx, creatorAccountId, netPaise, LedgerTxType.VOUCHER_SETTLE, "EPISODE", episode.id);
          if (feePaise > 0) {
            await credit(tx, platformAccountId, feePaise, LedgerTxType.PLATFORM_FEE_IN, "EPISODE", episode.id);
          }
        }
      }

      const access = await tx.episodeAccess.upsert({
        where: { viewerId_episodeId: { viewerId: session.viewerId, episodeId: episode.id } },
        create: {
          viewerId: session.viewerId,
          episodeId: episode.id,
          totalPaidPaise: settledAmount,
          secondsWatched: session.secondsWatched,
        },
        update: {
          totalPaidPaise: { increment: settledAmount },
          secondsWatched: { increment: session.secondsWatched },
        },
      });
      if (access.totalPaidPaise >= session.capRupeesPaiseSnapshot && !access.capReached) {
        await tx.episodeAccess.update({
          where: { id: access.id },
          data: { capReached: true },
        });
      }
    } else {
      // Free session — still accumulate watch time for review eligibility.
      await tx.episodeAccess.upsert({
        where: { viewerId_episodeId: { viewerId: session.viewerId, episodeId: episode.id } },
        create: { viewerId: session.viewerId, episodeId: episode.id, secondsWatched: session.secondsWatched },
        update: { secondsWatched: { increment: session.secondsWatched } },
      });
    }

    return tx.watchSession.update({
      where: { id: session.id },
      data: {
        status: WatchSessionStatus.SETTLED,
        settledAmountPaise: settledAmount,
        settledAt: new Date(),
      },
    });
  });
}

/**
 * Sweep for sessions whose last voucher (or start, if none yet) is older
 * than the auto-settle timeout — the server-side safety net for a crashed
 * tab or lost connection that never sent a clean "stop". Call this from a
 * scheduled route; it's also safe to call opportunistically on page loads.
 */
export async function autoSettleStaleSessions() {
  const cutoff = new Date(Date.now() - PAY_PER_MINUTE.AUTO_SETTLE_TIMEOUT_SECONDS * 1000);
  const stale = await prisma.watchSession.findMany({
    where: {
      status: WatchSessionStatus.ACTIVE,
      OR: [{ lastVoucherAt: { lt: cutoff } }, { lastVoucherAt: null, startedAt: { lt: cutoff } }],
    },
    select: { id: true },
  });
  const results = [];
  for (const s of stale) {
    results.push(await settleSession(s.id, "AUTO_TIMEOUT"));
  }
  return results;
}

/**
 * Demo on-ramp: instantly credits the viewer's ledger (stands in for a card
 * top-up / stablecoin deposit). Capped per call to keep demo data sane.
 */
export async function depositFunds(userId: string, amountPaise: number) {
  if (amountPaise <= 0) throw new Error("Deposit amount must be positive");
  if (amountPaise > 10_000_00) throw new Error("Demo deposits are capped at ₹10,000 per top-up");

  return prisma.$transaction(async (tx) => {
    const accountId = await getOrCreateLedgerAccountId(tx, userId);
    await credit(tx, accountId, amountPaise, LedgerTxType.DEPOSIT);
    return tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
  });
}

export class WithdrawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawError";
  }
}

/**
 * Starts the withdraw cooldown. Any of the viewer's own ACTIVE paid sessions
 * are settled first (server-side, automatically) so they can't request a
 * withdrawal while a billing clock is still running against the same funds.
 */
export async function requestWithdraw(userId: string, amountPaise: number) {
  if (amountPaise <= 0) throw new WithdrawError("Withdraw amount must be positive");

  const openSessions = await prisma.watchSession.findMany({
    where: { viewerId: userId, status: WatchSessionStatus.ACTIVE, freeReason: FreeReason.NONE },
    select: { id: true },
  });
  for (const s of openSessions) {
    await settleSession(s.id, "VIEWER_STOP");
  }

  return prisma.$transaction(async (tx) => {
    const accountId = await getOrCreateLedgerAccountId(tx, userId);
    const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
    const freeBalance = account.balancePaise - account.pendingWithdrawPaise;
    if (amountPaise > freeBalance) {
      throw new WithdrawError("Withdraw amount exceeds your available balance");
    }

    const updated = await tx.ledgerAccount.update({
      where: { id: accountId },
      data: {
        pendingWithdrawPaise: { increment: amountPaise },
        withdrawRequestedAt: new Date(),
      },
    });
    await tx.ledgerTransaction.create({
      data: {
        accountId,
        type: LedgerTxType.WITHDRAW_REQUEST,
        amountPaise: 0,
        balanceAfter: updated.balancePaise,
        meta: JSON.stringify({ requestedPaise: amountPaise }),
      },
    });
    return updated;
  });
}

export async function completeWithdraw(userId: string) {
  return prisma.$transaction(async (tx) => {
    const accountId = await getOrCreateLedgerAccountId(tx, userId);
    const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });

    if (account.pendingWithdrawPaise <= 0 || !account.withdrawRequestedAt) {
      throw new WithdrawError("No withdrawal is pending");
    }
    const readyAt = new Date(
      account.withdrawRequestedAt.getTime() + WALLET.WITHDRAW_DELAY_MINUTES * 60 * 1000
    );
    if (new Date() < readyAt) {
      throw new WithdrawError(`Withdrawal unlocks at ${readyAt.toISOString()}`);
    }

    const amount = account.pendingWithdrawPaise;
    await debit(tx, accountId, amount, LedgerTxType.WITHDRAW_COMPLETE);
    return tx.ledgerAccount.update({
      where: { id: accountId },
      data: { pendingWithdrawPaise: 0, withdrawRequestedAt: null },
    });
  });
}

export async function cancelWithdraw(userId: string) {
  return prisma.$transaction(async (tx) => {
    const accountId = await getOrCreateLedgerAccountId(tx, userId);
    const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (account.pendingWithdrawPaise <= 0) throw new WithdrawError("No withdrawal is pending");

    const updated = await tx.ledgerAccount.update({
      where: { id: accountId },
      data: { pendingWithdrawPaise: 0, withdrawRequestedAt: null },
    });
    await tx.ledgerTransaction.create({
      data: {
        accountId,
        type: LedgerTxType.WITHDRAW_CANCEL,
        amountPaise: 0,
        balanceAfter: updated.balancePaise,
      },
    });
    return updated;
  });
}

export { resolveAccess as __resolveAccessForTesting };
