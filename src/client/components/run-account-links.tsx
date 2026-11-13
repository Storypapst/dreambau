import { useState, type FormEvent } from "react";
import { labelRole, type Locale } from "@/i18n";
import type { WorkspaceRunDetail } from "../../shared/workspace.js";
import { accountDeepLink, attachRunAccount, detachRunAccount } from "@/workspace-client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function RunAccountLinks({ detail, locale, onUpdated }: { detail: WorkspaceRunDetail; locale: Locale; onUpdated: (detail: WorkspaceRunDetail) => void }) {
  const de = locale === "de";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function attach(event: FormEvent) {
    event.preventDefault();
    if (busy || detail.source !== "evidence-run") return;
    setBusy(true); setError(false);
    try { onUpdated(await attachRunAccount(detail.id, email)); setEmail(""); }
    catch { setError(true); } finally { setBusy(false); }
  }
  async function detach(accountEmail: string) {
    if (busy || detail.source !== "evidence-run") return;
    setBusy(true); setError(false);
    try { onUpdated(await detachRunAccount(detail.id, accountEmail)); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <section aria-label={de ? "Testnutzer" : "Test users"}>
    <div className="workspace-section-heading"><h3>{de ? "Testnutzer" : "Test users"}</h3></div>
    {(detail.accounts ?? []).length === 0 ? <p className="workspace-hint">{de ? "Noch keine Testkonten ausdrücklich zugeordnet." : "No test accounts explicitly associated."}</p> : <ul className="space-y-2">
      {(detail.accounts ?? []).map((account, index) => <li key={account.accountId ?? (account.email || String(index))} className="rounded-md border p-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {account.resolved ? <a className="font-medium underline underline-offset-4" href={accountDeepLink(account.email, detail.project)}>{account.displayName ?? account.email}</a>
            : <span className="font-medium">{account.email || account.accountId} · {de ? "Konto nicht im Katalog" : "Account not in catalogue"}</span>}
          {detail.source === "evidence-run" && <Button type="button" variant="ghost" size="sm" disabled={busy}
            onClick={() => void detach(account.email)}>{de ? "Zuordnung entfernen" : "Remove link"}</Button>}
        </div>
        <p className="text-xs text-muted-foreground">{account.roles.map(role => labelRole(locale, role)).join(" · ") || "—"}{account.agencies.length ? " · "+account.agencies.join(" · ") : ""}{account.carrier ? " · "+account.carrier : ""}{account.postalCode ? " · PLZ "+account.postalCode : ""}</p>
      </li>)}
    </ul>}
    {detail.source === "evidence-run" && <form className="mt-2 flex flex-wrap gap-2" onSubmit={event => void attach(event)}>
      <Input className="min-w-56 flex-1" type="email" required value={email} onChange={event => setEmail(event.target.value)}
        aria-label={de ? "E-Mail des Testkontos" : "Test account email"} placeholder={de ? "Testkonto-E-Mail" : "Test account email"} />
      <Button type="submit" disabled={busy}>{de ? "Konto zuordnen" : "Link account"}</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{de ? "Die Zuordnung konnte nicht gespeichert werden. Prüfe Konto und Berechtigung." : "Could not save the link. Check the account and permission."}</p>}
  </section>;
}
