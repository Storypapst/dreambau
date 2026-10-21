import type { Locale } from "./i18n.js";
const reasonCopy: Record<string, [string, string, string, string]> = {
  checks_failed: [
    "Checks fehlgeschlagen",
    "Failed checks",
    "Check öffnen",
    "Open check",
  ],
  checks_pending: [
    "Checks laufen",
    "Checks pending",
    "Lauf öffnen",
    "Open run",
  ],
  checks_unknown: [
    "Checks nicht belegt",
    "Check evidence unknown",
    "Quelle prüfen",
    "Inspect source",
  ],
  no_checks: [
    "Keine Checks beobachtet",
    "No checks observed",
    "Checks ansehen",
    "Inspect checks",
  ],
  changes_requested: [
    "Änderungen angefordert",
    "Changes requested",
    "Review öffnen",
    "Open review",
  ],
  review_required: [
    "Review erforderlich",
    "Review required",
    "Review prüfen",
    "Inspect review",
  ],
  review_requested: [
    "Review angefragt",
    "Review requested",
    "Review öffnen",
    "Open review",
  ],
  threads_unresolved: [
    "Offene Review-Gespräche",
    "Unresolved conversations",
    "Gespräch öffnen",
    "Open conversation",
  ],
  conflict: [
    "Konflikt bestätigt",
    "Confirmed conflict",
    "Konflikt prüfen",
    "Inspect conflict",
  ],
  mergeability_unknown: [
    "Mergefähigkeit unbekannt",
    "Mergeability unknown",
    "Quelle aktualisieren",
    "Refresh source",
  ],
  data_stale: [
    "Daten veraltet",
    "Stale evidence",
    "Quelle aktualisieren",
    "Refresh source",
  ],
  data_incomplete: [
    "Daten unvollständig",
    "Incomplete evidence",
    "Quelle prüfen",
    "Inspect source",
  ],
  draft: ["Entwurf", "Draft", "Entwurf ansehen", "Inspect draft"],
};
export function safeLink(value: unknown): string | undefined {
  try {
    if (typeof value !== "string") return;
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ![...url.searchParams.keys()].some((key) =>
        /token|secret|password|credential|authorization|api.?key/i.test(key),
      )
    )
      return url.href;
  } catch {}
  return;
}

export function reasonLabel(locale: Locale, code: string) {
  return (
    reasonCopy[code]?.[locale === "de" ? 0 : 1] ??
    (locale === "de" ? "Unbekannter Grund" : "Unknown reason")
  );
}
export function reasonNext(locale: Locale, code: string) {
  return (
    reasonCopy[code]?.[locale === "de" ? 2 : 3] ??
    (locale === "de" ? "Quelle prüfen" : "Inspect source")
  );
}
export function relativeAge(locale: Locale, at: string | null | undefined) {
  if (!at || !Number.isFinite(Date.parse(at)))
    return locale === "de" ? "Unbekannt" : "Unknown";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(at)) / 60000),
  );
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -(minutes < 60 ? minutes : Math.floor(minutes / 60)),
    minutes < 60 ? "minute" : "hour",
  );
}
export function absoluteTime(locale: Locale, at: string | null | undefined) {
  return at && Number.isFinite(Date.parse(at))
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(new Date(at))
    : locale === "de"
      ? "Unbekannt"
      : "Unknown";
}
