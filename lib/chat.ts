import { prisma } from "@/lib/db";
import { CHAT, ChatMessageType, ChatActionType } from "@/lib/constants";
import { isActiveSubscriber } from "@/lib/ledger/subscriptions";

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

export async function isModerator(userId: string, creatorId: string): Promise<boolean> {
  const creator = await prisma.creator.findUnique({ where: { id: creatorId } });
  if (creator?.userId === userId) return true;
  const assignment = await prisma.moderatorAssignment.findUnique({
    where: { creatorId_userId: { creatorId, userId } },
  });
  return !!assignment;
}

async function activeBanOrTimeout(episodeId: string, userId: string): Promise<string | null> {
  const actions = await prisma.chatAction.findMany({
    where: { episodeId, targetUserId: userId, action: { in: [ChatActionType.BAN, ChatActionType.TIMEOUT] } },
    orderBy: { createdAt: "desc" },
  });
  for (const a of actions) {
    if (a.action === ChatActionType.BAN) return "You are banned from this chat";
    if (a.action === ChatActionType.TIMEOUT && a.expiresAt && a.expiresAt > new Date()) {
      return `You are timed out until ${a.expiresAt.toISOString()}`;
    }
  }
  return null;
}

async function computeBadges(userId: string, creatorId: string) {
  const sub = await prisma.subscription.findUnique({ where: { fanId_creatorId: { fanId: userId, creatorId } } });
  const subscriberMonths = sub?.active
    ? Math.max(1, Math.floor((Date.now() - sub.startedAt.getTime()) / (30 * 86_400_000)))
    : 0;

  const pass = await prisma.backerPass.findFirst({
    where: { userId, revoked: false, campaign: { creatorId } },
  });

  const isSubscribed = sub ? await isActiveSubscriber(userId, creatorId) : false;

  return {
    subscriberMonths: isSubscribed ? subscriberMonths : 0,
    backerTier: pass?.tierName ?? null,
    verified: !isSubscribed && !pass, // "verified viewer" = signed-in, non-subscriber/backer baseline badge
  };
}

export async function postMessage(userId: string, episodeId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new ChatError("Message can't be empty");
  if (trimmed.length > 500) throw new ChatError("Message is too long");

  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });

  const blocked = await activeBanOrTimeout(episodeId, userId);
  if (blocked) throw new ChatError(blocked);

  // Rate limit: cap messages per rolling 10s window per user.
  const windowStart = new Date(Date.now() - 10_000);
  const recentCount = await prisma.chatMessage.count({
    where: { episodeId, userId, createdAt: { gte: windowStart } },
  });
  if (recentCount >= CHAT.DEFAULT_RATE_LIMIT_PER_10S) {
    throw new ChatError("You're sending messages too fast — slow down");
  }

  const premiere = await prisma.premiere.findUnique({ where: { episodeId } });
  if (premiere && premiere.slowModeSeconds > 0) {
    const lastMessage = await prisma.chatMessage.findFirst({
      where: { episodeId, userId },
      orderBy: { createdAt: "desc" },
    });
    if (lastMessage) {
      const elapsed = (Date.now() - lastMessage.createdAt.getTime()) / 1000;
      if (elapsed < premiere.slowModeSeconds) {
        throw new ChatError(`Slow mode is on — wait ${Math.ceil(premiere.slowModeSeconds - elapsed)}s`);
      }
    }
  }

  const badges = await computeBadges(userId, episode.creatorId);

  return prisma.chatMessage.create({
    data: {
      episodeId,
      userId,
      text: trimmed,
      type: ChatMessageType.MESSAGE,
      badges: JSON.stringify(badges),
    },
  });
}

export async function postTipHighlight(episodeId: string, userId: string, amountPaise: number, message?: string) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  const badges = await computeBadges(userId, episode.creatorId);
  return prisma.chatMessage.create({
    data: {
      episodeId,
      userId,
      text: message?.trim() || "",
      type: ChatMessageType.TIP_HIGHLIGHT,
      tipAmountPaise: amountPaise,
      pinned: true,
      badges: JSON.stringify(badges),
    },
  });
}

export async function deleteMessage(moderatorId: string, messageId: string, reason?: string) {
  const message = await prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: message.episodeId } });
  if (!(await isModerator(moderatorId, episode.creatorId))) {
    throw new ChatError("You don't have moderator permissions here");
  }
  await prisma.chatAction.create({
    data: {
      episodeId: message.episodeId,
      moderatorId,
      targetUserId: message.userId,
      action: ChatActionType.DELETE,
      reason,
    },
  });
  return prisma.chatMessage.update({ where: { id: messageId }, data: { deleted: true } });
}

/** Moderators can act on viewers, but never on the creator, another
 * moderator, or themselves. */
async function assertCanModerate(moderatorId: string, creatorId: string, targetUserId: string) {
  if (!(await isModerator(moderatorId, creatorId))) {
    throw new ChatError("You don't have moderator permissions here");
  }
  if (targetUserId === moderatorId) throw new ChatError("You can't moderate yourself");
  if (await isModerator(targetUserId, creatorId)) {
    throw new ChatError("The creator and moderators can't be timed out or banned");
  }
}

/** Timeouts and bans also clear the person's messages from this premiere,
 * like on Twitch. Returns the ids so live clients can remove them too. */
async function clearMessagesFrom(episodeId: string, userId: string) {
  const messages = await prisma.chatMessage.findMany({
    where: { episodeId, userId, deleted: false },
    select: { id: true },
  });
  await prisma.chatMessage.updateMany({ where: { episodeId, userId }, data: { deleted: true } });
  return messages.map((m) => m.id);
}

export async function timeoutUser(
  moderatorId: string,
  episodeId: string,
  targetUserId: string,
  minutes: number,
  reason?: string
) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  await assertCanModerate(moderatorId, episode.creatorId, targetUserId);
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const action = await prisma.chatAction.create({
    data: { episodeId, moderatorId, targetUserId, action: ChatActionType.TIMEOUT, reason, expiresAt },
  });
  return { action, clearedMessageIds: await clearMessagesFrom(episodeId, targetUserId) };
}

export async function banUser(moderatorId: string, episodeId: string, targetUserId: string, reason?: string) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  await assertCanModerate(moderatorId, episode.creatorId, targetUserId);
  const action = await prisma.chatAction.create({
    data: { episodeId, moderatorId, targetUserId, action: ChatActionType.BAN, reason },
  });
  return { action, clearedMessageIds: await clearMessagesFrom(episodeId, targetUserId) };
}

export async function setSlowMode(moderatorId: string, episodeId: string, seconds: number) {
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  if (!(await isModerator(moderatorId, episode.creatorId))) {
    throw new ChatError("You don't have moderator permissions here");
  }
  await prisma.premiere.upsert({
    where: { episodeId },
    create: { episodeId, startAt: new Date(), slowModeSeconds: seconds },
    update: { slowModeSeconds: seconds },
  });
  await prisma.chatAction.create({
    data: {
      episodeId,
      moderatorId,
      targetUserId: moderatorId,
      action: seconds > 0 ? ChatActionType.SLOW_MODE_ON : ChatActionType.SLOW_MODE_OFF,
    },
  });
}
