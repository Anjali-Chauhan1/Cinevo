"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/client-api";
import { paise } from "@/lib/format";
import type { Address, Hex } from "viem";
import { paiseToUnits } from "@/lib/chain/config";
import { useOnchain } from "@/components/web3/Onchain";

interface WatchSession {
  sessionToken: string;
  freeReason: string;
  rateRupeesPaiseSnapshot: number;
  previewSecondsSnapshot: number;
  capRupeesPaiseSnapshot: number;
  cumulativeAmountPaise: number;
}

const VOUCHER_INTERVAL_MS = 10_000;

/** Onchain mode, paid sessions: what the viewer's wallet signs each time the amount owed goes up. */
interface VoucherParams {
  vault: Address;
  viewer: Address;
  episodeId: Hex;
  sessionId: Hex;
  expiry: number;
}

/**
 * Owns the full pay-per-minute lifecycle for one episode: starts a session,
 * tracks actual video playback time (not wall-clock) to respect the free
 * preview, sends a heartbeat/voucher every 10s (amounts never go down),
 * shows the live cost counter, and settles cleanly on stop/unmount/tab-close.
 */
export function WatchPlayer({
  episodeId,
  videoUrl,
  onSessionEnded,
}: {
  episodeId: string;
  videoUrl: string;
  onSessionEnded?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [session, setSession] = useState<WatchSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capReached, setCapReached] = useState(false);
  const [starting, setStarting] = useState(false);
  const onchain = useOnchain();
  const voucherRef = useRef<VoucherParams | null>(null);
  const lastBilledRef = useRef(0);

  const stopSession = useCallback(async (token: string) => {
    try {
      await api.post("/api/watch/stop", { sessionToken: token });
    } catch {
      // best-effort — the server auto-settles abandoned sessions anyway
    }
  }, []);

  // Settle on unmount (navigating away) and on tab close.
  useEffect(() => {
    function handleUnload() {
      if (session?.sessionToken) {
        navigator.sendBeacon(
          "/api/watch/stop",
          new Blob([JSON.stringify({ sessionToken: session.sessionToken })], { type: "application/json" })
        );
      }
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (session?.sessionToken) stopSession(session.sessionToken);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionToken]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const { session: s, voucher } = await api.post<{ session: WatchSession; voucher?: VoucherParams }>("/api/watch/start", { episodeId });
      voucherRef.current = voucher ?? null;
      setSession(s);
      setCapReached(s.cumulativeAmountPaise >= s.capRupeesPaiseSnapshot && s.capRupeesPaiseSnapshot > 0);
      lastBilledRef.current = s.cumulativeAmountPaise;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start playback");
    } finally {
      setStarting(false);
    }
  }

  // Seconds of video actually played since the last tick — measured from
  // playback progress, so pausing and seeking never count as watch time.
  const playedRef = useRef(0);
  const lastTimeRef = useRef(0);
  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const delta = video.currentTime - lastTimeRef.current;
    if (delta > 0 && delta < 2 && !video.seeking) playedRef.current += delta;
    lastTimeRef.current = video.currentTime;
  }

  // Heartbeat + billing loop, every 10s for EVERY session: it keeps the
  // session (and the video stream) alive and reports watch time. For paid
  // sessions it also carries the voucher: what's owed is computed from
  // video.currentTime (not wall-clock, so pausing doesn't bill), and only
  // ever goes up until the cap.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const hasSession = !!session;
  useEffect(() => {
    if (!hasSession) return;

    const interval = setInterval(async () => {
      const current = sessionRef.current;
      const video = videoRef.current;
      if (!current || !video) return;

      let amount = lastBilledRef.current;
      if (current.freeReason === "NONE") {
        const billableSeconds = Math.max(0, video.currentTime - current.previewSecondsSnapshot);
        const owed = Math.min(
          current.capRupeesPaiseSnapshot,
          Math.round((billableSeconds * current.rateRupeesPaiseSnapshot) / 60)
        );
        amount = Math.max(owed, lastBilledRef.current);
      }
      const played = Math.round(playedRef.current);

      try {
        // Onchain: the wallet silently signs the new total — that signature is
        // what lets the vault charge it when the session settles.
        let signature: Hex | undefined;
        const v = voucherRef.current;
        if (v && amount > lastBilledRef.current) {
          signature = await onchain.signVoucher(v.vault, {
            viewer: v.viewer,
            episodeId: v.episodeId,
            sessionId: v.sessionId,
            cumulativeAmount: paiseToUnits(amount),
            expiry: BigInt(v.expiry),
          });
        }
        const { session: updated } = await api.post<{ session: WatchSession }>("/api/watch/voucher", {
          sessionToken: current.sessionToken,
          cumulativeAmountPaise: amount,
          playedSeconds: played,
          signature,
        });
        playedRef.current = Math.max(0, playedRef.current - played);
        if (updated.cumulativeAmountPaise !== lastBilledRef.current) {
          lastBilledRef.current = updated.cumulativeAmountPaise;
          setSession((prev) => (prev ? { ...prev, cumulativeAmountPaise: updated.cumulativeAmountPaise } : prev));
        }
        if (current.capRupeesPaiseSnapshot > 0 && updated.cumulativeAmountPaise >= current.capRupeesPaiseSnapshot) {
          setCapReached(true);
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 400) {
          setError(err.message);
          video.pause();
        }
      }
    }, VOUCHER_INTERVAL_MS);

    return () => clearInterval(interval);
    // onchain.signVoucher is stable for a given wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession]);

  async function handleEnded() {
    if (session) {
      await stopSession(session.sessionToken);
      onSessionEnded?.();
    }
  }

  if (!session) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-black">
        <div className="text-center">
          <button className="btn-primary" onClick={start} disabled={starting}>
            {starting ? "Loading..." : "Play"}
          </button>
          {error && <p className="mt-3 max-w-sm text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  const isBilled = session.freeReason === "NONE";
  // Uploaded films stream through the session-checked route; legacy films
  // still point straight at their URL.
  const src = videoUrl.startsWith("upload:") ? `/api/media/video/${session.sessionToken}` : videoUrl;
  const minutesRate = (session.rateRupeesPaiseSnapshot / 100).toFixed(2);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          autoPlay
          className="aspect-video w-full"
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onSeeked={() => {
            lastTimeRef.current = videoRef.current?.currentTime ?? 0;
          }}
          onError={() => setError("Playback stopped. Press play on the film page to start again.")}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        {isBilled ? (
          <div className="flex items-center gap-3 text-[var(--text-dim)]">
            <span>₹{minutesRate}/min</span>
            <span className="text-[var(--text)]">{paise(session.cumulativeAmountPaise)} so far</span>
            {session.capRupeesPaiseSnapshot > 0 && (
              <span>cap {paise(session.capRupeesPaiseSnapshot)}</span>
            )}
            {capReached && <span className="badge bg-emerald-500/15 text-emerald-400">Cap reached — rest is free</span>}
          </div>
        ) : (
          <span className="badge bg-emerald-500/15 text-emerald-400">
            {session.freeReason === "SUBSCRIBER"
              ? "Free — you're subscribed"
              : session.freeReason === "BACKER_PASS"
                ? "Free — backer access"
                : session.freeReason === "ALREADY_PAID"
                  ? "Already paid — free rewatch"
                  : "Free episode"}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
