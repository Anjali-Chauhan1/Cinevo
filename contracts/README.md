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
| `CinovaVault` | Everyone's Cinova balance (viewers, creators, treasury). Pay-per-minute settlement from EIP-712 vouchers. Backing films from the balance. 10-minute withdraw delay |
| `CinovaSubscriptions` | Per-second creator subscriptions, paid from the vault balance |
| `CinovaTips` | Instant tips from the vault balance, 90% creator / 10% platform |
| `BackerPass` | Non-transferable ERC-1155 pass per film tier |
| `CampaignFactory` | Deploys one `FilmCampaign` per film (EIP-1167 clones) |
| `FilmCampaign` | Escrow, perk tiers, Producer Units, milestone releases, refunds, revenue waterfall |
| `CinovaTestUSD` | Testnet stablecoin (6 decimals, owner-only mint) for the in-app "Get test money" faucet |

### Roles (held in `CinovaRegistry`)

| Role | Who | Can |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | Platform multisig | Fee, treasury, rate bounds, grant roles |
| `VERIFIER_ROLE` | Admin team | Register and remove creators |
| `KYC_ROLE` | Licensed KYC partner | Mark investors as verified (enables Producer Units) |
| `MILESTONE_APPROVER_ROLE` | Admin team (MVP) | Release or reject milestone proof |
| `VAULT_SPENDER_ROLE` | `CinovaSubscriptions`, `CinovaTips` | Move balance between accounts inside the vault |
| `PUBLISHER_ROLE` | The Cinova server | Publish a verified creator's episodes, pricing, revenue links, campaigns, subscription price and milestone proof. It can never move anyone's money |

The deployer gets every role and is the app's operator account. For production, split these
onto separate keys and move `DEFAULT_ADMIN_ROLE` to a multisig.

## One balance

Tokens enter the vault through deposits (top-ups, and campaigns paying out releases, refunds
and revenue) and leave only through the delayed withdrawal. Everything in between is a balance
update inside the vault: a viewer paying for a film, a tip, a subscription charge, the
creator's and the platform's earnings. Creators withdraw what they've earned like anyone else.
Fans back campaigns straight from their balance (`vault.backCampaign` / `vault.buyUnits`), so
they never need tokens in their own wallet.

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
- checks the wallet's own signature first, then ERC-1271 — Privy's gas sponsorship upgrades
  embedded wallets with EIP-7702, which gives them code
- credits 10% to the treasury's balance and 90% to the creator's, minus the unit holders'
  share if the episode is linked to a film's Producer Unit waterfall (only that share is sent
  to the campaign)

**Subscriptions.** A subscription stores the monthly price and when it was last charged.
Nothing happens every second; what's owed (`price × seconds / 30 days`) is charged whenever
someone calls `claimAccrued`, `cancel`, or the fan resubscribes. If the balance can't cover it,
the subscription pauses. Use `isActive(fan, creator)` for access checks.

**Tips.** `tips.tip(creator, filmId, amount, messageHash)` takes the amount from the vault
balance and splits it 90/10 immediately. The message stays off-chain; its hash goes on-chain.

**Backing.** Fans call `vault.backCampaign(campaign, tier, ackHash)` (or `back` on the campaign
with their own tokens). `ackHash` is the hash of the exact risk acknowledgement they ticked,
and it is required. Money stays in the campaign:

- Goal met by the deadline → **Funded**. Proof is submitted per milestone (by the creator, or
  the server for them), an approver releases it, and that share minus the 10% fee lands in the
  creator's balance. The last milestone marks the film **Delivered**.
- Goal missed, or delivery date missed → **Failed**. Every backer can `claimRefund()` into
  their balance, and their passes are burned.

State changes driven by dates happen lazily. Any call (or `syncState()`) applies them, and
`currentState()` shows the up-to-date state without a transaction.

**Producer Units.** Only for addresses the KYC partner has verified. Capped per person and
per film, and not transferable. Once the film is funded, link an episode with
`registry.setRevenueRecipient(episodeId, campaign)`. Its revenue then splits:

| Stage | Unit holders | Creator | Platform |
|---|---|---|---|
| Until holders receive 120% of what they put in | 50% | 40% | 10% |
| After that | 20% | 70% | 10% |

Holders call `claimRevenue()` whenever they like (it lands in their balance). Gas stays the
same however many holders there are (`accRevenuePerUnit` accounting). Only the vault can route
revenue into a campaign.

## How the app uses them

The Next app's onchain mode (`lib/chain/`) already does all of this; see the main README.

- **Settles on withdraw requests.** When a user confirms a withdrawal request, the server
  settles their open sessions and charges their subscriptions inside the 10-minute window.
- **Sweeps subscriptions** every few hours with `claimAccrued`.
- **Settles sessions** when the viewer stops or goes quiet, from the latest signed voucher.
- **Hashes ids consistently.** `episodeId`, `filmId` and `sessionId` are `keccak256` of the
  app's ids.

## Commands

```bash
npm install
npm run build          # compile
npm test               # 32 tests: vouchers, caps, withdraw delay, subscriptions, tips, escrow,
                       # backing from balance, publisher limits, refunds, waterfall
npm run export-app     # copy ABIs + deployed addresses into the app (lib/chain/)

# Local chain + full deployment with a mintable MockUSDC
npm run node           # terminal 1
npm run deploy:local   # terminal 2

# Monad testnet (deploys CinovaTestUSD too, and gives the operator a faucet float)
npx hardhat keystore set MONAD_TESTNET_RPC_URL
npx hardhat keystore set MONAD_DEPLOYER_PRIVATE_KEY
npm run deploy:monad-testnet
npm run export-app
```

On a Windows machine where Application Control blocks Hardhat's native engine, run these
inside WSL. Mainnet isn't configured yet on purpose: it needs a real stablecoin and the
`Cinova` module (which takes a `token` parameter) instead of the test token.

## Known limits

- **Not audited.** Get an external security review before real money.
- **Refunds after a missed delivery date are pro-rata.** Money already released for completed
  milestones can't be returned, so backers split what is still in escrow. Missing the goal
  refunds everyone in full.
- **Producer Units can't be transferred at all.** The doc's 12-month lock-up is stricter here
  until a secondary market exists.
- **No emergency pause.** Consider adding one to deposits and settlement before mainnet.
