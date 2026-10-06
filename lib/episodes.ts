import { prisma } from "@/lib/db";
import { EpisodeStatus, PremiereStatus } from "@/lib/constants";

/**
 * Release stage is derived lazily from the schedule timestamps rather than
 * flipped by a cron job — any read of an episode first "catches it up" to
 * where it should be right now. SCHEDULED/DRAFT episodes are left alone
 * (publishing is an explicit creator action, not time-driven).
 */
export async function syncEpisodeStatus<
  T extends {
    id: string;
    status: string;
    premiereAt: Date | null;
    earlyAccessUntil: Date | null;
    publicAt: Date | null;
  }
>(episode: T): Promise<T> {
  if (episode.status === EpisodeStatus.DRAFT) return episode;

  const now = new Date();
  let nextStatus = episode.status;

  if (episode.premiereAt && now >= episode.premiereAt) {
    nextStatus = EpisodeStatus.PREMIERING;
  }
  if (episode.earlyAccessUntil && now >= episode.earlyAccessUntil) {
    nextStatus = EpisodeStatus.EARLY_ACCESS;
  }
  if (episode.publicAt && now >= episode.publicAt) {
    nextStatus = EpisodeStatus.PUBLIC;
  }

  if (nextStatus === episode.status) return episode;

  await prisma.episode.update({
    where: { id: episode.id },
    data: { status: nextStatus },
  });

  if (nextStatus === EpisodeStatus.PREMIERING) {
    await prisma.premiere.upsert({
      where: { episodeId: episode.id },
      create: { episodeId: episode.id, startAt: episode.premiereAt!, status: PremiereStatus.LIVE },
      update: { status: PremiereStatus.LIVE },
    });
    await prisma.hypeProgress.upsert({
      where: { episodeId: episode.id },
      create: { episodeId: episode.id },
      update: {},
    });
  }
  if (nextStatus === EpisodeStatus.EARLY_ACCESS || nextStatus === EpisodeStatus.PUBLIC) {
    await prisma.premiere.updateMany({
      where: { episodeId: episode.id, status: PremiereStatus.LIVE },
      data: { status: PremiereStatus.ENDED },
    });
  }

  return { ...episode, status: nextStatus } as T;
}
