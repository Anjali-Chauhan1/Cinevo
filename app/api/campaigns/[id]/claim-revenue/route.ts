import { requireUser } from "@/lib/auth";
import { claimRevenue } from "@/lib/ledger/campaigns";
import { ok, withApiErrors } from "@/lib/api";

export const POST = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const user = await requireUser();
  const { id } = params;
  const result = await claimRevenue(user.id, id);
  return ok(result);
});
