# Cinevo

Twitch-style support for indie filmmakers. Creators run their own channels; fans subscribe,
tip, and back the next film; creators get paid every second they're watched.

This build runs entirely on a demo in-app ledger instead of a real blockchain — every
financial mechanic from the design (pay-per-minute vouchers, escrow milestones, refunds,
the Producer Unit revenue waterfall, subscription streaming) is implemented with the same
invariants, just settled against a local database instead of a chain.

## Stack

- **App:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Data:** Prisma + SQLite (`prisma/schema.prisma`)
- **Ledger:** `lib/ledger/*` — demo token accounting (deposits, vouchers, escrow, revenue
  splits), each operation atomic and audit-logged
- **Realtime:** a standalone Socket.IO server (`realtime-server.ts`) for premiere chat, the
  hype bar, and reactions, run as a separate process from the Next app
- **Auth:** email + password, JWT session cookie (no third-party identity provider)

## Getting started

Install dependencies, apply the database schema, and seed some demo data:

```bash
npm install
npx prisma migrate dev
npm run db:seed
```

Start the app (this runs the Next.js server and the realtime server together):

```bash
npm run dev
```

- App: [http://localhost:3001](http://localhost:3001)
- Realtime server: `http://localhost:3002` (used internally by the app; no need to open it directly)

Sign in with any email address — a new account (with a starter demo wallet balance) is
created automatically on first login, no separate signup step required.

## Project layout

```
app/                 Pages and API routes (App Router)
components/           Client-side UI components
lib/                  Shared logic
  ledger/             Demo ledger: vault, subscriptions, tips, campaigns, reviews, popularity
  auth.ts             Session handling
  chat.ts, hype.ts     Premiere chat and hype-bar logic (shared by REST + realtime)
prisma/               Database schema and seed script
realtime-server.ts     Standalone Socket.IO server for the premiere room
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the app and realtime server together |
| `npm run build` | Production build |
| `npm run start` | Start the production build |
| `npm run db:seed` | Seed demo creators, episodes, and a campaign |
| `npm run db:reset` | Reset the database and reseed |

## Onchain mode (Monad testnet)

By default money runs on the demo ledger in the database. Set
`NEXT_PUBLIC_CHAIN_MODE=onchain` and it runs on Monad instead:

- **Sign-in** is Privy (email or Google). Each user gets an embedded wallet; they never see
  a seed phrase, a popup or gas — Privy sponsors the gas.
- **Balances** live in the `CinovaVault` contract, shown in ₹. On testnet, "Get test money" on
  the wallet page credits free test USD (it stands in for a card or UPI top-up).
- **Watching a paid film**: the wallet silently signs a voucher every 10 seconds; when the
  viewer stops, the server settles the latest one onchain.
- **Tips, subscriptions, backing, refunds, withdrawals** are sent from the user's wallet; the
  server checks each transaction's receipt before recording it.
- **Creator approval, episode pricing, campaigns, KYC and milestone releases** are done
  onchain by the server's operator account.

The database keeps a mirror (with transaction hashes) so history, earnings and dashboards
work the same in both modes. Contract details: [contracts/README.md](contracts/README.md).

### Setup

1. **Privy** — create an app at [dashboard.privy.io](https://dashboard.privy.io). Enable email
   and Google login, add Monad Testnet, and turn on gas sponsorship ("Fee sponsorship"; Privy
   subsidises Monad testnet — email monad@privy.io for credits). Copy the App ID and App Secret.
2. **Deployer wallet** — create a fresh key used only for this, and fund it with testnet MON
   from [faucet.monad.xyz](https://faucet.monad.xyz). It deploys the contracts and becomes the
   app's operator.
3. **Deploy the contracts** (in `contracts/`; on this machine run Hardhat inside WSL, because
   Windows Application Control blocks its native engine):
   ```bash
   npx hardhat keystore set MONAD_TESTNET_RPC_URL       # https://testnet-rpc.monad.xyz
   npx hardhat keystore set MONAD_DEPLOYER_PRIVATE_KEY
   npm run build && npm test
   npm run deploy:monad-testnet
   npm run export-app                                   # writes lib/chain/deployments.json + ABIs
   ```
   Commit `lib/chain/deployments.json` so everyone points at the same contracts.
4. **App `.env`** — fill in the onchain block from `.env.example`: `NEXT_PUBLIC_CHAIN_MODE`,
   the Privy App ID and secret, and `OPERATOR_PRIVATE_KEY` (the deployer key). Never commit it.
5. **Accounts** — sign in once with Privy so your account has a wallet, then
   `npm run make-admin -- you@email.com`. Creators also need to have signed in with Privy before
   an admin approves them (approval registers their wallet onchain).

### Testing against a local chain

Run `npx hardhat node` and `npm run deploy:local` in `contracts/`, then start the app with
`NEXT_PUBLIC_CHAIN_ID=31337`, `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`, the first Hardhat
account's key as `OPERATOR_PRIVATE_KEY`, and `ALLOW_DEV_WALLET_LOGIN=1`. Privy can't run against
a local chain, so `/api/auth/dev-wallet` lets a wallet sign in by signing a message instead —
it only works on the local chain with that flag set.

## Notes

- Creators upload their own videos (stored on this server under `storage/`, kept out of git);
  uploaded films stream only to viewers with a live watch session. The seeded demo films still
  use public sample clips.
- KYC and creator verification are simulated as an admin-approval queue, not a real
  identity/compliance provider.
- Producer Units (revenue-share backing) are gated to a configurable region list and
  require KYC approval, matching the regulatory design even though both are simulated here.
