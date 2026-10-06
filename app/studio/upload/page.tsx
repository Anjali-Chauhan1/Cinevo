"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { PAY_PER_MINUTE } from "@/lib/constants";

const SAMPLE_VIDEOS = [
  { label: "Big Buck Bunny (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
  { label: "Elephants Dream (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
  { label: "For Bigger Blazes (demo)", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" },
];

export default function UploadEpisodePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoKey, setVideoKey] = useState(SAMPLE_VIDEOS[0].url);
  const [durationSeconds, setDurationSeconds] = useState(600);
  const [isPaid, setIsPaid] = useState(false);
  const [rateRupees, setRateRupees] = useState(0.5);
  const [capRupees, setCapRupees] = useState(15);
  const [previewSeconds, setPreviewSeconds] = useState<number>(PAY_PER_MINUTE.DEFAULT_PREVIEW_SECONDS);
  const [schedule, setSchedule] = useState(false);
  const [premiereIn, setPremiereIn] = useState(0); // minutes from now
  const [earlyAccessDays, setEarlyAccessDays] = useState(7);
  const [publicAfterDays, setPublicAfterDays] = useState(9);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      const premiereAt = schedule ? new Date(now + premiereIn * 60_000).toISOString() : undefined;
      const earlyAccessUntil = schedule ? new Date(now + premiereIn * 60_000 + earlyAccessDays * 86_400_000).toISOString() : undefined;
      const publicAt = schedule ? new Date(now + premiereIn * 60_000 + publicAfterDays * 86_400_000).toISOString() : undefined;

      const { episode } = await api.post<{ episode: { id: string } }>("/api/episodes", {
        title,
        description,
        videoKey,
        durationSeconds,
        isPaid,
        rateRupees: isPaid ? rateRupees : undefined,
        capRupees: isPaid ? capRupees : undefined,
        previewSeconds,
        premiereAt,
        earlyAccessUntil,
        publicAt,
      });
      router.push(`/studio`);
      void episode;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create episode");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <h1 className="font-serif text-2xl font-bold">Upload an episode</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        No real video hosting in this demo — pick a sample clip or paste any public video URL.
      </p>

      <div className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Video</label>
          <select className="input" value={videoKey} onChange={(e) => setVideoKey(e.target.value)}>
            {SAMPLE_VIDEOS.map((v) => (
              <option key={v.url} value={v.url}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Duration (seconds)</label>
          <input className="input" type="number" min={10} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
          Pay-per-minute
        </label>

        {isPaid && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Rate ₹/min</label>
              <input
                className="input"
                type="number"
                step={0.1}
                min={PAY_PER_MINUTE.MIN_RATE_PAISE / 100}
                max={PAY_PER_MINUTE.MAX_RATE_PAISE / 100}
                value={rateRupees}
                onChange={(e) => setRateRupees(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Preview (s)</label>
              <input className="input" type="number" min={0} value={previewSeconds} onChange={(e) => setPreviewSeconds(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Cap ₹</label>
              <input className="input" type="number" min={1} value={capRupees} onChange={(e) => setCapRupees(Number(e.target.value))} />
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          Schedule a premiere (otherwise saved as a draft)
        </label>

        {schedule && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Premiere in (min)</label>
              <input className="input" type="number" min={0} value={premiereIn} onChange={(e) => setPremiereIn(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Early access (days)</label>
              <input className="input" type="number" min={0} value={earlyAccessDays} onChange={(e) => setEarlyAccessDays(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Public after (days)</label>
              <input className="input" type="number" min={0} value={publicAfterDays} onChange={(e) => setPublicAfterDays(Number(e.target.value))} />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy || !title}>
          {busy ? "Saving..." : schedule ? "Schedule episode" : "Save as draft"}
        </button>
      </div>
    </div>
  );
}
