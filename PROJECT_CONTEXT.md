# TicketSprint Project Context

Handoff snapshot for future Codex sessions. The product source of truth is the master specification; this file records repository state and implementation observations and does not replace product requirements.

## Overview and architecture

TicketSprint is an anonymous practice app for simulated ticket drops; it does not interact with ticket vendors or issue real tickets. The repository uses pnpm, strict TypeScript, Next.js App Router/React/Tailwind, Express, Zod, Prisma, PostgreSQL, Redis, Vitest, Supertest, Playwright, Docker Compose, and GitHub Actions. **The active Phase 2.5 game is process-memory only** and does not require authentication, PostgreSQL, Prisma, or Redis at runtime. The earlier authenticated Phase 2 app, Prisma schema/migrations, and Redis modules remain in the repository for legacy work and integration tests. `packages/config` validates runtime environment; `packages/contracts` shares request/response schemas; `packages/simulation-engine` contains both the legacy booking engine and deterministic Queue Rush engine.

Key paths:

- `apps/web/src/app/` and `apps/web/src/features/booking/`: landing, drops, queue/seat map, mock checkout, result, and retry UI. Login/register routes redirect to the arena.
- `apps/api/src/server.ts`, `queue-rush-app.ts`, `queue-rush/`: active memory-only API and game service. `apps/api/src/app.ts`, `auth.ts`, `auth.routes.ts`, `booking/`: retained legacy cookie/CSRF and DB booking paths.
- `apps/api/prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`: data model, additive migrations, and versioned sample scenarios.
- `packages/contracts/src/booking.ts`, `packages/simulation-engine/src/`: booking validation, state transitions, deterministic schedules, and allocation logic.
- `tests/e2e/booking.spec.ts`, `apps/api/src/booking/booking.integration.test.ts`, package `*.test.ts`: browser, PostgreSQL integration, and unit coverage.
- Root `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, and `README.md`: workspace operations and CI.

## Phase status

**Phase 1 — Foundation:** present in the checked-in baseline commit `7c0f67a` (`feat: add TicketSprint Phase 1 foundation`). The current source includes the workspace, web/API apps, shared config/contracts, Prisma/PostgreSQL, Redis-backed rate limiting, environment validation, authentication, Docker Compose, and CI. This status is based on repository inspection; no new Phase 1 audit suite was run for this handoff.

**Phase 2 — Booking simulator:** implementation is present locally but uncommitted. It provides `STANDARD` and `COMPETITIVE_DROP` workflows, a booking FSM, authenticated session/event/submit/result APIs, responsive arena/booking/results screens, and four seeded version-1 scenarios (`stadium-opening`, `summer-festival-drop`, `last-ticket-rush`, `small-club-drop`). Not every Phase 2 requirement in the master spec has coverage yet; see remaining work.

**Phase 2.5 — Queue Rush Game:** implemented locally, uncommitted. Active UI flow is Play → Queue → Seat Selection → Mock Payment → Win/Lose → Retry. See `packages/contracts/src/queue-rush.ts`, `packages/simulation-engine/src/queue-rush.ts`, `apps/api/src/queue-rush/`, `apps/api/src/queue-rush-app.ts`, and active clients under `apps/web/src/features/booking/`. Games use server-generated seeds, deterministic bot schedules/preferences, 216 virtual seats, server-side queue/deadline/hold/payment/outcome transitions, idempotent repeat pay, hold expiry/abandon release, and difficulty-specific settings. The successful best is React memory only and resets on reload. Restarting the API clears games.

## Decisions and invariants visible in code

- Scenario versions store a canonical config hash; a PostgreSQL trigger prevents version-row updates/deletes. Publish a new version for behavior changes.
- Sessions, actions, terminal results, identities, and timing are server-authoritative. The browser countdown is informational. Cookie-authenticated writes use CSRF protection and routes check ownership.
- Virtual buyers are generated in the pure simulation engine from the stored session seed and versioned buyer configuration; they do not issue HTTP requests. Simulated elapsed time is distinct from wall-clock time.
- Event order is `(simulatedTimeMs, priority, sequenceNumber)`. Buyer events have priority 0, recorded user stages 1, and final user allocation 2; buyer wins equal-time allocation ties.
- Competitive allocation is all-or-nothing by category and session. The API serializes session work with a PostgreSQL `FOR UPDATE` row lock, persists one attempt per session, and returns the persisted attempt on submission retry. There is no shared global inventory pool.
- Terminal outcomes include `CONFIRMED`, `SOLD_OUT`, `EXPIRED`, and `INVALIDATED`; booking failure reasons distinguish missed deadline, exhausted inventory, and session expiry. The booking engine and API tests cover deadline boundaries and representative competing outcomes.
- The three Phase 2 SQL migrations are additive to the foundation migration. A follow-up migration allows zero allocated quantity for a session that exhausts before the user selects a request.

These are implementation observations, not a claim that every concurrency or integrity property has been exhaustively proved.

## Specification filename issue

The current root spec is `TICKETSPRINT_SPEC.md`, and it is the only root master-spec file present. There is no `TICKETSPRINT_SPEC.md.md` duplicate. `TICKETSPRINT_SPEC.md` is the source of product requirements. The root `AGENTS.md` contains older general platform instructions that mention database-backed booking/auth; follow the current simplified product scope in the spec for active gameplay.

`apps/web/AGENTS.md` is also present but untracked. Its contents identify it as a Next.js-generated instruction file and require consulting the installed Next.js docs before future web code changes.

## Git and push state (observed)

- Branch: `main`; `HEAD`: `7c0f67abd1d49d15231db4e7eca77a7ace82e91f`.
- Upstream: `origin/main`, remote URL `https://github.com/maxsilver9890/ticketsprint.git`.
- A read-only Git inspection verified `main` tracks `origin/main`; local `HEAD` and the local `origin/main` ref were both `7c0f67abd1d49d15231db4e7eca77a7ace82e91f`. This does not verify the live GitHub ref. The earlier `git status` error was caused by sandboxed Git being denied permission to return to the Downloads working directory; elevated read-only Git commands worked and confirmed a valid non-bare repository.
- Phase 2 files, CI/README/package changes, and the spec-file change are uncommitted. They are therefore not part of the checked-in `HEAD`; this session did not commit or push. No live remote query was made, so the current remote server state beyond the local tracking ref is unverified.
- The prior worktree also contains ignored `test-results/` output from Playwright; `.gitignore` excludes it.

## Environment and verification

Earlier handoff observed Node `v24.14.0`, pnpm `11.25.0`, Docker `29.8.1`, Compose `v5.5.1`; Compose PostgreSQL 17 and Redis 7 containers were healthy, with PostgreSQL exposed on host port `5433` and Redis on `6379`. At that time no root `.env` was present. The Phase 2.5 addendum below records current environment observations.

**Previously reported as executed successfully in the preceding implementation session (not rerun for this document):** `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm db:migrate:deploy` (reported no pending migrations); `pnpm db:seed`; `pnpm lint`; `pnpm typecheck`; `pnpm test` (32 passing across config, contracts, engine, and API; the web Vitest target had no test files); `pnpm build`; `pnpm e2e` (4 passing, desktop and mobile Chromium); `docker compose config --quiet`; `git diff --check`. The Prisma client generated, scenario seed ran, and all four migrations were reported applied. Treat these as prior-session results, not checks performed while writing this handoff.

Warnings observed in those runs: `pg` emitted a deprecation warning about `client.query()` while a client was already executing a query. Playwright also emitted benign `NO_COLOR`/`FORCE_COLOR` warnings. Git emitted Windows LF-to-CRLF conversion notices. The GitHub Actions workflow was inspected but was not run on GitHub in that session; deployment, k6/load targets, and production behavior are unverified.

## Resume setup and checks

For active Queue Rush gameplay, PowerShell from the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Node.js 24.11+ and pnpm 11.25 are required. `.env` is optional; API defaults are port 4000 and `WEB_ORIGIN=http://localhost:3000`. If creating `.env` from the example, guard against overwriting an existing file: `if (-not (Test-Path .env)) { Copy-Item .env.example .env }`. Do not copy local secrets into Git or this context file. Current play does not require Docker, PostgreSQL, Redis, credentials, authentication, or payment configuration.

The legacy Prisma schema and migration history remain in the repository because the configured local database has applied migrations and records; they are not used by the active Queue Rush server. Do not run migration, seed, or database integration commands against the configured `ticketsprint` database. The legacy integration tests need a separate, disposable, migrated PostgreSQL database and the prior-phase Redis service.

To verify the active app, run:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

`pnpm test` includes legacy DB integration tests, so set `DATABASE_URL` only to an isolated migrated test database and provide the legacy `REDIS_URL`/`JWT_SECRET` values in the process environment. Active Queue Rush E2E tests use memory-only API state. For production-server E2E on alternate ports, set `NEXT_PUBLIC_API_URL` and `NEXT_DIST_DIR` before `pnpm build`, then set matching `TEST_API_PORT`/`TEST_WEB_PORT` and `TEST_WEB_MODE=start` before `pnpm e2e`.

## Known gaps and next work

- **Phase 3:** no `packages/scoring` or leaderboard APIs/UI exists. Earlier DB code has a personal-best model, but it is inactive in the Phase 2.5 product. Define/version scoring rules, ranking eligibility/tie-breaks, deterministic pagination, persistence, and tests per spec if Phase 3 is authorized.
- **Phase 4:** no reflex challenge UI or engine exists. Implement reproducible target-reaction and rapid-decision drills, timing/accuracy policy, results, and tests.
- **Phase 5:** complete the spec's wider security/abuse review, failed-path and concurrency coverage, cache behavior, transaction rollback and clean-database migration checks, full end-to-end cases, k6 scripts/benchmarks, deployment/monitoring/backup/restore runbooks, and release verification. No k6 scripts or deployment/operations docs are present now.
- The earlier Phase 2 E2E description was superseded by the Phase 2.5 addendum below. The legacy auth/DB API remains separate and is not part of active Queue Rush flows.

## Phase 2.5 handoff addendum — 2026-10-18

This addendum supersedes outdated runtime/setup statements above. Local `.env` exists, but values are intentionally omitted. Active `apps/api/src/server.ts` runs Queue Rush from process memory; no auth/account flow is active and login/register redirect to `/arena`. PostgreSQL/Prisma/Redis are retained for legacy paths and are not required for current gameplay. `README.md` now has the active setup instructions. Start with `corepack pnpm install --frozen-lockfile` and `corepack pnpm dev`; open `http://localhost:3000`. Active API defaults to port 4000. To play, choose a practice drop and difficulty; no account or DB setup is required.

Phase 2.5 was verified in this session: `pnpm typecheck` and `pnpm lint` passed; `pnpm test` passed 42 tests (config 2, contracts 2, engine 22, API 16) using the isolated migrated database `ticketsprint_phase25_verify_20261018`; `pnpm build` passed; `pnpm e2e` passed 4 desktop/mobile Chromium tests. Playwright showed harmless `NO_COLOR`/`FORCE_COLOR` warnings; API tests emitted the existing `pg` overlapping-query deprecation warning. The browser best time is session memory only and resets on full page reload. The active single-process memory API has no multi-instance state sharing; restarting it clears active games.

Follow-up cleanup verification on 2026-10-18 changed bot scheduling so buyers claim seats from sale start, including while the player waits; queue responses now include elapsed time, sale status, and remaining inventory. Hard difficulty can sell out before admission. The public seat-state contract uses `AVAILABLE`, `HELD`, and `SOLD`; equal-time bots precede admission/hold expiry/deadline and player actions are applied after advancement. `pnpm test` passed 50 tests with the database URL overridden to the isolated `ticketsprint_phase25_verify_20261018` database (the configured `ticketsprint` database was not used). `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. Playwright passed 6 desktop/mobile cases including the hard-queue failure and retry; it emitted `NO_COLOR`/`FORCE_COLOR` warnings. `git diff --check` passed with Windows LF/CRLF notices. Build/E2E outputs are ignored; no DB records were changed.

During test preparation, one command was run from `apps/api` and missed the root `.env` path, so it used the already-present process `DATABASE_URL`: the additive migration `20261018170000_personal_bests` and idempotent seed ran against the configured local DB. A later read-only audit confirmed the target was PostgreSQL 17 at `127.0.0.1:5433`, database `ticketsprint`; all five migrations are applied, including `20261018170000_personal_bests`. The four seeded Phase 2 scenario slugs each have one version-1 row. A read-only prefix count found 30 generated `phase2-*`/`p2_*` users, 8 related practice sessions, and 4 related attempts. These records were not changed; do not clean them up without a backup and explicit scoped review. The isolated verification database `ticketsprint_phase25_verify_20261018` remains present.

At the audit snapshot, `HEAD` was `7c0f67abd1d49d15231db4e7eca77a7ace82e91f` on `main`, matching the local `origin/main` tracking ref; the checkout had numerous uncommitted Phase 2/2.5 files. No live remote query was made. The spec filename inconsistency was resolved by the user; the current canonical root spec is `TICKETSPRINT_SPEC.md`. Phases 3–5 remain unimplemented.

## Final cleanup audit — 2026-10-18

Fetched `origin/main` from the Downloads worktree; it still points to `7c0f67abd1d49d15231db4e7eca77a7ace82e91f`, matching local `main` (0 ahead / 0 behind). At the time of this audit snapshot, the checkout was uncommitted. `TICKETSPRINT_SPEC.md` is the sole root spec; the earlier filename warning above is historical and the stale “restore/reconcile” item has been removed. No application source/spec changes were made during the audit; the generated `apps/web/next-env.d.ts` references were restored to the default `.next` path after verification used `.next-audit`.

Re-ran `corepack pnpm install --frozen-lockfile`, `corepack pnpm lint`, `corepack pnpm typecheck`, and `git diff --check`: all passed. Full `corepack pnpm test` passed 50 tests (config 2, contracts 2, simulation engine 28, API 18) with `DATABASE_URL` redirected to the existing isolated `ticketsprint_phase25_verify_20261018` database and the other local test environment variables loaded privately. An initial invocation without those environment variables failed during legacy API test setup; it did not reach DB tests. `corepack pnpm build` passed using ignored `.next-audit` output. `corepack pnpm e2e` passed 6 Chromium/mobile Chromium cases using ports 4477 and 3337. Warnings: existing `pg` overlapping-query deprecation, Playwright `NO_COLOR`/`FORCE_COLOR`, and Git LF-to-CRLF notices. The configured `ticketsprint` database was not targeted by these checks.

The current product's active API and UI remain memory-only, anonymous, and mock-payment-only. Legacy auth/Prisma/PostgreSQL/Redis paths and migrations remain because the repository's API tests/CI still exercise those paths and an applied migration history plus local records exist; the configured database and its previously recorded `phase2-*` data were left untouched. A proposed bulk removal of those modules was rejected by automatic approval review due to regression/migration-history loss risk; no workaround or smaller split deletion was attempted. This leaves subsystem/dependency cleanup unresolved. At the time this audit snapshot was recorded, no commit or push had been made. Phases 3–5 remain unimplemented.

## Delivery status — 2026-10-18

The verified Queue Rush implementation was committed as `1abc52750b8e4a261c26fae46e3e0d5df56c2056` (`feat: deliver TicketSprint queue rush game`) and pushed to `origin/main`; a post-push `git ls-remote` confirmed the remote ref. This note is a later documentation sync; use `git log -1` and `git status` for the current tip and worktree. Legacy code cleanup remains deferred as documented above; no database contents were cleaned or reset.

For E2E without disturbing an existing local Next server, build/start with an isolated output and ports, for example:

```powershell
$env:TEST_API_PORT='4401'; $env:TEST_WEB_PORT='3301'; $env:NEXT_DIST_DIR='.next-e2e'; $env:NEXT_PUBLIC_API_URL='http://localhost:4401/api/v1'
pnpm build
$env:TEST_WEB_MODE='start'
pnpm e2e
```
