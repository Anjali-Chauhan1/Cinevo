"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/client-api";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already remembered by the site — no need to sign in again. Full page
  // loads (not router.push) so "/" is re-rendered with the new session
  // instead of served from the client router cache.
  useEffect(() => {
    if (!loading && user) window.location.replace("/");
  }, [loading, user]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      window.location.assign("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-2xl font-bold">Sign in to Cinevo</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">
        No wallet popups, no seed phrases — just email.
      </p>

      <form onSubmit={onSubmit} className="card mt-6 space-y-4 p-5">
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-[var(--text-dim)]">
        New here? <Link href="/signup" className="text-[var(--accent)]">Create an account</Link>
      </p>
    </div>
  );
}
