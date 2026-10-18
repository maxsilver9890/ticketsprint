## Repository instructions

Read `TICKETSPRINT_SPEC.md` before changing product behavior. Its Phase 2.5 section defines the active TicketSprint scope: anonymous, single-player Queue Rush gameplay with ephemeral state and mock payment.

## Engineering rules

- Use strict TypeScript and the existing pnpm workspace.
- Keep queue, inventory, bot, seat-hold, deadline, checkout, and terminal-state rules authoritative in the simulation engine/API.
- Preserve deterministic seeded bot behavior and event ordering.
- Keep rate limits, validation, error handling, and shared Queue Rush contracts.
- Do not add accounts, persistent booking/scoring, PostgreSQL, Redis, real payments, or later-phase features without explicit authorization.
- Add focused tests for behavior changes. Never claim checks passed unless executed.
- Do not reset databases, delete data, commit, or push unless explicitly requested.

## Workflow

1. Inspect repository status and relevant code before editing.
2. Make the smallest coherent changes for the active product.
3. Run relevant lint, typecheck, unit/integration, E2E, and build checks where feasible.
4. Report changed files, actual results, warnings, environment limits, and remaining risks.
