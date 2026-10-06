"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { relativeTime } from "@/lib/format";

interface PendingCreator {
  id: string;
  channelName: string;
  handle: string;
  verificationDocUrl: string | null;
  user: { email: string; displayName: string; createdAt: string };
}
interface PendingKyc {
  id: string;
  email: string;
  displayName: string;
  region: string;
  createdAt: string;
}
interface PendingMilestone {
  id: string;
  label: string;
  order: number;
  proofUrl: string | null;
  proofNote: string | null;
  campaign: { id: string; filmTitle: string; creator: { channelName: string } };
}
interface OpenReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
  reporter: { displayName: string; email: string };
}

type Tab = "creators" | "kyc" | "milestones" | "reports";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("creators");
  const [creators, setCreators] = useState<PendingCreator[]>([]);
  const [kyc, setKyc] = useState<PendingKyc[]>([]);
  const [milestones, setMilestones] = useState<PendingMilestone[]>([]);
  const [reports, setReports] = useState<OpenReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [c, k, m, r] = await Promise.all([
        api.get<{ creators: PendingCreator[] }>("/api/admin/creators/pending"),
        api.get<{ users: PendingKyc[] }>("/api/admin/kyc/pending"),
        api.get<{ milestones: PendingMilestone[] }>("/api/admin/milestones/pending"),
        api.get<{ reports: OpenReport[] }>("/api/admin/reports"),
      ]);
      setCreators(c.creators);
      setKyc(k.users);
      setMilestones(m.milestones);
      setReports(r.reports);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load admin data");
    }
  }

  useEffect(() => {
    if (user?.platformRole === "ADMIN") loadAll();
  }, [user]);

  if (loading) return null;
  if (user?.platformRole !== "ADMIN") return <p className="py-12 text-center text-[var(--text-dim)]">Admin access required.</p>;

  async function approveCreator(id: string) {
    await api.post(`/api/admin/creators/${id}/approve`);
    loadAll();
  }
  async function rejectCreator(id: string) {
    await api.post(`/api/admin/creators/${id}/reject`, { note: "Verification not sufficient" });
    loadAll();
  }
  async function approveKyc(id: string) {
    await api.post(`/api/admin/kyc/${id}/approve`);
    loadAll();
  }
  async function rejectKyc(id: string) {
    await api.post(`/api/admin/kyc/${id}/reject`);
    loadAll();
  }
  async function approveMilestone(campaignId: string, milestoneId: string) {
    await api.post(`/api/campaigns/${campaignId}/milestones/${milestoneId}/approve`);
    loadAll();
  }
  async function rejectMilestone(campaignId: string, milestoneId: string) {
    await api.post(`/api/campaigns/${campaignId}/milestones/${milestoneId}/reject`, { reason: "Proof insufficient" });
    loadAll();
  }
  async function resolveReport(id: string, status: "ACTIONED" | "DISMISSED") {
    await api.patch(`/api/admin/reports/${id}`, { status });
    loadAll();
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "creators", label: "Creator verification", count: creators.length },
    { key: "kyc", label: "KYC", count: kyc.length },
    { key: "milestones", label: "Milestones", count: milestones.length },
    { key: "reports", label: "Reports", count: reports.length },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">Admin</h1>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${tab === t.key ? "border-b-2 border-[var(--accent)] text-[var(--accent)]" : "text-[var(--text-dim)]"}`}
          >
            {t.label} {t.count > 0 && <span className="badge ml-1 bg-[var(--surface-raised)]">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {tab === "creators" &&
          (creators.length === 0 ? (
            <Empty text="No pending creator verifications." />
          ) : (
            creators.map((c) => (
              <div key={c.id} className="card p-4 text-sm">
                <div className="font-medium">{c.channelName} (@{c.handle})</div>
                <div className="text-xs text-[var(--text-dim)]">{c.user.displayName} · {c.user.email}</div>
                {c.verificationDocUrl && (
                  <a href={c.verificationDocUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)]">
                    {c.verificationDocUrl}
                  </a>
                )}
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => approveCreator(c.id)}>Approve</button>
                  <button className="btn-danger !py-1 !px-3 text-xs" onClick={() => rejectCreator(c.id)}>Reject</button>
                </div>
              </div>
            ))
          ))}

        {tab === "kyc" &&
          (kyc.length === 0 ? (
            <Empty text="No pending KYC requests." />
          ) : (
            kyc.map((k) => (
              <div key={k.id} className="card p-4 text-sm">
                <div className="font-medium">{k.displayName} ({k.region})</div>
                <div className="text-xs text-[var(--text-dim)]">{k.email} · requested {relativeTime(k.createdAt)}</div>
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => approveKyc(k.id)}>Approve</button>
                  <button className="btn-danger !py-1 !px-3 text-xs" onClick={() => rejectKyc(k.id)}>Reject</button>
                </div>
              </div>
            ))
          ))}

        {tab === "milestones" &&
          (milestones.length === 0 ? (
            <Empty text="No milestones awaiting review." />
          ) : (
            milestones.map((m) => (
              <div key={m.id} className="card p-4 text-sm">
                <div className="font-medium">
                  {m.campaign.filmTitle} — #{m.order} {m.label}
                </div>
                <div className="text-xs text-[var(--text-dim)]">{m.campaign.creator.channelName}</div>
                {m.proofUrl && (
                  <a href={m.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)]">
                    {m.proofUrl}
                  </a>
                )}
                {m.proofNote && <p className="mt-1 text-xs text-[var(--text-dim)]">{m.proofNote}</p>}
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => approveMilestone(m.campaign.id, m.id)}>
                    Release funds
                  </button>
                  <button className="btn-danger !py-1 !px-3 text-xs" onClick={() => rejectMilestone(m.campaign.id, m.id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))
          ))}

        {tab === "reports" &&
          (reports.length === 0 ? (
            <Empty text="No open reports." />
          ) : (
            reports.map((r) => (
              <div key={r.id} className="card p-4 text-sm">
                <div className="font-medium">{r.targetType} · {r.targetId}</div>
                <div className="text-xs text-[var(--text-dim)]">
                  Reported by {r.reporter.displayName} · {relativeTime(r.createdAt)}
                </div>
                <p className="mt-1">{r.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button className="btn-primary !py-1 !px-3 text-xs" onClick={() => resolveReport(r.id, "ACTIONED")}>
                    Mark actioned
                  </button>
                  <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => resolveReport(r.id, "DISMISSED")}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[var(--text-dim)]">{text}</p>;
}
