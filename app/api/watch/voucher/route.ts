import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { submitVoucher } from "@/lib/ledger/vault";
import { voucherSchema } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const { sessionToken, cumulativeAmountPaise } = voucherSchema.parse(await req.json());
  const session = await submitVoucher(sessionToken, user.id, cumulativeAmountPaise);
  return ok({ session });
});
