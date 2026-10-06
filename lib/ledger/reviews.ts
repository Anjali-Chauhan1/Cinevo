import { prisma } from "@/lib/db";
import { REVIEW, ReviewerBadge } from "@/lib/constants";
import { isActiveSubscriber } from "@/lib/ledger/subscriptions";

export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

async function watchedEnough(userId: string, episodeId: string, durationSeconds: number) {
  const access = await prisma.episodeAccess.findUnique({
    where: { viewerId_episodeId: { viewerId: userId, episodeId } },
  });
  if (!access) return false;
  const required =
    durationSeconds < REVIEW.SHORT_FILM_THRESHOLD_SECONDS
      ? durationSeconds
      : durationSeconds * REVIEW.MIN_WATCH_FRACTION;
  return access.secondsWatched >= required;
}

async function resolveReviewerBadge(userId: string, creatorId: string): Promise<string> {
  const backerPass = await prisma.backerPass.findFirst({
    where: { userId, revoked: false, campaign: { creatorId } },
  });
  if (backerPass) return ReviewerBadge.BACKER;

  const subscribed = await isActiveSubscriber(userId, creatorId);
  if (subscribed) return ReviewerBadge.SUBSCRIBER;

  return ReviewerBadge.VIEWER;
}

export async function submitReview(
  userId: string,
  episodeId: string,
  input: { stars: number; text?: string; tags?: string[] }
) {
  if (input.stars < 1 || input.stars > 5) throw new ReviewError("Stars must be between 1 and 5");
  if (input.text && input.text.length > 300) throw new ReviewError("Reviews are limited to 300 characters");

  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: episodeId } });
  const reviewer = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });

  // A creator (or their own account) reviewing their own film is the
  // simplest, highest-confidence self-boosting case — block it outright.
  if (reviewer.creator?.id === episode.creatorId) {
    throw new ReviewError("You can't review your own film");
  }

  const eligible = await watchedEnough(userId, episodeId, episode.durationSeconds);
  if (!eligible) {
    throw new ReviewError(
      "You need to watch more of this film before reviewing it (50%, or all of it for films under 10 minutes)"
    );
  }

  const badge = await resolveReviewerBadge(userId, episode.creatorId);

  return prisma.review.upsert({
    where: { episodeId_userId: { episodeId, userId } },
    create: {
      episodeId,
      userId,
      stars: input.stars,
      text: input.text,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      reviewerBadge: badge,
    },
    update: {
      stars: input.stars,
      text: input.text,
      tags: input.tags ? JSON.stringify(input.tags) : null,
    },
  });
}

export async function replyToReview(creatorId: string, reviewId: string, reply: string) {
  const review = await prisma.review.findUniqueOrThrow({ where: { id: reviewId }, include: { episode: true } });
  if (review.episode.creatorId !== creatorId) throw new ReviewError("You don't own this film");
  if (reply.length > 500) throw new ReviewError("Replies are limited to 500 characters");
  return prisma.review.update({ where: { id: reviewId }, data: { creatorReply: reply } });
}
