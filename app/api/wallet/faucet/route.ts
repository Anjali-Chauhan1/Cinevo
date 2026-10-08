import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { explorerTxUrl, isOnchain } from "@/lib/chain/config";
import { faucetTopUp } from "@/lib/chain/operator";
import { FAUCET } from "@/lib/chain/faucet";

/** Testnet only: the operator credits test money straight into the user's vault balance. */
export const POST = withApiErrors(async () => {
  if (!isOnchain) return ok({ error: "The faucet is only for onchain test mode" }, 404);
  const user = await requireUser();
  const since = new Date(Date.now() - FAUCET.COOLDOWN_MS);
  // Claim the slot first so double-clicks can't top up twice.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ lastFaucetAt: null }, { lastFaucetAt: { lt: since } }] },
    data: { lastFaucetAt: new Date() },
  });
  if (claimed.count === 0) return ok({ error: "You can get test money once an hour" }, 429);
  try {
    const txHash = await faucetTopUp(user.id, FAUCET.AMOUNT_PAISE);
    return ok({ amountPaise: FAUCET.AMOUNT_PAISE, txHash, explorerUrl: explorerTxUrl(txHash) });
  } catch (err) {
    await prisma.user.update({ where: { id: user.id }, data: { lastFaucetAt: user.lastFaucetAt } });
    throw err;
  }
});
