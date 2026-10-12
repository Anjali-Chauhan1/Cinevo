"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { BASIC_EMOTES, MAX_CREATOR_EMOTES } from "@/lib/emotes";

interface Emote { id: string; code: string; glyph: string }
interface Moderator { user: { id: string; displayName: string; email: string } }
interface ChannelSettings {
  bio: string | null;
  subPriceRupeesPaise: number;
  subEarlyAccess: boolean;
  subOnlyEmotes: boolean;
  merchUrl: string | null;
  subMerchPerk: string | null;
}

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

export default function CreatorSettingsPage() {
  const { user, loading } = useAuth();
  const [bio, setBio] = useState("");
  const [subPriceRupees, setSubPriceRupees] = useState(49);
  const [subEarlyAccess, setSubEarlyAccess] = useState(true);
  const [subOnlyEmotes, setSubOnlyEmotes] = useState(true);
  const [merchUrl, setMerchUrl] = useState("");
  const [subMerchPerk, setSubMerchPerk] = useState("");
  const [emotes, setEmotes] = useState<Emote[]>([]);
  const [emoteCode, setEmoteCode] = useState("");
  const [emoteGlyph, setEmoteGlyph] = useState("");
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [modEmail, setModEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // One status line per card, so a message shows next to what it's about.
  const [status, setStatus] = useState<Record<string, { ok: boolean; text: string } | undefined>>({});

  useEffect(() => {
    if (!user?.creator) return;
    api.get<{ creator: ChannelSettings; emotes: Emote[] }>(`/api/creators/${user.creator.handle}`).then((d) => {
      setBio(d.creator.bio ?? "");
      setSubPriceRupees(d.creator.subPriceRupeesPaise / 100);
      setSubEarlyAccess(d.creator.subEarlyAccess);
      setSubOnlyEmotes(d.creator.subOnlyEmotes);
      setMerchUrl(d.creator.merchUrl ?? "");
      setSubMerchPerk(d.creator.subMerchPerk ?? "");
      setEmotes(d.emotes);
    });
    api.get<{ moderators: Moderator[] }>("/api/creator/moderators").then((d) => setModerators(d.moderators));
  }, [user?.creator]);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;

  async function run(card: string, step: () => Promise<unknown>, success: string, failure: string) {
    setBusy(true);
    setStatus((s) => ({ ...s, [card]: undefined }));
    try {
      await step();
      setStatus((s) => ({ ...s, [card]: { ok: true, text: success } }));
      setTimeout(() => setStatus((s) => ({ ...s, [card]: undefined })), 2500);
    } catch (err) {
      setStatus((s) => ({ ...s, [card]: { ok: false, text: errorText(err, failure) } }));
    } finally {
      setBusy(false);
    }
  }

  const saveChannel = () =>
    run("channel", () => api.patch("/api/creator/settings", { bio, subPriceRupees }), "Saved", "Save failed");

  const savePerks = () =>
    run(
      "perks",
      () => api.patch("/api/creator/settings", { subEarlyAccess, subOnlyEmotes, merchUrl: merchUrl.trim(), subMerchPerk: subMerchPerk.trim() }),
      "Subscriber perks saved",
      "Couldn't save perks"
    );

  const addEmote = () =>
    run(
      "emotes",
      async () => {
        const { emote } = await api.post<{ emote: Emote }>("/api/creator/emotes", { code: emoteCode, glyph: emoteGlyph });
        setEmotes((prev) => [...prev, emote]);
        setEmoteCode("");
        setEmoteGlyph("");
      },
      "Emote added",
      "Couldn't add emote"
    );

  const removeEmote = (id: string) =>
    run(
      "emotes",
      async () => {
        await api.delete(`/api/creator/emotes/${id}`);
        setEmotes((prev) => prev.filter((e) => e.id !== id));
      },
      "Emote removed",
      "Couldn't remove emote"
    );

  const addModerator = () =>
    run(
      "mods",
      async () => {
        await api.post("/api/creator/moderators", { email: modEmail });
        const { moderators: m } = await api.get<{ moderators: Moderator[] }>("/api/creator/moderators");
        setModerators(m);
        setModEmail("");
      },
      "Moderator added",
      "Couldn't add moderator"
    );

  async function removeModerator(userId: string) {
    await api.delete(`/api/creator/moderators/${userId}`);
    setModerators((prev) => prev.filter((m) => m.user.id !== userId));
  }

  const Status = ({ card }: { card: string }) =>
    status[card] ? <p className={`text-sm ${status[card]!.ok ? "text-emerald-400" : "text-red-400"}`}>{status[card]!.text}</p> : null;

  return (
    <div className="mx-auto max-w-lg space-y-6 py-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl font-bold">Channel settings</h1>
        <Link href={`/c/${user.creator.handle}`} className="text-xs text-[var(--accent)] hover:underline">View channel →</Link>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-medium">Channel</h2>
        <div>
          <label className="label" htmlFor="bio">Bio</label>
          <textarea id="bio" className="input" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="price">Subscription price (₹/month)</label>
          <input id="price" className="input" type="number" min={0} value={subPriceRupees} onChange={(e) => setSubPriceRupees(Number(e.target.value))} />
          <p className="mt-1 text-xs text-[var(--text-dim)]">Fans pay by the second and can cancel any time. New prices apply to new subscribers.</p>
        </div>
        <Status card="channel" />
        <button className="btn-primary" onClick={saveChannel} disabled={busy}>Save changes</button>
      </section>

      <section className="card space-y-5 p-5">
        <div>
          <h2 className="font-medium">Subscriber perks</h2>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            What fans get for subscribing. Subscribers always watch your paid episodes free — choose the rest.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={subEarlyAccess} onChange={(e) => setSubEarlyAccess(e.target.checked)} />
          <span>
            <strong className="block">Premieres and early access</strong>
            <span className="text-xs text-[var(--text-dim)]">
              Subscribers join your premieres and watch during the early-access window, before everyone else. Off: only
              backers of your campaigns get in early; subscribers watch from the public release.
            </span>
          </span>
        </label>

        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1" checked={subOnlyEmotes} onChange={(e) => setSubOnlyEmotes(e.target.checked)} />
            <span>
              <strong className="block">Subscriber-only emotes</strong>
              <span className="text-xs text-[var(--text-dim)]">
                Only subscribers (and your moderators) can use your channel emotes in premiere chat. Off: everyone can.
                Everyone always has the free set: {BASIC_EMOTES.map((e) => e.glyph).join(" ")}
              </span>
            </span>
          </label>

          <div>
            <p className="label">Your channel emotes ({emotes.length}/{MAX_CREATOR_EMOTES})</p>
            {emotes.length === 0 ? (
              <p className="text-xs text-[var(--text-dim)]">No emotes yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {emotes.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-1 text-sm">
                    <span className="text-xl">{e.glyph}</span>
                    <code className="text-xs text-[var(--text-dim)]">{e.code}</code>
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:underline"
                      aria-label={`Remove ${e.code}`}
                      onClick={() => removeEmote(e.id)}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {emotes.length < MAX_CREATOR_EMOTES && (
              <div className="mt-2 flex gap-2">
                <input className="input" placeholder="Name, e.g. hype" aria-label="Emote name" value={emoteCode} maxLength={26} onChange={(e) => setEmoteCode(e.target.value)} />
                <input className="input w-20" placeholder="🎉" aria-label="Emote symbol" value={emoteGlyph} maxLength={8} onChange={(e) => setEmoteGlyph(e.target.value)} />
                <button className="btn-secondary" onClick={addEmote} disabled={busy || !emoteCode.trim() || !emoteGlyph.trim()}>Add</button>
              </div>
            )}
            <p className="mt-1 text-xs text-[var(--text-dim)]">Fans type it in chat as <code>:hype:</code> or pick it from the emote menu.</p>
            <Status card="emotes" />
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <p className="text-sm font-medium">Merch</p>
          <div>
            <label className="label" htmlFor="merch-url">Your store link (shown to everyone)</label>
            <input id="merch-url" className="input" type="url" placeholder="https://your-store.example.com" value={merchUrl} onChange={(e) => setMerchUrl(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--text-dim)]">You sell and ship merch yourself; Cinova links to your store.</p>
          </div>
          <div>
            <label className="label" htmlFor="merch-perk">Subscriber merch perk (only subscribers see this)</label>
            <input
              id="merch-perk"
              className="input"
              placeholder="e.g. 15% off everything with code SUBS15"
              maxLength={200}
              value={subMerchPerk}
              onChange={(e) => setSubMerchPerk(e.target.value)}
            />
          </div>
        </div>

        <Status card="perks" />
        <button className="btn-primary" onClick={savePerks} disabled={busy}>Save subscriber perks</button>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-medium">Moderators</h2>
        {moderators.map((m) => (
          <div key={m.user.id} className="flex items-center justify-between text-sm">
            <span>{m.user.displayName} ({m.user.email})</span>
            <button className="text-xs text-red-400" onClick={() => removeModerator(m.user.id)}>Remove</button>
          </div>
        ))}
        <div className="flex gap-2">
          <input className="input" placeholder="Email" aria-label="Moderator email" value={modEmail} onChange={(e) => setModEmail(e.target.value)} />
          <button className="btn-secondary" onClick={addModerator} disabled={busy || !modEmail}>Add</button>
        </div>
        <Status card="mods" />
      </section>
    </div>
  );
}
