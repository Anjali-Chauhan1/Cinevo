"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";

interface TierForm { name: string; priceRupees: number; perks: string }
interface MilestoneForm { label: string; percentOfGoal: number }

export default function NewCampaignPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [filmTitle, setFilmTitle] = useState("");
  const [pitch, setPitch] = useState("");
  const [goalRupees, setGoalRupees] = useState(10000);
  const [deadlineDays, setDeadlineDays] = useState(20);
  const [deliveryDays, setDeliveryDays] = useState(90);
  const [producerUnitsEnabled, setProducerUnitsEnabled] = useState(false);
  const [tiers, setTiers] = useState<TierForm[]>([
    { name: "Supporter", priceRupees: 99, perks: "Name in credits, digital badge" },
    { name: "Insider", priceRupees: 499, perks: "Above, 48h early access, behind the scenes" },
  ]);
  const [milestones, setMilestones] = useState<MilestoneForm[]>([
    { label: "Script lock", percentOfGoal: 30 },
    { label: "Shoot complete", percentOfGoal: 40 },
    { label: "Final cut uploaded", percentOfGoal: 30 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!user?.creator) return <p className="py-12 text-center text-[var(--text-dim)]">You need a creator channel first.</p>;
  const creatorHandle = user.creator.handle;

  const percentSum = milestones.reduce((s, m) => s + m.percentOfGoal, 0);

  function updateTier(i: number, patch: Partial<TierForm>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function updateMilestone(i: number, patch: Partial<MilestoneForm>) {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function submit() {
    setError(null);
    if (percentSum !== 100) {
      setError(`Milestone percentages must sum to 100 (currently ${percentSum})`);
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      await api.post("/api/campaigns", {
        filmTitle,
        pitch,
        goalRupees,
        deadline: new Date(now + deadlineDays * 86_400_000).toISOString(),
        deliveryDate: new Date(now + deliveryDays * 86_400_000).toISOString(),
        producerUnitsEnabled,
        tiers: tiers.map((t) => ({ name: t.name, priceRupees: t.priceRupees, perks: t.perks.split(",").map((p) => p.trim()) })),
        milestones,
      });
      router.push(`/c/${creatorHandle}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create campaign");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg py-4">
      <h1 className="font-serif text-2xl font-bold">Fund your next film</h1>

      <div className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label">Film title</label>
          <input className="input" value={filmTitle} onChange={(e) => setFilmTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Pitch</label>
          <textarea className="input" rows={3} value={pitch} onChange={(e) => setPitch(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Goal ₹</label>
            <input className="input" type="number" min={1} value={goalRupees} onChange={(e) => setGoalRupees(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Deadline (days)</label>
            <input className="input" type="number" min={1} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Delivery (days)</label>
            <input className="input" type="number" min={deadlineDays + 1} value={deliveryDays} onChange={(e) => setDeliveryDays(Number(e.target.value))} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={producerUnitsEnabled} onChange={(e) => setProducerUnitsEnabled(e.target.checked)} />
          Offer Producer Units (revenue share, where legally permitted)
        </label>

        <div>
          <div className="label mb-2">Perk tiers</div>
          {tiers.map((t, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_80px] gap-2">
              <input className="input" placeholder="Name" value={t.name} onChange={(e) => updateTier(i, { name: e.target.value })} />
              <input
                className="input"
                type="number"
                placeholder="₹"
                value={t.priceRupees}
                onChange={(e) => updateTier(i, { priceRupees: Number(e.target.value) })}
              />
              <input
                className="input col-span-2"
                placeholder="Perks, comma-separated"
                value={t.perks}
                onChange={(e) => updateTier(i, { perks: e.target.value })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary mt-1 text-xs"
            onClick={() => setTiers((p) => [...p, { name: "", priceRupees: 0, perks: "" }])}
          >
            + Add tier
          </button>
        </div>

        <div>
          <div className="label mb-2">
            Milestones <span className={percentSum === 100 ? "text-emerald-400" : "text-red-400"}>({percentSum}% / 100%)</span>
          </div>
          {milestones.map((m, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_80px] gap-2">
              <input className="input" placeholder="Label" value={m.label} onChange={(e) => updateMilestone(i, { label: e.target.value })} />
              <input
                className="input"
                type="number"
                placeholder="%"
                value={m.percentOfGoal}
                onChange={(e) => updateMilestone(i, { percentOfGoal: Number(e.target.value) })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary mt-1 text-xs"
            onClick={() => setMilestones((p) => [...p, { label: "", percentOfGoal: 0 }])}
          >
            + Add milestone
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy || !filmTitle}>
          {busy ? "Creating..." : "Launch campaign"}
        </button>
      </div>
    </div>
  );
}
