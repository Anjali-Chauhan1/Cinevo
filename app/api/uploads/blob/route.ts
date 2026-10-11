import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireCreator } from "@/lib/auth";
import { errorToResponse } from "@/lib/api";
import { blobStorageEnabled, MediaError, MEDIA, mediaContentType, type Kind } from "@/lib/media";

const KIND_BY_FOLDER: Record<string, Kind> = { videos: "video", thumbnails: "thumbnail" };

// Read the env at request time, not once at build time.
export const dynamic = "force-dynamic";

/** Lets the upload widgets choose between direct-to-Blob and the disk routes. */
export async function GET() {
  return NextResponse.json({ enabled: blobStorageEnabled() });
}

/**
 * Issues one-time tokens for the browser to upload a video or thumbnail
 * straight into the private Blob store, so files never pass through a
 * serverless function (Vercel caps those requests at ~4.5 MB). The client
 * picks the name ("videos/<uuid>.mp4"); we only allow our own name format,
 * the matching content type and size, and never overwriting.
 */
export async function POST(req: NextRequest) {
  // Without a Blob store (local development), the client falls back to the
  // streaming routes that write to disk.
  if (!blobStorageEnabled()) return NextResponse.json({ error: "Blob storage isn't configured" }, { status: 404 });

  try {
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        await requireCreator();
        const [folder, name, ...rest] = pathname.split("/");
        const kind = KIND_BY_FOLDER[folder];
        const contentType = kind && !rest.length ? mediaContentType(kind, name) : null;
        if (!kind || !contentType) throw new MediaError("Unsupported file");
        return {
          access: "private",
          allowedContentTypes: [contentType],
          maximumSizeInBytes: kind === "video" ? MEDIA.MAX_VIDEO_BYTES : MEDIA.MAX_THUMBNAIL_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
