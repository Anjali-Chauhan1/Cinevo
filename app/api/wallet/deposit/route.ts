import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { depositFunds } from "@/lib/ledger/vault";
import { depositSchema, rupeesToPaiseInt } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { amountRupees } = depositSchema.parse(await req.json());
  const account = await depositFunds(user.id, rupeesToPaiseInt(amountRupees));
  return ok({ account });
});
