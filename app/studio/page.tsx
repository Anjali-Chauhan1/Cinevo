"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { paise, relativeTime } from "@/lib/format";

interface DropOff {
  totalViewers: number;
  buckets: Array<{ decile: number; retainedPercent: number }>;
}

interface Earnings {
  sources: Array<{ key: string; label: string; last30Paise: number; allTimePaise: number }>;
  totals: { last30Paise: number; allTimePaise: number };
  daily: Array<{ date: string; totalPaise: number }>;
  topSupporters: Array<{
    fanId: string;
    displayName: string;
    totalPaise: number;
    tips: number;
    payPerMinute: number;
    subscriptions: number;
    backing: number;
  }>;
  recent: Array<{ label: string; detail: string | null; amountPaise: number; createdAt: string }>;
  stats: { activeSubscribers: number; uniqueViewers: number; balancePaise: number };
}

interface Campaign {
  id: string;
  filmTitle: string;
  status: string;
  goalPaise: number;
  totalBackedPaise: number;
}

type StudioEpisode = { id: string; title: string; status: string };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  PREMIERING: "Premiering",
  EARLY_ACCESS: "Early access",
  PUBLIC: "Public",
  ACTIVE: "Raising",
  FUNDED_PRODUCING: "Funded",
  DELIVERED: "Delivered",
  FAILED_REFUNDING: "Refunding",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export default function StudioDashboardPage() {
  const { user, loading } = useAuth();
  const [episodes, setEpisodes] = useState<StudioEpisode[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dropOff, setDropOff] = useState<DropOff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.creator) return;
    api.get<{ episodes: StudioEpisode[] }>(`/api/creators/${user.creator.handle}`).then((d) => setEpisodes(d.episodes));
    api.get<{ campaigns: Campaign[] }>("/api/creator/campaigns").then((d) => setCampaigns(d.campaigns));
    api
      .get<Earnings>("/api/creator/earnings")
      .then(setEarnings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load earnings"));
  }, [user?.creator]);

  useEffect(() => {
    if (!selected) return;
    setDropOff(null);
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

  const verified = user.creator.verificationStatus === "APPROVED";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold">{user.creator.channelName} · Studio</h1>
        <div className="flex flex-wrap gap-2">
          {verified && <Link href="/studio/upload" className="btn-primary">Upload episode</Link>}
          {verified && <Link href="/studio/campaign" className="btn-secondary">New campaign</Link>}
          <Link href="/studio/settings" className="btn-secondary">Settings</Link>
        </div>
      </div>

      {!verified && (
        <div className="card border-yellow-500/30 p-4 text-sm">
          Your channel is <span className="font-medium">{user.creator.verificationStatus.toLowerCase()}</span>. Publishing
          unlocks once an admin approves your verification — you&apos;ll get a notification.
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {earnings && <EarningsPanel earnings={earnings} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold">Episodes</h2>
          <div className="card divide-y divide-[var(--border)]">
            {episodes.length === 0 && (
              <p className="p-4 text-sm text-[var(--text-dim)]">
                No episodes yet.{verified && <> <Link href="/studio/upload" className="text-[var(--accent)]">Upload your first film</Link>.</>}
              </p>
            )}
            {episodes.map((e) => (
              <div key={e.id} className={`flex items-center justify-between gap-2 p-3 text-sm ${selected === e.id ? "bg-[var(--surface-raised)]" : ""}`}>
                <button onClick={() => setSelected(e.id)} className="min-w-0 flex-1 truncate text-left hover:text-[var(--accent)]" aria-pressed={selected === e.id}>
                  {e.title}
                </button>
                <span className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">{STATUS_LABEL[e.status] ?? e.status}</span>
                <Link href={`/studio/episodes/${e.id}`} className="text-xs text-[var(--accent)] hover:underline">
                  {e.status === "DRAFT" ? "Set up & publish" : "Edit"}
                </Link>
              </div>
            ))}
          </div>

          {campaigns.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 font-serif text-lg font-semibold">Campaigns</h2>
              <div className="card divide-y divide-[var(--border)]">
                {campaigns.map((c) => (
                  <Link key={c.id} href={`/back/${c.id}`} className="flex items-center justify-between gap-2 p-3 text-sm hover:bg-[var(--surface-raised)]">
                    <span className="min-w-0 flex-1 truncate">{c.filmTitle}</span>
                    <span className="text-xs text-[var(--text-dim)]">{paise(c.totalBackedPaise)} of {paise(c.goalPaise)}</span>
                    <span className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">{STATUS_LABEL[c.status] ?? c.status}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold">Drop-off</h2>
          {!selected ? (
            <p className="text-sm text-[var(--text-dim)]">Select an episode to see where viewers stop watching.</p>
          ) : !dropOff ? (
            <p className="text-sm text-[var(--text-dim)]">Loading...</p>
          ) : dropOff.totalViewers === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No viewers yet for this episode.</p>
          ) : (
            <div className="card p-4">
              <p className="mb-3 text-xs text-[var(--text-dim)]">{dropOff.totalViewers} viewers tracked · share still watching at each point</p>
              <div className="flex items-end gap-[2px]" style={{ height: 100 }}>
                {dropOff.buckets.map((b) => (
                  <div key={b.decile} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                    <div
                      className="w-full rounded-t-[4px] bg-[var(--accent)]"
                      style={{ height: `${b.retainedPercent}%` }}
                      tabIndex={0}
                      aria-label={`${b.decile * 10}% through: ${b.retainedPercent}% still watching`}
                    />
                    <span className="chart-tip">{b.retainedPercent}% still watching</span>
                    <span className="mt-1 text-[10px] text-[var(--text-dim)]">{b.decile * 10}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EarningsPanel({ earnings }: { earnings: Earnings }) {
  const { totals, sources, daily, topSupporters, recent, stats } = earnings;
  const maxDay = Math.max(...daily.map((d) => d.totalPaise), 1);
  const ranked = [...sources].sort((a, b) => b.allTimePaise - a.allTimePaise);
  const maxSource = Math.max(...sources.map((s) => s.allTimePaise), 1);
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <section aria-labelledby="earnings-heading" className="space-y-4">
      <h2 id="earnings-heading" className="font-serif text-lg font-semibold">Earnings</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last 30 days" value={paise(totals.last30Paise)} />
        <Stat label="All time" value={paise(totals.allTimePaise)} />
        <Stat label="Active subscribers" value={String(stats.activeSubscribers)} />
        <Stat label="Unique viewers" value={String(stats.uniqueViewers)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="card p-4">
          <p className="text-sm font-medium">Daily earnings, last 30 days</p>
          <p className="text-xs text-[var(--text-dim)]">What reached your balance after the 10% platform fee</p>
          {totals.last30Paise === 0 ? (
            <p className="mt-6 text-sm text-[var(--text-dim)]">Nothing in the last 30 days yet. Tips, subscriptions and paid views will show up here.</p>
          ) : (
            <>
              <div className="mt-4 flex items-end gap-[2px] border-b border-[var(--border)]" style={{ height: 120 }} role="img" aria-label="Daily earnings bar chart; the table below has the values">
                {daily.map((d) => (
                  <div key={d.date} className="group relative flex h-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[4px] bg-[var(--accent)]"
                      style={{ height: d.totalPaise > 0 ? `${Math.max(3, (d.totalPaise / maxDay) * 100)}%` : 0 }}
                      tabIndex={d.totalPaise > 0 ? 0 : -1}
                      aria-label={`${dayLabel(d.date)}: ${paise(d.totalPaise)}`}
                    />
                    <span className="chart-tip">{dayLabel(d.date)} · {paise(d.totalPaise)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[var(--text-dim)]">
                <span>{dayLabel(daily[0].date)}</span>
                <span>Today</span>
              </div>
              <table className="sr-only">
                <caption>Daily earnings, last 30 days</caption>
                <thead><tr><th>Date</th><th>Earned</th></tr></thead>
                <tbody>{daily.map((d) => <tr key={d.date}><td>{dayLabel(d.date)}</td><td>{paise(d.totalPaise)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </div>

        <div className="card p-4">
          <p className="text-sm font-medium">By source, all time</p>
          <ul className="mt-3 space-y-3">
            {ranked.map((s) => (
              <li key={s.key}>
                <div className="flex justify-between text-sm">
                  <span>{s.label}</span>
                  <span>{paise(s.allTimePaise)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]" aria-hidden>
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(s.allTimePaise / maxSource) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--text-dim)]">{paise(s.last30Paise)} in the last 30 days</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm font-medium">Top supporters</p>
          {topSupporters.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-dim)]">Your first supporters will appear here.</p>
          ) : (
            <ol className="mt-2 divide-y divide-[var(--border)] text-sm">
              {topSupporters.map((s, i) => (
                <li key={s.fanId} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="mr-2 text-[var(--text-dim)]">{i + 1}.</span>
                    {s.displayName}
                    <span className="block text-[11px] text-[var(--text-dim)]">
                      {[
                        s.tips && `tips ${paise(s.tips)}`,
                        s.subscriptions && `subscription ${paise(s.subscriptions)}`,
                        s.payPerMinute && `watching ${paise(s.payPerMinute)}`,
                        s.backing && `backing ${paise(s.backing)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="font-medium">{paise(s.totalPaise)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Recent payments</p>
            <Link href="/wallet" className="text-xs text-[var(--accent)]">Balance {paise(stats.balancePaise)} →</Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-dim)]">No payments yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--border)] text-sm">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">
                    {r.label}
                    {r.detail && <span className="text-[var(--text-dim)]"> · {r.detail}</span>}
                    <span className="block text-[11px] text-[var(--text-dim)]">{relativeTime(r.createdAt)}</span>
                  </span>
                  <span className="text-emerald-400">+{paise(r.amountPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--text-dim)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
