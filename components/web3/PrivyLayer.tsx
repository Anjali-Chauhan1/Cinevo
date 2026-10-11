"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
        externalWallets: { disableAllExternalWallets: true },
        embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
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
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Once Privy has signed someone in and their wallet exists, swap that for
  // a Cinova session (unless they already have one for this wallet).
  const syncSession = useCallback(async () => {
    if (!ready || !authenticated || !walletAddress || exchanging.current) return;
    exchanging.current = true;
    setSessionError(null);
    try {
      const me = await fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => null);
      const onAuthPage = window.location.pathname === "/login" || window.location.pathname === "/signup";
      if (me?.user?.walletAddress?.toLowerCase() === walletAddress.toLowerCase()) {
        if (onAuthPage) window.location.replace("/");
        return;
      }
      for (let attempt = 0; attempt < 5; attempt++) {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error("Your sign-in expired. Please sign out and sign in again.");
        const res = await fetch("/api/auth/privy", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        if (res.ok) {
          window.location.assign(onAuthPage ? "/" : window.location.href);
          return;
        }
        if (res.status !== 409 || attempt === 4) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Unable to finish signing in. Please try again.");
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to finish signing in. Please try again.");
    } finally {
      exchanging.current = false;
    }
  }, [ready, authenticated, walletAddress, getAccessToken]);

  useEffect(() => {
    void syncSession();
  }, [syncSession]);

  const startLogin = useCallback(() => {
    if (!ready) return;
    if (authenticated) {
      void syncSession();
      return;
    }
    login();
  }, [ready, authenticated, syncSession, login]);

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
      // Privy JSON-serialises the payload, which can't hold BigInt. EIP-712
      // encodes a uint256 given as a decimal string identically, so the
      // signature still verifies against the bigint message on the server.
      const jsonSafeMessage = {
        ...message,
        cumulativeAmount: message.cumulativeAmount.toString(),
        expiry: message.expiry.toString(),
      };
      const { signature } = await signTypedData(
        { domain: voucherDomain(vault), types: VOUCHER_TYPES, primaryType: "Voucher", message: jsonSafeMessage } as never,
        { address: walletAddress, uiOptions: { showWalletUIs: false } }
      );
      return signature as Hex;
    },
    [walletAddress, signTypedData]
  );

  const value = useMemo<OnchainContextValue>(
    () => ({ enabled: true, ready, authenticated, sessionError, walletAddress, login: startLogin, logout, sendTx, signVoucher }),
    [ready, authenticated, sessionError, walletAddress, startLogin, logout, sendTx, signVoucher]
  );
  return <OnchainContext.Provider value={value}>{children}</OnchainContext.Provider>;
}
