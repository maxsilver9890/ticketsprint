# TicketSprint

Phase 1 foundation for simulated ticket-booking practice. Booking simulation, scoring, leaderboards, and challenge flows are deferred.

## Requirements

Node.js 24.11+, pnpm 11.25.0, and Docker Compose.

## Local setup

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate:dev
pnpm db:seed
pnpm dev
```

Web: http://localhost:3000. API: http://localhost:4000. Liveness/readiness: `/api/v1/health/live` and `/api/v1/health/ready`. Set a random `JWT_SECRET` (at least 32 characters). `WEB_ORIGIN` is the exact allowed web origin. Stop services with `docker compose down`; `-v` removes persisted local data.

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate:deploy
pnpm db:seed
```

API integration tests use PostgreSQL. Test mode uses an isolated in-memory limiter; development and production use Redis for shared rate limits. PostgreSQL is authoritative. Authentication uses Argon2id, short-lived signed JWTs in HTTP-only cookies, double-submit CSRF tokens, explicit CORS, and rate limiting. Refresh-token rotation is not implemented. The session and attempt tables are foundational only; simulator behavior is deferred. Production requires managed secrets, restricted DB credentials, HTTPS, backups, and controlled migrations.
