import { prisma } from "@/lib/db";
import { POPULARITY_WEIGHTS, EpisodeStatus, PopularityLevel } from "@/lib/constants";

const HALF_LIFE_DAYS = 10;
const NEW_ACCOUNT_RAMP_DAYS = 14;
const CHAT_MESSAGES_PER_ACCOUNT_CAP = 20;

function decayFactor(at: Date, now: Date): number {
  const ageDays = Math.max(0, (now.getTime() - at.getTime()) / 86_400_000);
  return Math.exp((-Math.LN2 * ageDays) / HALF_LIFE_DAYS);
}

function accountAgeWeight(createdAt: Date, now: Date): number {
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  return Math.max(0, Math.min(1, ageDays / NEW_ACCOUNT_RAMP_DAYS));
}

interface RawSignals {
  episodeId: string;
  creatorUserId: string;
  publishedAt: Date;
  watchMinutesDecayed: number;
  completionRate: number;
  verifiedRatingWeighted: number; // 0-5 scale
  uniqueSupporters: number;
  reactionsChatDecayed: number;
}

async function computeRawSignals(now: Date): Promise<RawSignals[]> {
  const episodes = await prisma.episode.findMany({
    where: { status: { in: [EpisodeStatus.PUBLIC, EpisodeStatus.EARLY_ACCESS, EpisodeStatus.PREMIERING] } },
    include: { creator: true },
  });

  const results: RawSignals[] = [];

  for (const episode of episodes) {
    const creatorUserId = episode.creator.userId;

    const accesses = await prisma.episodeAccess.findMany({
      where: { episodeId: episode.id, viewerId: { not: creatorUserId } },
    });
    const watchMinutesDecayed = accesses.reduce(
      (sum, a) => sum + (a.secondsWatched / 60) * decayFactor(a.updatedAt, now),
      0
    );
    const completionRate =
      accesses.length > 0
        ? accesses.reduce(
            (sum, a) => sum + Math.min(1, a.secondsWatched / Math.max(episode.durationSeconds, 1)),
            0
          ) / accesses.length
        : 0;

    const reviews = await prisma.review.findMany({
      where: { episodeId: episode.id },
      include: { user: true },
    });
    let ratingWeightSum = 0;
    let ratingSum = 0;
    for (const r of reviews) {
      const w = accountAgeWeight(r.user.createdAt, now);
      ratingSum += r.stars * w;
      ratingWeightSum += w;
    }
    const verifiedRatingWeighted = ratingWeightSum > 0 ? ratingSum / ratingWeightSum : 0;

    const [tipSupporters, subSupporters, backingSupporters] = await Promise.all([
      prisma.tip.findMany({
        where: { creatorId: episode.creatorId, fanId: { not: creatorUserId } },
        distinct: ["fanId"],
        select: { fanId: true },
      }),
      prisma.subscription.findMany({
        where: { creatorId: episode.creatorId, active: true, fanId: { not: creatorUserId } },
        select: { fanId: true },
      }),
      prisma.backing.findMany({
        where: {
          campaign: { creatorId: episode.creatorId },
          status: "ACTIVE",
          userId: { not: creatorUserId },
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
    ]);
    const uniqueSupporters = new Set([
      ...tipSupporters.map((t) => t.fanId),
      ...subSupporters.map((s) => s.fanId),
      ...backingSupporters.map((b) => b.userId),
    ]).size;

    const hype = await prisma.hypeProgress.findUnique({ where: { episodeId: episode.id } });
    const chatMessages = await prisma.chatMessage.findMany({
      where: { episodeId: episode.id, deleted: false, userId: { not: creatorUserId } },
      select: { userId: true, createdAt: true },
    });
    const perAccountCount = new Map<string, number>();
    let reactionsChatDecayed = hype ? hype.reactionCount * decayFactor(now, now) : 0; // reactions: no per-message timestamp kept, treat as current
    for (const m of chatMessages) {
      const count = perAccountCount.get(m.userId) ?? 0;
      if (count >= CHAT_MESSAGES_PER_ACCOUNT_CAP) continue;
      perAccountCount.set(m.userId, count + 1);
      reactionsChatDecayed += decayFactor(m.createdAt, now);
    }

    results.push({
      episodeId: episode.id,
      creatorUserId,
      publishedAt: episode.publicAt ?? episode.premiereAt ?? episode.createdAt,
      watchMinutesDecayed,
      completionRate,
      verifiedRatingWeighted,
      uniqueSupporters,
      reactionsChatDecayed,
    });
  }

  return results;
}

/** Percentile rank (0-100) of `value` within `all`, highest value -> 100. */
function percentileRank(value: number, all: number[]): number {
  if (all.length <= 1) return value > 0 ? 100 : 0;
  const sorted = [...all].sort((a, b) => a - b);
  const below = sorted.filter((v) => v < value).length;
  return (below / (sorted.length - 1)) * 100;
}

export async function recomputeAllPopularityScores() {
  const now = new Date();
  const raw = await computeRawSignals(now);
  if (raw.length === 0) return [];

  const watchAll = raw.map((r) => r.watchMinutesDecayed);
  const completionAll = raw.map((r) => r.completionRate);
  const ratingAll = raw.map((r) => r.verifiedRatingWeighted);
  const supportersAll = raw.map((r) => r.uniqueSupporters);
  const chatAll = raw.map((r) => r.reactionsChatDecayed);

  const scored = raw.map((r) => {
    const watchScore = percentileRank(r.watchMinutesDecayed, watchAll);
    const completionScore = percentileRank(r.completionRate, completionAll);
    const ratingScore = percentileRank(r.verifiedRatingWeighted, ratingAll);
    const supportersScore = percentileRank(r.uniqueSupporters, supportersAll);
    const chatScore = percentileRank(r.reactionsChatDecayed, chatAll);

    const score =
      watchScore * POPULARITY_WEIGHTS.WATCH_MINUTES +
      completionScore * POPULARITY_WEIGHTS.COMPLETION_RATE +
      ratingScore * POPULARITY_WEIGHTS.VERIFIED_RATING +
      supportersScore * POPULARITY_WEIGHTS.UNIQUE_SUPPORTERS +
      chatScore * POPULARITY_WEIGHTS.REACTIONS_CHAT;

    return { ...r, score, breakdown: { watchScore, completionScore, ratingScore, supportersScore, chatScore } };
  });

  const scoresOnly = scored.map((s) => s.score);
  const ageDays = (publishedAt: Date) => (now.getTime() - publishedAt.getTime()) / 86_400_000;

  const results = [];
  for (const s of scored) {
    const overallPercentile = percentileRank(s.score, scoresOnly);
    const isNew = ageDays(s.publishedAt) <= 14;
    const reviewCount = await prisma.review.count({ where: { episodeId: s.episodeId } });
    const avgRating = s.verifiedRatingWeighted;

    let level: string = PopularityLevel.NONE;
    if (avgRating >= 4.5 && reviewCount >= 3) level = PopularityLevel.FAN_FAVOURITE;
    else if (overallPercentile >= 90) level = PopularityLevel.TRENDING;
    else if (overallPercentile >= 70) level = PopularityLevel.HOT;
    else if (isNew && overallPercentile >= 40) level = PopularityLevel.RISING;

    const saved = await prisma.popularityScore.upsert({
      where: { episodeId: s.episodeId },
      create: {
        episodeId: s.episodeId,
        score: s.score,
        level,
        breakdown: JSON.stringify(s.breakdown),
      },
      update: { score: s.score, level, breakdown: JSON.stringify(s.breakdown), computedAt: now },
    });
    results.push(saved);
  }

  return results;
}
