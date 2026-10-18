# TicketSprint

TicketSprint is an anonymous practice game for simulated high-demand ticket drops. The active Phase 2.5 flow is **Play → Queue → Seat Selection → Mock Payment → Win/Lose → Retry**. There are no accounts, real tickets, or real payment processing in the active product.

## Stack and runtime

- pnpm workspace, strict TypeScript, Next.js App Router / React / Tailwind, Express, Zod, and the shared `packages/simulation-engine`.
- The active API stores ephemeral game sessions in process memory. PostgreSQL, Prisma, and Redis modules and migrations remain in the repository for earlier phase work; they are not required to run the current game, and the API does not connect to them.
- A server-generated per-game seed drives deterministic virtual buyer timing and seat preferences. Server state owns inventory, queue admission, deadlines, seat holds, mock payment confirmation, and terminal outcomes. Restarting the API clears games. The “session best” is held in React memory only and resets on a full page reload.

## Local setup

Requirements: Node.js 24.11+ and pnpm 11.25. No Docker/database setup or `.env` credentials are required for the current gameplay. If you want to change ports with a root `.env`, create it only when it does not already exist:

```powershell
corepack pnpm install --frozen-lockfile
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
corepack pnpm dev
```

You can also skip `.env` completely; the API defaults to port 4000 and the web origin to `http://localhost:3000`.

Open http://localhost:3000. API health is http://localhost:4000/api/v1/health/live. `API_PORT`, `WEB_ORIGIN`, and `NEXT_PUBLIC_API_URL` can be set when changing local ports. The active API requires only `API_PORT` and `WEB_ORIGIN` (default `http://localhost:3000`); the browser uses `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`). The root `.env.example` still includes prior-phase database/auth settings; those are for legacy Prisma/DB paths and are not needed for active play.

## Render API deployment

Deploy `apps/api` as a Node Web Service with the repository root as its working directory so pnpm can resolve the shared workspace packages.

- **Build Command:** `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @ticketsprint/api build`
- **Start Command:** `corepack pnpm --filter @ticketsprint/api start`
- **Environment:** set `NODE_VERSION=24.21.0` and `WEB_ORIGIN=https://ticketsprint-omega.vercel.app`.
- Render supplies `PORT` at runtime. The API validates and uses it before falling back to local `API_PORT` (default `4000`); do not set `PORT` manually.
- Set the Vercel frontend's `NEXT_PUBLIC_API_URL` to `https://<your-render-service>.onrender.com/api/v1` with no trailing slash.
- Keep the Render service at one instance: active game state is process-local. A restart or deploy can clear active games, as allowed by the ephemeral game design.

Render requires the web service to listen on `0.0.0.0` and recommends using its `PORT` value. See the [Render web service port documentation](https://render.com/docs/web-services#port-binding).

## Practice API

All routes are under `/api/v1`:

- `GET /drops` and `GET /drops/:slug` return fictional event drops.
- `POST /games` creates a new seeded game with `dropSlug` and difficulty (`EASY`, `MEDIUM`, `HARD`).
- `GET /games/:id` advances the deterministic simulation and returns the authoritative state.
- `POST /games/:id/hold` atomically holds 1–4 available seats.
- `POST /games/:id/hold/release` abandons checkout and releases the hold.
- `POST /games/:id/pay` confirms the mock checkout once; repeat confirmations are idempotent.

Bots run inside the simulation engine and are not HTTP clients. Event ties use deterministic ordering; bots claim seats before a same-time hold/deadline transition. Expired holds are released on the next state transition; stale payment requests cannot win. A retry creates a fresh game ID and seed. Game records are process-local and expire through bounded cleanup.

## Verification

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm e2e
```

The E2E suite uses Playwright Chromium and mobile Chromium. Set `TEST_API_PORT`, `TEST_WEB_PORT`, and `NEXT_PUBLIC_API_URL` to matching values when using alternate ports. The `NEXT_PUBLIC_API_URL` value is embedded in the production bundle, so set it before `pnpm build` when using `TEST_WEB_MODE=start`. The `start` mode expects a fresh production build; otherwise Playwright starts Next dev. Legacy API integration tests still exercise the earlier Prisma/PostgreSQL application and require a dedicated migrated test database. Never point those tests at the configured local application database or valuable data.

## Project status

Phase 2.5 implements the queue rush game and anonymous active UI. Phase 3 scoring/leaderboards and Phase 4 Reflex Arena are not part of this implementation. `TICKETSPRINT_SPEC.md` remains the product requirements source; legacy phase specifications and DB support remain intact.
