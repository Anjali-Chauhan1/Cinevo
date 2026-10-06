"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/client-api";

const PRESETS = [10, 50, 100, 500];

export function TipButton({
  creatorId,
  episodeId,
  onSent,
}: {
  creatorId: string;
  episodeId?: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(50);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/tips", { creatorId, episodeId, amountRupees: amount, message });
      setSent(true);
      onSent?.();
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setMessage("");
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tip failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Tip
      </button>
    );
  }

  return (
    <div className="card w-72 p-3">
      {sent ? (
        <p className="text-center text-sm text-emerald-400">Tip sent!</p>
      ) : (
        <>
          <div className="flex gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`btn-secondary flex-1 !px-2 !py-1 text-xs ${amount === p ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
              >
                ₹{p}
              </button>
            ))}
          </div>
          <input
            className="input mt-2"
            type="number"
            min={10}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <input
            className="input mt-2"
            placeholder="Message (optional)"
            maxLength={120}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button className="btn-primary flex-1" onClick={send} disabled={busy}>
              Send ₹{amount}
            </button>
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
