"use client";

import { useOnchain } from "@/components/web3/Onchain";

/** Onchain-mode sign in / sign up: one Privy flow (email or Google) for both. */
export function WalletSignIn({ title, subtitle }: { title: string; subtitle: string }) {
  const { ready, login } = useOnchain();
  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-[var(--text-dim)]">{subtitle}</p>
      <div className="card mt-6 space-y-3 p-5">
        <button className="btn-primary w-full" onClick={login} disabled={!ready}>
          {ready ? "Continue with email or Google" : "Loading…"}
        </button>
        <p className="text-xs text-[var(--text-dim)]">
          New here? The same button creates your account. Your Cinova balance is held for you — no wallet app, seed
          phrase or popups.
        </p>
      </div>
    </div>
  );
}
