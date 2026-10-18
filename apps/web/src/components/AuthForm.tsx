"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthFormProps = { mode: "login" | "register" };
type ApiError = { error?: { message?: string } };
const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void fetch(`${apiBase}/auth/me`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => {
        if (active && response.ok) router.replace("/arena");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const registering = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    setPending(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const csrfResponse = await fetch(`${apiBase}/auth/csrf`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!csrfResponse.ok)
        throw new Error("Could not start a secure sign-in request.");
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken: string;
      };
      const body = registering
        ? {
            username: String(form.get("username") ?? ""),
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            password: String(form.get("password") ?? ""),
          };
      const response = await fetch(`${apiBase}/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(
          payload.error?.message ?? "The request could not be completed.",
        );
      }
      setMessage(
        "You’re signed in. Your account is ready for practice challenges.",
      );
      formElement.reset();
      router.replace("/arena");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "A network error occurred.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        TicketSprint account
      </p>
      <h1 className="mt-3 text-3xl font-bold">
        {registering ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {registering
          ? "Save your practice history and personal bests."
          : "Sign in to continue your practice."}
      </p>
      <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
        {registering && (
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              name="username"
              type="text"
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9_]+"
              autoComplete="username"
              required
            />
            <span className="mt-1 block text-xs text-slate-400">
              3–24 letters, numbers, or underscores
            </span>
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            name="email"
            type="email"
            maxLength={254}
            autoComplete="email"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className="mt-2 block min-h-11 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-base text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            name="password"
            type="password"
            minLength={registering ? 12 : 1}
            maxLength={128}
            autoComplete={registering ? "new-password" : "current-password"}
            required
          />
          {registering && (
            <span className="mt-1 block text-xs text-slate-400">
              Use at least 12 characters.
            </span>
          )}
        </label>
        {error && (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="text-sm text-emerald-300" role="status">
            {message}
            {" "}
            <Link className="font-semibold underline-offset-4 hover:underline" href="/arena">Choose a practice drop</Link>
          </p>
        )}
        <button
          className="min-h-12 w-full rounded-lg bg-cyan-300 px-4 font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 disabled:cursor-wait disabled:opacity-60"
          type="submit"
          disabled={pending}
        >
          {pending
            ? "Please wait…"
            : registering
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-300">
        {registering ? "Already have an account? " : "New to TicketSprint? "}
        <Link
          className="font-semibold text-cyan-300 underline-offset-4 hover:underline"
          href={registering ? "/login" : "/register"}
        >
          {registering ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </section>
  );
}
