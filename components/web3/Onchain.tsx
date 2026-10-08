"use client";

import { createContext, useContext, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Abi, Address, Hex } from "viem";
import { isOnchain } from "@/lib/chain/config";

/**
 * Onchain mode in the browser: wraps the app in Privy, turns a Privy login
 * into a Cinova session, and gives components two helpers —
 *   sendTx:      a gas-sponsored contract call from the user's embedded wallet
 *   signVoucher: a silent EIP-712 signature for pay-per-minute
 * Off-chain (demo) mode renders children untouched and `enabled` is false.
 */

export interface ContractCall {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export interface VoucherMessage {
  viewer: Address;
  episodeId: Hex;
  sessionId: Hex;
  cumulativeAmount: bigint;
  expiry: bigint;
}

export interface OnchainContextValue {
  enabled: boolean;
  ready: boolean;
  walletAddress: Address | null;
  login: () => void;
  logout: () => Promise<void>;
  sendTx: (call: ContractCall) => Promise<Hex>;
  signVoucher: (vault: Address, message: VoucherMessage) => Promise<Hex>;
}

const disabled: OnchainContextValue = {
  enabled: false,
  ready: true,
  walletAddress: null,
  login: () => {},
  logout: async () => {},
  sendTx: async () => {
    throw new Error("Onchain mode is off");
  },
  signVoucher: async () => {
    throw new Error("Onchain mode is off");
  },
};

export const OnchainContext = createContext<OnchainContextValue>(disabled);

export const useOnchain = () => useContext(OnchainContext);

// Privy's SDK is large; it lives in its own chunk that only loads in onchain
// mode, so the demo-ledger app never downloads it.
const PrivyLayer = dynamic(() => import("@/components/web3/PrivyLayer"));

export function OnchainProvider({ children }: { children: ReactNode }) {
  if (!isOnchain) return <>{children}</>;
  return <PrivyLayer>{children}</PrivyLayer>;
}
