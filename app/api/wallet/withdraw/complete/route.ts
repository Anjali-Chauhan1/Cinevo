import { requireUser } from "@/lib/auth";
import { completeWithdraw } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async () => {
  const user = await requireUser();
  const account = await completeWithdraw(user.id);
  return ok({ account });
});
