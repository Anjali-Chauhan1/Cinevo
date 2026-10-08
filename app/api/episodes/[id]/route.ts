import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireCreator, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { toJSONSafe } from "@/lib/serialize";
import { syncEpisodeStatus } from "@/lib/episodes";
import { isActiveSubscriber } from "@/lib/ledger/subscriptions";
import { isModerator } from "@/lib/chat";
import { BackingStatus, BackingType, EpisodeStatus, PAY_PER_MINUTE, VerificationStatus } from "@/lib/constants";
import { episodeUpdateSchema, rupeesToPaiseInt } from "@/lib/validation";
import { assertValidVideoKey } from "@/lib/media";
import { isOnchain } from "@/lib/chain/config";
import { syncEpisodeOnchain } from "@/lib/chain/operator";

export const GET = withApiErrors(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const { id } = params;
  let episode = await prisma.episode.findUnique({
    where: { id },
    include: { creator: { include: { user: { select: { walletAddress: true } } } } },
  });
  if (!episode) return ok({ error: "Not found" }, 404);
  episode = { ...(await syncEpisodeStatus(episode)), creator: episode.creator };

  const [popularity, reviews, hypeLevels, hypeProgress, fundingCampaign, premiere] = await Promise.all([
    prisma.popularityScore.findUnique({ where: { episodeId: id } }),
    prisma.review.findMany({
      where: { episodeId: id },
      include: { user: { select: { displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.hypeLevel.findMany({ where: { episodeId: id }, orderBy: { level: "asc" } }),
    prisma.hypeProgress.findUnique({ where: { episodeId: id } }),
    prisma.campaign.findUnique({
      where: { fundedEpisodeId: id },
      select: {
        filmTitle: true,
        backings: {
          where: { status: BackingStatus.ACTIVE, type: BackingType.PERK },
          select: { user: { select: { displayName: true } }, tier: { select: { name: true, pricePaise: true } } },
        },
      },
    }),
    prisma.premiere.findUnique({ where: { episodeId: id }, select: { slowModeSeconds: true } }),
  ]);

  // "Funders' names show in the credits": backers of the campaign that funded
  // this film, grouped by tier, biggest tier first.
  const tiers = new Map<string, { tier: string; pricePaise: number; names: Set<string> }>();
  for (const b of fundingCampaign?.backings ?? []) {
    if (!b.tier) continue;
    const entry = tiers.get(b.tier.name) ?? { tier: b.tier.name, pricePaise: b.tier.pricePaise, names: new Set<string>() };
    entry.names.add(b.user.displayName);
    tiers.set(b.tier.name, entry);
  }
  const backerCredits = [...tiers.values()]
    .sort((a, b) => b.pricePaise - a.pricePaise)
    .map((t) => ({ tier: t.tier, names: [...t.names].sort() }));

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
    toJSONSafe({
      episode,
      popularity,
      reviews,
      hypeLevels,
      hypeProgress,
      backerCredits,
      slowModeSeconds: premiere?.slowModeSeconds ?? 0,
      creatorWallet: episode.creator.user.walletAddress,
      viewerState,
    })
  );
});

export const PATCH = withApiErrors(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const { creator } = await requireCreator();
  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: params.id } });
  if (episode.creatorId !== creator.id) throw new ForbiddenError("You don't own this episode");

  const body = episodeUpdateSchema.parse(await req.json());
  const videoChanged = body.videoKey !== undefined && body.videoKey !== episode.videoKey;
  if (videoChanged) {
    await assertValidVideoKey(body.videoKey!);
    if (!body.durationSeconds) return ok({ error: "Send the new video's duration" }, 400);
  }
  const isDraft = episode.status === EpisodeStatus.DRAFT;
  const fail = (error: string) => ok({ error }, 400);

  // --- Pricing (the creator can switch pay-per-minute on or off at any time;
  // sessions already running keep the price they started with).
  const isPaid = body.isPaid ?? episode.isPaid;
  const rateRupeesPaise = body.rateRupees !== undefined ? rupeesToPaiseInt(body.rateRupees) : episode.rateRupeesPaise;
  const capRupeesPaise = body.capRupees !== undefined ? rupeesToPaiseInt(body.capRupees) : episode.capRupeesPaise;
  if (isPaid) {
    if (rateRupeesPaise < PAY_PER_MINUTE.MIN_RATE_PAISE || rateRupeesPaise > PAY_PER_MINUTE.MAX_RATE_PAISE) {
      return fail(`Rate must be between ₹${PAY_PER_MINUTE.MIN_RATE_PAISE / 100} and ₹${PAY_PER_MINUTE.MAX_RATE_PAISE / 100} per minute`);
    }
    if (capRupeesPaise <= 0) return fail("Set a price cap for paid episodes");
  }

  // --- Schedule. Once an episode has left DRAFT its premiere time has been
  // announced (reminders may have gone out), so it can't be moved.
  const toDate = (v: string | null | undefined, current: Date | null) =>
    v === undefined ? current : v === null ? null : new Date(v);
  let premiereAt = toDate(body.premiereAt, episode.premiereAt);
  let earlyAccessUntil = toDate(body.earlyAccessUntil, episode.earlyAccessUntil);
  let publicAt = toDate(body.publicAt, episode.publicAt);
  if (!isDraft && body.premiereAt !== undefined && premiereAt?.getTime() !== episode.premiereAt?.getTime()) {
    return fail("The premiere time is locked once the episode is scheduled");
  }

  let status: string | undefined;
  if (body.publish) {
    if (!isDraft) return fail("This episode is already published");
    if (creator.verificationStatus !== VerificationStatus.APPROVED) {
      throw new ForbiddenError("Your channel must be verified before publishing episodes");
    }
    if (body.publish === "NOW") {
      status = EpisodeStatus.PUBLIC;
      premiereAt = null;
      earlyAccessUntil = null;
      publicAt = new Date();
    } else {
      if (!premiereAt || !earlyAccessUntil || !publicAt) {
        return fail("Set the premiere time, the end of early access and the public release date");
      }
      if (premiereAt <= new Date()) return fail("Pick a premiere time in the future");
      status = EpisodeStatus.SCHEDULED;
    }
  }
  if (premiereAt && earlyAccessUntil && earlyAccessUntil < premiereAt) {
    return fail("Early access must end after the premiere");
  }
  if (earlyAccessUntil && publicAt && publicAt < earlyAccessUntil) {
    return fail("Public release must be on or after the end of early access");
  }

  const updated = await prisma.episode.update({
    where: { id: episode.id },
    data: {
      title: body.title,
      description: body.description,
      thumbnailUrl: body.thumbnailUrl,
      castCredits: body.castCredits ? JSON.stringify(body.castCredits) : undefined,
      isPaid,
      rateRupeesPaise: isPaid ? rateRupeesPaise : episode.rateRupeesPaise,
      capRupeesPaise: isPaid ? capRupeesPaise : episode.capRupeesPaise,
      previewSeconds: body.previewSeconds,
      videoKey: videoChanged ? body.videoKey : undefined,
      durationSeconds: videoChanged ? body.durationSeconds : undefined,
      // Bumped on replacement so drop-off analytics can tell old cuts from new.
      videoVersion: videoChanged ? { increment: 1 } : undefined,
      premiereAt,
      earlyAccessUntil,
      publicAt,
      status,
    },
  });

  // Onchain mode: once published, the episode and its pricing live in the registry.
  if (isOnchain && updated.status !== EpisodeStatus.DRAFT) await syncEpisodeOnchain(updated.id);
  return ok({ episode: updated });
});
