"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";

export default function BecomeCreatorPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [channelName, setChannelName] = useState("");
  const [bio, setBio] = useState("");
  const [verificationDocUrl, setVerificationDocUrl] = useState("");
  const [subPriceRupees, setSubPriceRupees] = useState(49);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-[var(--text-dim)]">Sign in first to set up a channel.</p>
      </div>
    );
  }
  if (user.creator) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p>
          You already run <span className="font-medium">{user.creator.channelName}</span>.
        </p>
        {user.creator.verificationStatus === "PENDING" && (
          <p className="mt-2 text-sm text-[var(--text-dim)]">
            Your verification is pending admin review. You can publish episodes once approved.
          </p>
        )}
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/api/creator/onboard", {
        handle,
        channelName,
        bio,
        verificationDocUrl,
        subPriceRupees,
      });
      await refresh();
      router.push(`/c/${handle}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-8">
      <h1 className="font-serif text-2xl font-bold">Start your channel</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        Student, indie or first-time director — set up your channel, get verified, and start earning.
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label">Handle</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-dim)]">cinevo.app/c/</span>
            <input
              className="input"
              required
              pattern="[a-z0-9-]+"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              placeholder="your-handle"
            />
          </div>
        </div>
        <div>
          <label className="label">Channel name</label>
          <input className="input" required value={channelName} onChange={(e) => setChannelName(e.target.value)} />
        </div>
        <div>
          <label className="label">Bio</label>
          <textarea className="input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <label className="label">Verification link</label>
          <input
            className="input"
            required
            placeholder="Link to your college ID, film-club page, or portfolio"
            value={verificationDocUrl}
            onChange={(e) => setVerificationDocUrl(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            An admin reviews this before your channel can publish episodes.
          </p>
        </div>
        <div>
          <label className="label">Monthly subscription price (₹)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={999}
            value={subPriceRupees}
            onChange={(e) => setSubPriceRupees(Number(e.target.value))}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Creating channel..." : "Create channel"}
        </button>
      </form>
    </div>
  );
}
