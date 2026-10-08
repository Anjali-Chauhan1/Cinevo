"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/client-api";
import { paise, relativeTime } from "@/lib/format";
import type { Address } from "viem";
import { useOnchain } from "@/components/web3/Onchain";
import { paiseToUnits } from "@/lib/chain/config";
import { vaultAbi } from "@/lib/chain/abis";

interface WalletData {
  account: { balancePaise: number; pendingWithdrawPaise: number; withdrawRequestedAt: string | null };
  transactions: Array<{ id: string; type: string; amountPaise: number; createdAt: string; explorerUrl?: string | null }>;
  activeSubscriptions: Array<{ creatorId: string; creator: { handle: string; channelName: string } }>;
  backerPasses: Array<{ id: string; tierName: string; campaign: { filmTitle: string } }>;
  // Onchain mode only.
  onchain: {
    walletAddress: Address;
    vaultAddress: Address;
    withdrawReadyAt: string | null;
    faucetPaise: number;
    nextFaucetAt: string | null;
  } | null;
}

export default function WalletPage() {
  const { user, loading, refresh } = useAuth();
  const [data, setData] = useState<WalletData | null>(null);
  const [depositAmount, setDepositAmount] = useState(500);
  const [withdrawAmount, setWithdrawAmount] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const chain = useOnchain();

  async function load() {
    try {
      const res = await api.get<WalletData>("/api/wallet");
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load wallet");
    }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  if (loading) return null;
  if (!user) return <p className="py-12 text-center text-[var(--text-dim)]">Sign in to view your wallet.</p>;
  if (!data) return <p className="py-12 text-center text-[var(--text-dim)]">Loading...</p>;

  /** Runs a step, then reloads balances; shows the error inline if it fails. */
  async function run(step: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await step();
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const vaultCall = (functionName: string, args: readonly unknown[] = []) =>
    chain.sendTx({ address: data!.onchain!.vaultAddress, abi: vaultAbi, functionName, args });

  async function getTestMoney() {
    await run(async () => {
      const res = await api.post<{ amountPaise: number }>("/api/wallet/faucet");
      setNotice(`${paise(res.amountPaise)} of test money added.`);
    }, "Couldn't add test money");
  }

  async function onchainWithdraw(kind: "request" | "complete" | "cancel") {
    await run(async () => {
      const txHash =
        kind === "request"
          ? await vaultCall("requestWithdraw", [paiseToUnits(withdrawAmount * 100)])
          : await vaultCall(kind === "complete" ? "withdraw" : "cancelWithdraw");
      await api.post(`/api/wallet/withdraw/${kind}`, { txHash });
    }, "Withdrawal failed");
  }

  async function deposit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/wallet/deposit", { amountRupees: depositAmount });
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Top-up failed");
    } finally {
      setBusy(false);
    }
  }

  async function requestWithdraw() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/wallet/withdraw/request", { amountRupees: withdrawAmount });
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Withdraw request failed");
    } finally {
      setBusy(false);
    }
  }

  async function completeWithdraw() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/wallet/withdraw/complete");
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Withdrawal isn't unlocked yet");
    } finally {
      setBusy(false);
    }
  }

  async function cancelWithdraw() {
    setBusy(true);
    try {
      await api.post("/api/wallet/withdraw/cancel");
      await load();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const { account, transactions, activeSubscriptions, backerPasses, onchain } = data;
  const readyAt = onchain?.withdrawReadyAt
    ? new Date(onchain.withdrawReadyAt)
    : account.withdrawRequestedAt
      ? new Date(new Date(account.withdrawRequestedAt).getTime() + 10 * 60_000)
      : null;
  const withdrawReady = readyAt ? new Date() >= readyAt : false;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="font-serif text-2xl font-bold">Wallet</h1>
        <p className="mt-1 text-xs text-[var(--text-dim)]">
          {onchain
            ? "Settles in a USD stablecoin on Monad testnet — you only ever see rupees. Test money has no real value."
            : "Settles in a demo USD-pegged stablecoin behind the scenes — you only ever see rupees."}
        </p>

        <div className="card mt-6 p-6">
          <div className="text-sm text-[var(--text-dim)]">Balance</div>
          <div className="font-serif text-3xl font-bold">{paise(account.balancePaise)}</div>
          {account.pendingWithdrawPaise > 0 && (
            <div className="mt-2 text-xs text-yellow-400">
              {paise(account.pendingWithdrawPaise)} locked for withdrawal
              {readyAt && !withdrawReady && ` — unlocks ${relativeTime(readyAt)}`}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-400">{notice}</p>}

        <h2 className="mb-2 mt-8 font-serif text-lg font-semibold">Recent activity</h2>
        <div className="card divide-y divide-[var(--border)]">
          {transactions.length === 0 && <p className="p-4 text-sm text-[var(--text-dim)]">No activity yet.</p>}
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">{t.type.replaceAll("_", " ").toLowerCase()}</div>
                <div className="text-xs text-[var(--text-dim)]">
                  {relativeTime(t.createdAt)}
                  {t.explorerUrl && (
                    <>
                      {" · "}
                      <a href={t.explorerUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
                        Receipt ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <span className={t.amountPaise >= 0 ? "text-emerald-400" : "text-[var(--text-dim)]"}>
                {t.amountPaise >= 0 ? "+" : ""}
                {paise(t.amountPaise)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <aside className="space-y-4">
        {onchain ? (
          <div className="card p-4">
            <h3 className="mb-1 font-medium">Add money (testnet)</h3>
            <p className="text-xs text-[var(--text-dim)]">
              On testnet, top-ups are free test money. In production this is a card or UPI payment.
            </p>
            <button className="btn-primary mt-3 w-full" onClick={getTestMoney} disabled={busy || !!onchain.nextFaucetAt}>
              {onchain.nextFaucetAt ? `Available again ${relativeTime(onchain.nextFaucetAt)}` : `Get ${paise(onchain.faucetPaise)} of test money`}
            </button>
            <p className="mt-3 break-all text-[11px] text-[var(--text-dim)]">Account: {onchain.walletAddress}</p>
          </div>
        ) : (
          <div className="card p-4">
            <h3 className="mb-2 font-medium">Top up (demo)</h3>
            <input className="input" type="number" min={1} value={depositAmount} onChange={(e) => setDepositAmount(Number(e.target.value))} />
            <button className="btn-primary mt-2 w-full" onClick={deposit} disabled={busy}>Add ₹{depositAmount}</button>
          </div>
        )}

        <div className="card p-4">
          <h3 className="mb-2 font-medium">Withdraw</h3>
          {account.pendingWithdrawPaise > 0 ? (
            <div className="space-y-2">
              <button
                className="btn-primary w-full"
                onClick={onchain ? () => onchainWithdraw("complete") : completeWithdraw}
                disabled={busy || !withdrawReady}
              >
                {withdrawReady ? "Complete withdrawal" : readyAt ? `Unlocks ${relativeTime(readyAt)}` : "Unlocks in 10 min"}
              </button>
              <button className="btn-secondary w-full" onClick={onchain ? () => onchainWithdraw("cancel") : cancelWithdraw} disabled={busy}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <input className="input" type="number" min={1} value={withdrawAmount} onChange={(e) => setWithdrawAmount(Number(e.target.value))} />
              <p className="mt-1 text-xs text-[var(--text-dim)]">10-minute cooldown before funds release.</p>
              <button
                className="btn-secondary mt-2 w-full"
                onClick={onchain ? () => onchainWithdraw("request") : requestWithdraw}
                disabled={busy || withdrawAmount <= 0}
              >
                Request withdrawal
              </button>
            </>
          )}
        </div>

        {activeSubscriptions.length > 0 && (
          <div className="card p-4">
            <h3 className="mb-2 font-medium">Active subscriptions</h3>
            {activeSubscriptions.map((s) => (
              <Link key={s.creatorId} href={`/c/${s.creator.handle}`} className="block py-1 text-sm hover:text-[var(--accent)]">
                {s.creator.channelName}
              </Link>
            ))}
          </div>
        )}

        {backerPasses.length > 0 && (
          <div className="card p-4">
            <h3 className="mb-2 font-medium">Backer passes</h3>
            {backerPasses.map((p) => (
              <div key={p.id} className="py-1 text-sm">
                {p.campaign.filmTitle} <span className="text-[var(--text-dim)]">· {p.tierName}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
