/** Testnet "Get test money": stands in for a card on-ramp. */
export const FAUCET = {
  AMOUNT_CENTS: 1_000, // $10 per claim
  COOLDOWN_MS: 60 * 60 * 1000, // once an hour
} as const;
