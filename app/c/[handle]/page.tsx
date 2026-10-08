"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { Address } from "viem";
import { api, ApiError } from "@/lib/client-api";
import { useOnchain } from "@/components/web3/Onchain";
import { getAddresses } from "@/lib/chain/config";
import { subscriptionsAbi } from "@/lib/chain/abis";
import { paise, paiseWhole } from "@/lib/format";
import { EpisodeCard } from "@/components/EpisodeCard";

interface ChannelData {
  creatorWallet?: Address | null;
  creator: {
    id: string;
    handle: string;
    channelName: string;
    bio: string | null;
    bannerUrl: string | null;
    verificationStatus: string;
    subPriceRupeesPaise: number;
    createdAt: string;
  };
  episodes: Array<Record<string, unknown> & { id: string; status: string }>;
  emotes: Array<{ id: string; code: string; glyph: string }>;
  campaigns: Array<{ id: string; filmTitle: string; goalPaise: number; totalBackedPaise: number; deadline: string }>;
  supporterWall: Array<{ user?: { displayName: string } | null; totalPaise: number }>;
  subscriberCount: number;
  viewerState: { isSubscribed: boolean; isOwner: boolean };
}

export default function ChannelPage({ params }: { params: { handle: string } }) {
  const { handle } = params;
  const { user } = useAuth();
  const [data, setData] = useState<ChannelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chain = useOnchain();

  async function load() {
    try {
      const res = await api.get<ChannelData>(`/api/creators/${handle}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load channel");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  if (error) return <p className="py-12 text-center text-[var(--text-dim)]">{error}</p>;
  if (!data) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;

  const { creator, episodes, emotes, campaigns, supporterWall, subscriberCount, viewerState } = data;

  async function subscribe() {
    setBusy(true);
    try {
      if (chain.enabled) {
        // The fan's wallet starts the per-second subscription onchain; the server confirms it.
        if (!data?.creatorWallet) throw new Error("This creator can't take subscriptions yet");
        const txHash = await chain.sendTx({ address: getAddresses().subscriptions, abi: subscriptionsAbi, functionName: "subscribe", args: [data.creatorWallet] });
        await api.post("/api/subscriptions", { creatorId: creator.id, txHash });
      } else {
        await api.post("/api/subscriptions", { creatorId: creator.id });
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not subscribe");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSub() {
    setBusy(true);
    try {
      if (chain.enabled) {
        if (!data?.creatorWallet) throw new Error("This creator isn't onchain");
        const txHash = await chain.sendTx({ address: getAddresses().subscriptions, abi: subscriptionsAbi, functionName: "cancel", args: [data.creatorWallet] });
        await api.delete(`/api/subscriptions/${creator.id}?txHash=${txHash}`);
      } else {
        await api.delete(`/api/subscriptions/${creator.id}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="h-40 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--surface-raised)] to-[var(--surface)] sm:h-56">
        {creator.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl font-bold">{creator.channelName}</h1>
            {creator.verificationStatus === "APPROVED" ? (
              <span className="badge bg-blue-500/15 text-blue-400">Verified</span>
            ) : (
              <span className="badge bg-yellow-500/15 text-yellow-400">Verification pending</span>
            )}
          </div>
          <p className="text-sm text-[var(--text-dim)]">
            @{creator.handle} · {subscriberCount} subscriber{subscriberCount === 1 ? "" : "s"}
          </p>
          {creator.bio && <p className="mt-2 max-w-xl text-sm text-[var(--text)]">{creator.bio}</p>}
        </div>

        <div className="flex gap-2">
          {viewerState.isOwner ? (
            <Link href="/studio" className="btn-secondary">Open studio</Link>
          ) : user ? (
            viewerState.isSubscribed ? (
              <button className="btn-secondary" disabled={busy} onClick={cancelSub}>
                Subscribed · Cancel
              </button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={subscribe}>
                Subscribe · {paiseWhole(creator.subPriceRupeesPaise)}/mo
              </button>
            )
          ) : (
            <Link href="/login" className="btn-primary">Sign in to subscribe</Link>
          )}
        </div>
      </div>

      {emotes.length > 0 && (
        <div className="mt-4 flex gap-2 text-2xl">
          {emotes.map((e) => (
            <span key={e.id} title={e.code}>{e.glyph}</span>
          ))}
        </div>
      )}

      {campaigns.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-semibold">Funding the next film</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {campaigns.map((c) => {
              const pct = Math.min(100, Math.round((c.totalBackedPaise / c.goalPaise) * 100));
              return (
                <Link key={c.id} href={`/back/${c.id}`} className="card block p-4 hover:border-[var(--accent)]/50">
                  <div className="font-medium">{c.filmTitle}</div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-raised)]">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-dim)]">
                    {paise(c.totalBackedPaise)} of {paise(c.goalPaise)} · {pct}%
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-lg font-semibold">Episodes & films</h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No episodes published yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {episodes.map((e) => (
              // @ts-expect-error -- dynamically-shaped API payload, matches EpisodeCard's required fields
              <EpisodeCard key={e.id} episode={e} />
            ))}
          </div>
        )}
      </section>

      {supporterWall.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-semibold">Supporter wall</h2>
          <div className="flex flex-wrap gap-3">
            {supporterWall.map((s, i) => (
              <div key={i} className="card px-3 py-2 text-sm">
                <span className="font-medium">{s.user?.displayName ?? "A supporter"}</span>
                <span className="ml-2 text-[var(--accent)]">{paise(s.totalPaise)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
