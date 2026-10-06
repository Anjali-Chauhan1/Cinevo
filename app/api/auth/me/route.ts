import { getCurrentUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { sanitizeUser, toJSONSafe } from "@/lib/serialize";

export const GET = withApiErrors(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });
  return ok({ user: toJSONSafe(sanitizeUser(user)) });
});
