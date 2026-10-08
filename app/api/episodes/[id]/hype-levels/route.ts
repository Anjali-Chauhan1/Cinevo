import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { hypeLevelsSchema, rupeesToPaiseInt } from "@/lib/validation";
import { EpisodeStatus } from "@/lib/constants";

/**
 * Replaces the premiere's hype bar levels. Levels unlock in order, so each
 * goal must be bigger than the one before it (of the same type). Locked once
 * the premiere starts — fans are already filling the bar by then.
 */
export const PUT = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: params.id } });
  if (episode.creatorId !== creator.id) throw new ForbiddenError("You don't own this episode");
  if (episode.status !== EpisodeStatus.DRAFT && episode.status !== EpisodeStatus.SCHEDULED) {
    return ok({ error: "Hype levels are locked once the premiere has started" }, 400);
  }

  const { levels } = hypeLevelsSchema.parse(await req.json());
  const rows = levels.map((l, i) => ({
    episodeId: episode.id,
    level: i + 1,
    goalType: l.goalType,
    goalValue: l.goalType === "TIPS" ? rupeesToPaiseInt(l.goalValue) : Math.round(l.goalValue),
    unlockTitle: l.unlockTitle,
    unlockAssetUrl: l.unlockAssetUrl || null,
  }));
  for (let i = 1; i < rows.length; i++) {
    const previous = rows.slice(0, i).reverse().find((r) => r.goalType === rows[i].goalType);
    if (previous && rows[i].goalValue <= previous.goalValue) {
      return ok({ error: `Level ${i + 1} needs a bigger goal than level ${previous.level}` }, 400);
    }
  }

  const hypeLevels = await prisma.$transaction(async (tx) => {
    await tx.hypeLevel.deleteMany({ where: { episodeId: episode.id } });
    if (rows.length > 0) await tx.hypeLevel.createMany({ data: rows });
    return tx.hypeLevel.findMany({ where: { episodeId: episode.id }, orderBy: { level: "asc" } });
  });
  return ok({ hypeLevels });
});
