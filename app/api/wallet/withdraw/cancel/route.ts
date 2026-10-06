import { requireUser } from "@/lib/auth";
import { cancelWithdraw } from "@/lib/ledger/vault";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async () => {
  const user = await requireUser();
  const account = await cancelWithdraw(user.id);
  return ok({ account });
});
