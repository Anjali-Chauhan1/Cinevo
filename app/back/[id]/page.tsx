"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { paise, relativeTime } from "@/lib/format";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import { useOnchain } from "@/components/web3/Onchain";
import { getAddresses } from "@/lib/chain/config";
import { filmCampaignAbi, vaultAbi } from "@/lib/chain/abis";

// The exact sentences backers tick. Onchain, the hash of the one they
// accepted is recorded with their backing, so it must be this text.
const PERK_ACK = "I understand this supports the creator and receive rewards, not financial returns.";
const unitAck = (lockUpMonths: number) =>
  `I understand revenue share is not guaranteed and units lock up for ${lockUpMonths} months.`;
const ackHash = (text: string): Hex => keccak256(toBytes(text));

interface Tier {
  id: string;
  name: string;
  pricePaise: number;
  perks: string;
  backerLimit: number | null;
  backedCount: number;
  /** Position of this tier in the onchain campaign. */
  chainIndex: number;
}
interface Milestone {
  id: string;
  order: number;
  label: string;
  percentOfGoal: number;
  status: string;
}
interface CampaignData {
  campaign: {
    id: string;
    filmTitle: string;
    pitch: string | null;
    pitchVideoUrl: string | null;
    goalPaise: number;
    totalBackedPaise: number;
    deadline: string;
    deliveryDate: string;
    status: string;
    producerUnitsEnabled: boolean;
    tiers: Tier[];
    milestones: Milestone[];
    creator: { handle: string; channelName: string };
  };
  backerCount: number;
  onchain: { contractAddress: Address | null } | null;
  unitEconomics: { unitPricePaise: number; maxPaisePerPerson: number; lockUpMonths: number; permittedRegions: string[] } | null;
  viewerState: {
    signedIn: boolean;
    isOwner?: boolean;
    myBackings?: Array<{ type: string; amountPaise: number; status: string }>;
    myUnits?: number;
    producerUnitsAvailableToViewer?: boolean;
    kycStatus?: string;
    region?: string;
  };
}

export default function CampaignPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user, refresh: refreshAuth } = useAuth();
  const [data, setData] = useState<CampaignData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [unitAmount, setUnitAmount] = useState(100);
  const [showUnitCheckout, setShowUnitCheckout] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const chain = useOnchain();

  async function load() {
    try {
      const res = await api.get<CampaignData>(`/api/campaigns/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load campaign");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="py-12 text-center text-[var(--text-dim)]">{error}</p>;
  if (!data) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;

  const { campaign, backerCount, unitEconomics, viewerState } = data;
  const verifyHref = `/verify?next=${encodeURIComponent(`/back/${id}`)}`;
  const pct = Math.min(100, Math.round((campaign.totalBackedPaise / campaign.goalPaise) * 100));
  const contract = data.onchain?.contractAddress ?? null;
  const errorText = (err: unknown, fallback: string) => (err instanceof ApiError || err instanceof Error ? err.message : fallback);

  /** Onchain: the backer's wallet pays from their Cinova balance, then the server confirms it. */
  async function onchainBack(functionName: "backCampaign" | "buyUnits", args: readonly unknown[]) {
    if (!contract) throw new Error("This campaign isn't onchain yet");
    const txHash = await chain.sendTx({ address: getAddresses().vault, abi: vaultAbi, functionName, args: [contract, ...args] });
    await api.post(`/api/campaigns/${id}/back`, { txHash });
  }

  async function onchainCampaignCall(functionName: "claimRefund" | "claimRevenue") {
    if (!contract) throw new Error("This campaign isn't onchain yet");
    return chain.sendTx({ address: contract, abi: filmCampaignAbi, functionName });
  }

  async function backPerk() {
    if (!selectedTier || !ack) return;
    setBusy(true);
    setError(null);
    try {
      if (chain.enabled) await onchainBack("backCampaign", [selectedTier.chainIndex, ackHash(PERK_ACK)]);
      else await api.post(`/api/campaigns/${id}/back`, { type: "PERK", tierId: selectedTier.id, riskAcknowledged: true });
      setSelectedTier(null);
      setAck(false);
      await load();
      await refreshAuth();
    } catch (err) {
      setError(errorText(err, "Backing failed"));
    } finally {
      setBusy(false);
    }
  }

  async function backUnits() {
    if (!ack) return;
    setBusy(true);
    setError(null);
    try {
      if (chain.enabled && unitEconomics) {
        const units = Math.floor((unitAmount * 100) / unitEconomics.unitPricePaise);
        await onchainBack("buyUnits", [BigInt(units), ackHash(unitAck(unitEconomics.lockUpMonths))]);
      } else {
        await api.post(`/api/campaigns/${id}/back`, {
          type: "PRODUCER_UNIT",
          amountRupees: unitAmount,
          riskAcknowledged: true,
        });
      }
      setShowUnitCheckout(false);
      setAck(false);
      await load();
      await refreshAuth();
    } catch (err) {
      setError(errorText(err, "Backing failed"));
    } finally {
      setBusy(false);
    }
  }

  async function claimRefund() {
    setBusy(true);
    try {
      if (chain.enabled) await api.post(`/api/campaigns/${id}/refund`, { txHash: await onchainCampaignCall("claimRefund") });
      else await api.post(`/api/campaigns/${id}/refund`);
      await load();
      await refreshAuth();
    } catch (err) {
      setError(errorText(err, "Refund failed"));
    } finally {
      setBusy(false);
    }
  }

  async function claimRevenue() {
    setBusy(true);
    try {
      const res = chain.enabled
        ? await api.post<{ claimedPaise: number }>(`/api/campaigns/${id}/claim-revenue`, { txHash: await onchainCampaignCall("claimRevenue") })
        : await api.post<{ claimedPaise: number }>(`/api/campaigns/${id}/claim-revenue`);
      await load();
      await refreshAuth();
      setError(`Claimed ${paise(res.claimedPaise)}`);
    } catch (err) {
      setError(errorText(err, "Claim failed"));
    } finally {
      setBusy(false);
    }
  }

  const myActiveBacking = viewerState.myBackings?.find((b) => b.status === "ACTIVE");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <Link href={`/c/${campaign.creator.handle}`} className="text-sm text-[var(--text-dim)] hover:text-[var(--accent)]">
          {campaign.creator.channelName}
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-bold">{campaign.filmTitle}</h1>
        {campaign.pitch && <p className="mt-3 text-sm text-[var(--text-dim)]">{campaign.pitch}</p>}

        <div className="card mt-6 p-4">
          <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-raised)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span>
              <span className="font-semibold">{paise(campaign.totalBackedPaise)}</span>{" "}
              <span className="text-[var(--text-dim)]">raised of {paise(campaign.goalPaise)}</span>
            </span>
            <span className="text-[var(--text-dim)]">{backerCount} backers</span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-dim)]">
            Deadline {relativeTime(campaign.deadline)} · Delivery promised {relativeTime(campaign.deliveryDate)}
          </div>
          <div className="mt-1 text-xs">
            <span
              className={`badge ${
                campaign.status === "ACTIVE"
                  ? "bg-blue-500/15 text-blue-400"
                  : campaign.status === "DELIVERED"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : campaign.status === "FAILED_REFUNDING"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-[var(--surface-raised)] text-[var(--text-dim)]"
              }`}
            >
              {campaign.status.replace("_", " ").toLowerCase()}
            </span>
          </div>
        </div>

        {campaign.status === "FAILED_REFUNDING" && myActiveBacking && (
          <div className="card mt-4 border-red-500/30 p-4">
            <p className="text-sm">This campaign didn&apos;t meet its goal or delivery deadline. You can claim a refund.</p>
            <button className="btn-danger mt-2" onClick={claimRefund} disabled={busy}>Claim refund</button>
          </div>
        )}

        {(viewerState.myUnits ?? 0) > 0 && (
          <div className="card mt-4 p-4">
            <p className="text-sm">You hold {viewerState.myUnits} Producer Units in this film.</p>
            <button className="btn-secondary mt-2" onClick={claimRevenue} disabled={busy}>Claim revenue</button>
          </div>
        )}

        <section className="mt-8">
          <h2 className="mb-3 font-serif text-lg font-semibold">Milestones</h2>
          <ol className="space-y-2">
            {campaign.milestones.map((m) => (
              <li key={m.id} className="card p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{m.order}. {m.label} ({m.percentOfGoal}% of goal)</span>
                  <span
                    className={`badge ${
                      m.status === "RELEASED"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : m.status === "SUBMITTED"
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-[var(--surface-raised)] text-[var(--text-dim)]"
                    }`}
                  >
                    {m.status.toLowerCase()}
                  </span>
                </div>
                {viewerState.isOwner && (m.status === "PENDING" || m.status === "REJECTED") && (
                  <MilestoneSubmitForm campaignId={campaign.id} milestoneId={m.id} onSubmitted={load} />
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <h3 className="mb-3 font-medium">Back this film</h3>
          <div className="space-y-2">
            {campaign.tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t)}
                disabled={campaign.status !== "ACTIVE" || !!viewerState.isOwner}
                className={`w-full rounded-lg border p-3 text-left text-sm ${
                  selectedTier?.id === t.id ? "border-[var(--accent)]" : "border-[var(--border)]"
                } hover:border-[var(--accent)]/60 disabled:opacity-50`}
              >
                <div className="flex justify-between font-medium">
                  <span>{t.name}</span>
                  <span>{paise(t.pricePaise)}</span>
                </div>
                <ul className="mt-1 text-xs text-[var(--text-dim)]">
                  {JSON.parse(t.perks).map((p: string, i: number) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {selectedTier && (
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <label className="flex items-start gap-2 text-xs text-[var(--text-dim)]">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                {PERK_ACK}
              </label>
              {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
              <button className="btn-primary mt-2 w-full" onClick={backPerk} disabled={!ack || busy || !user}>
                {user ? `Back ${paise(selectedTier.pricePaise)}` : "Sign in to back"}
              </button>
            </div>
          )}
        </div>

        {campaign.producerUnitsEnabled && unitEconomics && (
          <div className="card p-4">
            <h3 className="mb-1 font-medium">Producer Units</h3>
            <p className="text-xs text-[var(--text-dim)]">
              Earn a share of this film&apos;s revenue if it performs. Capped at {paise(unitEconomics.maxPaisePerPerson)}
              /person, {unitEconomics.lockUpMonths}-month lock-up, {unitEconomics.permittedRegions.join(", ")} only, KYC required.
            </p>

            {!user ? (
              <Link href="/login" className="btn-secondary mt-3 w-full">Sign in</Link>
            ) : !viewerState.producerUnitsAvailableToViewer ? (
              viewerState.region !== "US" ? (
                <p className="mt-3 text-xs text-yellow-400">Not available in your region yet.</p>
              ) : viewerState.kycStatus === "PENDING" ? (
                <p className="mt-3 text-xs text-yellow-400">
                  Your identity check is under review. <Link href={verifyHref} className="underline">Check status</Link>
                </p>
              ) : viewerState.kycStatus === "REJECTED" ? (
                <p className="mt-3 text-xs text-red-400">
                  Your identity check wasn&apos;t approved. <Link href={verifyHref} className="underline">See why and resubmit</Link>
                </p>
              ) : (
                <Link href={verifyHref} className="btn-secondary mt-3 w-full">
                  Verify your identity
                </Link>
              )
            ) : showUnitCheckout ? (
              <div className="mt-3">
                <input
                  className="input"
                  type="number"
                  step={unitEconomics.unitPricePaise / 100}
                  min={unitEconomics.unitPricePaise / 100}
                  value={unitAmount}
                  onChange={(e) => setUnitAmount(Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-[var(--text-dim)]">
                  {Math.floor((unitAmount * 100) / unitEconomics.unitPricePaise)} units
                </p>
                <label className="mt-2 flex items-start gap-2 text-xs text-[var(--text-dim)]">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                  {unitAck(unitEconomics.lockUpMonths)}
                </label>
                <button className="btn-primary mt-2 w-full" onClick={backUnits} disabled={!ack || busy}>
                  Buy ₹{unitAmount} of units
                </button>
              </div>
            ) : (
              <button className="btn-primary mt-3 w-full" onClick={() => setShowUnitCheckout(true)}>
                Buy Producer Units
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

/** Lets a campaign owner attach proof for a pending milestone so an admin
 * can review and release that slice of escrow. */
function MilestoneSubmitForm({
  campaignId,
  milestoneId,
  onSubmitted,
}: {
  campaignId: string;
  milestoneId: string;
  onSubmitted: () => void;
}) {
  const [proofUrl, setProofUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!proofUrl) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/campaigns/${campaignId}/milestones/${milestoneId}/submit`, { proofUrl, proofNote: note });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit proof");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 border-t border-[var(--border)] pt-2">
      <input
        className="input"
        placeholder="Proof link (footage, receipts, script draft...)"
        value={proofUrl}
        onChange={(e) => setProofUrl(e.target.value)}
      />
      <textarea
        className="input mt-2"
        rows={2}
        placeholder="Note for the reviewer (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      <button className="btn-secondary mt-2" onClick={submit} disabled={busy || !proofUrl}>
        Submit for review
      </button>
    </div>
  );
}
