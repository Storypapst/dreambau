import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";

const PREFERENCE_PATH = "/auth/me/preferences/favorite-accounts";

/** Normalises the server value of the `favorite-accounts` preference into a list of e-mail addresses. */
export function coerceFavorites(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

/** Returns the list with the address added or removed. */
export function toggleFavorite(favorites: string[], email: string): string[] {
  return favorites.includes(email) ? favorites.filter((item) => item !== email) : [...favorites, email];
}

/**
 * Favorite accounts of the signed-in employee. They live on the server per
 * user (like saved filters), so the same stars appear on every device. A
 * toggle shows at once and is rolled back when saving fails.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const latest = useRef<string[]>([]);
  const loaded = useRef(false);
  const writing = useRef(false);

  useEffect(() => {
    let live = true;
    api<{ value: unknown }>(PREFERENCE_PATH)
      .then((result) => {
        if (!live) return;
        latest.current = coerceFavorites(result.value);
        loaded.current = true;
        setFavorites(latest.current);
        setReady(true);
      })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; loaded.current = false; };
  }, []);

  const toggle = useCallback(async (email: string) => {
    // Refs block calls in the same event before React can render disabled stars.
    if (!loaded.current || writing.current) return;
    writing.current = true;
    setSaving(true);
    const before = latest.current;
    const next = toggleFavorite(before, email);
    latest.current = next;
    setFavorites(next); setError(false);
    try {
      const result = await api<{ value: unknown }>(PREFERENCE_PATH, { method: "PUT", body: JSON.stringify({ value: next }) });
      latest.current = coerceFavorites(result.value);
      setFavorites(latest.current);
    } catch {
      latest.current = before;
      setFavorites(before); setError(true);
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, []);

  return { favorites, ready, saving, error, toggle };
}
