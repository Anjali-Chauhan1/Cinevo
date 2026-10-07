"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { WatchPlayer } from "@/components/WatchPlayer";
import { ReviewSection } from "@/components/ReviewSection";
import { TipButton } from "@/components/TipButton";
import { Icon } from "@/components/Icon";
import { paise } from "@/lib/format";

interface EpisodeData {
  episode: {
    id: string;
    title: string;
    description: string | null;
    videoKey: string;
    status: string;
    isPaid: boolean;
    rateRupeesPaise: number;
    capRupeesPaise: number;
    previewSeconds: number;
    premiereAt: string | null;
    castCredits: string | null;
    creatorId: string;
    creator: { id: string; handle: string; channelName: string };
  };
  popularity: { score: number; level: string } | null;
  reviews: Array<{
    id: string;
    stars: number;
    text: string | null;
    tags: string | null;
    reviewerBadge: string;
    creatorReply: string | null;
    createdAt: string;
    user: { displayName: string; avatarUrl: string | null };
  }>;
  viewerState: {
    signedIn: boolean;
    isOwner?: boolean;
    secondsWatched?: number;
    myReview?: EpisodeData["reviews"][number] | null;
  };
}

const LEVEL_LABEL: Record<string, string> = {
  RISING: "Rising",
  HOT: "Hot",
  TRENDING: "Trending",
  FAN_FAVOURITE: "Fan favourite",
};

export default function WatchPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user } = useAuth();
  const [data, setData] = useState<EpisodeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await api.get<EpisodeData>(`/api/episodes/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this film");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div className="empty-state" role="alert"><Icon name="film" size={32} /><h1>We couldn&apos;t load this film.</h1><p>{error}</p><button className="btn-primary" onClick={() => { setError(null); load(); }}>Try again</button><Link href="/trending" className="text-link">Explore other films</Link></div>;
  if (!data) return <div role="status" aria-label="Loading film" className="space-y-5"><div className="aspect-video max-h-[560px] animate-pulse rounded-xl bg-[var(--surface-raised)]" /><div className="h-7 w-2/3 animate-pulse rounded bg-[var(--surface-raised)]" /><p className="text-sm text-[var(--text-dim)]">Getting your film ready…</p></div>;

  const { episode, popularity, reviews, viewerState } = data;
  const credits: Array<{ name: string; role: string }> = episode.castCredits ? JSON.parse(episode.castCredits) : [];

  if (episode.status === "PREMIERING") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <span className="badge bg-red-500 text-white">Live now</span>
        <h1 className="mt-3 font-serif text-2xl font-bold">{episode.title} is premiering</h1>
        <p className="mt-2 text-[var(--text-dim)]">Join the live premiere room for chat, reactions and the hype bar.</p>
        <Link href={`/premiere/${episode.id}`} className="btn-primary mt-5 inline-flex">
          Enter premiere room
        </Link>
      </div>
    );
  }

  const canWatch = episode.status === "EARLY_ACCESS" || episode.status === "PUBLIC";

  return (
    <div><Link href="/trending" className="text-link mb-6">← Back to films</Link><div className="grid gap-6 lg:grid-cols-[1fr_290px]">
      <div>
        {episode.status === "SCHEDULED" || episode.status === "DRAFT" ? (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-black text-[var(--text-dim)]">
            <div className="p-8 text-center"><Icon name="film" size={36} className="mx-auto mb-4 text-[var(--accent)]" /><h2 className="text-xl text-[var(--text)]">Something worth waiting for.</h2><p className="mt-3 text-sm">{episode.premiereAt ? `Premiering ${new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(episode.premiereAt))} IST` : "The filmmaker is getting this story ready for you."}</p><Link href={`/c/${episode.creator.handle}`} className="btn-secondary mt-5">Visit the filmmaker&apos;s channel</Link></div>
          </div>
        ) : canWatch ? (
          <WatchPlayer episodeId={episode.id} videoUrl={episode.videoKey} onSessionEnded={load} />
        ) : null}

        <div className="mt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-xl font-bold">{episode.title}</h1>
              <Link href={`/c/${episode.creator.handle}`} className="text-sm text-[var(--text-dim)] hover:text-[var(--accent)]">
                {episode.creator.channelName}
              </Link>
            </div>
            {user && <TipButton creatorId={episode.creatorId} episodeId={episode.id} />}
          </div>
          {episode.description && <p className="mt-3 text-sm text-[var(--text-dim)]">{episode.description}</p>}
        </div>

        {popularity && (
          <div className="card mt-4 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-dim)]">Popularity</span>
              {LEVEL_LABEL[popularity.level] && (
                <span className="badge bg-[var(--accent)]/15 text-[var(--accent)]">{LEVEL_LABEL[popularity.level]}</span>
              )}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
              <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round(popularity.score)}%` }} />
            </div>
          </div>
        )}

        {credits.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 font-serif text-lg font-semibold">Credits</h2>
            <ul className="text-sm text-[var(--text-dim)]">
              {credits.map((c, i) => (
                <li key={i}>
                  {c.name} — {c.role}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8">
          <ReviewSection
            episodeId={episode.id}
            reviews={reviews}
            myReview={viewerState.myReview ?? null}
            canReview={!!user && !viewerState.isOwner}
            onSubmitted={load}
          />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card p-6">
          <span className="eyebrow">YOUR SEAT AT THE SCREEN</span>
          <h2 className="mt-4 text-xl font-semibold">{episode.isPaid ? `${paise(episode.rateRupeesPaise)}/min` : "Free to watch"}</h2>
          {episode.isPaid ? <dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-[var(--text-dim)]">Free preview</dt><dd>{episode.previewSeconds} seconds</dd></div><div className="flex justify-between gap-3"><dt className="text-[var(--text-dim)]">Maximum charge</dt><dd>{paise(episode.capRupeesPaise)}</dd></div></dl> : <p className="mt-3 text-sm text-[var(--text-dim)]">Enjoy this story with no viewing charge.</p>}
          <p className="mt-5 border-t border-[var(--border)] pt-4 text-xs leading-relaxed text-[var(--text-dim)]">Subscribers watch without per-minute charges. Premiere and early-access viewing is for subscribers and eligible backers.</p>
          <Link href={`/c/${episode.creator.handle}`} className="btn-secondary mt-5 w-full">Explore the channel<Icon name="arrow" size={16} /></Link>
        </div>
      </aside>
    </div></div>
  );
}
