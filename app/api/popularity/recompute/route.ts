import { recomputeAllPopularityScores } from "@/lib/ledger/popularity";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";

// Stands in for the "worker recalculates scores every 5 minutes" job.
// Triggered from the admin panel in this demo; wire to a real scheduler in
// production.
export const POST = withApiErrors(async () => {
  const results = await recomputeAllPopularityScores();
  return ok(toJSONSafe({ updated: results.length }));
});
