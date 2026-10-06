import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { FreeReason, PAY_PER_MINUTE, WatchSessionStatus } from "@/lib/constants";

/**
 * Stands in for "short-lived signed segment URLs": every poll re-validates
 * that the session is still allowed to keep playing (fresh voucher, or a
 * free/subscriber/backer-pass reason) before handing back the source URL.
 * No real HLS segmentation/DRM — out of scope per the design doc.
 */
export const GET = withApiErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");
  if (!sessionToken) return ok({ error: "sessionToken is required" }, 400);

  const session = await prisma.watchSession.findUnique({ where: { sessionToken } });
  if (!session || session.viewerId !== user.id) throw new ForbiddenError("Not your session");
  if (session.status !== WatchSessionStatus.ACTIVE) {
    return ok({ error: "This session has ended — start a new one" }, 410);
  }

  if (session.freeReason === FreeReason.NONE) {
    const reference = session.lastVoucherAt ?? session.startedAt;
    const ageSeconds = (Date.now() - reference.getTime()) / 1000;
    const allowedGap = PAY_PER_MINUTE.VOUCHER_INTERVAL_SECONDS + 5; // small network-jitter grace
    if (ageSeconds > allowedGap) {
      return ok({ error: "No fresh voucher — playback paused" }, 402);
    }
  }

  const episode = await prisma.episode.findUniqueOrThrow({ where: { id: session.episodeId } });
  return ok({
    url: episode.videoKey,
    expiresInSeconds: PAY_PER_MINUTE.SEGMENT_URL_TTL_SECONDS,
  });
});
