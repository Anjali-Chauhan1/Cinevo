import type { Address } from "viem";
import { prisma } from "@/lib/db";
import { getAddresses, unitsToCents } from "@/lib/chain/config";
import { publicClient } from "@/lib/chain/server";
import { vaultAbi } from "@/lib/chain/abis";

/**
 * In onchain mode the CinovaVault balance is the truth. The database keeps a
 * mirror so everything built on the ledger keeps working: each confirmed
 * onchain money movement is written as a LedgerTransaction row (with its tx
 * hash), and LedgerAccount.balanceCents is refreshed from the chain.
 */

export async function vaultBalanceUnits(wallet: Address): Promise<bigint> {
  return publicClient.readContract({ address: getAddresses().vault, abi: vaultAbi, functionName: "balanceOf", args: [wallet] });
}

/** Re-reads a user's vault balance and caches it (in cents) on their ledger account. */
export async function syncBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.walletAddress) return 0;
  const cents = unitsToCents(await vaultBalanceUnits(user.walletAddress as Address));
  await prisma.ledgerAccount.upsert({
    where: { userId },
    create: { userId, balanceCents: cents },
    update: { balanceCents: cents },
  });
  return cents;
}

/**
 * Records one onchain money movement for a user. `amountCents` is signed:
 * positive = money in, negative = money out. Idempotent per (tx, user, type),
 * so a confirmation retried by the client never double-counts.
 */
export async function mirror(opts: {
  userId: string;
  type: string;
  amountCents: number;
  txHash: string;
  refType?: string;
  refId?: string;
  meta?: Record<string, unknown>;
}) {
  if (opts.amountCents === 0) return;
  const balanceAfter = await syncBalance(opts.userId);
  const account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { userId: opts.userId } });
  const existing = await prisma.ledgerTransaction.findFirst({
    where: { accountId: account.id, txHash: opts.txHash, type: opts.type },
  });
  if (existing) return;
  await prisma.ledgerTransaction.create({
    data: {
      accountId: account.id,
      type: opts.type,
      amountCents: opts.amountCents,
      balanceAfter,
      refType: opts.refType,
      refId: opts.refId,
      txHash: opts.txHash,
      meta: opts.meta ? JSON.stringify(opts.meta) : null,
    },
  });
}

/** The user that owns a wallet address, if any. */
export async function userByWallet(wallet: string) {
  return prisma.user.findFirst({ where: { walletAddress: { equals: wallet.toLowerCase() } } });
}
