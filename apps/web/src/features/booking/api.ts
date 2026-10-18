const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type ApiErrorBody = { error?: { message?: string; code?: string } };

export async function bookingApi<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? "GET";
  const headers = new Headers();
  let body: string | undefined;
  if (method === "POST") {
    const tokenResponse = await fetch(`${apiBase}/auth/csrf`, { credentials: "include", cache: "no-store" });
    if (!tokenResponse.ok) throw new Error("Could not start a secure booking request. Please sign in again.");
    const payload = (await tokenResponse.json()) as { csrfToken?: string };
    if (!payload.csrfToken) throw new Error("Could not start a secure booking request. Please sign in again.");
    headers.set("X-CSRF-Token", payload.csrfToken);
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.body);
    }
  }
  const response = await fetch(`${apiBase}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers,
    body: body ?? null,
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(error.error?.message ?? `The booking request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

export function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const seconds = Math.floor(safe / 1000);
  const centiseconds = Math.floor((safe % 1000) / 10);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}
