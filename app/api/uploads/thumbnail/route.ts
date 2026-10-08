import { NextRequest } from "next/server";
import type { ReadableStream as WebReadableStream } from "stream/web";
import { requireCreator } from "@/lib/auth";
import { ok, withApiErrors } from "@/lib/api";
import { MEDIA, saveUpload } from "@/lib/media";

export const POST = withApiErrors(async (req: NextRequest) => {
  await requireCreator();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MEDIA.MAX_THUMBNAIL_BYTES) return ok({ error: "Thumbnails must be under 5 MB" }, 413);
  const name = await saveUpload(req.body as WebReadableStream<Uint8Array> | null, "thumbnail");
  return ok({ thumbnailUrl: `/api/media/thumbnails/${name}` }, 201);
});
