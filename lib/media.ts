import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, rename, rm, stat } from "fs/promises";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export const MEDIA = {
  MAX_VIDEO_BYTES: 1024 * 1024 * 1024, // 1 GB
  MAX_THUMBNAIL_BYTES: 5 * 1024 * 1024, // 5 MB
  // Prefix marking an episode's videoKey as a file we host (vs a legacy URL).
  UPLOAD_PREFIX: "upload:",
} as const;

// Outside public/: videos are only served through the session-checked route,
// thumbnails through their own route (Next doesn't serve files added to
// public/ after a production build).
const STORAGE_ROOT = path.join(process.cwd(), "storage");
const DIRS = { video: path.join(STORAGE_ROOT, "videos"), thumbnail: path.join(STORAGE_ROOT, "thumbnails") };

type Kind = keyof typeof DIRS;

interface FileType {
  ext: string;
  contentType: string;
  matches: (head: Buffer) => boolean;
}

const startsWith = (head: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const TYPES: Record<Kind, FileType[]> = {
  video: [
    // MP4 and MOV both carry an "ftyp" box at byte 4.
    { ext: "mp4", contentType: "video/mp4", matches: (h) => startsWith(h, ascii("ftyp"), 4) && !startsWith(h, ascii("qt  "), 8) },
    { ext: "mov", contentType: "video/quicktime", matches: (h) => startsWith(h, ascii("ftypqt  "), 4) },
    { ext: "webm", contentType: "video/webm", matches: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]) },
  ],
  thumbnail: [
    { ext: "jpg", contentType: "image/jpeg", matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
    { ext: "png", contentType: "image/png", matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]) },
    { ext: "webp", contentType: "image/webp", matches: (h) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8) },
  ],
};

const FILE_NAME = /^[0-9a-f-]{36}\.(mp4|mov|webm|jpg|png|webp)$/;

/**
 * Streams an upload straight to disk (never buffering a whole video in
 * memory), enforcing the size limit as bytes arrive and identifying the file
 * from its first bytes rather than trusting the client's Content-Type.
 * Returns the stored file name.
 */
export async function saveUpload(body: WebReadableStream<Uint8Array> | null, kind: Kind): Promise<string> {
  if (!body) throw new MediaError("No file was sent");
  const maxBytes = kind === "video" ? MEDIA.MAX_VIDEO_BYTES : MEDIA.MAX_THUMBNAIL_BYTES;
  await mkdir(DIRS[kind], { recursive: true });
  const tmpPath = path.join(DIRS[kind], `${randomUUID()}.part`);

  let received = 0;
  let head = Buffer.alloc(0);
  let type: FileType | undefined;
  const guard = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length;
      if (received > maxBytes) return done(new MediaError(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`));
      if (!type && head.length < 16) {
        head = Buffer.concat([head, chunk]).subarray(0, 16);
        if (head.length >= 12) {
          type = TYPES[kind].find((t) => t.matches(head));
          if (!type) {
            return done(new MediaError(kind === "video" ? "Upload an MP4, MOV or WebM video" : "Upload a JPG, PNG or WebP image"));
          }
        }
      }
      done(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body), guard, createWriteStream(tmpPath));
    if (!type) throw new MediaError("The file is empty or too small");
    const name = `${randomUUID()}.${type.ext}`;
    await rename(tmpPath, path.join(DIRS[kind], name));
    return name;
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

export function isUploadedVideoKey(videoKey: string) {
  return videoKey.startsWith(MEDIA.UPLOAD_PREFIX);
}

/** Checks a videoKey sent by the client: either one of our uploads that
 * actually exists, or a legacy http(s) URL. */
export async function assertValidVideoKey(videoKey: string) {
  if (isUploadedVideoKey(videoKey)) {
    await resolveMediaFile("video", videoKey.slice(MEDIA.UPLOAD_PREFIX.length));
    return;
  }
  if (!/^https?:\/\//.test(videoKey)) throw new MediaError("Upload a video file");
}

/** Path, size and content type for a stored file; throws if it doesn't exist. */
export async function resolveMediaFile(kind: Kind, name: string) {
  if (!FILE_NAME.test(name)) throw new MediaError("Unknown file");
  const filePath = path.join(DIRS[kind], name);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) throw new MediaError("Unknown file");
  const ext = name.split(".").pop()!;
  const contentType = TYPES[kind].find((t) => t.ext === ext)!.contentType;
  return { filePath, size: info.size, contentType };
}

/**
 * Builds a response for a stored file, honouring HTTP Range requests so
 * video players can seek and stream without downloading the whole file.
 */
export function fileResponse(
  file: { filePath: string; size: number; contentType: string },
  rangeHeader: string | null,
  cacheControl: string
): NextResponse {
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  };

  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) {
    headers["Content-Length"] = String(file.size);
    return new NextResponse(Readable.toWeb(createReadStream(file.filePath)) as ReadableStream, { headers });
  }

  let start: number;
  let end: number;
  if (match[1]) {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  } else {
    // "bytes=-500" = the last 500 bytes
    start = Math.max(0, file.size - Number(match[2]));
    end = file.size - 1;
  }
  if (start > end || start >= file.size) {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
  }

  headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
  headers["Content-Length"] = String(end - start + 1);
  return new NextResponse(Readable.toWeb(createReadStream(file.filePath, { start, end })) as ReadableStream, {
    status: 206,
    headers,
  });
}
