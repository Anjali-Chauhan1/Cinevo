"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/client-api";
import { paise } from "@/lib/format";

interface WatchSession {
  sessionToken: string;
  freeReason: string;
  rateRupeesPaiseSnapshot: number;
  previewSecondsSnapshot: number;
  capRupeesPaiseSnapshot: number;
  cumulativeAmountPaise: number;
}

const VOUCHER_INTERVAL_MS = 10_000;

/**
 * Owns the full pay-per-minute lifecycle for one episode: starts a session,
 * tracks actual video playback time (not wall-clock) to respect the free
 * preview, submits a strictly-increasing voucher every 10s of real playback,
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
      const { session: s } = await api.post<{ session: WatchSession }>("/api/watch/start", { episodeId });
      setSession(s);
      setCapReached(s.cumulativeAmountPaise >= s.capRupeesPaiseSnapshot && s.capRupeesPaiseSnapshot > 0);
      lastBilledRef.current = s.cumulativeAmountPaise;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start playback");
    } finally {
      setStarting(false);
    }
  }

  // Billing loop: every 10s of real playback, compute what's owed from
  // actual video.currentTime (not wall-clock, so pausing doesn't bill) and
  // submit it as the new cumulative voucher amount.
  useEffect(() => {
    if (!session || session.freeReason !== "NONE" || capReached) return;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.paused) return;

      const playedSeconds = video.currentTime;
      const billableSeconds = Math.max(0, playedSeconds - session.previewSecondsSnapshot);
      if (billableSeconds <= 0) return;

      const owed = Math.min(
        session.capRupeesPaiseSnapshot,
        Math.round((billableSeconds * session.rateRupeesPaiseSnapshot) / 60)
      );
      if (owed <= lastBilledRef.current) return;

      try {
        const { session: updated } = await api.post<{ session: WatchSession }>("/api/watch/voucher", {
          sessionToken: session.sessionToken,
          cumulativeAmountPaise: owed,
        });
        lastBilledRef.current = updated.cumulativeAmountPaise;
        setSession((prev) => (prev ? { ...prev, cumulativeAmountPaise: updated.cumulativeAmountPaise } : prev));
        if (updated.cumulativeAmountPaise >= session.capRupeesPaiseSnapshot) {
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
  }, [session, capReached]);

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
  const minutesRate = (session.rateRupeesPaiseSnapshot / 100).toFixed(2);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay
          className="aspect-video w-full"
          onEnded={handleEnded}
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
