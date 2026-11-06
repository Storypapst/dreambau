/**
 * A tab can still show account data after the session cookie expires or
 * another tab switches users. Bind its requests to the viewer it loaded.
 */
export const unauthorizedEvent = "testmails:unauthorized";
let activeViewer: string | null = null;

export const getActiveViewer = () => activeViewer;

export function setActiveViewer(userId: string | null) {
  activeViewer = userId;
}

export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(unauthorizedEvent, handler);
  return () => window.removeEventListener(unauthorizedEvent, handler);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const viewer = activeViewer;
  const response = await fetch(`/testmails/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers, ...(viewer ? { "X-Testmails-Viewer": viewer } : {}) }
  });
  if (response.status === 401 && activeViewer === viewer) window.dispatchEvent(new Event(unauthorizedEvent));
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
  return response.json();
}
