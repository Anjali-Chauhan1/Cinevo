"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";

interface Emote { id: string; code: string; glyph: string }
interface Moderator { user: { id: string; displayName: string; email: string } }

export default function CreatorSettingsPage() {
  const { user, loading } = useAuth();
  const [bio, setBio] = useState("");
  const [subPriceRupees, setSubPriceRupees] = useState(49);
  const [emotes, setEmotes] = useState<Emote[]>([]);
  const [emoteCode, setEmoteCode] = useState("");
  const [emoteGlyph, setEmoteGlyph] = useState("");
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [modEmail, setModEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.creator) return;
    api
      .get<{ creator: { bio: string | null; subPriceRupeesPaise: number }; emotes: Emote[] }>(
        `/api/creators/${user.creator.handle}`
      )
      .then((d) => {
        setBio(d.creator.bio ?? "");
        setSubPriceRupees(d.creator.subPriceRupeesPaise / 100);
        setEmotes(d.emotes);
      });
    api.get<{ moderators: Moderator[] }>("/api/creator/moderators").then((d) => setModerators(d.moderators));
  }, [user?.creator]);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;

  async function saveSettings() {
    setBusy(true);
    setError(null);
    try {
      await api.patch("/api/creator/settings", { bio, subPriceRupees });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addEmote() {
    if (!emoteCode || !emoteGlyph) return;
    setBusy(true);
    setError(null);
    try {
      const { emote } = await api.post<{ emote: Emote }>("/api/creator/emotes", { code: emoteCode, glyph: emoteGlyph });
      setEmotes((prev) => [...prev, emote]);
      setEmoteCode("");
      setEmoteGlyph("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add emote");
    } finally {
      setBusy(false);
    }
  }

  async function addModerator() {
    if (!modEmail) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/creator/moderators", { email: modEmail });
      const { moderators: m } = await api.get<{ moderators: Moderator[] }>("/api/creator/moderators");
      setModerators(m);
      setModEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add moderator");
    } finally {
      setBusy(false);
    }
  }

  async function removeModerator(userId: string) {
    await api.delete(`/api/creator/moderators/${userId}`);
    setModerators((prev) => prev.filter((m) => m.user.id !== userId));
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <h1 className="font-serif text-2xl font-bold">Channel settings</h1>

      <div className="card space-y-4 p-5">
        <h2 className="font-medium">Channel</h2>
        <div>
          <label className="label">Bio</label>
          <textarea className="input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <label className="label">Subscription price (₹/month)</label>
          <input className="input" type="number" min={0} value={subPriceRupees} onChange={(e) => setSubPriceRupees(Number(e.target.value))} />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary" onClick={saveSettings} disabled={busy}>
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-medium">Emotes ({emotes.length}/5)</h2>
        <div className="flex gap-2 text-2xl">
          {emotes.map((e) => <span key={e.id} title={e.code}>{e.glyph}</span>)}
        </div>
        {emotes.length < 5 && (
          <div className="flex gap-2">
            <input className="input" placeholder=":code:" value={emoteCode} onChange={(e) => setEmoteCode(e.target.value)} />
            <input className="input w-20" placeholder="🔥" value={emoteGlyph} onChange={(e) => setEmoteGlyph(e.target.value)} />
            <button className="btn-secondary" onClick={addEmote} disabled={busy}>Add</button>
          </div>
        )}
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-medium">Moderators</h2>
        {moderators.map((m) => (
          <div key={m.user.id} className="flex items-center justify-between text-sm">
            <span>{m.user.displayName} ({m.user.email})</span>
            <button className="text-xs text-red-400" onClick={() => removeModerator(m.user.id)}>Remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input" placeholder="Email" value={modEmail} onChange={(e) => setModEmail(e.target.value)} />
          <button className="btn-secondary" onClick={addModerator} disabled={busy}>Add</button>
        </div>
      </div>
    </div>
  );
}
