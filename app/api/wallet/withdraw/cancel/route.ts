import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { requireUser } from "@/lib/auth";
import { cancelWithdraw } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";
import { txHashSchema } from "@/lib/validation";
import { isOnchain } from "@/lib/chain/config";
import { confirmWithdrawEvent } from "@/lib/chain/confirm";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  if (isOnchain) {
    const { txHash } = txHashSchema.parse(await req.json());
    return ok(await confirmWithdrawEvent(user.id, txHash as Hex, "WithdrawCancelled"));
  }
  const account = await cancelWithdraw(user.id);
  return ok({ account });
});
