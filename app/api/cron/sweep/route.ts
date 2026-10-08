import { autoSettleStaleSessions } from "@/lib/ledger/vault";
import { sweepAllSubscriptions } from "@/lib/ledger/subscriptions";
import { sweepCampaignDeadlines } from "@/lib/ledger/campaigns";
import { recomputeAllPopularityScores } from "@/lib/ledger/popularity";
import { ok, withApiErrors } from "@/lib/api";
import { sendPremiereReminders } from "@/lib/notifications";
import { isOnchain } from "@/lib/chain/config";
import { sweepOnchain } from "@/lib/chain/flows";

/**
 * Single entry point standing in for every scheduled job the design doc
 * calls for: stale-session auto-settlement, subscription accrual sweeps,
 * campaign deadline transitions, popularity recomputation, and premiere
 * reminders. Safe to call
 * repeatedly — every underlying operation is idempotent. The client polls
 * this opportunistically (see components/CronPing) instead of running a
 * real background worker, which this demo environment doesn't have.
 */
export const POST = withApiErrors(async () => {
  if (isOnchain) {
    // Money lives onchain: settle stale sessions, charge due subscriptions and
    // take campaign outcomes from the chain instead of the demo ledger.
    const [settled, chainSweep, popularity, reminders] = await Promise.all([
      autoSettleStaleSessions(),
      sweepOnchain(),
      recomputeAllPopularityScores(),
      sendPremiereReminders(),
    ]);
    return ok({
      settledSessions: settled.length,
      subscriptionsCharged: chainSweep.subscriptionsCharged,
      campaignsTouched: chainSweep.campaignsUpdated.length,
      popularityUpdated: popularity.length,
      premiereRemindersQueued: reminders,
    });
  }
  const [settled, subs, campaigns, popularity, reminders] = await Promise.all([
    autoSettleStaleSessions(),
    sweepAllSubscriptions(),
    sweepCampaignDeadlines(),
    recomputeAllPopularityScores(),
    sendPremiereReminders(),
  ]);
  return ok({
    settledSessions: settled.length,
    subscriptionsTouched: subs.length,
    campaignsTouched: campaigns.length,
    popularityUpdated: popularity.length,
    premiereRemindersQueued: reminders,
  });
});
