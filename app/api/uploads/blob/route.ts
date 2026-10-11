import { NextRequest, NextResponse } from "next/server";
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { requireCreator } from "@/lib/auth";
import { errorToResponse } from "@/lib/api";
import { blobStorageEnabled, MediaError, MEDIA, mediaContentType, type Kind } from "@/lib/media";

const KIND_BY_FOLDER: Record<string, Kind> = { videos: "video", thumbnails: "thumbnail" };

// Read the env at request time, not once at build time.
export const dynamic = "force-dynamic";

// Stores with a read-write token sign client tokens with it; newer stores
// (id + OIDC, no token) hand out presigned URLs instead.
const uploadMode = () => (process.env.BLOB_READ_WRITE_TOKEN ? "token" : "presigned");

/** Lets the upload widgets choose between direct-to-Blob and the disk routes. */
export async function GET() {
  return NextResponse.json({ enabled: blobStorageEnabled(), mode: blobStorageEnabled() ? uploadMode() : null });
}

/** Only creators, only our own name format, only the matching type and size. */
async function constraintsFor(pathname: string) {
  await requireCreator();
  const [folder, name, ...rest] = pathname.split("/");
  const kind = KIND_BY_FOLDER[folder];
  const contentType = kind && !rest.length ? mediaContentType(kind, name) : null;
  if (!kind || !contentType) throw new MediaError("Unsupported file");
  return {
    allowedContentTypes: [contentType],
    maximumSizeInBytes: kind === "video" ? MEDIA.MAX_VIDEO_BYTES : MEDIA.MAX_THUMBNAIL_BYTES,
  };
}

/**
 * Lets the browser upload a video or thumbnail straight into the private Blob
 * store, so files never pass through a serverless function (Vercel caps those
 * requests at ~4.5 MB). The client picks the name ("videos/<uuid>.mp4").
 */
export async function POST(req: NextRequest) {
  // Without a Blob store (local development), the client uses the disk routes.
  if (!blobStorageEnabled()) return NextResponse.json({ error: "Blob storage isn't configured" }, { status: 404 });

  try {
    const body = await req.json();
    if (uploadMode() === "token") {
      const result = await handleUpload({
        request: req,
        body: body as HandleUploadBody,
        onBeforeGenerateToken: async (pathname) => ({
          access: "private",
          ...(await constraintsFor(pathname)),
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      });
      return NextResponse.json(result);
    }
    const result = await handleUploadPresigned({
      request: req,
      body: body as HandleUploadPresignedBody,
      getSignedToken: async (pathname) => {
        const constraints = await constraintsFor(pathname);
        const token = await issueSignedToken({ pathname, operations: ["put"], ...constraints });
        return { token, urlOptions: { ...constraints, addRandomSuffix: false, allowOverwrite: false } };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorToResponse(err);
  }
}
