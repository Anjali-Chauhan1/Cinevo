import { NextRequest } from "next/server";
import type { Hex } from "viem";
import { requireUser } from "@/lib/auth";
import { claimRefund } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";
import { txHashSchema } from "@/lib/validation";
import { isOnchain } from "@/lib/chain/config";
import { confirmRefund } from "@/lib/chain/confirm";

export const POST = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  if (isOnchain) {
    const { txHash } = txHashSchema.parse(await req.json());
    return ok(await confirmRefund(user.id, id, txHash as Hex));
  }
  return ok(await claimRefund(user.id, id));
});
