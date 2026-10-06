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

## Notes

- Video playback uses public sample clips — there's no real video hosting in this build.
- KYC and creator verification are simulated as an admin-approval queue, not a real
  identity/compliance provider.
- Producer Units (revenue-share backing) are gated to a configurable region list and
  require KYC approval, matching the regulatory design even though both are simulated here.
