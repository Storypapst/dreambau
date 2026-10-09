import type { Locale } from "@/i18n";

/** Informational test-account documentation; never an authorization source. */
export function AccountAgencies({ agencies = [], locale }: { agencies?: string[]; locale: Locale }) {
  return <div className="min-w-0 text-sm" data-testid="account-agencies">
    <div className="text-xs font-medium text-muted-foreground">{locale === "de" ? "Beratungsstellen · Dokumentation" : "Counselling agencies · documentation"}</div>
    {agencies.length ? <ul className="list-inside list-disc break-words">{agencies.map((name, index) => <li key={`${index}:${name}`}>{name}</li>)}</ul>
      : <p className="text-muted-foreground">{locale === "de" ? "Nicht hinterlegt" : "Not documented"}</p>}
  </div>;
}
