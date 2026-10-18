# TicketSprint

TicketSprint is an anonymous single-player practice game for simulated high-demand ticket drops. The active flow is **Play → Queue → Seat Selection → Mock Payment → Win/Lose → Retry**. It uses fictional events and does not issue real tickets or process payments.

## Architecture

- pnpm workspace with strict TypeScript, Next.js App Router, React, Tailwind, Express, Zod, and shared contracts/simulation packages.
- Active API entry point: `apps/api/src/server.ts`; Express app: `apps/api/src/queue-rush-app.ts`.
- Queue Rush state, inventory, deterministic bot schedules, deadlines, seat holds, mock payment outcomes, and terminal results are server-authoritative and held in process memory. A restart clears active games; run one API instance because instances do not share game state.
- Rate limiting also uses in-process memory. The browser's best successful time lasts only for the current page session.
- There are no accounts, persistent booking records, PostgreSQL/Prisma, Redis, or real payment services.

## Local setup

Requirements: Node.js 24.11+ and pnpm 11.25. No Docker, database, Redis, or credentials are needed.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open http://localhost:3000. API health: http://localhost:4000/api/v1/health/live. `.env` is optional. Local API port uses `API_PORT` (default `4000`), and CORS uses `WEB_ORIGIN` (default `http://localhost:3000`). Render's validated `PORT` overrides `API_PORT`. The browser uses `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).

## Render API deployment

Create a Node Web Service with the repository root as its working directory so pnpm can resolve shared workspace packages.

- **Build Command:** `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ticketsprint/api build`
- **Start Command:** `corepack pnpm --filter @ticketsprint/api start`
- Set `NODE_VERSION=24.21.0` and `WEB_ORIGIN=https://ticketsprint-omega.vercel.app`.
- Render supplies `PORT`; the server binds `0.0.0.0` and falls back to local `API_PORT` only when no `PORT` is supplied.
- Set Vercel's `NEXT_PUBLIC_API_URL` to `https://<your-render-service>.onrender.com/api/v1` without a trailing slash.
- Keep one Render instance. Active games are lost on restart/deploy.

See [Render web service port binding](https://render.com/docs/web-services#port-binding).

## API routes

All routes use the `/api/v1` prefix:

- `GET /drops` and `GET /drops/:slug` list fictional drops.
- `POST /games` creates a seeded game for a drop and difficulty (`EASY`, `MEDIUM`, `HARD`).
- `GET /games/:id` advances and returns authoritative game state.
- `POST /games/:id/hold` atomically holds 1–4 available seats.
- `POST /games/:id/hold/release` abandons checkout and releases the hold.
- `POST /games/:id/pay` completes mock checkout; duplicate confirmation is idempotent.

Bots run inside the simulation engine. The backend enforces inventory, event ordering, deadlines, holds, payment validity, and terminal outcomes. Retry creates a fresh game ID and seed.

## Verification

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm e2e
```

Unit and API integration tests use in-memory state and have no external service requirement. E2E uses Playwright Chromium and mobile Chromium. For alternate ports, set `TEST_API_PORT`, `TEST_WEB_PORT`, and a matching `NEXT_PUBLIC_API_URL` before building/testing.

## Scope

Persistent scoring, leaderboards, accounts, and Reflex Arena are outside the current product scope. `TICKETSPRINT_SPEC.md` remains the master product requirements document.
