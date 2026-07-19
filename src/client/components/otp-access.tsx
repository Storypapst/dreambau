import { useEffect, useState } from "react";
import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { AccountView, OtpResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";

export function OtpAccess({ account, locale, compact = false }: { account: AccountView; locale: Locale; compact?: boolean }) {
  const linked = account.linkedAccess?.[0];
  const [result, setResult] = useState<OtpResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!result) return;
    const expiresAt = result.source === "totp" ? new Date(result.expiresAt).getTime() : Date.now() + 5 * 60_000;
    const timeout = window.setTimeout(() => setResult(null), Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [result]);
  if (!linked) return compact ? null : <p className="text-sm text-muted-foreground">{locale === "de" ? "Noch kein App-Login mit dieser Simpson-Adresse verknüpft." : "No app login is linked to this Simpson address yet."}</p>;

  async function requestOtp() {
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      setResult(await api<OtpResponse>(`/accounts/${encodeURIComponent(account.email)}/otp?accountId=${encodeURIComponent(linked!.id)}`));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex min-w-0 flex-col gap-2">
    {!compact && <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant="secondary">{linked.environment}</Badge>
      <code className="min-w-0 truncate text-xs">{linked.username}</code>
      <Button asChild variant="ghost" size="sm"><a href={linked.loginUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{locale === "de" ? "App öffnen" : "Open app"}</a></Button>
    </div>}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={requestOtp}>
        <KeyRoundIcon data-icon="inline-start" />{busy ? (locale === "de" ? "OTP wird geladen…" : "Loading OTP…") : (locale === "de" ? "OTP abrufen" : "Get OTP")}
      </Button>
      {result && <><Badge variant="outline">{result.source === "totp" ? "TOTP" : "E-Mail"}</Badge><code className="font-semibold tabular-nums">{result.code}</code><CopyButton value={result.code} label={locale === "de" ? "OTP kopieren" : "Copy OTP"} compact /></>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "OTP konnte nicht abgerufen werden." : "Could not retrieve OTP."}</p>}
    {!compact && account.access?.latest && <p className="text-xs text-muted-foreground">{locale === "de" ? "Zuletzt verwendet" : "Last used"}: {new Date(account.access.latest.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")} · {account.access.latest.actorId}</p>}
  </div>;
}
