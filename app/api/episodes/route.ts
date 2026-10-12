import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireCreator, ForbiddenError } from "@/lib/auth";
import { episodeCreateSchema, dollarsToCents } from "@/lib/validation";
import { ok, withApiErrors } from "@/lib/api";
import { EpisodeStatus, VerificationStatus, PAY_PER_MINUTE } from "@/lib/constants";
import { assertValidVideoKey } from "@/lib/media";
import { isOnchain } from "@/lib/chain/config";
import { syncEpisodeOnchain } from "@/lib/chain/operator";

export const POST = withApiErrors(async (req: NextRequest) => {
  const { creator } = await requireCreator();
  if (creator.verificationStatus !== VerificationStatus.APPROVED) {
    throw new ForbiddenError("Your channel must be verified before publishing episodes");
  }

  const body = episodeCreateSchema.parse(await req.json());
  await assertValidVideoKey(body.videoKey);

  if (body.isPaid) {
    const rateP = dollarsToCents(body.rateDollars!);
    if (rateP < PAY_PER_MINUTE.MIN_RATE_CENTS || rateP > PAY_PER_MINUTE.MAX_RATE_CENTS) {
      return ok(
        { error: `Rate must be between $${PAY_PER_MINUTE.MIN_RATE_CENTS / 100} and $${PAY_PER_MINUTE.MAX_RATE_CENTS / 100} per minute` },
        400
      );
    }
  }

  const premiereAt = body.premiereAt ? new Date(body.premiereAt) : undefined;
  const earlyAccessUntil = body.earlyAccessUntil ? new Date(body.earlyAccessUntil) : undefined;
  const publicAt = body.publicAt ? new Date(body.publicAt) : undefined;

  if (premiereAt && earlyAccessUntil && earlyAccessUntil < premiereAt) {
    return ok({ error: "Early access window must end after the premiere" }, 400);
  }
  if (earlyAccessUntil && publicAt && publicAt < earlyAccessUntil) {
    return ok({ error: "Public release must be on or after early access ends" }, 400);
  }

  const episode = await prisma.episode.create({
    data: {
      creatorId: creator.id,
      title: body.title,
      description: body.description,
      videoKey: body.videoKey,
      thumbnailUrl: body.thumbnailUrl,
      durationSeconds: body.durationSeconds,
      castCredits: body.castCredits ? JSON.stringify(body.castCredits) : null,
      isPaid: body.isPaid,
      rateCents: body.isPaid ? dollarsToCents(body.rateDollars!) : 0,
      previewSeconds: body.previewSeconds ?? PAY_PER_MINUTE.DEFAULT_PREVIEW_SECONDS,
      capCents: body.isPaid ? dollarsToCents(body.capDollars ?? 2) : 0,
      premiereAt,
      earlyAccessUntil,
      publicAt,
      status: premiereAt ? EpisodeStatus.SCHEDULED : EpisodeStatus.DRAFT,
    },
  });

  if (isOnchain && episode.status !== EpisodeStatus.DRAFT) await syncEpisodeOnchain(episode.id);
  return ok({ episode }, 201);
});
