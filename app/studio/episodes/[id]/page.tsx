"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { PAY_PER_MINUTE } from "@/lib/constants";
import { paise } from "@/lib/format";
import { ThumbnailUpload, VideoUpload } from "@/components/MediaUpload";

interface Episode {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  videoKey: string;
  durationSeconds: number;
  castCredits: string | null;
  isPaid: boolean;
  rateRupeesPaise: number;
  previewSeconds: number;
  capRupeesPaise: number;
  premiereAt: string | null;
  earlyAccessUntil: string | null;
  publicAt: string | null;
  status: string;
  creatorId: string;
}

interface HypeLevel {
  level: number;
  goalType: string;
  goalValue: number;
  unlockTitle: string;
  unlockAssetUrl: string | null;
  reachedAt: string | null;
}

interface Campaign {
  id: string;
  filmTitle: string;
  status: string;
  producerUnitsEnabled: boolean;
  totalUnits: number;
  fundedEpisodeId: string | null;
}

interface HypeForm {
  goalType: "TIPS" | "REACTIONS";
  goalValue: number;
  unlockTitle: string;
  unlockAssetUrl: string;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PREMIERING: "Premiering now",
  EARLY_ACCESS: "Early access",
  PUBLIC: "Public",
};

const CLOSED_CAMPAIGN = ["FAILED_REFUNDING", "REFUNDED", "CANCELLED"];

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

// useSearchParams needs a Suspense boundary for the production build.
export default function EpisodeEditorPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <EpisodeEditor id={params.id} />
    </Suspense>
  );
}

function EpisodeEditor({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const justCreated = useSearchParams().get("new") === "1";
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Details, pricing, credits — saved together.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [newVideo, setNewVideo] = useState<{ videoKey: string; durationSeconds: number } | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [rateRupees, setRateRupees] = useState(0.5);
  const [previewSeconds, setPreviewSeconds] = useState<number>(PAY_PER_MINUTE.DEFAULT_PREVIEW_SECONDS);
  const [capRupees, setCapRupees] = useState(15);
  const [credits, setCredits] = useState<{ name: string; role: string }[]>([]);
  const [hype, setHype] = useState<HypeForm[]>([]);
  const [hypeReached, setHypeReached] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ episode: ep, hypeLevels }, { campaigns: cs }] = await Promise.all([
        api.get<{ episode: Episode; hypeLevels: HypeLevel[] }>(`/api/episodes/${id}`),
        api.get<{ campaigns: Campaign[] }>("/api/creator/campaigns"),
      ]);
      setEpisode(ep);
      setCampaigns(cs);
      setTitle(ep.title);
      setDescription(ep.description ?? "");
      setThumbnailUrl(ep.thumbnailUrl);
      setNewVideo(null);
      setIsPaid(ep.isPaid);
      if (ep.rateRupeesPaise > 0) setRateRupees(ep.rateRupeesPaise / 100);
      setPreviewSeconds(ep.previewSeconds);
      if (ep.capRupeesPaise > 0) setCapRupees(ep.capRupeesPaise / 100);
      setCredits(ep.castCredits ? JSON.parse(ep.castCredits) : []);
      setHype(
        hypeLevels.map((l) => ({
          goalType: l.goalType === "TIPS" ? "TIPS" : "REACTIONS",
          goalValue: l.goalType === "TIPS" ? l.goalValue / 100 : l.goalValue,
          unlockTitle: l.unlockTitle,
          unlockAssetUrl: l.unlockAssetUrl ?? "",
        }))
      );
      setHypeReached(hypeLevels.some((l) => l.reachedAt));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Couldn't load this episode");
    }
  }, [id]);

  useEffect(() => {
    if (user?.creator) load();
  }, [user?.creator, load]);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;
  if (loadError) return <p className="py-12 text-center text-[var(--text-dim)]">{loadError}</p>;
  if (!episode) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;
  if (episode.creatorId !== user.creator.id) {
    return <p className="py-12 text-center text-[var(--text-dim)]">You can only edit your own episodes.</p>;
  }

  const isDraft = episode.status === "DRAFT";
  const hypeEditable = episode.status === "DRAFT" || episode.status === "SCHEDULED";
  const linkedCampaign = campaigns.find((c) => c.fundedEpisodeId === episode.id);
  const linkable = campaigns.filter((c) => !CLOSED_CAMPAIGN.includes(c.status) && !c.fundedEpisodeId);
  const viewHref = episode.status === "PREMIERING" ? `/premiere/${episode.id}` : `/watch/${episode.id}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div>
        <Link href="/studio" className="text-xs text-[var(--text-dim)] hover:text-[var(--accent)]">← Studio</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-bold">{episode.title}</h1>
            <span className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">{STATUS_LABEL[episode.status] ?? episode.status}</span>
          </div>
          {!isDraft && <Link href={viewHref} className="btn-secondary">View on channel</Link>}
        </div>
        {justCreated && isDraft && (
          <p className="mt-2 text-sm text-[var(--text-dim)]">Draft saved. Set it up below, then publish when you&apos;re ready.</p>
        )}
      </div>

      <DetailsSection
        episode={episode}
        state={{ title, description, thumbnailUrl, newVideo, isPaid, rateRupees, previewSeconds, capRupees, credits }}
        set={{ setTitle, setDescription, setThumbnailUrl, setNewVideo, setIsPaid, setRateRupees, setPreviewSeconds, setCapRupees, setCredits }}
        onSaved={load}
      />

      <HypeSection
        episodeId={episode.id}
        editable={hypeEditable}
        reached={hypeReached}
        levels={hype}
        setLevels={setHype}
        onSaved={load}
      />

      <RevenueSection episodeId={episode.id} linked={linkedCampaign} linkable={linkable} onChanged={load} />

      {isDraft ? (
        <PublishSection episodeId={episode.id} hasHype={hype.length > 0} onPublished={load} />
      ) : (
        <section className="card p-5">
          <h2 className="font-medium">Release schedule</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[var(--text-dim)]">Premiere</dt><dd>{formatDate(episode.premiereAt)}</dd></div>
            <div><dt className="text-xs text-[var(--text-dim)]">Early access until</dt><dd>{formatDate(episode.earlyAccessUntil)}</dd></div>
            <div><dt className="text-xs text-[var(--text-dim)]">Public from</dt><dd>{formatDate(episode.publicAt)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-[var(--text-dim)]">The premiere time is locked once announced, so subscribers&apos; reminders stay accurate.</p>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details, pricing and credits
// ---------------------------------------------------------------------------

function DetailsSection({
  episode,
  state,
  set,
  onSaved,
}: {
  episode: Episode;
  state: {
    title: string;
    description: string;
    thumbnailUrl: string | null;
    newVideo: { videoKey: string; durationSeconds: number } | null;
    isPaid: boolean;
    rateRupees: number;
    previewSeconds: number;
    capRupees: number;
    credits: { name: string; role: string }[];
  };
  set: {
    setTitle: (v: string) => void;
    setDescription: (v: string) => void;
    setThumbnailUrl: (v: string) => void;
    setNewVideo: (v: { videoKey: string; durationSeconds: number }) => void;
    setIsPaid: (v: boolean) => void;
    setRateRupees: (v: number) => void;
    setPreviewSeconds: (v: number) => void;
    setCapRupees: (v: number) => void;
    setCredits: (v: { name: string; role: string }[]) => void;
  };
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/episodes/${episode.id}`, {
        title: state.title,
        description: state.description,
        thumbnailUrl: state.thumbnailUrl ?? undefined,
        ...(state.newVideo ?? {}),
        isPaid: state.isPaid,
        ...(state.isPaid ? { rateRupees: state.rateRupees, capRupees: state.capRupees, previewSeconds: state.previewSeconds } : {}),
        castCredits: state.credits.filter((c) => c.name.trim() && c.role.trim()),
      });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const updateCredit = (i: number, patch: Partial<{ name: string; role: string }>) =>
    set.setCredits(state.credits.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-medium">Details</h2>
      <div>
        <label className="label" htmlFor="ep-title">Title</label>
        <input id="ep-title" className="input" maxLength={120} value={state.title} onChange={(e) => set.setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="ep-desc">Description</label>
        <textarea id="ep-desc" className="input" rows={3} maxLength={2000} value={state.description} onChange={(e) => set.setDescription(e.target.value)} />
      </div>
      <div>
        <span className="label">Thumbnail</span>
        <ThumbnailUpload value={state.thumbnailUrl} onChange={set.setThumbnailUrl} />
      </div>
      <div>
        <span className="label">Video ({Math.floor(episode.durationSeconds / 60)}m {episode.durationSeconds % 60}s)</span>
        <VideoUpload hasExisting onUploaded={({ videoKey, durationSeconds }) => set.setNewVideo({ videoKey, durationSeconds })} />
        {state.newVideo && <p className="mt-1 text-xs text-[var(--accent)]">Save changes to switch to the new video.</p>}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-medium">Pricing</h3>
        <div className="mt-2 flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="pricing" checked={!state.isPaid} onChange={() => set.setIsPaid(false)} /> Free
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="pricing" checked={state.isPaid} onChange={() => set.setIsPaid(true)} /> Pay-per-minute
          </label>
        </div>
        {state.isPaid && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <label className="label" htmlFor="ep-rate">Rate ₹/min</label>
                <input
                  id="ep-rate"
                  className="input"
                  type="number"
                  step={0.1}
                  min={PAY_PER_MINUTE.MIN_RATE_PAISE / 100}
                  max={PAY_PER_MINUTE.MAX_RATE_PAISE / 100}
                  value={state.rateRupees}
                  onChange={(e) => set.setRateRupees(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="ep-preview">Free preview (s)</label>
                <input id="ep-preview" className="input" type="number" min={0} max={600} value={state.previewSeconds} onChange={(e) => set.setPreviewSeconds(Number(e.target.value))} />
              </div>
              <div>
                <label className="label" htmlFor="ep-cap">Price cap ₹</label>
                <input id="ep-cap" className="input" type="number" min={1} value={state.capRupees} onChange={(e) => set.setCapRupees(Number(e.target.value))} />
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--text-dim)]">
              Subscribers and backers always watch free. Once a viewer pays the cap, the rest is free forever.
            </p>
          </>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-medium">Cast &amp; crew credits</h3>
        <div className="mt-2 space-y-2">
          {state.credits.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" placeholder="Name" aria-label={`Credit ${i + 1} name`} maxLength={80} value={c.name} onChange={(e) => updateCredit(i, { name: e.target.value })} />
              <input className="input" placeholder="Role, e.g. Director" aria-label={`Credit ${i + 1} role`} maxLength={60} value={c.role} onChange={(e) => updateCredit(i, { role: e.target.value })} />
              <button
                type="button"
                className="btn-secondary !px-3"
                aria-label={`Remove credit ${i + 1}`}
                onClick={() => set.setCredits(state.credits.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn-secondary mt-2 text-xs" onClick={() => set.setCredits([...state.credits, { name: "", role: "" }])}>
          + Add credit
        </button>
        <p className="mt-2 text-xs text-[var(--text-dim)]">Backers of the campaign linked below are added to the credits automatically, by tier.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn-primary" onClick={save} disabled={busy || state.title.trim().length < 2}>
        {busy ? "Saving..." : saved ? "Saved" : "Save changes"}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hype bar
// ---------------------------------------------------------------------------

function HypeSection({
  episodeId,
  editable,
  reached,
  levels,
  setLevels,
  onSaved,
}: {
  episodeId: string;
  editable: boolean;
  reached: boolean;
  levels: HypeForm[];
  setLevels: (v: HypeForm[]) => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (i: number, patch: Partial<HypeForm>) => setLevels(levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/episodes/${episodeId}/hype-levels`, { levels });
      await onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save hype levels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-medium">Premiere hype bar</h2>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          Tips and reactions during the premiere fill a shared bar. Each level unlocks something you prepared, like a
          blooper reel or a live Q&amp;A. Rewards are always content, never money.
        </p>
      </div>

      {!editable ? (
        levels.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No hype levels were set for this premiere.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {levels.map((l, i) => (
              <li key={i}>
                Level {i + 1}: {l.goalType === "TIPS" ? `${paise(Math.round(l.goalValue * 100))} in tips` : `${l.goalValue} reactions`} → {l.unlockTitle}
              </li>
            ))}
            {reached && <li className="text-xs text-[var(--text-dim)]">Reached levels have already been unlocked.</li>}
          </ol>
        )
      ) : (
        <>
          {levels.map((l, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Level {i + 1}</span>
                <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => setLevels(levels.filter((_, idx) => idx !== i))}>
                  Remove
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
                <select
                  className="input"
                  aria-label={`Level ${i + 1} goal type`}
                  value={l.goalType}
                  onChange={(e) => update(i, { goalType: e.target.value as HypeForm["goalType"] })}
                >
                  <option value="TIPS">Tips (₹)</option>
                  <option value="REACTIONS">Reactions</option>
                </select>
                <input
                  className="input"
                  type="number"
                  min={1}
                  aria-label={`Level ${i + 1} goal`}
                  value={l.goalValue}
                  onChange={(e) => update(i, { goalValue: Number(e.target.value) })}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="What unlocks, e.g. Blooper reel after the credits"
                  aria-label={`Level ${i + 1} reward`}
                  maxLength={80}
                  value={l.unlockTitle}
                  onChange={(e) => update(i, { unlockTitle: e.target.value })}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Link to the reward (optional)"
                  aria-label={`Level ${i + 1} reward link`}
                  maxLength={500}
                  value={l.unlockAssetUrl}
                  onChange={(e) => update(i, { unlockAssetUrl: e.target.value })}
                />
              </div>
            </div>
          ))}
          {levels.length < 3 && (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() =>
                setLevels([
                  ...levels,
                  levels.length === 0
                    ? { goalType: "TIPS", goalValue: 2000, unlockTitle: "Blooper reel after the credits", unlockAssetUrl: "" }
                    : { goalType: "TIPS", goalValue: (levels[levels.length - 1].goalValue || 1000) * 2, unlockTitle: "", unlockAssetUrl: "" },
                ])
              }
            >
              + Add level
            </button>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div>
            <button className="btn-primary" onClick={save} disabled={busy || levels.some((l) => l.unlockTitle.trim().length < 2 || !(l.goalValue > 0))}>
              {busy ? "Saving..." : saved ? "Saved" : "Save hype levels"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Revenue sharing with a campaign (Producer Unit waterfall)
// ---------------------------------------------------------------------------

function RevenueSection({
  episodeId,
  linked,
  linkable,
  onChanged,
}: {
  episodeId: string;
  linked: Campaign | undefined;
  linkable: Campaign[];
  onChanged: () => Promise<void>;
}) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
      setChoice("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update revenue sharing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div>
        <h2 className="font-medium">Revenue sharing</h2>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          If this is the film a campaign funded, link it so Producer Unit holders get their share of what viewers pay:
          50% until they&apos;re paid back plus 20%, then 20%. Without a link, you keep 90% and the platform 10%.
        </p>
      </div>
      {linked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Sharing revenue with <Link href={`/back/${linked.id}`} className="text-[var(--accent)]">{linked.filmTitle}</Link>
            {!linked.producerUnitsEnabled || linked.totalUnits === 0 ? (
              <span className="text-xs text-[var(--text-dim)]"> (no Producer Units sold, so you still keep 90%)</span>
            ) : null}
          </span>
          <button className="btn-secondary text-xs" disabled={busy} onClick={() => run(() => api.delete(`/api/campaigns/${linked.id}/link-episode`))}>
            Unlink
          </button>
        </div>
      ) : linkable.length === 0 ? (
        <p className="text-sm text-[var(--text-dim)]">
          No campaigns to link. <Link href="/studio/campaign" className="text-[var(--accent)]">Start a campaign</Link> to fund your next film.
        </p>
      ) : (
        <div className="flex gap-2">
          <select className="input" aria-label="Campaign to link" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Choose the campaign that funded this film</option>
            {linkable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.filmTitle}
                {c.producerUnitsEnabled ? " · Producer Units" : ""}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={busy || !choice}
            onClick={() => run(() => api.post(`/api/campaigns/${choice}/link-episode`, { episodeId }))}
          >
            Link
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Publishing a draft
// ---------------------------------------------------------------------------

function PublishSection({ episodeId, hasHype, onPublished }: { episodeId: string; hasHype: boolean; onPublished: () => Promise<void> }) {
  const [mode, setMode] = useState<"SCHEDULE" | "NOW">("SCHEDULE");
  const [premiere, setPremiere] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3_600_000)));
  const [earlyAccessDays, setEarlyAccessDays] = useState(7);
  const [publicAfterDays, setPublicAfterDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "NOW") {
        await api.patch(`/api/episodes/${episodeId}`, { publish: "NOW" });
      } else {
        const start = new Date(premiere);
        if (Number.isNaN(start.getTime())) throw new ApiError("Pick a premiere date and time", 400);
        // The premiere itself runs for its first hour, then early access begins.
        const earlyAccessUntil = new Date(start.getTime() + Math.max(earlyAccessDays * 86_400_000, 3_600_000));
        const publicAt = new Date(earlyAccessUntil.getTime() + publicAfterDays * 86_400_000);
        await api.patch(`/api/episodes/${episodeId}`, {
          publish: "SCHEDULE",
          premiereAt: start.toISOString(),
          earlyAccessUntil: earlyAccessUntil.toISOString(),
          publicAt: publicAt.toISOString(),
        });
      }
      await onPublished();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-medium">Publish</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === "SCHEDULE" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
          <input type="radio" name="publish-mode" className="mr-2" checked={mode === "SCHEDULE"} onChange={() => setMode("SCHEDULE")} />
          <strong>Schedule a premiere</strong>
          <span className="mt-1 block text-xs text-[var(--text-dim)]">Subscribers and backers watch first, with live chat. Then early access, then everyone.</span>
        </label>
        <label className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === "NOW" ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
          <input type="radio" name="publish-mode" className="mr-2" checked={mode === "NOW"} onChange={() => setMode("NOW")} />
          <strong>Publish now</strong>
          <span className="mt-1 block text-xs text-[var(--text-dim)]">Goes straight to public. No premiere, no supporter window.</span>
        </label>
      </div>

      {mode === "SCHEDULE" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="premiere-at">Premiere</label>
              <input id="premiere-at" className="input" type="datetime-local" min={toLocalInput(new Date())} value={premiere} onChange={(e) => setPremiere(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="early-days">Early access (days)</label>
              <input id="early-days" className="input" type="number" min={0} max={90} value={earlyAccessDays} onChange={(e) => setEarlyAccessDays(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="public-days">Then public after (days)</label>
              <input id="public-days" className="input" type="number" min={0} max={90} value={publicAfterDays} onChange={(e) => setPublicAfterDays(Number(e.target.value))} />
            </div>
          </div>
          <p className="text-xs text-[var(--text-dim)]">
            Subscribers and backers get reminders 1 hour and 10 minutes before. The premiere time can&apos;t be changed after you schedule it.
            {!hasHype && " Tip: add hype bar levels above before you schedule."}
          </p>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn-primary" onClick={publish} disabled={busy}>
        {busy ? "Publishing..." : mode === "NOW" ? "Publish now" : "Schedule premiere"}
      </button>
    </section>
  );
}
