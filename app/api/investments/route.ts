import { requireUser } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { listInvestments } from "@/lib/investments";

/** The signed-in user's Producer Unit holdings across every film. */
export const GET = withApiErrors(async () => {
  const user = await requireUser();
  return ok({ investments: await listInvestments(user.id) });
});
