
# TicketSprint — Master Engineering Specification for Codex

## Your Role

Act as a senior full-stack engineer and software architect. Build TicketSprint, a production-oriented, responsive web application for practicing simulated high-demand ticket booking and reflex challenges.

Follow professional software engineering standards. Prioritize correctness, maintainability, security, accessibility, reproducibility, and measurable performance. Do not build a superficial demo or stop after generating a landing page.

Implement the project in working, testable phases. Inspect the repository and validate the environment before making changes. Do not claim that a feature, test, deployment, or benchmark succeeded unless it has actually been verified.

# 1. Product Overview

Product name: TicketSprint.

Concept: Users practice simulated ticket-booking workflows and reflex challenges before real-world high-demand ticket sales. They receive performance analytics and compete on separate leaderboards.

The platform operates entirely on independently defined simulated events, virtual inventory, challenge rules, and mock verification steps. Do not scrape, automate, or interact with third-party ticketing platforms. Do not purchase, reserve, or issue real tickets.

## Core features

1. Realistic multi-step ticket-booking simulator.
2. Reflex arena with target-reaction and rapid-decision drills.
3. Booking deadline and SOLD_OUT outcomes.
4. Server-validated practice sessions and attempts.
5. Separate fastest-completion and highest-performance-score leaderboards.
6. User profiles, personal bests, attempt history, and performance analytics.
7. Responsive desktop and mobile UI.
8. Authentication, API validation, rate limiting, and abuse prevention.
9. Automated tests, load testing, and reproducible engineering benchmarks.
10. Professional landing page and deployment documentation.

# 2. Repository and Technology Stack

Create one Git repository named `ticketsprint`. Keep this project separate from any existing TaskFlow repository.

Use a pnpm monorepo:

- apps/web: Next.js App Router, React, TypeScript, Tailwind CSS, accessible UI components, Lucide icons.
- apps/api: Node.js, Express, TypeScript, Zod, Prisma.
- packages/contracts: shared request/response schemas and types.
- packages/scoring: deterministic scoring functions and ranking utilities.
- packages/simulation-engine: challenge configuration, event schemas, and state-transition definitions.
- PostgreSQL: authoritative persistent data.
- Redis: shared rate limiting and leaderboard caching when justified.
- Vitest: unit tests.
- Supertest: API integration tests.
- Playwright: end-to-end tests.
- k6: load and performance testing.
- Docker Compose: local PostgreSQL and Redis.
- GitHub Actions: CI.
- Vercel and Render: proposed deployment targets.

Use strict TypeScript settings. Pin dependencies through the lockfile. Prefer maintained, compatible package versions and follow the APIs of the versions actually installed.

Do not introduce microservices, Kafka, Kubernetes, or a background queue without a demonstrated requirement.

# 3. Repository Structure

Create a maintainable structure similar to:

ticketsprint/
  apps/
    web/
      src/app/
      src/components/
      src/features/
      src/hooks/
      src/lib/
      src/styles/
      tests/
    api/
      src/config/
      src/middleware/
      src/modules/
      src/infrastructure/
      src/shared/
      prisma/
      tests/
  packages/
    contracts/
    scoring/
    simulation-engine/
    config/
  tests/e2e/
  infra/docker/
  infra/k6/
  docs/
  .github/workflows/
  docker-compose.yml
  pnpm-workspace.yaml
  package.json
  README.md

Organize API modules around auth, users, scenarios, sessions, attempts, scoring, leaderboards, and administration.

Separate routes, controllers, services, repositories, schemas, and errors where the complexity justifies the separation. Keep business logic out of HTTP route handlers.

# 4. Product Pages

Implement:

- / — landing page.
- /arena — challenge selection.
- /practice/booking/[slug] — booking simulation.
- /practice/reflex/[slug] — reflex drill.
- /results/[attemptId] — result details.
- /leaderboard — leaderboard with metric and challenge filters.
- /profile/[username] — public profile and personal bests.
- /settings — account settings.
- /login and /register — authentication.

The application must work on desktop and mobile. Provide keyboard navigation, visible focus states, accessible labels, reduced-motion support, large touch targets, and responsive layouts.

Use a consistent design system, useful loading states, empty states, error states, and clear feedback for every important interaction.

# 5. Booking Simulation

Implement a deterministic, server-configured finite-state machine.

Default flow:

WAITING_ROOM
-> SALE_OPEN
-> CATEGORY_SELECTED
-> QUANTITY_SELECTED
-> SEATS_SELECTED
-> VERIFICATION
-> REVIEW
-> CONFIRMED

Support scenario-specific flows that omit seat selection when appropriate.

Reject invalid state transitions on the server. The frontend may display state and provide provisional feedback, but it must not determine authoritative completion, eligibility, or scores.

Each scenario version must define:

- Scenario identity and immutable version.
- Mode and difficulty.
- Public display configuration.
- Required booking stages.
- Virtual categories, seats, and inventory.
- Allowed ticket quantities.
- Mock verification behavior.
- Booking deadline.
- Maximum session lifetime.
- Scoring version.
- Deterministic seed or reproducible configuration.
- Rules governing successful completion.

Do not allow edits to a published scenario version to change historical attempts. Create a new version for rule changes.

# 6. Booking Deadline and SOLD_OUT Mechanic

This feature is mandatory.

Each booking scenario must define a configurable bookingDeadlineMs. Measure it relative to the server-defined sale-open event.

If a user fails to complete the required booking before the booking deadline:

- Transition the attempt to SOLD_OUT.
- Stop the booking flow.
- Prevent further booking actions for that session.
- Do not issue a simulated confirmation.
- Display a dedicated sold-out result screen.
- Show the user's elapsed time, deadline, and time over the limit.
- Show a randomized, context-appropriate sarcastic message.
- Provide actions to retry the scenario or return to the arena.
- Save the failed attempt and reason in the user's practice history.
- Exclude the failed attempt from the fastest-successful-booking leaderboard.

Example messages:

- "You ain't getting those tickets with this speed."
- "Tickets sold out. The queue moved faster than you."
- "That was a lovely attempt. Unfortunately, the tickets are gone."
- "You hesitated. Someone else is already posting the concert story."
- "Sold out. Better luck next drop."
- "At this speed, even the waiting room is disappointed."

Implement a small, configurable message catalog. Use the outcome and performance band to choose an appropriate message. Message selection must never affect scoring or eligibility.

Use three distinct concepts:

1. Booking deadline: the cutoff for successful simulated booking.
2. Session expiry: the maximum lifetime of the session.
3. Challenge completion: the validated successful completion of the workflow.

Outcomes:

- CONFIRMED: all required steps completed before the booking deadline.
- SOLD_OUT: the booking deadline has been crossed while the booking remains incomplete.
- EXPIRED: the session expires before successful completion and before a SOLD_OUT outcome.
- INVALIDATED: the attempt has been invalidated by an explicit integrity or administrative decision.

Define and test boundary semantics explicitly. A booking accepted exactly at the deadline must follow a documented rule; prefer a strict deadline where the booking is valid only if its authoritative completion time is less than the deadline.

The backend is authoritative. A client countdown reaching zero is not sufficient proof of SOLD_OUT.

Validate the deadline when processing actions and final submission. Use a clear, atomic state transition so a valid completion and a sold-out transition cannot both finalize the same session.

A session's first valid terminal transition must win. Retries must return the existing outcome rather than create conflicting results.

Do not silently convert a SOLD_OUT attempt to CONFIRMED or vice versa.

# 7. Reflex Arena

Implement two drill types.

## Target-reaction drill

- Show a waiting state.
- Reveal a target after a randomized delay generated from the challenge configuration.
- Record the response.
- Reject or penalize premature responses according to published rules.
- Repeat for a fixed number of rounds.
- Calculate per-round response times and median reaction time.

## Rapid-decision drill

- Present a sequence of valid and invalid simulated ticket decisions.
- Require the user to select the correct action.
- Record response time, accuracy, and errors.
- End after a fixed number of rounds or a defined duration.

Challenge generation must be reproducible for a fixed scenario version and seed. Do not expose answers or hidden challenge parameters before they are needed.

Document how browser scheduling, input devices, background tabs, and network latency affect timing. Do not claim that browser-reported physical input times are tamper-proof.

# 8. Database Design

Use PostgreSQL and Prisma migrations.

Implement these core models:

## User

- id: UUID.
- username: unique, bounded length.
- email: unique.
- passwordHash.
- createdAt.
- updatedAt.

## Scenario

- id: UUID.
- slug.
- title.
- mode: BOOKING or REFLEX.
- isActive.
- createdAt.

## ScenarioVersion

- id: UUID.
- scenarioId.
- version.
- difficulty.
- config: JSONB.
- configHash.
- scoringVersion.
- durationLimitMs.
- bookingDeadlineMs, where applicable.
- createdAt.

## PracticeSession

- id: UUID.
- userId.
- scenarioVersionId.
- seed.
- status.
- startedAt.
- saleOpenedAt, where applicable.
- expiresAt.
- terminalAt.
- terminalOutcome.
- completedAt.

## Attempt

- id: UUID.
- sessionId: unique.
- userId.
- scenarioVersionId.
- status: VALID, FLAGGED, or REJECTED.
- outcome: CONFIRMED, SOLD_OUT, EXPIRED, or INVALIDATED.
- completionMs.
- medianReactionMs, where applicable.
- accuracyBps.
- errorCount.
- score.
- scoringVersion.
- startedAt.
- completedAt.
- createdAt.

## AttemptEvent

- id: UUID.
- attemptId.
- sequenceNumber.
- eventType.
- elapsedMs.
- payload: JSONB.
- createdAt.

Also add refresh-token storage if rotating refresh tokens are implemented, and an audit log for administrative changes.

Create appropriate foreign keys, unique constraints, and indexes. In particular:

- One attempt per session.
- One event sequence number per attempt.
- Leaderboard indexes by scenario version, status, completion time, and score.
- Session indexes by user, status, and expiry.
- Referential integrity between session, user, scenario version, and attempt.

Validate score and accuracy bounds. Ensure a session cannot produce an attempt owned by a different user or for a different scenario version.

Use restrictive deletion semantics for records that must preserve historical results.

Store timestamps in UTC. Keep historical attempt records when a scenario is retired.

For SOLD_OUT outcomes, preserve the outcome and reason even when the attempt is excluded from rankings.

# 9. Transactional Integrity

Attempt submission must use a database transaction.

The transaction must:

1. Lock or conditionally update the session.
2. Verify ownership, active status, and expiry.
3. Validate the final event sequence and required state transitions.
4. Determine the terminal outcome.
5. Calculate the authoritative metrics and score.
6. Insert the attempt and its validated events.
7. Finalize the session.
8. Commit all writes atomically.

A failed transaction must not leave a partially finalized attempt.

Use the unique session-to-attempt constraint as a final duplicate-prevention safeguard. Handle concurrent requests deterministically.

If the same session is submitted again, return the existing finalized result when appropriate. Reject conflicting submissions without creating additional attempts.

Add integration tests that coordinate simultaneous requests and verify that only one terminal outcome and one attempt are persisted.

# 10. API Contracts

Base path: /api/v1.

Use Zod for request validation and shared response contracts.

Implement:

POST /auth/register
POST /auth/login
POST /auth/logout
GET /me

GET /scenarios
GET /scenarios/:id

POST /sessions
GET /sessions/:id
POST /sessions/:id/events, if incremental event ingestion is implemented
POST /sessions/:id/submit

GET /leaderboards
GET /leaderboards/me
GET /me/attempts
GET /attempts/:id

GET /health/live
GET /health/ready

Add administrative scenario-management endpoints behind explicit server-side authorization.

## Create session

POST /api/v1/sessions

Input:
{
  "scenarioVersionId": "<UUID></uuid>"
}

The authenticated user ID must come from the server's authentication context, not the request body.

Return a server-issued session ID, scenario version, public rules, timing limits, and expiry.

## Submit attempt

POST /api/v1/sessions/:id/submit

Accept a validated, bounded event array or reference to an already persisted event sequence.

Do not accept client-authoritative values for userId, score, status, terminal outcome, startedAt, or completedAt.

The server reconstructs the state machine and decides whether the result is CONFIRMED, SOLD_OUT, EXPIRED, or invalid.

Use appropriate HTTP statuses:

- 201 for a newly created attempt.
- 200 when returning an already finalized result on a valid retry.
- 401 for unauthenticated requests.
- 403 for forbidden ownership or authorization.
- 409 for conflicting state transitions.
- 410 for expired sessions when appropriate.
- 422 for structurally valid requests that violate scenario rules.
- 429 for rate limits.

Use a consistent error response with code, message, and request ID. Do not expose stack traces or sensitive integrity rules.

# 11. Timing and Event Validation

Use performance.now() for client-side elapsed intervals.

Record server-side timestamps for authoritative state transitions and maintain a clearly documented distinction between client-observed and server-observed time.

Do not treat client event timestamps as cryptographic proof of physical click timing.

Validate:

- Event schema and payload.
- Sequence ordering.
- Allowed state transitions.
- Non-negative and bounded elapsed times.
- Session ownership and expiry.
- Booking deadline.
- Required final state.
- Event count and request body size.
- Duplicate and replayed submissions.
- Impossible timing patterns.

Apply rate limits and flag suspicious attempts for review. Do not automatically ban users based on one anomalous reaction time.

Use an explicit policy for browser backgrounding, premature reactions, missing responses, and timing outliers.

# 12. Scoring and Leaderboards

Implement two independent ranking metrics.

## A. Fastest successful booking

Sort eligible, successfully confirmed booking attempts by:

1. completionMs ascending.
2. errorCount ascending.
3. completedAt ascending.
4. attempt ID as a stable final tie-break.

SOLD_OUT and EXPIRED attempts must not appear on the fastest-successful-booking leaderboard.

## B. Highest performance score

Use a bounded integer score from 0 to 10,000.

For booking simulations, begin with:

score = round(10000 * (0.65 * accuracy + 0.35 * speed))

For reflex drills, begin with:

score = round(10000 * (0.55 * accuracy + 0.20 * speed + 0.25 * reaction))

Each component is normalized to the range 0–1. Define the exact normalization and edge cases for each challenge type. These weights are initial product decisions and must be versioned.

For speed normalization, define scenario-specific target and maximum durations. Clamp the normalized speed value between 0 and 1. Ensure faster-than-target times do not produce scores above the maximum.

For accuracy:

accuracy = correct decisions / total scored decisions.

Store accuracy in basis points from 0 to 10,000.

For reflex reaction time, calculate the median of valid reaction times and document how premature responses, missing responses, and outliers are treated.

Store raw metrics and the scoring version alongside the final score.

Do not compare scores across different scenario versions unless an explicit compatibility policy exists.

Maintain separate ranking filters for scenario version, mode, difficulty, and competition period where supported.

Use PostgreSQL as the source of truth. Redis may cache rankings, but it must not be the sole store of permanent scores.

# 13. Leaderboard and Result APIs

Support:

GET /api/v1/leaderboards?scenarioVersionId=...&metric=completion_time&limit=50&cursor=...

Supported metrics:

- completion_time.
- performance_score.

Return rank, username, relevant metrics, scenario version, and pagination cursor.

Use deterministic keyset pagination for larger datasets. Never expose private user details.

The user's profile and attempt history should show:

- Best successful booking time.
- Best performance score.
- Recent attempts.
- Booking outcome.
- Time over the booking deadline for SOLD_OUT attempts.
- Error count and accuracy.
- Reaction-time statistics where relevant.

Flagged and rejected attempts must not appear in public competitive rankings.

# 14. Redis and Caching

Use Redis only where justified.

Initial supported use cases:

- Shared rate limiting.
- Cached top-50 leaderboards.
- Short-lived coordination where PostgreSQL alone is insufficient.

Example cache keys:

leaderboard:v1:{scenarioVersionId}:completion_time:top50

leaderboard:v1:{scenarioVersionId}:performance_score:top50

Invalidate relevant leaderboard caches after successful database commits. Use a documented TTL as a fallback.

A cache failure must not corrupt persisted results. The API should degrade gracefully to database reads when practical.

Keep session state authoritative in PostgreSQL.

Do not add BullMQ or another background queue until scheduled competitions, email, batch analytics, or other asynchronous workloads justify it.

# 15. Security

Implement:

- Argon2id password hashing or a securely configured equivalent.
- Secure HTTP-only cookies where appropriate.
- CSRF protection for cookie-authenticated state-changing requests.
- Refresh-token rotation if refresh tokens are used.
- Explicit CORS allowlists.
- Security headers.
- Request size limits.
- Zod validation.
- Resource ownership checks.
- Login and registration rate limiting.
- Environment-variable validation at startup.
- Restricted database credentials.
- Secret and token redaction in logs.
- Request IDs and structured error logging.
- Safe handling of database and Redis failures.

Keep production secrets out of Git and out of client bundles.

Use controlled Prisma migrations. Never run arbitrary production migrations from an ordinary test pipeline.

# 16. Testing Requirements

## Unit tests

Test all state transitions, deadline boundaries, challenge generation, score calculations, tie-breaks, session expiration, and error handling.

Test the exact deadline boundary: just before, exactly at, and just after the deadline.

Verify that SOLD_OUT and EXPIRED cannot become successful bookings through replay or retries.

## Integration tests

Use a real PostgreSQL test database and Redis where relevant.

Test:

- Session creation and expiry.
- Transaction rollback.
- Attempt submission.
- Duplicate submission races.
- Conflicting terminal-state transitions.
- Scenario-version immutability.
- Leaderboard exclusion of ineligible attempts.
- Cache invalidation and fallback.
- Ownership enforcement.
- Database migrations from a clean state.

## End-to-end tests

Use Playwright.

Verify:

1. Register and log in.
2. Complete a booking before the deadline.
3. Confirm a successful result and leaderboard entry.
4. Miss the booking deadline and see the SOLD_OUT screen.
5. Confirm that the sold-out attempt remains in personal history.
6. Confirm it is absent from the fastest-successful-booking leaderboard.
7. Verify that retrying a terminal session cannot change its result.
8. Complete a reflex drill.
9. Verify result metrics and both ranking categories.
10. Test responsive desktop and mobile layouts.
11. Test that users cannot access other users' private attempt records.

## Concurrency tests

Coordinate concurrent requests for the same session and verify that no more than one finalized attempt exists.

Test multiple users submitting distinct attempts concurrently and verify persisted rankings remain deterministic.

# 17. Performance Testing

Use k6 to test session creation, attempt submission, leaderboard reads, and mixed traffic separately.

Initial test profile: ramp to 50 virtual users, sustain the workload for a defined period, and document the configuration.

Measure:

- Requests per second.
- p50, p95, and p99 latency.
- Error rate and timeouts.
- Database connection-pool utilization.
- Slow queries.
- Redis cache hit rate.
- CPU and memory utilization.

Initial proposed targets, subject to baseline measurement:

- Leaderboard API p95 below 200 ms.
- Cached leaderboard API p95 below 100 ms.
- Session creation p95 below 250 ms.
- Attempt submission p95 below 300 ms.
- Error rate below 1% under the defined target workload.
- Zero duplicate finalized attempts per session.
- Zero ineligible attempts included in public rankings.

Do not claim these numbers unless measured. Store benchmark scripts and document dataset size, environment, commit, and test profile.

# 18. Deployment

Use Docker Compose for local PostgreSQL and Redis.

Deploy the web app and API independently. Vercel and Render are proposed hosting options.

Production requirements:

- Separate development and production environment variables.
- Restrict CORS to the production frontend.
- Run migrations as a controlled release step.
- Use expand-and-contract migrations for breaking schema changes.
- Configure readiness and liveness checks.
- Enable structured logging and error monitoring.
- Verify the frontend and API point to the correct production resources.
- Document database backups, restore testing, and rollback procedures.
- Do not assume free hosting includes every required capability.

# 19. Implementation Phases

Work in these phases and keep the application runnable after each phase.

## Phase 0: Repository audit and implementation plan

Inspect the current repository, installed dependencies, runtime versions, and available infrastructure.

If the repository is empty, scaffold the monorepo. If an existing implementation is present, preserve useful work and inspect it before replacing anything.

Produce a short plan identifying files, dependencies, schema changes, risks, and verification steps.

## Phase 1: Foundation

Set up pnpm workspaces, TypeScript, Next.js, Express, PostgreSQL, Prisma, Docker Compose, environment validation, shared contracts, error handling, authentication, and CI.

Deliverable: clean setup, successful migrations, working API, and baseline tests.

## Phase 2: Booking simulator

Implement immutable scenario versions, session creation, the booking state machine, event validation, booking deadlines, SOLD_OUT behavior, and a complete responsive booking interface.

Deliverable: a user can finish or miss the deadline of a booking simulation and receive the correct persisted result.

## Phase 3: Scoring and leaderboards

Implement deterministic scoring, transactional submission, duplicate prevention, successful-booking rankings, performance-score rankings, profiles, personal bests, and attempt history.

Deliverable: persisted eligible attempts produce correct and reproducible rankings.

## Phase 4: Reflex arena

Implement target-reaction and rapid-decision drills, timing analytics, accuracy calculations, and responsive results.

Deliverable: both practice modes use the shared session, attempt, scoring, and leaderboard infrastructure.

## Phase 5: Hardening and launch

Complete security checks, integration and end-to-end tests, concurrency tests, k6 benchmarks, deployment configuration, monitoring, and operational documentation.

Deliverable: a verified public deployment with documented performance and correctness results.

# 20. Engineering Rules

1. Inspect existing files before modifying them.
2. Never overwrite working code without understanding its behavior.
3. Do not put the entire application into a few large files.
4. Keep route handlers thin and business logic testable.
5. Do not use mock data as a substitute for backend persistence in completed features.
6. Do not use localStorage as the authoritative store for sessions, scores, or leaderboards.
7. Do not trust client-submitted scores, outcomes, or identities.
8. Do not add unnecessary dependencies or infrastructure.
9. Do not suppress TypeScript errors, tests, or lint failures to claim success.
10. Use real database integration tests for transactional guarantees.
11. Document design decisions and non-obvious trade-offs.
12. Keep environment variables and credentials out of source control.
13. Do not fabricate benchmark numbers or claim unverified deployment success.
14. Keep all code changes scoped to TicketSprint.
15. Make each implementation phase independently testable and reviewable.

# 21. Required Deliverables

Produce:

- Working monorepo.
- README with prerequisites and exact local setup commands.
- Environment variable example without secrets.
- Docker Compose configuration.
- Prisma schema, seed data, and migrations.
- API contracts and documented error codes.
- Scoring and deadline rules documentation.
- Architecture and threat-model documentation.
- Unit, integration, E2E, and concurrency tests.
- k6 scripts and benchmark instructions.
- CI workflow.
- Deployment and migration runbooks.
- A concise implementation report listing changed files, commands run, test results, remaining issues, and next steps.

# 22. How to Begin

Start with Phase 0.

Inspect the repository and determine whether it is empty or already contains implementation work. Then propose a concise file-level plan and begin Phase 1.

Do not attempt to implement every phase in a single unverified code-generation pass. Complete each phase, run the relevant checks, fix failures caused by your changes, and report what remains.

After each phase, summarize:

- What was implemented.
- Important design decisions.
- Files changed.
- Migrations created.
- Commands and tests executed.
- Verified results.
- Known limitations.
- Next phase.

The final objective is a working, maintainable TicketSprint product with fair, server-validated competition—not merely a visually convincing frontend.
