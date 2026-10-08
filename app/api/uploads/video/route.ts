import { NextRequest } from "next/server";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { MEDIA, saveUpload } from "@/lib/media";

/** Raw-body upload (not multipart) so the file streams to disk as it arrives. */
export const POST = withApiErrors(async (req: NextRequest) => {
  await requireCreator();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MEDIA.MAX_VIDEO_BYTES) return ok({ error: "Videos must be under 1 GB" }, 413);
  const name = await saveUpload(req.body as WebReadableStream<Uint8Array> | null, "video");
  return ok({ videoKey: `${MEDIA.UPLOAD_PREFIX}${name}` }, 201);
});
