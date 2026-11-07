/** Preserve an explicit URL exactly or withhold it; never strip credentials into a new link. */
export function safeWorkspaceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    for (const key of url.searchParams.keys()) {
      if (/(token|password|authorization|api.?key|secret|signature|credential|session|cookie|otp)/i.test(key) || /^(key|sig|code)$/i.test(key)) return null;
    }
    return value;
  } catch { return null; }
}
