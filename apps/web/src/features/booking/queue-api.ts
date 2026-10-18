import type { QueueRushGameView } from "@ticketsprint/contracts/queue-rush";

const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
export async function queueApi<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const request: RequestInit = {
    method: init.method ?? "GET",
    cache: "no-store",
    credentials: "omit",
  };
  if (init.body !== undefined) {
    request.headers = { "Content-Type": "application/json" };
    request.body = JSON.stringify(init.body);
  }
  const response = await fetch(`${apiBase}${path}`, request);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      payload.error?.message ?? `Practice request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}
export type QueueGameResponse = { game: QueueRushGameView };
