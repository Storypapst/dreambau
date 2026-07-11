export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/testmails/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);
  return response.json();
}
