"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { KYC, KycIdType } from "@/lib/constants";
import { relativeTime } from "@/lib/format";

interface KycState {
  kycStatus: string;
  region: string;
  latest: {
    legalName: string;
    country: string;
    idType: string;
    idNumberLast4: string;
    status: string;
    rejectionReason: string | null;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
}

const ID_TYPE_LABEL: Record<string, string> = {
  [KycIdType.PASSPORT]: "Passport",
  [KycIdType.DRIVERS_LICENSE]: "Driver's licence",
  [KycIdType.NATIONAL_ID]: "National ID card",
};

const countryName = (code: string) => KYC.COUNTRIES.find((c) => c.code === code)?.name ?? code;

// useSearchParams needs a Suspense boundary for the production build.
export default function VerifyIdentityPage() {
  return (
    <Suspense fallback={null}>
      <VerifyIdentity />
    </Suspense>
  );
}

function VerifyIdentity() {
  const { user, loading, refresh } = useAuth();
  // Where to send the user back to (e.g. the campaign they were backing).
  const next = useSearchParams().get("next");
  const returnTo = next?.startsWith("/") && !next.startsWith("//") ? next : null;
  const [state, setState] = useState<KycState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setState(await api.get<KycState>("/api/account/kyc"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your verification status");
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Plain fetch, not the JSON api helper: this is a multipart upload.
      const res = await fetch("/api/account/kyc", {
        method: "POST",
        body: new FormData(e.currentTarget),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submission failed");
      await Promise.all([load(), refresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <p className="text-[var(--text-dim)]">Sign in to verify your identity.</p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
      </div>
    );
  }
  if (!state) {
    return <p className="py-12 text-center text-[var(--text-dim)]">{error ?? "Loading..."}</p>;
  }

  const { kycStatus, latest } = state;
  const showForm = kycStatus === "NONE" || kycStatus === "REJECTED";

  return (
    <div className="mx-auto max-w-lg py-4">
      <span className="eyebrow">ACCOUNT</span>
      <h1 className="mt-2 font-serif text-2xl font-bold">Verify your identity</h1>
      <p className="mt-2 text-sm text-[var(--text-dim)]">
        Producer Units (a share of a film&apos;s revenue) are only offered to verified people in permitted regions.
        Your region is set from the country on your ID, not your location.
      </p>

      {kycStatus === "VERIFIED" && (
        <div className="card mt-6 p-5">
          <span className="badge bg-emerald-500/15 text-emerald-400">Verified</span>
          <p className="mt-3 text-sm">
            {latest?.legalName} · resident of {latest ? countryName(latest.country) : state.region}
          </p>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            {latest && `${ID_TYPE_LABEL[latest.idType]} ending ${latest.idNumberLast4}`}
            {latest?.reviewedAt && ` · verified ${relativeTime(latest.reviewedAt)}`}
          </p>
          {returnTo && <Link href={returnTo} className="btn-primary mt-4 inline-flex">Continue</Link>}
        </div>
      )}

      {kycStatus === "PENDING" && (
        <div className="card mt-6 p-5">
          <span className="badge bg-yellow-500/15 text-yellow-400">Under review</span>
          <p className="mt-3 text-sm">
            We&apos;re checking your documents. This usually takes a day or two — come back to this page to see the result.
          </p>
          {latest && (
            <p className="mt-1 text-xs text-[var(--text-dim)]">Submitted {relativeTime(latest.createdAt)}</p>
          )}
        </div>
      )}

      {kycStatus === "REJECTED" && latest?.rejectionReason && (
        <div className="card mt-6 border-red-500/30 p-4 text-sm">
          <span className="badge bg-red-500/15 text-red-400">Not approved</span>
          <p className="mt-2">{latest.rejectionReason}</p>
          <p className="mt-1 text-xs text-[var(--text-dim)]">Fix the issue above and submit again.</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
          <div>
            <label className="label" htmlFor="legalName">Full legal name (as on your ID)</label>
            <input id="legalName" name="legalName" className="input" required minLength={2} maxLength={120} autoComplete="name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="dateOfBirth">Date of birth</label>
              <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" required autoComplete="bday" />
            </div>
            <div>
              <label className="label" htmlFor="country">Country of residence</label>
              <select id="country" name="country" className="input" required defaultValue={state.region === "US" ? "US" : "IN"}>
                {KYC.COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="idType">ID type</label>
              <select id="idType" name="idType" className="input" required>
                {Object.entries(ID_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="idNumber">ID number</label>
              <input id="idNumber" name="idNumber" className="input" required minLength={4} maxLength={40} autoComplete="off" />
              <p className="mt-1 text-xs text-[var(--text-dim)]">We only keep the last 4 characters.</p>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="document">Photo or scan of your ID</label>
            <input id="document" name="document" type="file" accept="image/jpeg,image/png,application/pdf" required className="input" />
            <p className="mt-1 text-xs text-[var(--text-dim)]">JPG, PNG or PDF, up to 5 MB. All four corners visible.</p>
          </div>
          <div>
            <label className="label" htmlFor="selfie">Selfie holding the same ID</label>
            <input id="selfie" name="selfie" type="file" accept="image/jpeg,image/png" capture="user" required className="input" />
            <p className="mt-1 text-xs text-[var(--text-dim)]">JPG or PNG, up to 5 MB. Your face and the ID must both be clear.</p>
          </div>
          <p className="text-xs text-[var(--text-dim)]">
            Your documents are only seen by the review team and are never shown on your profile.
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={busy}>
            {busy ? "Uploading..." : kycStatus === "REJECTED" ? "Submit again" : "Submit for review"}
          </button>
        </form>
      )}
    </div>
  );
}
