import { prisma } from "@/lib/db";
import { NOTIFICATIONS, NotificationType, PremiereStatus, BackingStatus, EpisodeStatus } from "@/lib/constants";

type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType];

export interface NotifyInput {
  type: NotificationTypeValue;
  title: string;
  body?: string;
  link?: string;
  /** Makes the notification send-once: a second notify with the same key is skipped. */
  dedupeKey?: string;
}

/**
 * Best-effort, like the realtime push: a failed notification must never roll
 * back or fail the action that triggered it (an approval, a payout, a tip).
 */
export async function notify(userId: string, input: NotifyInput) {
  try {
    await prisma.notification.create({ data: { userId, ...input } });
  } catch (err) {
    // P2002 = dedupeKey already used, i.e. already sent — expected, not an error.
    if (!(err && typeof err === "object" && "code" in err && err.code === "P2002")) {
      console.error("notify failed", err);
    }
  }
}

export async function notifyMany(userIds: string[], input: (userId: string) => NotifyInput) {
  for (const userId of new Set(userIds)) await notify(userId, input(userId));
}

/** Everyone who should hear about a creator's premiere: active subscribers
 * plus holders of an unrevoked backer pass for any of the creator's films. */
export async function creatorSupporterIds(creatorId: string): Promise<string[]> {
  const [subs, passes] = await Promise.all([
    prisma.subscription.findMany({ where: { creatorId, active: true }, select: { fanId: true } }),
    prisma.backerPass.findMany({ where: { revoked: false, campaign: { creatorId } }, select: { userId: true } }),
  ]);
  return [...new Set([...subs.map((s) => s.fanId), ...passes.map((p) => p.userId)])];
}

/** Active backers of one campaign (for milestone and outcome updates). */
export async function campaignBackerIds(campaignId: string): Promise<string[]> {
  const backings = await prisma.backing.findMany({
    where: { campaignId, status: BackingStatus.ACTIVE },
    select: { userId: true },
  });
  return [...new Set(backings.map((b) => b.userId))];
}

/**
 * Sends the "starting in 1 hour" and "starting in 10 minutes" reminders for
 * upcoming premieres. Called from the periodic sweep; the dedupe key (per
 * viewer, episode and window) makes repeated sweeps harmless.
 */
export async function sendPremiereReminders() {
  const now = Date.now();
  const maxWindowMs = Math.max(...NOTIFICATIONS.PREMIERE_REMINDER_MINUTES) * 60_000;
  const upcoming = await prisma.episode.findMany({
    where: {
      status: EpisodeStatus.SCHEDULED,
      premiereAt: { gt: new Date(now), lte: new Date(now + maxWindowMs) },
      OR: [{ premiere: { is: null } }, { premiere: { is: { status: PremiereStatus.SCHEDULED } } }],
    },
    include: { creator: true },
  });

  let queued = 0;
  for (const episode of upcoming) {
    const minutesLeft = (episode.premiereAt!.getTime() - now) / 60_000;
    // The smallest window we're already inside, e.g. 7 min left -> the 10 min reminder.
    const window = [...NOTIFICATIONS.PREMIERE_REMINDER_MINUTES].sort((a, b) => a - b).find((m) => minutesLeft <= m);
    if (!window) continue;
    const recipients = await creatorSupporterIds(episode.creatorId);
    for (const userId of recipients) {
      // Say the real time left: a premiere scheduled 30 minutes out gets its
      // first reminder now (the 1-hour window), and it should say 30 minutes.
      const left = Math.ceil(minutesLeft);
      await notify(userId, {
        type: NotificationType.PREMIERE_REMINDER,
        title: `${episode.title} premieres in ${left >= 55 ? "1 hour" : `${left} minute${left === 1 ? "" : "s"}`}`,
        body: `${episode.creator.channelName} is going live. Supporters watch first.`,
        link: `/premiere/${episode.id}`,
        dedupeKey: `premiere:${episode.id}:${userId}:${window}`,
      });
      queued += 1;
    }
  }
  return queued;
}
