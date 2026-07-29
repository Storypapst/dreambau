import { useEffect, useState } from "react";
import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { AccountView, OtpResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { TotpEnrollmentDialog } from "./totp-enrollment-dialog";

export function OtpAccess({ account, locale, compact = false }: { account: AccountView; locale: Locale; compact?: boolean }) {
  const linked = account.linkedAccess?.[0];
  const [result, setResult] = useState<{ email: string; accountId: string; value: OtpResponse; expiresAt: number } | null>(null);
  const [applicationSecret, setApplicationSecret] = useState<{ email: string; accountId: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [secretError, setSecretError] = useState(false);
  const [enrolledRecordIds, setEnrolledRecordIds] = useState<Set<string>>(() => new Set());
  const hasTotp = Boolean(linked?.hasTotp || (linked && enrolledRecordIds.has(linked.id)));
  const displayedResult = result?.email === account.email && result.accountId === linked?.id ? result.value : null;
  const displayedExpiresAt = displayedResult ? result?.expiresAt : undefined;
  const displayedApplicationSecret = applicationSecret?.email === account.email && applicationSecret.accountId === linked?.id
    ? applicationSecret.value
    : "";
  useEffect(() => {
    if (!displayedResult || displayedExpiresAt === undefined) return;
    const timeout = window.setTimeout(() => setResult(null), Math.max(0, displayedExpiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [displayedResult, displayedExpiresAt]);
  if (!linked) return <div className="flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary">{locale === "de" ? "Nur Mailkonto" : "Mailbox only"}</Badge><span className="text-xs text-muted-foreground">{locale === "de" ? "Noch kein App-Login verknüpft." : "No application login linked yet."}</span></div>;

  async function requestApplicationSecret() {
    const requestedEmail = account.email;
    const requestedAccountId = linked!.id;
    setSecretError(false);
    try {
      const response = await api<{ accountId: string; secret: string }>(`/accounts/${encodeURIComponent(requestedEmail)}/application-secret?accountId=${encodeURIComponent(requestedAccountId)}`);
      if (response.accountId !== requestedAccountId) throw new Error("Unexpected account");
      setApplicationSecret({ email: requestedEmail, accountId: requestedAccountId, value: response.secret });
    } catch {
      setSecretError(true);
    }
  }

  async function requestOtp() {
    const requestedEmail = account.email;
    const requestedAccountId = linked!.id;
    setBusy(true);
    setError(false);
    setResult(null);
    try {
      const value = await api<OtpResponse>(`/accounts/${encodeURIComponent(requestedEmail)}/otp?accountId=${encodeURIComponent(requestedAccountId)}`);
      if (value.accountId !== requestedAccountId) throw new Error("Unexpected account");
      setResult({
        email: requestedEmail,
        accountId: requestedAccountId,
        value,
        expiresAt: value.source === "totp" ? new Date(value.expiresAt).getTime() : Date.now() + 5 * 60_000
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex min-w-0 flex-col gap-2">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant="secondary">{linked.environment}</Badge>
      {linked.roles.map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
      {!compact && <code className="min-w-0 truncate text-xs">{linked.username}</code>}
      {!compact && <Button asChild variant="ghost" size="sm"><a href={linked.loginUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{locale === "de" ? "App öffnen" : "Open app"}</a></Button>}
    </div>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={requestApplicationSecret}>
        {locale === "de" ? "App-Passwort abrufen" : "Get app password"}
      </Button>
      {displayedApplicationSecret && <><code className="min-w-0 break-all font-mono text-xs">{displayedApplicationSecret}</code><CopyButton value={displayedApplicationSecret} label={locale === "de" ? "App-Passwort kopieren" : "Copy app password"} compact /></>}
    </div>
    {secretError && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "App-Passwort konnte nicht abgerufen werden." : "Could not retrieve app password."}</p>}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {hasTotp
        ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={requestOtp}>
            <KeyRoundIcon data-icon="inline-start" />{busy ? (locale === "de" ? "OTP wird geladen…" : "Loading OTP…") : (locale === "de" ? "OTP abrufen" : "Get OTP")}
          </Button>
        : <TotpEnrollmentDialog
            email={account.email}
            linked={linked}
            locale={locale}
            onEnrolled={(accountId) => setEnrolledRecordIds((current) => new Set(current).add(accountId))}
          />}
      {displayedResult && <><Badge variant="outline">{displayedResult.source === "totp" ? "TOTP" : "E-Mail"}</Badge><code className="font-semibold tabular-nums">{displayedResult.code}</code><CopyButton value={displayedResult.code} label={locale === "de" ? "OTP kopieren" : "Copy OTP"} compact /></>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "OTP konnte nicht abgerufen werden." : "Could not retrieve OTP."}</p>}
    {!compact && account.access?.latest && <p className="text-xs text-muted-foreground">{locale === "de" ? "Zuletzt verwendet" : "Last used"}: {new Date(account.access.latest.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")} · {account.access.latest.actorId}</p>}
  </div>;
}
