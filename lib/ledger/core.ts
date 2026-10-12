import type { Prisma, PrismaClient } from "@prisma/client";
import { PLATFORM_LEDGER_EMAIL } from "@/lib/constants";

/** Any Prisma client or interactive-transaction client works for ledger ops. */
export type Tx = PrismaClient | Prisma.TransactionClient;

export class InsufficientBalanceError extends Error {
  constructor(message = "Insufficient balance") {
    super(message);
    this.name = "InsufficientBalanceError";
  }
}

/**
 * The platform's own ledger account, used as the counterparty for the 10%
 * fee on tips/subscriptions/pay-per-minute/backing. It is a real User row
 * (role ADMIN, unguessable email) so platform revenue flows through the same
 * audited LedgerTransaction trail as everyone else's money — no special-case
 * "just add to a number somewhere" fee logic.
 */
export async function getPlatformAccountId(tx: Tx): Promise<string> {
  const platformUser = await tx.user.findUnique({
    where: { email: PLATFORM_LEDGER_EMAIL },
    include: { ledgerAccount: true },
  });
  if (!platformUser) {
    throw new Error(
      "Platform operator account is missing. Run `npm run db:seed` before using the app."
    );
  }
  if (!platformUser.ledgerAccount) {
    const account = await tx.ledgerAccount.create({ data: { userId: platformUser.id } });
    return account.id;
  }
  return platformUser.ledgerAccount.id;
}

export async function getOrCreateLedgerAccountId(tx: Tx, userId: string): Promise<string> {
  const existing = await tx.ledgerAccount.findUnique({ where: { userId } });
  if (existing) return existing.id;
  const created = await tx.ledgerAccount.create({ data: { userId } });
  return created.id;
}

/**
 * Credits an account and writes the matching audit row. Credits never need a
 * balance check — only debits can fail.
 */
export async function credit(
  tx: Tx,
  accountId: string,
  amountCents: number,
  type: string,
  refType?: string,
  refId?: string,
  meta?: Record<string, unknown>
) {
  if (amountCents < 0) throw new Error("credit() requires a non-negative amount");
  if (amountCents === 0) return; // no-op, don't pollute the audit log with zero rows
  const account = await tx.ledgerAccount.update({
    where: { id: accountId },
    data: { balanceCents: { increment: amountCents } },
  });
  await tx.ledgerTransaction.create({
    data: {
      accountId,
      type,
      amountCents,
      balanceAfter: account.balanceCents,
      refType,
      refId,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}

/**
 * Debits an account. Throws InsufficientBalanceError if the account's FREE
 * balance (balance minus anything already locked behind a pending withdraw)
 * can't cover it — every caller must handle this, never assume success.
 */
export async function debit(
  tx: Tx,
  accountId: string,
  amountCents: number,
  type: string,
  refType?: string,
  refId?: string,
  meta?: Record<string, unknown>
) {
  if (amountCents < 0) throw new Error("debit() requires a non-negative amount");
  if (amountCents === 0) return;

  const account = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
  const freeBalance = account.balanceCents - account.pendingWithdrawCents;
  if (freeBalance < amountCents) {
    throw new InsufficientBalanceError(
      `Balance ${freeBalance} cents is less than required ${amountCents} cents`
    );
  }

  const updated = await tx.ledgerAccount.update({
    where: { id: accountId },
    data: { balanceCents: { decrement: amountCents } },
  });
  await tx.ledgerTransaction.create({
    data: {
      accountId,
      type,
      amountCents: -amountCents,
      balanceAfter: updated.balanceCents,
      refType,
      refId,
      meta: meta ? JSON.stringify(meta) : null,
    },
  });
}

/**
 * Moves money from one account to another with a platform fee skimmed off
 * the top, writing three audit rows (payer debit, payee credit, platform
 * credit) that always net to zero. This is the shared primitive behind tips,
 * pay-per-minute settlement, and perk-only campaign revenue.
 */
export async function transferWithFee(
  tx: Tx,
  opts: {
    fromAccountId: string;
    toAccountId: string;
    totalAmountCents: number;
    feeBps: number;
    debitType: string;
    creditType: string;
    feeType: string;
    refType?: string;
    refId?: string;
    meta?: Record<string, unknown>;
  }
) {
  const { fromAccountId, toAccountId, totalAmountCents, feeBps } = opts;
  if (totalAmountCents <= 0) throw new Error("transferWithFee requires a positive amount");

  const feeCents = Math.round((totalAmountCents * feeBps) / 10000);
  const netCents = totalAmountCents - feeCents;
  const platformAccountId = await getPlatformAccountId(tx);

  await debit(tx, fromAccountId, totalAmountCents, opts.debitType, opts.refType, opts.refId, opts.meta);
  await credit(tx, toAccountId, netCents, opts.creditType, opts.refType, opts.refId, opts.meta);
  if (feeCents > 0) {
    await credit(tx, platformAccountId, feeCents, opts.feeType, opts.refType, opts.refId, opts.meta);
  }

  return { feeCents, netCents };
}
