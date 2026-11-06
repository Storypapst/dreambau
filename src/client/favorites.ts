import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/api";

type FavoritePreference = "favorite-accounts" | "favorite-display";

// A reopened directory waits for the last dispatched write for each preference.
const dispatchedWrites: Partial<Record<FavoritePreference, Promise<void>>> = {};

export type FavoriteDisplay = {
  testContext: boolean;
  notes: boolean;
};

/** Normalises the server value of the `favorite-accounts` preference into a list of e-mail addresses. */
export function coerceFavorites(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

/** Returns the list with the address added or removed. */
export function toggleFavorite(favorites: string[], email: string): string[] {
  return favorites.includes(email) ? favorites.filter((item) => item !== email) : [...favorites, email];
}

function coerceFavoriteDisplay(input: unknown): FavoriteDisplay {
  if (!input || typeof input !== "object") return { testContext: true, notes: true };
  return {
    testContext: !("testContext" in input) || input.testContext !== false,
    notes: !("notes" in input) || input.notes !== false
  };
}

function useFavoritePreference<T>(key: FavoritePreference, coerce: (input: unknown) => T) {
  const path = `/auth/me/preferences/${key}`;
  const [value, setValue] = useState(() => coerce(null));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(value);
  const confirmed = useRef(value);
  const loadedSession = useRef<object | null>(null);
  const revision = useRef(0);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const session = {};
    (dispatchedWrites[key] ?? Promise.resolve())
      .then(async () => {
        if (!active) return;
        const result = await api<{ value: unknown }>(path);
        if (!active) return;
        latest.current = confirmed.current = coerce(result.value);
        loadedSession.current = session;
        setValue(latest.current);
        setReady(true);
      })
      .catch(() => { if (active) setError("load_failed"); });
    return () => { active = false; loadedSession.current = null; };
  }, [coerce, key, path]);

  const update = useCallback(async (change: (current: T) => T) => {
    // Wait for the stored preference before composing changes with it.
    const session = loadedSession.current;
    if (!session) return;
    const next = change(latest.current);
    if (next === latest.current) return;
    const currentRevision = ++revision.current;
    latest.current = next;
    setValue(next);
    setError(null);
    pending.current = pending.current.then(async () => {
      // The cookie may belong to another employee after logout. Cancel old intent.
      if (session !== loadedSession.current) return;
      try {
        const request = api<{ value: unknown }>(path, { method: "PUT", body: JSON.stringify({ value: next }) });
        dispatchedWrites[key] = request.then(() => {}, () => {});
        const result = await request;
        if (session !== loadedSession.current) return;
        confirmed.current = coerce(result.value);
        if (currentRevision === revision.current) {
          latest.current = confirmed.current;
          setValue(latest.current);
          setError(null);
        }
      } catch {
        if (session !== loadedSession.current) return;
        if (currentRevision === revision.current) {
          latest.current = confirmed.current;
          setValue(latest.current);
        }
        setError("save_failed");
      }
    });
    await pending.current;
  }, [coerce, key, path]);

  return { value, ready, error, update };
}

/**
 * The signed-in employee's favorites in their chosen order. Saves run in
 * order, and a failed final save rolls back to the last confirmed value.
 */
export function useFavorites() {
  const { value: favorites, ready, error, update } = useFavoritePreference("favorite-accounts", coerceFavorites);
  const toggle = useCallback((email: string) => update((current) => toggleFavorite(current, email)), [update]);
  const move = useCallback((email: string, direction: -1 | 1, visible?: ReadonlySet<string>) => update((current) => {
    const ordered = visible ? current.filter((address) => visible.has(address)) : current;
    const from = current.indexOf(email);
    const visibleIndex = ordered.indexOf(email);
    if (visibleIndex < 0) return current;
    const target = ordered[visibleIndex + direction];
    if (target === undefined) return current;
    const to = current.indexOf(target);
    const next = [...current];
    next[from] = current[to];
    next[to] = email;
    return next;
  }), [update]);

  return { favorites, ready, error: error !== null, toggle, move };
}

export function useFavoriteDisplay() {
  const { value: display, ready, error, update } = useFavoritePreference("favorite-display", coerceFavoriteDisplay);
  const setDisplay = useCallback((patch: Partial<FavoriteDisplay>) => update((current) => ({
    testContext: patch.testContext ?? current.testContext,
    notes: patch.notes ?? current.notes
  })), [update]);
  return { display, ready, error, setDisplay };
}
