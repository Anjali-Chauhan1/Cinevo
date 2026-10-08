"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { PrivyProvider, usePrivy, useSendTransaction, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { chain, VOUCHER_TYPES, voucherDomain } from "@/lib/chain/config";
import { OnchainContext, type ContractCall, type OnchainContextValue, type VoucherMessage } from "@/components/web3/Onchain";

/** Onchain mode only (loaded lazily by OnchainProvider): Privy + the session bridge. */

// Gas sponsorship is on by default (the user never holds MON); it can be
// turned off for local testing with a funded wallet.
const SPONSOR_GAS = process.env.NEXT_PUBLIC_SPONSOR_GAS !== "false";

export default function PrivyLayer({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    return (
      <div className="m-8 rounded-lg border border-red-500/40 p-4 text-sm">
        Onchain mode is on but NEXT_PUBLIC_PRIVY_APP_ID is not set. Add it to .env, or set NEXT_PUBLIC_CHAIN_MODE=offchain.
      </div>
    );
  }
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", accentColor: "#e8b86a", landingHeader: "Sign in to Cinova" },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { signTypedData } = useSignTypedData();
  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const walletAddress = (embedded?.address as Address | undefined) ?? null;
  const exchanging = useRef(false);

  // Once Privy has signed someone in and their wallet exists, swap that for
  // a Cinova session (unless they already have one for this wallet).
  useEffect(() => {
    if (!ready || !authenticated || !walletAddress || exchanging.current) return;
    exchanging.current = true;
    (async () => {
      const me = await fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => null);
      if (me?.user?.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) return;
      for (let attempt = 0; attempt < 5; attempt++) {
        const accessToken = await getAccessToken();
        const res = await fetch("/api/auth/privy", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        if (res.ok) {
          // Full reload so server-rendered pages (like "/") pick up the session.
          window.location.assign(window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/signup") ? "/" : window.location.href);
          return;
        }
        if (res.status !== 409) break; // 409 = wallet still being created; retry shortly
        await new Promise((r) => setTimeout(r, 1500));
      }
      exchanging.current = false;
    })();
  }, [ready, authenticated, walletAddress, getAccessToken]);

  const sendTx = useCallback(
    async (call: ContractCall) => {
      if (!walletAddress) throw new Error("Your wallet isn't ready yet — try again in a moment");
      const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args ?? [] } as never);
      const { hash } = await sendTransaction(
        { to: call.address, data, chainId: chain.id },
        { sponsor: SPONSOR_GAS, address: walletAddress, uiOptions: { showWalletUIs: false } }
      );
      return hash;
    },
    [walletAddress, sendTransaction]
  );

  const signVoucher = useCallback(
    async (vault: Address, message: VoucherMessage) => {
      if (!walletAddress) throw new Error("Your wallet isn't ready yet");
      const { signature } = await signTypedData(
        { domain: voucherDomain(vault), types: VOUCHER_TYPES, primaryType: "Voucher", message } as never,
        { address: walletAddress, uiOptions: { showWalletUIs: false } }
      );
      return signature as Hex;
    },
    [walletAddress, signTypedData]
  );

  const value = useMemo<OnchainContextValue>(
    () => ({ enabled: true, ready, walletAddress, login, logout, sendTx, signVoucher }),
    [ready, walletAddress, login, logout, sendTx, signVoucher]
  );
  return <OnchainContext.Provider value={value}>{children}</OnchainContext.Provider>;
}
