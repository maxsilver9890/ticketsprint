import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
        TicketSprint | Foundation
      </p>
      <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
        Practice for the moment tickets go live.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
        A practice platform for simulated ticket-booking challenges. The booking
        arena is planned for a later implementation phase.
      </p>
      <nav className="mt-10 flex flex-wrap gap-4" aria-label="Account">
        <Link
          className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          href="/register"
        >
          Create account
        </Link>
        <Link
          className="rounded-lg border border-slate-500 px-5 py-3 font-semibold text-white hover:border-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          href="/login"
        >
          Sign in
        </Link>
      </nav>
      <p className="mt-10 text-sm text-slate-400">
        Phase 1 foundation is running.
      </p>
    </main>
  );
}
