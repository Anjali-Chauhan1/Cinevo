import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, ForbiddenError } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { PAY_PER_MINUTE, WatchSessionStatus } from "@/lib/constants";
import { fileResponse, isUploadedVideoKey, MEDIA, resolveMediaFile } from "@/lib/media";

/**
 * Streams an uploaded episode's video, and only while the viewer holds a
 * live watch session: it must be theirs, still open, and kept alive by the
 * player's heartbeat (which for paid sessions carries the latest voucher).
 * Stop paying or close the session and the next byte-range request fails,
 * which is what pauses playback. The video file's own URL is never exposed.
 */
export const GET = withApiErrors(async (req: NextRequest, { params }: { params: { sessionToken: string } }) => {
  const user = await requireUser();
  const session = await prisma.watchSession.findUnique({
    where: { sessionToken: params.sessionToken },
    include: { episode: { select: { videoKey: true } } },
  });
  if (!session || session.viewerId !== user.id) throw new ForbiddenError("Not your session");
  if (session.status !== WatchSessionStatus.ACTIVE) {
    return ok({ error: "This session has ended — press play to start again" }, 410);
  }
  const lastSeen = (session.lastVoucherAt ?? session.startedAt).getTime();
  if (Date.now() - lastSeen > PAY_PER_MINUTE.STREAM_HEARTBEAT_GRACE_SECONDS * 1000) {
    return ok({ error: "Playback paused — no recent heartbeat" }, 402);
  }
  if (!isUploadedVideoKey(session.episode.videoKey)) return ok({ error: "Not found" }, 404);

  const file = await resolveMediaFile("video", session.episode.videoKey.slice(MEDIA.UPLOAD_PREFIX.length));
  return fileResponse(file, req.headers.get("range"), "private, no-store");
});
