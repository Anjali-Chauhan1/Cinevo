import { requireUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/ledger/subscriptions";
import { ok, withApiErrors } from "@/lib/api";

export const DELETE = withApiErrors(async (_req: Request, { params }: { params: { creatorId: string } }) => {
  const user = await requireUser();
  const { creatorId } = params;
  const subscription = await cancelSubscription(user.id, creatorId);
  return ok({ subscription });
});
