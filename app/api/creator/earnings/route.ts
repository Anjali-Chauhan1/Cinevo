import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { getCreatorEarnings } from "@/lib/earnings";

export const GET = withApiErrors(async () => {
  const { user, creator } = await requireCreator();
  return ok(await getCreatorEarnings(creator.id, user.id));
});
