"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";

interface DropOff {
  totalViewers: number;
  buckets: Array<{ decile: number; retainedPercent: number }>;
}

type StudioEpisode = Record<string, unknown> & { id: string; title: string; status: string };

export default function StudioDashboardPage() {
  const { user, loading } = useAuth();
  const [episodes, setEpisodes] = useState<StudioEpisode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropOff, setDropOff] = useState<DropOff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.creator) return;
    api
      .get<{ episodes: StudioEpisode[] }>(`/api/creators/${user.creator.handle}`)
      .then((d) => setEpisodes(d.episodes));
  }, [user?.creator]);

  useEffect(() => {
    if (!selected) return;
    api
      .get<DropOff>(`/api/episodes/${selected}/drop-off`)
      .then(setDropOff)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load analytics"));
  }, [selected]);

  if (loading) return null;
  if (!user) return <p className="py-12 text-center text-[var(--text-dim)]">Sign in first.</p>;
  if (!user.creator) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--text-dim)]">You don&apos;t have a creator channel yet.</p>
        <Link href="/become-creator" className="btn-primary mt-3 inline-flex">Start a channel</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold">{user.creator.channelName} · Studio</h1>
        <div className="flex gap-2">
          <Link href="/studio/upload" className="btn-primary">Upload episode</Link>
          <Link href="/studio/campaign" className="btn-secondary">New campaign</Link>
          <Link href="/studio/settings" className="btn-secondary">Settings</Link>
        </div>
      </div>

      {user.creator.verificationStatus !== "APPROVED" && (
        <div className="card mb-6 border-yellow-500/30 p-4 text-sm">
          Your channel is <span className="font-medium">{user.creator.verificationStatus.toLowerCase()}</span>.
          Publishing is disabled until an admin approves verification.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <h2 className="mb-3 font-serif text-lg font-semibold">Episodes</h2>
          <div className="card divide-y divide-[var(--border)]">
            {episodes.length === 0 && <p className="p-4 text-sm text-[var(--text-dim)]">No episodes yet.</p>}
            {episodes.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e.id)}
                className={`flex w-full items-center justify-between p-3 text-left text-sm hover:bg-[var(--surface-raised)] ${selected === e.id ? "bg-[var(--surface-raised)]" : ""}`}
              >
                <span>{e.title}</span>
                <span className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">
                  {(e.status as string).toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-serif text-lg font-semibold">Drop-off</h2>
          {!selected ? (
            <p className="text-sm text-[var(--text-dim)]">Select an episode to see where viewers stop watching.</p>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : !dropOff ? (
            <p className="text-sm text-[var(--text-dim)]">Loading...</p>
          ) : dropOff.totalViewers === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No viewers yet for this episode.</p>
          ) : (
            <div className="card p-4">
              <p className="mb-3 text-xs text-[var(--text-dim)]">{dropOff.totalViewers} viewers tracked</p>
              <div className="flex items-end gap-1" style={{ height: 100 }}>
                {dropOff.buckets.map((b) => (
                  <div key={b.decile} className="flex flex-1 flex-col items-center justify-end">
                    <div className="w-full rounded-t bg-[var(--accent)]" style={{ height: `${b.retainedPercent}%` }} />
                    <span className="mt-1 text-[10px] text-[var(--text-dim)]">{b.decile * 10}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
