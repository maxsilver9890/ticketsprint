TicketSprint — Master Specification

1. Product Goal
   TicketSprint is a responsive browser game that simulates the pressure of booking high-demand concert and stadium tickets.
   The core loop is:
   Play → Queue → Grab Seats → Pay → Win or Lose → Retry
   The player competes against simulated bots. Seats become unavailable as bots claim them, and the player must secure seats and complete a mock checkout before the relevant timers expire.
   This is an independent simulation. Do not scrape, automate, or interact with real ticketing platforms. Do not purchase real tickets or process real payments.
2. Product Scope
   Required

- A polished, responsive landing page and fictional event selection.
- Queue and admission simulation with visible progress.
- Interactive stadium/concert seating map with sections and selectable seats.
- Simulated bots competing for the same finite inventory.
- Difficulty levels that change the actual competition.
- Temporary seat holds and an enforced checkout countdown.
- One-click mock payment using a fictional saved payment method.
- Clear success/failure results and retry.
- Total completion time and stage timings.
- Best successful completion time kept only in browser memory for the current page session.
- Automated tests for core game rules and browser journeys.
  Out of scope
- Registration, login, user accounts, profiles, and account settings.
- Persistent attempt history, saved personal records, and leaderboards.
- Real payment processing or collection of real card details.
- Reflex Arena, scoring systems, rankings, and analytics dashboards.
- Microservices, message queues, or infrastructure without a demonstrated need.
  Do not add features outside this scope unless they are necessary for correctness or the user explicitly requests them.

3. Existing Repository and Stack
   Keep the existing ticketsprint repository and pnpm monorepo. Inspect the actual repository before changing it; preserve useful Phase 1, Phase 2, and frontend realism work.
   Existing stack:

- apps/web: Next.js App Router, React, TypeScript, Tailwind CSS.
- apps/api: Node.js, Express, TypeScript, Zod.
- packages/contracts: shared schemas and types.
- packages/simulation-engine: simulation rules and state transitions.
- Existing test tooling, including Vitest, Supertest, and Playwright where already configured.
  Reuse current dependencies and conventions. Do not introduce another framework or unnecessary libraries.
  Simplify infrastructure only after auditing its use. Prefer removing PostgreSQL/Redis as runtime requirements if the game can safely run with ephemeral state, but do not blindly delete configuration, migrations, or existing data. Document any remaining infrastructure requirement accurately.

4. Gameplay
   4.1 Start a Run

- The player selects an event and difficulty, then clicks Play.
- Start a fresh run without login or setup.
- Initialize a new queue, finite inventory, bot behavior, and timers.
- Each run is independent. A retry must not inherit stale state from the previous run.
  4.2 Queue
- Show the player's queue position, progress, elapsed time, and sale status.
- Simulate other buyers in the queue.
- Use shuffled, seeded randomness so the experience feels varied but can be reproduced in tests.
- Admit the player when their turn arrives and the scenario permits entry.
- Inventory may run out before admission; show a clear loss result.
- Do not promise a precise wait estimate unless it can be calculated meaningfully.
  4.3 Seat Selection
- Show a large, interactive venue map divided into sections and seat categories.
- Seats have an authoritative state: AVAILABLE, HELD, or SOLD.
- Bots compete for the same finite inventory and claim seats throughout the simulation.
- The player may select only seats that are still available.
- Show seat availability clearly and preserve the player's selections during UI refreshes.
- Use seeded random bot choices and shuffled seat preferences.
- Bot behavior must run inside the simulation engine, not as one HTTP request per bot.
  4.4 Difficulty
  Provide Easy, Medium, and Hard. Difficulty must change simulation behavior, not just labels.
- Easy: slower bot claims and more generous decision windows.
- Medium: balanced competition and moderate time pressure.
- Hard: faster bot claims, stronger inventory pressure, and shorter decision windows.
  Keep the values configurable in scenario settings. Test that difficulty produces meaningfully different outcomes.
  4.5 Temporary Seat Hold and Checkout
- When the player secures seats, create a temporary hold and start a visible countdown.
- Held seats cannot be claimed by bots while the hold is valid.
- Show an order summary and fictional saved payment method.
- The player completes checkout with one Pay now action.
- Do not collect card numbers or call a payment gateway.
- Payment succeeds only if the hold is still valid and checkout occurs before the authoritative deadline.
- If the hold expires or checkout is abandoned, release the seats so bots can claim them.
- The backend or authoritative simulation engine must enforce deadlines; a frontend countdown alone is insufficient.
  4.6 Results and Retry
  On success, show:
- A clear booking-confirmed result.
- Total time from clicking Play to confirmation.
- Queue, seat-selection, and checkout timings.
- Seats selected and fictional order summary.
- Best successful time for the current browser page session.
  On failure, show a clear reason, such as inventory exhausted, no available seats, queue timeout, or checkout hold expired. Offer a prominent Retry button.
  Only successful runs update the in-memory best time. Do not persist it to a database or local storage. Reloading the page may reset the record.

5. Simulation Rules and Correctness
   Keep the rules in packages/simulation-engine where practical, separate from React and HTTP code.

- Use deterministic seeded randomness for reproducible bot behavior.
- Separate simulated event time from wall-clock processing time.
- Define consistent event ordering for bot actions and player actions, including equal-time events. Do not arbitrarily favor the player based on browser request arrival order.
- Keep inventory finite. Never allocate or sell the same seat twice.
- Validate seat availability, hold ownership, deadlines, and payment outcome in the authoritative game state.
- Expired holds must release inventory.
- Prevent duplicate payment submissions and confirmations.
- Terminal outcomes are immutable. Retries start new runs rather than changing a completed run.
- Do not trust the client to declare seats available, a hold valid, payment successful, or a run won.
- Keep game state ephemeral. It may be held in memory for the duration of a run and discarded afterwards. A server restart may reset active games.
- If the architecture requires a single API instance for in-memory state, document that limitation and configure local development accordingly.

6. UI and Accessibility
   Keep TicketSprint's own branding and fictional event content. Use ticketing platforms only as references for general interaction patterns; do not copy proprietary branding or assets.
   The interface should include:

- Event cards and event details.
- Queue status and admission transition.
- Interactive seat map and clear available/held/sold states.
- Persistent-in-view selection summary where useful.
- Checkout countdown and one-click mock payment.
- Success/failure screens and retry.
- Loading, empty, and error states.
  Support desktop and mobile layouts, keyboard navigation, visible focus states, accessible labels, reduced-motion preferences, and usable touch targets.

7. Testing and Verification
   Add or update tests for:

- Queue progression and admission.
- Reproducible bot behavior and difficulty differences.
- Seat selection and unavailable seats.
- Simultaneous bot/player claims and no duplicate allocation.
- Seat-hold creation, expiry, and release.
- Bots claiming released seats.
- Payment before and after the deadline.
- Duplicate payment prevention and terminal-state immutability.
- Retry isolation and in-memory best-time behavior.
- Successful and failed browser flows on desktop and mobile.
  Run the repository's actual lint, typecheck, unit/integration tests, Playwright tests, and production build. Report actual results, skipped tests, and warnings. Do not claim checks passed unless they ran successfully.

8. Development Phases
   Phase 1 — Foundation
   Existing foundation: monorepo, frontend, API, shared packages, and initial infrastructure/tests. Preserve working code.
   Phase 2 — Booking Simulation
   Existing booking flow, finite inventory, deterministic virtual buyers, and persisted session/attempt behavior. Audit the actual implementation before changing it.
   Phase 2.5 — Queue Rush Game
   Simplify the product to the gameplay in this specification: queue, admission, contested seats, temporary holds, mock payment, results, and retry. Remove account and persistence features from the active gameplay experience. Simplify infrastructure where safe.
   Later work
   Only after Phase 2.5 works end to end, consider focused improvements to gameplay balance, usability, reliability, and deployment. Do not implement Reflex Arena, persistent scoring, or leaderboards unless the product direction changes.
9. Engineering Rules
10. Inspect the repository and current Git state before editing.
11. Preserve useful code; avoid unrelated refactoring.
12. Do not overwrite or delete specification files without understanding their current state.
13. Do not reset or delete databases or test data.
14. Do not add unnecessary dependencies or infrastructure.
15. Keep simulation rules testable and deterministic.
16. Never rely on frontend-only timers or state for authoritative outcomes.
17. Never claim unverified test, performance, or deployment results.
18. Do not commit or push unless explicitly asked.
19. Update setup instructions when the runtime requirements change.
20. Required Handoff
    After implementation, report:

- What already existed and what changed.
- The final game-state and bot-simulation approach.
- Whether PostgreSQL or Redis is still required to run the game.
- Files changed and any specification naming issues.
- Commands run and actual test results.
- Remaining limitations.
- Exact local setup and run instructions.
  The goal is a focused, playable, fair ticket-rush game—not a full ticketing platform.
