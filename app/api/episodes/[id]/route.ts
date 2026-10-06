import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireCreator, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { syncEpisodeStatus } from "@/lib/episodes";
import { isActiveSubscriber } from "@/lib/ledger/subscriptions";
import { isModerator } from "@/lib/chat";
import { EpisodeStatus } from "@/lib/constants";

export const GET = withApiErrors(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { id } = params;
  let episode = await prisma.episode.findUnique({ where: { id }, include: { creator: true } });
  if (!episode) return ok({ error: "Not found" }, 404);
  episode = { ...(await syncEpisodeStatus(episode)), creator: episode.creator };

  const [popularity, reviews, hypeLevels, hypeProgress] = await Promise.all([
    prisma.popularityScore.findUnique({ where: { episodeId: id } }),
    prisma.review.findMany({
      where: { episodeId: id },
      include: { user: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.hypeLevel.findMany({ where: { episodeId: id }, orderBy: { level: "asc" } }),
    prisma.hypeProgress.findUnique({ where: { episodeId: id } }),
  ]);

  const viewer = await getCurrentUser();
  let viewerState: Record<string, unknown> = { signedIn: false };
  if (viewer) {
    const access = await prisma.episodeAccess.findUnique({
      where: { viewerId_episodeId: { viewerId: viewer.id, episodeId: id } },
    });
    const activeSession = await prisma.watchSession.findFirst({
      where: { viewerId: viewer.id, episodeId: id, status: "ACTIVE" },
    });
    const subscribed = await isActiveSubscriber(viewer.id, episode.creatorId);
    const backerPass = await prisma.backerPass.findFirst({
      where: { userId: viewer.id, revoked: false, campaign: { creatorId: episode.creatorId } },
    });
    const myReview = await prisma.review.findUnique({ where: { episodeId_userId: { episodeId: id, userId: viewer.id } } });

    viewerState = {
      signedIn: true,
      isOwner: viewer.id === episode.creator.userId,
      isModerator: await isModerator(viewer.id, episode.creatorId),
      isSubscribed: subscribed,
      hasBackerPass: !!backerPass,
      totalPaidPaise: access?.totalPaidPaise ?? 0,
      capReached: access?.capReached ?? false,
      secondsWatched: access?.secondsWatched ?? 0,
      activeSessionToken: activeSession?.sessionToken ?? null,
      myReview,
    };
  }

  return ok(
    toJSONSafe({ episode, popularity, reviews, hypeLevels, hypeProgress, viewerState })
  );
});

const updateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  thumbnailUrl: z.string().optional(),
  premiereAt: z.string().datetime().optional(),
  earlyAccessUntil: z.string().datetime().optional(),
  publicAt: z.string().datetime().optional(),
});

export const PATCH = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const { id } = params;
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id } });
  if (episode.creatorId !== creator.id) throw new ForbiddenError("You don't own this episode");

  const body = updateSchema.parse(await req.json());

  // Once an episode has left DRAFT, its schedule is visible to subscribers
  // and backers (reminders may already be queued against it) — lock the
  // premiere date specifically so a bait-and-switch can't happen after
  // people have been told when to show up.
  if (episode.status !== EpisodeStatus.DRAFT && body.premiereAt) {
    return ok({ error: "Premiere date is locked once the episode is scheduled" }, 400);
  }

  const updated = await prisma.episode.update({
    where: { id },
    data: {
      title: body.title,
      description: body.description,
      thumbnailUrl: body.thumbnailUrl,
      premiereAt: body.premiereAt ? new Date(body.premiereAt) : undefined,
      earlyAccessUntil: body.earlyAccessUntil ? new Date(body.earlyAccessUntil) : undefined,
      publicAt: body.publicAt ? new Date(body.publicAt) : undefined,
      status:
        episode.status === EpisodeStatus.DRAFT && body.premiereAt ? EpisodeStatus.SCHEDULED : undefined,
    },
  });

  return ok({ episode: updated });
});
