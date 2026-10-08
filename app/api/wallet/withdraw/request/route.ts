import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { requireUser } from "@/lib/auth";
import { requestWithdraw } from "@/lib/ledger/vault";
import { withdrawRequestSchema, rupeesToPaiseInt, txHashSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { isOnchain } from "@/lib/chain/config";
import { confirmWithdrawEvent } from "@/lib/chain/confirm";
import { settleBeforeWithdraw } from "@/lib/chain/flows";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  if (isOnchain) {
    const { txHash } = txHashSchema.parse(await req.json());
    const result = await confirmWithdrawEvent(user.id, txHash as Hex, "WithdrawRequested");
    // Inside the vault's withdraw delay: collect what this user owes first.
    await settleBeforeWithdraw(user.id);
    return ok(result);
  }
  const { amountRupees } = withdrawRequestSchema.parse(await req.json());
  const account = await requestWithdraw(user.id, rupeesToPaiseInt(amountRupees));
  return ok({ account });
});
