import { autoSettleStaleSessions } from "@/lib/ledger/vault";
import { sweepAllSubscriptions } from "@/lib/ledger/subscriptions";
import { sweepCampaignDeadlines } from "@/lib/ledger/campaigns";
import { recomputeAllPopularityScores } from "@/lib/ledger/popularity";
import { ok, withApiErrors } from "@/lib/api";

/**
 * Single entry point standing in for every scheduled job the design doc
 * calls for: stale-session auto-settlement, subscription accrual sweeps,
 * campaign deadline transitions, and popularity recomputation. Safe to call
 * repeatedly — every underlying operation is idempotent. The client polls
 * this opportunistically (see components/CronPing) instead of running a
 * real background worker, which this demo environment doesn't have.
 */
export const POST = withApiErrors(async () => {
  const [settled, subs, campaigns, popularity] = await Promise.all([
    autoSettleStaleSessions(),
    sweepAllSubscriptions(),
    sweepCampaignDeadlines(),
    recomputeAllPopularityScores(),
  ]);
  return ok({
    settledSessions: settled.length,
    subscriptionsTouched: subs.length,
    campaignsTouched: campaigns.length,
    popularityUpdated: popularity.length,
  });
});
