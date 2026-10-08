"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { ThumbnailUpload, VideoUpload } from "@/components/MediaUpload";

// For demos without a video file to hand.
const SAMPLE_VIDEOS = [
  { label: "Big Buck Bunny (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", duration: 596 },
  { label: "Elephants Dream (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", duration: 653 },
  { label: "For Bigger Blazes (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4", duration: 15 },
];

/**
 * Step 1 of publishing: the film itself. Creates a draft and hands over to
 * the episode editor for pricing, schedule, hype bar and credits.
 */
export default function UploadEpisodePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [video, setVideo] = useState<{ videoKey: string; durationSeconds: number } | null>(null);
  const [useSample, setUseSample] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;
  if (user.creator.verificationStatus !== "APPROVED") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-[var(--text-dim)]">Your channel needs to be verified before you can publish. We&apos;ll notify you once it&apos;s approved.</p>
        <Link href="/studio" className="btn-secondary mt-4 inline-flex">Back to studio</Link>
      </div>
    );
  }

  async function submit() {
    if (!video) return;
    setBusy(true);
    setError(null);
    try {
      const { episode } = await api.post<{ episode: { id: string } }>("/api/episodes", {
        title,
        description,
        videoKey: video.videoKey,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: thumbnailUrl ?? undefined,
        isPaid: false,
      });
      router.push(`/studio/episodes/${episode.id}?new=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the episode");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <span className="eyebrow">STEP 1 OF 2</span>
      <h1 className="mt-2 font-serif text-2xl font-bold">Upload your film</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        Next you&apos;ll set pricing, the premiere schedule, hype bar rewards and credits.
      </p>

      <div className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" className="input" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div>
          <span className="label">Video</span>
          {useSample ? (
            <select
              className="input"
              aria-label="Sample video"
              defaultValue=""
              onChange={(e) => {
                const sample = SAMPLE_VIDEOS.find((v) => v.url === e.target.value);
                setVideo(sample ? { videoKey: sample.url, durationSeconds: sample.duration } : null);
              }}
            >
              <option value="" disabled>Pick a sample clip</option>
              {SAMPLE_VIDEOS.map((v) => <option key={v.url} value={v.url}>{v.label}</option>)}
            </select>
          ) : (
            <VideoUpload onUploaded={({ videoKey, durationSeconds }) => setVideo({ videoKey, durationSeconds })} />
          )}
          <button
            type="button"
            className="mt-1 text-xs text-[var(--accent)] hover:underline"
            onClick={() => {
              setUseSample(!useSample);
              setVideo(null);
            }}
          >
            {useSample ? "Upload my own file instead" : "No file handy? Use a sample clip"}
          </button>
          {video && (
            <p className="mt-1 text-xs text-[var(--text-dim)]">
              Length: {Math.floor(video.durationSeconds / 60)}m {video.durationSeconds % 60}s
            </p>
          )}
        </div>

        <div>
          <span className="label">Thumbnail (optional)</span>
          <ThumbnailUpload value={thumbnailUrl} onChange={setThumbnailUrl} />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy || title.trim().length < 2 || !video}>
          {busy ? "Saving..." : "Save draft and continue"}
        </button>
      </div>
    </div>
  );
}
