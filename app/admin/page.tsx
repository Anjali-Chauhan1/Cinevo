"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { paise, relativeTime } from "@/lib/format";

interface PendingCreator {
  id: string;
  channelName: string;
  handle: string;
  verificationDocUrl: string | null;
  bio: string | null;
  bannerUrl: string | null;
  socialLinks: string | null; // JSON array of strings
  subPriceRupeesPaise: number;
  createdAt: string;
  user: { email: string; displayName: string; createdAt: string; region: string; kycStatus: string };
}
interface PendingKyc {
  id: string;
  userId: string;
  legalName: string;
  dateOfBirth: string;
  country: string;
  idType: string;
  idNumberLast4: string;
  createdAt: string;
  priorRejections: number;
  sameIdOtherAccounts: number;
  user: { email: string; displayName: string; region: string };
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
        api.get<{ submissions: PendingKyc[] }>("/api/admin/kyc/pending"),
        api.get<{ milestones: PendingMilestone[] }>("/api/admin/milestones/pending"),
        api.get<{ reports: OpenReport[] }>("/api/admin/reports"),
      ]);
      setCreators(c.creators);
      setKyc(k.submissions);
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
              <CreatorReviewCard key={c.id} creator={c} onApprove={() => approveCreator(c.id)} onReject={() => rejectCreator(c.id)} />
            ))
          ))}

        {tab === "kyc" &&
          (kyc.length === 0 ? (
            <Empty text="No identity checks waiting for review." />
          ) : (
            kyc.map((k) => <KycReviewCard key={k.id} submission={k} onDone={loadAll} />)
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

const ID_TYPE_LABEL: Record<string, string> = {
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's licence",
  NATIONAL_ID: "National ID",
};

function ageFrom(dob: string) {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

/** One pending identity check: details, both documents, and approve /
 * reject-with-reason. The reason is shown to the user on /verify. */
function KycReviewCard({ submission: k, onDone }: { submission: PendingKyc; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = (kind: "document" | "selfie") => `/api/admin/kyc/files/${k.id}/${kind}`;

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/kyc/${k.userId}/${action}`, action === "reject" ? { reason } : undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">{k.legalName}</div>
        <div className="text-xs text-[var(--text-dim)]">submitted {relativeTime(k.createdAt)}</div>
      </div>
      <div className="text-xs text-[var(--text-dim)]">
        Account: {k.user.displayName} · {k.user.email} · signed up as {k.user.region}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div><dt className="text-[var(--text-dim)]">Date of birth</dt><dd>{k.dateOfBirth.slice(0, 10)} ({ageFrom(k.dateOfBirth)})</dd></div>
        <div><dt className="text-[var(--text-dim)]">Residence</dt><dd>{k.country}</dd></div>
        <div><dt className="text-[var(--text-dim)]">ID</dt><dd>{ID_TYPE_LABEL[k.idType] ?? k.idType}</dd></div>
        <div><dt className="text-[var(--text-dim)]">ID ends</dt><dd>…{k.idNumberLast4}</dd></div>
      </dl>
      {k.sameIdOtherAccounts > 0 && (
        <p className="mt-2 text-xs text-red-400">
          This ID was also submitted from {k.sameIdOtherAccounts} other account{k.sameIdOtherAccounts === 1 ? "" : "s"}. Each person may verify only once.
        </p>
      )}
      {k.priorRejections > 0 && (
        <p className="mt-2 text-xs text-yellow-400">Rejected {k.priorRejections} time{k.priorRejections === 1 ? "" : "s"} before.</p>
      )}
      <div className="mt-3 flex gap-3 text-xs">
        <a href={files("document")} target="_blank" rel="noreferrer" className="text-[var(--accent)]">View ID document ↗</a>
        <a href={files("selfie")} target="_blank" rel="noreferrer" className="text-[var(--accent)]">View selfie ↗</a>
      </div>
      {rejecting ? (
        <div className="mt-3">
          <label className="label" htmlFor={`reason-${k.id}`}>Reason shown to the user</label>
          <textarea
            id={`reason-${k.id}`}
            className="input"
            rows={2}
            maxLength={300}
            placeholder="e.g. The ID photo is blurry — please upload a clearer one."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button className="btn-danger !py-1 !px-3 text-xs" disabled={busy || reason.trim().length < 5} onClick={() => act("reject")}>
              Confirm rejection
            </button>
            <button className="btn-secondary !py-1 !px-3 text-xs" disabled={busy} onClick={() => setRejecting(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="btn-primary !py-1 !px-3 text-xs" disabled={busy} onClick={() => act("approve")}>
            Approve
          </button>
          <button className="btn-danger !py-1 !px-3 text-xs" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-[var(--text-dim)]">{text}</p>;
}

function parseSocialLinks(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const links: unknown = JSON.parse(raw);
    return Array.isArray(links) ? links.filter((l): l is string => typeof l === "string" && l.trim() !== "") : [];
  } catch {
    return [];
  }
}

function CreatorReviewCard({ creator: c, onApprove, onReject }: { creator: PendingCreator; onApprove: () => void; onReject: () => void }) {
  const [open, setOpen] = useState(false);
  const socialLinks = parseSocialLinks(c.socialLinks);
  // Only what the creator actually submitted counts; with none of it there is nothing to expand.
  const hasDetails = Boolean(c.bio?.trim() || c.bannerUrl?.trim() || c.verificationDocUrl?.trim() || socialLinks.length);
  const account = `${c.user.displayName} · ${c.user.email}`;

  return (
    <div className="card p-4 text-sm">
      <div className="font-medium">{c.channelName} (@{c.handle})</div>
      {hasDetails ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={`creator-details-${c.id}`}
          className="text-left text-xs text-[var(--accent)] hover:underline"
        >
          {account} {open ? "▴" : "▾"}
        </button>
      ) : (
        <div className="text-xs text-[var(--text-dim)]">{account}</div>
      )}
      {open && hasDetails && (
        <dl id={`creator-details-${c.id}`} className="mt-3 grid gap-x-4 gap-y-2 rounded-lg bg-[var(--surface-raised)] p-3 text-xs sm:grid-cols-2">
          <div><dt className="text-[var(--text-dim)]">Applied</dt><dd>{relativeTime(c.createdAt)}</dd></div>
          <div><dt className="text-[var(--text-dim)]">Account created</dt><dd>{relativeTime(c.user.createdAt)}</dd></div>
          {c.user.region && <div><dt className="text-[var(--text-dim)]">Region</dt><dd>{c.user.region}</dd></div>}
          {c.user.kycStatus && <div><dt className="text-[var(--text-dim)]">KYC</dt><dd>{c.user.kycStatus}</dd></div>}
          <div><dt className="text-[var(--text-dim)]">Subscription price</dt><dd>{paise(c.subPriceRupeesPaise)}/month</dd></div>
          {c.bio?.trim() && <div className="sm:col-span-2"><dt className="text-[var(--text-dim)]">Bio</dt><dd className="whitespace-pre-line">{c.bio}</dd></div>}
          {c.verificationDocUrl?.trim() && <div className="sm:col-span-2"><dt className="text-[var(--text-dim)]">Verification link</dt><dd className="break-all">{c.verificationDocUrl}</dd></div>}
          {c.bannerUrl?.trim() && <div className="sm:col-span-2"><dt className="text-[var(--text-dim)]">Banner</dt><dd className="break-all">{c.bannerUrl}</dd></div>}
          {socialLinks.length > 0 && (
            <div className="sm:col-span-2"><dt className="text-[var(--text-dim)]">Social links</dt><dd className="flex flex-col break-all">{socialLinks.map((l) => <span key={l}>{l}</span>)}</dd></div>
          )}
        </dl>
      )}
      <div className="mt-2 flex gap-2">
        <button className="btn-primary !py-1 !px-3 text-xs" onClick={onApprove}>Approve</button>
        <button className="btn-danger !py-1 !px-3 text-xs" onClick={onReject}>Reject</button>
      </div>
    </div>
  );
}
