import { prisma } from "@/lib/db";

/** Max reactions from a single account that ever count toward the shared bar. */
const MAX_REACTIONS_PER_ACCOUNT = 50;

export async function registerReaction(episodeId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const tally = await tx.episodeReactionCount.upsert({
      where: { episodeId_userId: { episodeId, userId } },
      create: { episodeId, userId, count: 1 },
      update: { count: { increment: 1 } },
    });

    if (tally.count > MAX_REACTIONS_PER_ACCOUNT) {
      // Over this account's cap — the reaction still plays locally for the
      // sender (handled client-side) but no longer moves the shared bar.
      return { counted: false, progress: await tx.hypeProgress.findUnique({ where: { episodeId } }) };
    }

    const progress = await tx.hypeProgress.upsert({
      where: { episodeId },
      create: { episodeId, reactionCount: 1 },
      update: { reactionCount: { increment: 1 } },
    });

    return { counted: true, progress, newLevel: await maybeAdvanceLevel(tx, episodeId, progress) };
  });
}

export async function addTipToHypeBar(episodeId: string, amountPaise: number) {
  return prisma.$transaction(async (tx) => {
    const progress = await tx.hypeProgress.upsert({
      where: { episodeId },
      create: { episodeId, tipTotalPaise: amountPaise },
      update: { tipTotalPaise: { increment: amountPaise } },
    });
    return { progress, newLevel: await maybeAdvanceLevel(tx, episodeId, progress) };
  });
}

async function maybeAdvanceLevel(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  episodeId: string,
  progress: { tipTotalPaise: number; reactionCount: number; lastLevelReached: number }
) {
  const levels = await tx.hypeLevel.findMany({
    where: { episodeId, level: { gt: progress.lastLevelReached } },
    orderBy: { level: "asc" },
  });

  let newlyReached: { level: number; unlockTitle: string } | null = null;

  for (const level of levels) {
    const goalMet =
      level.goalType === "TIPS"
        ? progress.tipTotalPaise >= level.goalValue
        : progress.reactionCount >= level.goalValue;
    if (!goalMet) break; // levels unlock in order

    await tx.hypeLevel.update({ where: { id: level.id }, data: { reachedAt: new Date() } });
    await tx.hypeProgress.update({ where: { episodeId }, data: { lastLevelReached: level.level } });
    newlyReached = { level: level.level, unlockTitle: level.unlockTitle };
  }

  return newlyReached;
}
