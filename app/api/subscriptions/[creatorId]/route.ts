import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { requireUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/ledger/subscriptions";
import { ok, withApiErrors } from "@/lib/api";
import { isOnchain } from "@/lib/chain/config";
import { confirmCancel } from "@/lib/chain/confirm";

export const DELETE = withApiErrors(async (req: NextRequest, { params }: { params: { creatorId: string } }) => {
  const user = await requireUser();
  const { creatorId } = params;
  if (isOnchain) {
    // The fan's wallet already sent subscriptions.cancel(); the hash comes in the query string.
    const txHash = req.nextUrl.searchParams.get("txHash");
    if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return ok({ error: "Missing transaction hash" }, 400);
    return ok({ subscription: await confirmCancel(user.id, creatorId, txHash as Hex) });
  }
  const subscription = await cancelSubscription(user.id, creatorId);
  return ok({ subscription });
});
