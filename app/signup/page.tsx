"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/client-api";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegion] = useState("IN");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signup(email, password, displayName, region);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-2xl font-bold">Join Cinevo</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        You&apos;ll get a ₹500 demo balance to try tipping, subscriptions and pay-per-minute.
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
        <div>
          <label className="label">Display name</label>
          <input className="input" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Region</label>
          <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="OTHER">Other</option>
          </select>
          <p className="mt-1 text-xs text-[var(--text-dim)]">
            Used only to apply the right funding rules (Producer Units are currently US-only).
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--text-dim)]">
        Already have an account? <Link href="/login" className="text-[var(--accent)]">Sign in</Link>
      </p>
    </div>
  );
}
