# TicketSprint

TicketSprint is an anonymous, single-player practice game for simulated high-demand ticket drops. The game flow is **Play → Queue → Seat Selection → Mock Payment → Win/Lose → Retry**. Events and tickets are fictional; the app does not issue tickets or process payments.

## Live deployments

- **Frontend (Vercel):** [ticketsprint-omega.vercel.app](https://ticketsprint-omega.vercel.app/)
- **Backend (Render):** [ticketsprint-api.onrender.com](https://ticketsprint-api.onrender.com)
- **API health:** [ticketsprint-api.onrender.com/api/v1/health/live](https://ticketsprint-api.onrender.com/api/v1/health/live)

## Stack and architecture

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS (`apps/web`).
- **API:** Node.js, Express, TypeScript, Zod (`apps/api`). Active entry point is `apps/api/src/server.ts`; Express application and routes are under `apps/api/src/queue-rush/` and `apps/api/src/queue-rush-app.ts`.
- **Shared packages:** `packages/contracts` defines request/response schemas; `packages/simulation-engine` contains deterministic game rules; `packages/config` validates API environment variables.
- **Workspace:** pnpm 11.25 monorepo with strict TypeScript. Shared packages expose source to development/type tooling and compiled ESM JavaScript to production imports. Build workspace dependencies before their consumers; the package build scripts and recursive pnpm commands do this.

The server is authoritative for queue progress, bot claims, finite inventory, seat holds, deadlines, mock checkout, and terminal outcomes. Bot schedules use seeded randomness and deterministic event ordering. The fictional venue map contains **216 seats** (3 sections × 6 rows × 12 seats). A player can hold up to four seats; duplicate mock-payment confirmation is idempotent.

Difficulty changes queue length, bot pressure, the decision window, and hold duration:

| Mode | Bots ahead | Scheduled bots | Nominal bot cadence* | Selection window | Seat hold |
| --- | ---: | ---: | ---: | ---: | ---: |
| Easy | 2 | 22 | 3,000 ms | 65 s | 20 s |
| Medium | 5 | 44 | 1,100 ms | 45 s | 12 s |
| Hard | 9 | 88 | 375 ms | 28 s | 7 s |

*Bot arrival times include seeded jitter around the nominal cadence.*

All active game state and API rate-limit state are in process memory. **Run one Render API instance.** Active games are lost when that process restarts or redeploys; multiple instances do not share games. There are no user accounts, persistent scores, PostgreSQL, Prisma, Redis, or real payment services.

## Repository map

```text
apps/
  web/                     Next.js app and Queue Rush experience
  api/                     Express API, routes, service, and API integration tests
packages/
  config/                  Environment validation
  contracts/               Shared Zod schemas and TypeScript types
  simulation-engine/       Queue Rush rules, seeded bots, and unit tests
tests/e2e/                 Playwright desktop and mobile journeys
.github/workflows/ci.yml   Lint, typecheck, tests, production build, and E2E
TICKETSPRINT_SPEC.md       Master product requirements
```

## Local development

Requirements: Node.js 24.11+ and Corepack with pnpm 11.25. Docker, a database, Redis, and credentials are not needed.

From the repository root in PowerShell:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open <http://localhost:3000>. The API health endpoint is <http://localhost:4000/api/v1/health/live>. Copy `.env.example` to `.env` only if you need to override defaults.

If a Windows terminal reports that `pnpm` is not recognized inside a package script, Corepack can run pnpm directly while nested scripts still need a `pnpm.cmd` on `PATH`. A user-scoped shim avoids administrator access:

```powershell
$shimDir = Join-Path $env:LOCALAPPDATA 'TicketSprint\bin'
New-Item -ItemType Directory -Force -Path $shimDir | Out-Null
@'
@echo off
corepack pnpm %*
'@ | Set-Content -Encoding ASCII -Path (Join-Path $shimDir 'pnpm.cmd')
$env:PATH = "$shimDir;$env:PATH"
```

Environment variables:

| Variable | Purpose | Default / deployment value |
| --- | --- | --- |
| `API_PORT` | Local API port | `4000` |
| `PORT` | Hosting platform port; takes precedence over `API_PORT` | Assigned by Render |
| `WEB_ORIGIN` | Single allowed browser origin for CORS | `http://localhost:3000`; Render: `https://ticketsprint-omega.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Frontend API base URL, including the version prefix | Local: `http://localhost:4000/api/v1`; Vercel: `https://ticketsprint-api.onrender.com/api/v1` |

Keep `/api/v1` in `NEXT_PUBLIC_API_URL`; client requests append route paths such as `/games` to that base.

## Deployment

### Vercel frontend

The Next.js frontend is deployed at [ticketsprint-omega.vercel.app](https://ticketsprint-omega.vercel.app/). Set `NEXT_PUBLIC_API_URL` to `https://ticketsprint-api.onrender.com/api/v1` in the Vercel project and rebuild after changing it. The web build compiles the shared contracts package before `next build`.

### Render API

Configure the Render Node Web Service to use the repository root so pnpm can see the workspace:

- **Build Command:** `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ticketsprint/api... build`
- **Start Command:** `corepack pnpm --filter @ticketsprint/api start`
- **Runtime:** Node.js 24; `NODE_VERSION=24.21.0` is the documented pinned value.
- **Environment:** Set `WEB_ORIGIN=https://ticketsprint-omega.vercel.app`. Render supplies `PORT`; the API binds to `0.0.0.0`.
- **Instances:** Keep one instance while game state is in memory.

The API exposes `GET /api/v1/health/live` and `GET /api/v1/health/ready` for health checks.

## API routes

All routes use the `/api/v1` prefix:

- `GET /drops` and `GET /drops/:slug` list fictional drops.
- `POST /games` creates a seeded game for a drop and difficulty (`EASY`, `MEDIUM`, or `HARD`).
- `GET /games/:id` advances and returns authoritative game state.
- `POST /games/:id/hold` holds 1–4 available seats.
- `POST /games/:id/hold/release` abandons checkout and releases the hold.
- `POST /games/:id/pay` completes mock checkout; duplicate confirmation is idempotent.

## Verification

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm e2e
```

Unit and API integration tests use in-memory state and require no external service. Playwright E2E uses Chromium for desktop and mobile layouts; install browser support with `corepack pnpm exec playwright install chromium` if needed. CI runs lint, typecheck, tests, build, and E2E. Tests and build commands should be run from the repository root.

## Scope

The active product is the Queue Rush game described above. Accounts, persistent attempt history, leaderboards, payment processing, and Reflex Arena are out of scope. `TICKETSPRINT_SPEC.md` is the master product requirements document.
