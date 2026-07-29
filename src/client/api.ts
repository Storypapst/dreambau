/**
 * Sessions live in the server's memory, so a restart or deploy invalidates
 * every cookie while an open tab keeps the data it already rendered. Without
 * this signal that looks like a broken feature instead of a lost session:
 * each action fails with its own message and the stale rows stay on screen.
 */
const unauthorizedEvent = "testmails:unauthorized";

export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(unauthorizedEvent, handler);
  return () => window.removeEventListener(unauthorizedEvent, handler);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/testmails/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (response.status === 401) window.dispatchEvent(new Event(unauthorizedEvent));
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
  return response.json();
}
