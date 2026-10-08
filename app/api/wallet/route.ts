import type { Address } from "viem";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { getOrCreateLedgerAccountId } from "@/lib/ledger/core";
import { WALLET } from "@/lib/constants";
import { explorerTxUrl, getAddresses, isOnchain, unitsToPaise } from "@/lib/chain/config";
import { publicClient } from "@/lib/chain/server";
import { syncBalance } from "@/lib/chain/mirror";
import { vaultAbi } from "@/lib/chain/abis";
import { FAUCET } from "@/lib/chain/faucet";

export const GET = withApiErrors(async () => {
  const user = await requireUser();
  const accountId = await getOrCreateLedgerAccountId(prisma, user.id);
  let account = await prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
  const transactions = await prisma.ledgerTransaction.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const activeSubscriptions = await prisma.subscription.findMany({
    where: { fanId: user.id, active: true },
    include: { creator: { select: { handle: true, channelName: true } } },
  });
  const backerPasses = await prisma.backerPass.findMany({
    where: { userId: user.id, revoked: false },
    include: { campaign: { select: { filmTitle: true } } },
  });

  // Onchain mode: the vault is the truth for the balance and any pending withdrawal.
  let onchain = null;
  if (isOnchain && user.walletAddress) {
    const vault = getAddresses().vault;
    const [balancePaise, request] = await Promise.all([
      syncBalance(user.id),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "withdrawRequests", args: [user.walletAddress as Address] }),
    ]);
    const [requestedUnits, readyAt] = request;
    account = {
      ...account,
      balancePaise,
      pendingWithdrawPaise: unitsToPaise(requestedUnits),
      withdrawRequestedAt: requestedUnits > 0n ? new Date((Number(readyAt) - WALLET.WITHDRAW_DELAY_MINUTES * 60) * 1000) : null,
    };
    const nextFaucetAt = user.lastFaucetAt ? new Date(user.lastFaucetAt.getTime() + FAUCET.COOLDOWN_MS) : null;
    onchain = {
      walletAddress: user.walletAddress,
      vaultAddress: vault,
      withdrawReadyAt: requestedUnits > 0n ? new Date(Number(readyAt) * 1000) : null,
      faucetPaise: FAUCET.AMOUNT_PAISE,
      nextFaucetAt: nextFaucetAt && nextFaucetAt > new Date() ? nextFaucetAt : null,
    };
  }

  return ok({
    account,
    transactions: transactions.map((t) => ({ ...t, explorerUrl: t.txHash ? explorerTxUrl(t.txHash) : null })),
    activeSubscriptions,
    backerPasses,
    onchain,
  });
});
