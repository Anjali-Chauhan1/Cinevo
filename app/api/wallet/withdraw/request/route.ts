import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { requestWithdraw } from "@/lib/ledger/vault";
import { withdrawRequestSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { amountRupees } = withdrawRequestSchema.parse(await req.json());
  const account = await requestWithdraw(user.id, rupeesToPaiseInt(amountRupees));
  return ok({ account });
});
