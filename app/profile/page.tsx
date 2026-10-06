"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/client-api";
import { paise } from "@/lib/format";

interface ProfileData {
  reviews: Array<{ id: string; stars: number; episode: { id: string; title: string }; createdAt: string }>;
  backings: Array<{ id: string; amountPaise: number; type: string; campaign: { id: string; filmTitle: string }; tier: { name: string } | null }>;
  subscriptionCount: number;
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (user) api.get<ProfileData>("/api/profile").then(setData);
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

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-semibold">Backed films</h2>
        {data.backings.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">You haven&apos;t backed any films yet.</p>
        ) : (
          <div className="space-y-2">
            {data.backings.map((b) => (
              <Link key={b.id} href={`/back/${b.campaign.id}`} className="card flex items-center justify-between p-3 text-sm hover:border-[var(--accent)]/50">
                <span>{b.campaign.filmTitle} {b.tier && <span className="text-[var(--text-dim)]">· {b.tier.name}</span>}</span>
                <span>{paise(b.amountPaise)}</span>
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
