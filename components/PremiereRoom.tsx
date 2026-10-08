"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api, ApiError } from "@/lib/client-api";
import { useAuth } from "@/components/AuthProvider";
import { paise } from "@/lib/format";
import { TipButton } from "@/components/TipButton";

interface ChatMessage {
  id: string;
  text: string;
  type: string;
  tipAmountPaise?: number | null;
  pinned?: boolean;
  badges?: { subscriberMonths: number; backerTier: string | null; verified: boolean } | null;
  createdAt: string;
  user: { id: string; displayName: string; avatarUrl?: string | null };
}

interface HypeLevel {
  id: string;
  level: number;
  goalType: string;
  goalValue: number;
  unlockTitle: string;
  reachedAt: string | null;
}

interface HypeProgress {
  tipTotalPaise: number;
  reactionCount: number;
  lastLevelReached: number;
}

const REACTIONS = ["😂", "😮", "🔥", "😢", "👏"];
const SLOW_MODE_OPTIONS = [0, 5, 15, 30, 60];
const TIMEOUT_MINUTES = 5;

/** A chat line the room shows locally, e.g. "Asha was timed out". */
function systemLine(text: string): ChatMessage {
  return {
    id: `system-${Math.random()}`,
    text,
    type: "SYSTEM",
    createdAt: new Date().toISOString(),
    user: { id: "system", displayName: "" },
  };
}

export function PremiereRoom({
  episodeId,
  creatorId,
  creatorUserId,
  isModerator,
  viewerSignedIn,
}: {
  episodeId: string;
  creatorId: string;
  /** The creator's account id, so their messages can be marked. */
  creatorUserId?: string;
  isModerator: boolean;
  viewerSignedIn: boolean;
}) {
  const { user } = useAuth();
  const [slowMode, setSlowMode] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<{ id: number; emoji: string; drift: number }[]>([]);
  const [hypeLevels, setHypeLevels] = useState<HypeLevel[]>([]);
  const [hypeProgress, setHypeProgress] = useState<HypeProgress | null>(null);
  const [unlockBanner, setUnlockBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<{ messages: ChatMessage[] }>(`/api/episodes/${episodeId}/chat`).then((d) => setMessages(d.messages));
    api
      .get<{ hypeLevels: HypeLevel[]; hypeProgress: HypeProgress | null; slowModeSeconds?: number }>(`/api/episodes/${episodeId}`)
      .then((d) => {
        setHypeLevels(d.hypeLevels ?? []);
        setHypeProgress(d.hypeProgress ?? null);
        setSlowMode(d.slowModeSeconds ?? 0);
      });
  }, [episodeId]);

  useEffect(() => {
    if (!viewerSignedIn) return;
    const url = process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:3002";
    const socket = io(url, { withCredentials: true, path: "/socket.io" });
    socketRef.current = socket;

    socket.emit("join_premiere", { episodeId });

    socket.on("viewer_count", ({ count }: { count: number }) => setViewerCount(count));
    socket.on("chat_message", (msg: ChatMessage) => setMessages((prev) => [...prev, msg]));
    socket.on("message_deleted", ({ messageId }: { messageId: string }) =>
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    );
    socket.on("chat_error", ({ message }: { message: string }) => setChatError(message));
    socket.on(
      "user_moderated",
      ({ displayName, action, minutes, clearedMessageIds }: { displayName: string; action: string; minutes: number | null; clearedMessageIds: string[] }) => {
        const cleared = new Set(clearedMessageIds);
        setMessages((prev) => [
          ...prev.filter((m) => !cleared.has(m.id)),
          systemLine(action === "BAN" ? `${displayName} was banned from chat` : `${displayName} was timed out for ${minutes} minutes`),
        ]);
      }
    );
    socket.on("slow_mode", ({ seconds }: { seconds: number }) => {
      setSlowMode(seconds);
      setMessages((prev) => [...prev, systemLine(seconds > 0 ? `Slow mode on: one message every ${seconds}s` : "Slow mode off")]);
    });
    socket.on("reaction", ({ emoji }: { emoji: string }) => {
      const id = Math.random();
      // Random sideways drift so a burst of the same emoji fans out instead of stacking.
      const drift = Math.round((Math.random() - 0.5) * 48);
      // Capped so a reaction storm can't pile up unbounded DOM nodes.
      setFloatingReactions((prev) => [...prev.slice(-29), { id, emoji, drift }]);
      setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2200);
    });
    socket.on("hype_update", ({ progress, newLevel }: { progress: typeof hypeProgress; newLevel: { level: number; unlockTitle: string } | null }) => {
      setHypeProgress(progress);
      if (newLevel) {
        setUnlockBanner(`Unlocked: ${newLevel.unlockTitle}`);
        setTimeout(() => setUnlockBanner(null), 5000);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [episodeId, viewerSignedIn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function sendMessage() {
    if (!input.trim() || !socketRef.current) return;
    setChatError(null);
    socketRef.current.emit("chat_message", { episodeId, text: input });
    setInput("");
  }

  function sendReaction(emoji: string) {
    socketRef.current?.emit("reaction", { episodeId, emoji });
  }

  // Moderation goes through the REST route, which checks permissions and
  // broadcasts the result to everyone in the room.
  async function moderate(body: Record<string, unknown>) {
    setChatError(null);
    try {
      await api.post(`/api/episodes/${episodeId}/moderation`, body);
      if (body.action === "SLOW_MODE") setSlowMode(Number(body.seconds));
    } catch (err) {
      setChatError(err instanceof ApiError ? err.message : "Moderation action failed");
    }
  }

  const currentLevel = hypeLevels.find((l) => l.level === (hypeProgress?.lastLevelReached ?? 0) + 1);
  const hypePct = currentLevel
    ? Math.min(
        100,
        Math.round(
          ((currentLevel.goalType === "TIPS" ? hypeProgress?.tipTotalPaise ?? 0 : hypeProgress?.reactionCount ?? 0) /
            currentLevel.goalValue) *
            100
        )
      )
    : 100;

  return (
    <div className="flex h-[32rem] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {viewerCount} watching
        </span>
        <div className="flex items-center gap-2">
          {isModerator && (
            <label className="flex items-center gap-1 text-xs text-[var(--text-dim)]">
              Slow mode
              <select
                className="rounded-md bg-[var(--surface-raised)] px-1 py-0.5 text-xs text-[var(--text)]"
                value={slowMode}
                onChange={(e) => moderate({ action: "SLOW_MODE", seconds: Number(e.target.value) })}
              >
                {SLOW_MODE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === 0 ? "Off" : `${s}s`}</option>
                ))}
              </select>
            </label>
          )}
          {viewerSignedIn && <TipButton creatorId={creatorId} episodeId={episodeId} />}
        </div>
      </div>
      {slowMode > 0 && !isModerator && (
        <div className="border-b border-[var(--border)] px-3 py-1 text-center text-xs text-[var(--text-dim)]">
          Slow mode: one message every {slowMode}s
        </div>
      )}

      {currentLevel && (
        <div className="border-b border-[var(--border)] px-3 py-2">
          <div className="flex justify-between text-xs text-[var(--text-dim)]">
            <span>Level {currentLevel.level}: {currentLevel.unlockTitle}</span>
            <span>{hypePct}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${hypePct}%` }} />
          </div>
        </div>
      )}
      {unlockBanner && (
        <div className="bg-[var(--accent)]/15 px-3 py-1.5 text-center text-xs text-[var(--accent)]">{unlockBanner}</div>
      )}

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-3 py-2">
        {messages.map((m) => m.type === "SYSTEM" ? (
          <p key={m.id} className="mb-2 text-center text-xs italic text-[var(--text-dim)]">{m.text}</p>
        ) : (
          <div key={m.id} className={`group mb-2 text-sm ${m.type === "TIP_HIGHLIGHT" ? "rounded-lg bg-[var(--accent)]/10 p-2" : ""}`}>
            <span className="font-medium">{m.user.displayName}</span>
            {creatorUserId && m.user.id === creatorUserId && (
              <span className="badge ml-1 bg-[var(--accent)] text-[var(--bg)]">Creator</span>
            )}
            {m.badges?.subscriberMonths ? (
              <span className="badge ml-1 bg-blue-500/15 text-blue-400">sub·{m.badges.subscriberMonths}mo</span>
            ) : null}
            {m.badges?.backerTier && <span className="badge ml-1 bg-[var(--accent)]/15 text-[var(--accent)]">{m.badges.backerTier}</span>}
            {m.type === "TIP_HIGHLIGHT" && (
              <span className="badge ml-1 bg-emerald-500/15 text-emerald-400">tipped {paise(m.tipAmountPaise ?? 0)}</span>
            )}
            <span className="ml-1 text-[var(--text)]">{m.text}</span>
            {isModerator && m.type === "MESSAGE" && (
              <span className="ml-2 inline-flex gap-2 text-xs opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
                <button onClick={() => moderate({ action: "DELETE", messageId: m.id })} className="text-red-400 hover:underline">
                  Delete
                </button>
                {m.user.id !== user?.id && m.user.id !== creatorUserId && (
                  <>
                    <button
                      onClick={() => moderate({ action: "TIMEOUT", targetUserId: m.user.id, minutes: TIMEOUT_MINUTES })}
                      className="text-red-400 hover:underline"
                    >
                      Timeout {TIMEOUT_MINUTES}m
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Ban ${m.user.displayName} from this premiere's chat?`)) {
                          moderate({ action: "BAN", targetUserId: m.user.id });
                        }
                      }}
                      className="text-red-400 hover:underline"
                    >
                      Ban
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        ))}

      </div>

      <div className="border-t border-[var(--border)] p-2">
        <div className="mb-2 flex gap-1">
          {REACTIONS.map((e) => (
            <span key={e} className="relative">
              <button onClick={() => sendReaction(e)} className="rounded-md px-1.5 py-0.5 hover:bg-[var(--surface-raised)]">
                {e}
              </button>
              {/* Each reaction floats up from the button it belongs to. */}
              {floatingReactions.filter((r) => r.emoji === e).map((r) => (
                <span
                  key={r.id}
                  aria-hidden
                  className="reaction-float"
                  style={{ "--drift": `${r.drift}px` } as React.CSSProperties}
                >
                  {r.emoji}
                </span>
              ))}
            </span>
          ))}
        </div>
        {chatError && <p className="mb-1 text-xs text-red-400">{chatError}</p>}
        {viewerSignedIn ? (
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Say something..."
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="btn-primary" onClick={sendMessage}>Send</button>
          </div>
        ) : (
          <p className="text-center text-xs text-[var(--text-dim)]">Sign in to join the chat</p>
        )}
      </div>
    </div>
  );
}
