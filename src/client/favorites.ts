import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";

const PREFERENCE_PATH = "/auth/me/preferences/favorite-accounts";
// A reopened directory must read after a dispatched write has settled.
let dispatchedWrite: Promise<void> = Promise.resolve();

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
 * toggle shows at once. Saves run in order; a failed final save rolls back
 * to the last confirmed value without undoing newer queued choices.
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const latest = useRef<string[]>([]);
  const confirmed = useRef<string[]>([]);
  const loaded = useRef(false);
  const live = useRef(false);
  const revision = useRef(0);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    live.current = true;
    dispatchedWrite
      .then(async () => {
        if (!active) return;
        const result = await api<{ value: unknown }>(PREFERENCE_PATH);
        if (!active) return;
        latest.current = confirmed.current = coerceFavorites(result.value);
        loaded.current = true;
        setFavorites(latest.current);
        setReady(true);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; live.current = false; loaded.current = false; };
  }, []);

  const toggle = useCallback(async (email: string) => {
    // Never replace an unknown server preference with a list built from [].
    if (!loaded.current) return;
    const currentRevision = ++revision.current;
    const next = toggleFavorite(latest.current, email);
    latest.current = next;
    setFavorites(next); setError(false);
    pending.current = pending.current.then(async () => {
      // The cookie may belong to another employee after logout. Cancel old intent.
      if (!live.current) return;
      try {
        const request = api<{ value: unknown }>(PREFERENCE_PATH, { method: "PUT", body: JSON.stringify({ value: next }) });
        dispatchedWrite = request.then(() => {}, () => {});
        const result = await request;
        confirmed.current = coerceFavorites(result.value);
        if (live.current && currentRevision === revision.current) {
          latest.current = confirmed.current;
          setFavorites(latest.current);
          setError(false);
        }
      } catch {
        if (!live.current) return;
        if (currentRevision === revision.current) {
          latest.current = confirmed.current;
          setFavorites(latest.current);
        }
        setError(true);
      }
    });
    await pending.current;
  }, []);

  return { favorites, ready, error, toggle };
}
