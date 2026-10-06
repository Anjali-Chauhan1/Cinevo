import { prisma } from "@/lib/db";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";

export const GET = withApiErrors(async (_req: Request, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const { id } = params;
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id } });
  if (episode.creatorId !== creator.id) throw new ForbiddenError("You don't own this episode");

  const accesses = await prisma.episodeAccess.findMany({ where: { episodeId: id } });
  const totalViewers = accesses.length;

  const buckets = Array.from({ length: 10 }, (_, i) => {
    const decile = i + 1;
    const thresholdSeconds = (episode.durationSeconds * decile) / 10;
    const retained = accesses.filter((a) => a.secondsWatched >= thresholdSeconds).length;
    return {
      decile,
      retainedViewers: retained,
      retainedPercent: totalViewers > 0 ? Math.round((retained / totalViewers) * 100) : 0,
    };
  });

  return ok({ totalViewers, buckets });
});
