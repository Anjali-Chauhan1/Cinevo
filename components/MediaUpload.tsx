"use client";

import { useState } from "react";

/** Reads a video file's length in the browser, before it's uploaded. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't read that video. Try an MP4 (H.264)."));
    };
    video.src = url;
  });
}

/** Raw-body upload with progress (fetch can't report upload progress). */
function uploadWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: Record<string, string> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // fall through to the generic error below
      }
      if (xhr.status >= 200 && xhr.status < 300 && !data.error) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again"));
    xhr.send(file);
  });
}

const MAX_VIDEO_MB = 1024;

export function VideoUpload({
  onUploaded,
  hasExisting,
}: {
  onUploaded: (result: { videoKey: string; durationSeconds: number; fileName: string }) => void;
  hasExisting?: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setDone(null);
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError("Videos must be under 1 GB");
      return;
    }
    try {
      const duration = await readDuration(file);
      if (!Number.isFinite(duration) || duration < 10) throw new Error("Videos must be at least 10 seconds long");
      setProgress(0);
      const { videoKey } = await uploadWithProgress("/api/uploads/video", file, setProgress);
      setDone(file.name);
      onUploaded({ videoKey, durationSeconds: Math.round(duration), fileName: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <input
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="input"
        onChange={onChange}
        disabled={progress !== null}
        aria-describedby="video-upload-help"
      />
      <p id="video-upload-help" className="mt-1 text-xs text-[var(--text-dim)]">
        {hasExisting ? "Choose a file to replace the current video. " : ""}MP4, MOV or WebM, up to 1 GB.
      </p>
      {progress !== null && (
        <div className="mt-2" role="progressbar" aria-label="Upload progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Uploading… {progress}%</p>
        </div>
      )}
      {done && <p className="mt-1 text-xs text-emerald-400">Uploaded {done}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function ThumbnailUpload({ value, onChange }: { value?: string | null; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Thumbnails must be under 5 MB");
      return;
    }
    setBusy(true);
    try {
      const { thumbnailUrl } = await uploadWithProgress("/api/uploads/thumbnail", file, () => {});
      onChange(thumbnailUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      <div className="aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-raised)]">
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Thumbnail preview" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <input type="file" accept="image/jpeg,image/png,image/webp" className="input" onChange={onFile} disabled={busy} />
        <p className="mt-1 text-xs text-[var(--text-dim)]">{busy ? "Uploading…" : "JPG, PNG or WebP, up to 5 MB. 16:9 looks best."}</p>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
