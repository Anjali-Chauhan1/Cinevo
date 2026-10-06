import { requireUser } from "@/lib/auth";
import { claimRefund } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  const result = await claimRefund(user.id, id);
  return ok(result);
});
