# Cinova contracts

Solidity contracts for Cinova's money layer on Monad: pay-per-minute viewing, per-second
subscriptions, tips, and escrowed film backing with Producer Units. Built with Hardhat 3,
OpenZeppelin 5 and Solidity 0.8.28.

All amounts are in the USD stablecoin's base units (6 decimals). The app converts them to ₹
for display.

## Contracts

| Contract | What it does |
|---|---|
| `CinovaRegistry` | Roles, verified creators, episodes and their pricing, KYC-verified investors, the 10% platform fee and treasury |
| `CinovaVault` | Viewer balances. Pay-per-minute settlement from EIP-712 vouchers. 10-minute withdraw delay |
| `CinovaSubscriptions` | Per-second creator subscriptions, paid from the vault balance |
| `CinovaTips` | Instant tips from the vault balance, 90% creator / 10% platform |
| `BackerPass` | Non-transferable ERC-1155 pass per film tier |
| `CampaignFactory` | Deploys one `FilmCampaign` per film (EIP-1167 clones) |
| `FilmCampaign` | Escrow, perk tiers, Producer Units, milestone releases, refunds, revenue waterfall |

### Roles (held in `CinovaRegistry`)

| Role | Who | Can |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Platform multisig | Fee, treasury, rate bounds, grant roles |
| `VERIFIER_ROLE` | Admin team | Register and remove creators |
| `KYC_ROLE` | Licensed KYC partner | Mark investors as verified (enables Producer Units) |
| `MILESTONE_APPROVER_ROLE` | Admin team (MVP) | Release or reject milestone proof |
| `VAULT_SPENDER_ROLE` | `CinovaSubscriptions`, `CinovaTips` | Spend from viewer balances |

The deployer gets admin, verifier, KYC and approver roles. Move `DEFAULT_ADMIN_ROLE` to a
multisig after deployment.

## How the money moves

**Pay-per-minute.** The viewer deposits once. After the free preview, their wallet signs a
voucher every 10 seconds:

```
Voucher(address viewer, bytes32 episodeId, bytes32 sessionId, uint256 cumulativeAmount, uint256 expiry)
EIP-712 domain: name "Cinova Vault", version "1", chainId, verifyingContract = vault
```

`cumulativeAmount` is the total owed for that session so far. When the viewer stops, the
server calls `vault.settle(voucher, signature)`. The vault:

- pays only the increase over what that session already settled (replays and older vouchers revert)
- stops at the episode cap, across every session for that viewer (rewatches are free)
- never takes more than the balance; a shortfall can be collected later with the same voucher
- accepts smart-account wallets as well as normal ones (ERC-1271)
- sends 10% to the treasury, and 90% to the creator, or through the film's Producer Unit
  waterfall if the episode is linked to a campaign

**Subscriptions.** A subscription stores the monthly price and when it was last charged.
Nothing happens every second; what's owed (`price × seconds / 30 days`) is charged whenever
someone calls `claimAccrued`, `cancel`, or the fan resubscribes. If the balance can't cover it,
the subscription pauses. Use `isActive(fan, creator)` for access checks.

**Tips.** `tips.tip(creator, filmId, amount, messageHash)` takes the amount from the vault
balance and splits it 90/10 immediately. The message stays off-chain; its hash goes on-chain.

**Backing.** Fans call `back(tier, ackHash)` on the film's campaign. `ackHash` is the hash of
the risk acknowledgement they accepted, and it is required. Money stays in the campaign:

- Goal met by the deadline → **Funded**. The creator submits proof per milestone, an approver
  releases it, and the creator receives that share minus the 10% fee. The last milestone
  marks the film **Delivered**.
- Goal missed, or delivery date missed → **Failed**. Every backer can `claimRefund()`, and
  their passes are burned.

State changes driven by dates happen lazily. Any call (or `syncState()`) applies them, and
`currentState()` shows the up-to-date state without a transaction.

**Producer Units.** Only for addresses the KYC partner has verified. Capped per person and
per film, and not transferable. Once the film is funded, link an episode with
`registry.setRevenueRecipient(episodeId, campaign)`. Its revenue then splits:

| Stage | Unit holders | Creator | Platform |
|---|---|---|---|
| Until holders receive 120% of what they put in | 50% | 40% | 10% |
| After that | 20% | 70% | 10% |

Holders call `claimRevenue()` whenever they like. Gas stays the same however many holders
there are (`accRevenuePerUnit` accounting).

## What the app must do

- **Settle on withdraw requests.** When a `WithdrawRequested` event arrives, settle the
  viewer's open sessions and call `claimAccrued` for their subscriptions within the 10-minute
  window. Otherwise that money leaves with the withdrawal.
- **Sweep subscriptions** periodically with `claimAccrued`, so creators get paid and paused
  subscriptions show up.
- **Settle sessions** when the viewer stops, closes the tab, or hits the cap. Keep the latest
  voucher per session until it's settled.
- **Hash ids consistently.** `episodeId` and `filmId` are `keccak256` of the app's episode id.

## Commands

```bash
npm install
npm run build          # compile
npm test               # 26 tests: vouchers, caps, withdraw delay, subscriptions, tips, escrow, refunds, waterfall

# Local chain + full deployment with a mintable MockUSDC
npm run node           # terminal 1
npm run deploy:local   # terminal 2

# Monad testnet
npx hardhat keystore set MONAD_TESTNET_RPC_URL
npx hardhat keystore set MONAD_DEPLOYER_PRIVATE_KEY
# then fill in ignition/parameters/monad-testnet.json (stablecoin + treasury addresses)
npm run deploy:monad-testnet
```

Check the RPC URL, chain ID and stablecoin address against the Monad docs before deploying.
Mainnet isn't configured yet on purpose.

## Known limits

- **Not audited.** Get an external security review before real money.
- **Refunds after a missed delivery date are pro-rata.** Money already released for completed
  milestones can't be returned, so backers split what is still in escrow. Missing the goal
  refunds everyone in full.
- **Producer Units can't be transferred at all.** The doc's 12-month lock-up is stricter here
  until a secondary market exists.
- **Payouts are pushed to the creator.** If the stablecoin issuer blocks a creator's address,
  settlements for their episodes revert until it's resolved. Viewer balances are unaffected.
- **No emergency pause.** Consider adding one to deposits and settlement before mainnet.
