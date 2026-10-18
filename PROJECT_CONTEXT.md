# TicketSprint Project Context

The master product requirements are in `TICKETSPRINT_SPEC.md`. This handoff describes the current repository state after simplifying the runtime to the active Phase 2.5 product.

## Product and architecture

TicketSprint is an anonymous single-player simulation: **Play → Queue → Seat Selection → Mock Payment → Win/Lose → Retry**. No accounts, real tickets, or real payment processing are used.

- Monorepo: pnpm 11.25, Node.js >=24.11, strict TypeScript.
- Web: Next.js App Router, React, Tailwind in `apps/web`.
- API: Express in `apps/api`; entry point `src/server.ts`, app `src/queue-rush-app.ts`, routes and service in `src/queue-rush/`.
- Shared packages: `packages/config` (API env), `packages/contracts` (shared response and Queue Rush schemas), and `packages/simulation-engine` (deterministic Queue Rush rules).
- Game state, inventory, holds, deadlines, payment outcomes, and terminal results are held in API process memory. Restarts lose active games; multiple API instances cannot share games. Server-side Express rate limiting also uses in-memory storage.
- Browser best successful time is page-session memory only.
- PostgreSQL, Prisma, Redis, accounts, and real payment processing are not runtime requirements. No database or cache is used by the active tests or CI.

## Important files

- `apps/api/src/server.ts`, `queue-rush-app.ts`, `queue-rush/`: active backend.
- `apps/web/src/features/booking/`: active Queue Rush UI (the historical directory name remains); its API client is `queue-api.ts`.
- `packages/contracts/src/queue-rush.ts`, `packages/simulation-engine/src/queue-rush.ts`: shared game contract and authoritative simulation.
- `packages/config/src/env.ts`: `PORT` takes precedence over local `API_PORT` (default 4000); `WEB_ORIGIN` defaults to `http://localhost:3000`.
- `README.md`, `.env.example`, `.github/workflows/ci.yml`: setup, environment, and verification.

## Git and local data

Use `git status --short --branch`, `git log -1`, and `git diff` to inspect the current state. Do not infer push status from this file. Earlier work recorded a local PostgreSQL database with applied legacy migrations and generated Phase 2 test records; removing source migrations does not modify that database. Do not run migration or cleanup commands against it. The active project no longer needs Docker services.

## Setup and verification

From the repository root in PowerShell:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open `http://localhost:3000`; the API health endpoint is `http://localhost:4000/api/v1/health/live`.

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm e2e
```

The tests use in-memory state. Playwright E2E requires Chromium (and mobile Chromium emulation). See `README.md` for Render commands and environment setup.

## Deployment limitation

Render API build: `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ticketsprint/api build`.
Render API start: `corepack pnpm --filter @ticketsprint/api start`.
Set `WEB_ORIGIN=https://ticketsprint-omega.vercel.app`; Render supplies `PORT`. Keep one API instance. Configure Vercel `NEXT_PUBLIC_API_URL` as `https://<render-service>.onrender.com/api/v1`.

Phases 3–5 (persistent scoring/leaderboards and Reflex Arena) are outside the current product scope.
