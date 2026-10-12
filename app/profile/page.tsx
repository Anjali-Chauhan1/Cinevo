"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client-api";
import { money } from "@/lib/format";

interface ProfileData {
  reviews: Array<{ id: string; stars: number; episode: { id: string; title: string }; createdAt: string }>;
  backings: Array<{ id: string; amountCents: number; type: string; campaign: { id: string; filmTitle: string }; tier: { name: string } | null }>;
  subscriptionCount: number;
}

interface Investment {
  campaignId: string;
  filmTitle: string;
  channelName: string;
  campaignStatus: string;
  units: number;
  investedCents: number;
  receivedCents: number;
  claimableCents: number | null;
  lockUntil: string;
}

const CAMPAIGN_STATUS: Record<string, string> = {
  ACTIVE: "Raising",
  FUNDED_PRODUCING: "In production",
  DELIVERED: "Released",
  FAILED_REFUNDING: "Refund available",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
};

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);

  useEffect(() => {
    if (!user) return;
    api.get<ProfileData>("/api/profile").then(setData);
    api.get<{ investments: Investment[] }>("/api/investments").then((d) => setInvestments(d.investments)).catch(() => {});
  }, [user]);

  if (loading) return null;
  if (!user) return <p className="py-12 text-center text-[var(--text-dim)]">Sign in to view your profile.</p>;
  if (!data) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xl font-semibold">
          {user.displayName.charAt(0)}
        </div>
        <div>
          <h1 className="font-serif text-xl font-bold">{user.displayName}</h1>
          <p className="text-sm text-[var(--text-dim)]">{user.email}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {data.subscriptionCount > 0 && (
          <span className="badge bg-blue-500/15 text-blue-400">{data.subscriptionCount} subscription{data.subscriptionCount === 1 ? "" : "s"}</span>
        )}
        {data.backings.length > 0 && (
          <span className="badge bg-[var(--accent)]/15 text-[var(--accent)]">{data.backings.length} film{data.backings.length === 1 ? "" : "s"} backed</span>
        )}
      </div>

      {investments.length > 0 && (
        <section id="investments" className="mt-8">
          <h2 className="font-serif text-lg font-semibold">Your investments</h2>
          <p className="mb-3 mt-1 text-xs text-[var(--text-dim)]">
            Producer Units earn a share of a film&apos;s revenue if it performs — not guaranteed returns.
          </p>
          <div className="space-y-2">
            {investments.map((inv) => (
              <Link key={inv.campaignId} href={`/back/${inv.campaignId}`} className="card block p-4 text-sm hover:border-[var(--accent)]/50">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{inv.filmTitle}</span>
                  <span className="badge bg-[var(--surface-raised)] text-[var(--text-dim)]">{CAMPAIGN_STATUS[inv.campaignStatus] ?? inv.campaignStatus}</span>
                </div>
                <p className="text-xs text-[var(--text-dim)]">{inv.channelName}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                  <div><dt className="text-[var(--text-dim)]">Units</dt><dd className="text-sm">{inv.units}</dd></div>
                  <div><dt className="text-[var(--text-dim)]">Invested</dt><dd className="text-sm">{money(inv.investedCents)}</dd></div>
                  <div><dt className="text-[var(--text-dim)]">Received so far</dt><dd className="text-sm">{money(inv.receivedCents)}</dd></div>
                  <div>
                    <dt className="text-[var(--text-dim)]">Ready to claim</dt>
                    <dd className={`text-sm ${inv.claimableCents ? "text-emerald-400" : ""}`}>{inv.claimableCents == null ? "—" : money(inv.claimableCents)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[11px] text-[var(--text-dim)]">
                  Locked until {new Date(inv.lockUntil).toLocaleDateString("en-US", { dateStyle: "medium" })} — units can&apos;t be transferred.
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-semibold">Backed films</h2>
        {data.backings.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">You haven&apos;t backed any films yet.</p>
        ) : (
          <div className="space-y-2">
            {data.backings.map((b) => (
              <Link key={b.id} href={`/back/${b.campaign.id}`} className="card flex items-center justify-between p-3 text-sm hover:border-[var(--accent)]/50">
                <span>{b.campaign.filmTitle} {b.tier && <span className="text-[var(--text-dim)]">· {b.tier.name}</span>}</span>
                <span>{money(b.amountCents)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-semibold">Your reviews</h2>
        {data.reviews.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No reviews yet.</p>
        ) : (
          <div className="space-y-2">
            {data.reviews.map((r) => (
              <Link key={r.id} href={`/watch/${r.episode.id}`} className="card flex items-center justify-between p-3 text-sm hover:border-[var(--accent)]/50">
                <span>{r.episode.title}</span>
                <span className="text-[var(--accent)]">
                  {"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
