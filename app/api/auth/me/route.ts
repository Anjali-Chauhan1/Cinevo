import { getCurrentUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser, toJSONSafe } from "@/lib/serialize";
import { isOnchain } from "@/lib/chain/config";
import { syncBalance } from "@/lib/chain/mirror";

export const GET = withApiErrors(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  // Onchain mode: the balance shown everywhere is the live vault balance.
  if (isOnchain && user.walletAddress && user.ledgerAccount) {
    try {
      user.ledgerAccount.balancePaise = await syncBalance(user.id);
    } catch {
      // RPC hiccup: fall back to the last cached balance.
    }
  }
  return ok({ user: toJSONSafe(sanitizeUser(user)) });
});
