
# TicketSprint — Repository Instructions

Before implementing any feature, read `TICKETSPRINT_SPEC.md` at the repository root.

Treat it as the canonical product and architecture specification. Follow its requirements for the technology stack, database integrity, session lifecycle, scoring, leaderboard eligibility, security, testing, and deployment.

## Engineering rules

- Use TypeScript with strict type checking.
- Follow the pnpm monorepo structure defined in the specification.
- Keep frontend, backend, shared contracts, scoring, and simulation logic appropriately separated.
- Never trust client-submitted scores, user identities, or terminal outcomes.
- Preserve transactional integrity and prevent duplicate session submissions.
- Enforce server-side booking deadlines and terminal-state transitions.
- Keep SOLD_OUT and EXPIRED attempts out of successful-booking rankings.
- Add tests for new functionality and regressions.
- Use Prisma migrations for database schema changes.
- Never fabricate test results, benchmark results, or deployment status.
- Do not introduce unnecessary dependencies or infrastructure.
- Inspect existing code before modifying it.
- Do not overwrite working implementations without understanding their behavior.
- Do not implement future phases prematurely unless explicitly requested.
- Keep the project runnable and report any known failures honestly.

## Workflow

For each requested phase:

1. Read the relevant specification sections.
2. Inspect the existing implementation and identify dependencies.
3. Make a concise implementation plan.
4. Implement the requested phase.
5. Run relevant type checks, linting, tests, migrations, and builds.
6. Fix regressions introduced by the changes.
7. Report changed files, commands executed, verified results, unresolved issues, and the next recommended step.

Implement in small, reviewable increments. The specification defines the intended behavior; actual code and tests must demonstrate that the behavior works.
