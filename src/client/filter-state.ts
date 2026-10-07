import type { FixtureQuality, LifecycleStatus, Project } from "./types";

/**
 * Every filter of the account directory in one value, so it can travel
 * through the URL, be remembered between visits and be saved as a preset.
 */
export interface FilterState {
  query: string;
  domain: string;
  status: "all" | LifecycleStatus;
  quality: "all" | FixtureQuality;
  project: "all" | Project;
  versionAfter: string;
  roles: string[];
  topics: string[];
  conversations: string[];
}

export const DEFAULT_FILTERS: FilterState = Object.freeze({
  query: "", domain: "all", status: "all", quality: "all", project: "all", versionAfter: "", roles: [], topics: [], conversations: []
}) as FilterState;

export const lifecycleValues: Array<"all" | LifecycleStatus> = ["all", "unused", "active", "needs_review", "delete_candidate", "archived"];
export const fixtureValues: Array<"all" | FixtureQuality> = ["all", "empty", "synthetic", "realistic", "gold"];
export const projectValues: Array<"all" | Project> = ["all", "NONE", "ORI", "ORISO", "ORIMO", "TRAIL.IST", "DREAMBAU", "OTHER"];
export const domainValues = ["all", "dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];

const LAST_FILTERS_KEY = "testmails-filters";
const LIST_SEPARATOR = ",";

/** URL parameter names; short but readable when shared. */
const PARAM: Record<keyof FilterState, string> = {
  query: "q", domain: "domain", status: "status", quality: "quality", project: "project",
  versionAfter: "after", roles: "roles", topics: "topics", conversations: "conversations"
};

function oneOf<T extends string>(allowed: readonly T[], value: string | null | undefined, fallback: T): T {
  return value !== null && value !== undefined && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

function list(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(LIST_SEPARATOR).map((item) => item.trim()).filter(Boolean))];
}

/** Reads a filter state from URL parameters. Unknown values fall back to defaults. */
export function parseFilters(params: URLSearchParams): FilterState {
  return {
    query: params.get(PARAM.query) ?? "",
    domain: oneOf(domainValues, params.get(PARAM.domain), "all"),
    status: oneOf(lifecycleValues, params.get(PARAM.status), "all"),
    quality: oneOf(fixtureValues, params.get(PARAM.quality), "all"),
    project: oneOf(projectValues, params.get(PARAM.project), "all"),
    versionAfter: params.get(PARAM.versionAfter) ?? "",
    roles: list(params.get(PARAM.roles)),
    topics: list(params.get(PARAM.topics)),
    conversations: list(params.get(PARAM.conversations))
  };
}

/** Writes only the non-default filters, so a clean state gives an empty query string. */
export function serializeFilters(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set(PARAM.query, state.query);
  if (state.domain !== "all") params.set(PARAM.domain, state.domain);
  if (state.status !== "all") params.set(PARAM.status, state.status);
  if (state.quality !== "all") params.set(PARAM.quality, state.quality);
  if (state.project !== "all") params.set(PARAM.project, state.project);
  if (state.versionAfter) params.set(PARAM.versionAfter, state.versionAfter);
  if (state.roles.length) params.set(PARAM.roles, state.roles.join(LIST_SEPARATOR));
  if (state.topics.length) params.set(PARAM.topics, state.topics.join(LIST_SEPARATOR));
  if (state.conversations.length) params.set(PARAM.conversations, state.conversations.join(LIST_SEPARATOR));
  return params;
}

/** Number of filters that differ from the default; the search counts as one. */
export function countActiveFilters(state: FilterState) {
  return [
    state.query !== "", state.domain !== "all", state.status !== "all", state.quality !== "all", state.project !== "all",
    state.versionAfter !== "", state.roles.length > 0, state.topics.length > 0, state.conversations.length > 0
  ].filter(Boolean).length;
}

/** Normalises any JSON-ish input (a preset, a stored value) into a valid state. */
export function coerceFilters(input: unknown): FilterState {
  const params = new URLSearchParams();
  if (input && typeof input === "object") {
    for (const key of Object.keys(PARAM) as Array<keyof FilterState>) {
      const value = (input as Record<string, unknown>)[key];
      if (Array.isArray(value)) params.set(PARAM[key], value.filter((item) => typeof item === "string").join(LIST_SEPARATOR));
      else if (typeof value === "string") params.set(PARAM[key], value);
    }
  }
  return parseFilters(params);
}

export function loadLastFilters(): FilterState | null {
  try {
    const raw = localStorage.getItem(LAST_FILTERS_KEY);
    return raw ? coerceFilters(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function saveLastFilters(state: FilterState) {
  try {
    if (countActiveFilters(state) === 0) localStorage.removeItem(LAST_FILTERS_KEY);
    else localStorage.setItem(LAST_FILTERS_KEY, JSON.stringify(state));
  } catch { /* storage unavailable */ }
}

/** Filters from the current address bar, or null when the URL carries none. */
export function readFiltersFromLocation(): FilterState | null {
  const params = new URLSearchParams(window.location.search);
  return Array.from(params.keys()).some((key) => Object.values(PARAM).includes(key)) ? parseFilters(params) : null;
}

/** Mirrors the state into the address bar without adding history entries. */
export function writeFiltersToLocation(state: FilterState) {
  const search = serializeFilters(state).toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
}

/** A named filter state saved per user on the server. */
export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
}

/** Normalises the server value of the `filter-presets` preference. */
export function coercePresets(input: unknown): FilterPreset[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, name, filters } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) return [];
    return [{ id, name: name.trim(), filters: coerceFilters(filters) }];
  });
}

export function sameFilters(left: FilterState, right: FilterState) {
  return serializeFilters(left).toString() === serializeFilters(right).toString();
}

/** Start-up order: URL beats the last remembered state beats the defaults. */
export function initialFilters(): FilterState {
  return readFiltersFromLocation() ?? loadLastFilters() ?? DEFAULT_FILTERS;
}
