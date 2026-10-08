import { defineChain, keccak256, toBytes, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";
import deployments from "@/lib/chain/deployments.json";

/**
 * Settings shared by the server and the browser for onchain mode.
 *
 * NEXT_PUBLIC_CHAIN_MODE=onchain switches money onto Monad: Privy wallets,
 * the CinovaVault balance, signed vouchers. Anything else (or unset) keeps
 * the demo ledger in the database, so the app runs with no chain setup at all.
 */
export const isOnchain = process.env.NEXT_PUBLIC_CHAIN_MODE === "onchain";

const LOCAL_CHAIN_ID = 31337;
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || monadTestnet.id);
export const isLocalChain = CHAIN_ID === LOCAL_CHAIN_ID;

/** Monad testnet, or a local Hardhat node for development and tests. */
export const chain = isLocalChain
  ? defineChain({
      id: LOCAL_CHAIN_ID,
      name: "Hardhat (local)",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545"] } },
    })
  : process.env.NEXT_PUBLIC_RPC_URL
    ? { ...monadTestnet, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL] } } }
    : monadTestnet;

export interface CinovaAddresses {
  registry: Address;
  vault: Address;
  subscriptions: Address;
  tips: Address;
  backerPass: Address;
  campaignFactory: Address;
  token: Address;
}

/** Deployed contract addresses for the configured chain (from contracts/: npm run export-app). */
export function getAddresses(): CinovaAddresses {
  const found = (deployments as Record<string, Partial<CinovaAddresses>>)[String(CHAIN_ID)];
  if (!found?.vault) {
    throw new Error(
      `No Cinova contracts deployed for chain ${CHAIN_ID}. Deploy them, then run "npm run export-app" in contracts/.`
    );
  }
  return found as CinovaAddresses;
}

export function explorerTxUrl(hash: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : null;
}

// ---------------------------------------------------------------------------
// Money: the app prices everything in paise (₹); the chain settles in a USD
// stablecoin with 6 decimals. One fixed rate converts between them, so the
// server and the browser always agree on a voucher's amount.
// ---------------------------------------------------------------------------

export const USD_INR_RATE = Number(process.env.NEXT_PUBLIC_USD_INR_RATE || 83);
const UNITS_PER_USD = 1_000_000;

export function paiseToUnits(paise: number): bigint {
  return BigInt(Math.round((paise / 100 / USD_INR_RATE) * UNITS_PER_USD));
}

export function unitsToPaise(units: bigint): number {
  return Math.round((Number(units) / UNITS_PER_USD) * USD_INR_RATE * 100);
}

// ---------------------------------------------------------------------------
// Ids: off-chain cuid ids become bytes32 onchain.
// ---------------------------------------------------------------------------

export const toChainId = (offchainId: string): Hex => keccak256(toBytes(offchainId));

// ---------------------------------------------------------------------------
// The pay-per-minute voucher the viewer's wallet signs (must match CinovaVault).
// ---------------------------------------------------------------------------

export const VOUCHER_TYPES = {
  Voucher: [
    { name: "viewer", type: "address" },
    { name: "episodeId", type: "bytes32" },
    { name: "sessionId", type: "bytes32" },
    { name: "cumulativeAmount", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export function voucherDomain(vault: Address) {
  return { name: "Cinova Vault", version: "1", chainId: CHAIN_ID, verifyingContract: vault } as const;
}
