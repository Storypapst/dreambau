import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { labelLinkedEnvironment, type Locale } from "@/i18n";
import type { AccountView, HumanEntitlements, LinkedTestAccount, OtpResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { OtpValidity } from "./otp-validity";
import { OrisoProvisioningDialog } from "./oriso-provisioning-dialog";
import { TotpEnrollmentDialog } from "./totp-enrollment-dialog";
import { requestSafeOtp } from "@/safe-otp";

function isOrisoScoped(account: AccountView) {
  if (account.metadata.project === "ORISO") return true;
  if (["ORIMO", "TRAIL.IST", "DREAMBAU"].includes(account.metadata.project)) return false;
  return account.domain === "oriso.org" || account.domain === "openresilience.cc";
}

function orisoEnvironment(account: AccountView): "pre-dev" | "dev" | null {
  if (!isOrisoScoped(account)) return null;
  if (account.domain === "dreambau.com" || account.domain === "dreambau.de") return "pre-dev";
  if (account.domain === "oriso.org" || account.domain === "openresilience.cc") return "dev";
  return null;
}

export function OtpAccess({ account, locale, compact = false, orisoProvisioningEnvironments = [], onProvisioned }: {
  account: AccountView;
  locale: Locale;
  compact?: boolean;
  orisoProvisioningEnvironments?: HumanEntitlements["orisoProvisioning"]["environments"];
  onProvisioned?: (email: string, linked: LinkedTestAccount) => void;
}) {
  const linked = account.linkedAccess?.[0];
  const environment = orisoEnvironment(account);
  const provisioningDialog = environment && orisoProvisioningEnvironments.includes(environment) && onProvisioned
    && (!linked || (linked.project === "oriso" && linked.environment === environment && !linked.hasTotp))
    ? <OrisoProvisioningDialog account={account} locale={locale} hasLinkedAccess={Boolean(linked)} onProvisioned={onProvisioned} />
    : null;
  const [result, setResult] = useState<{ email: string; accountId: string; value: OtpResponse; expiresAt: number } | null>(null);
  const [applicationSecret, setApplicationSecret] = useState<{ email: string; accountId: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingUntil, setWaitingUntil] = useState<number | null>(null);
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
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
  useEffect(() => {
    setSecretRevealed(false);
    setSecretCopied(false);
    setSecretError(false);
  }, [account.email, linked?.id]);
  if (!linked) return <div className="flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary">{locale === "de" ? "Nur Mailkonto" : "Mailbox only"}</Badge><span className="text-xs text-muted-foreground">{locale === "de" ? "Noch kein App-Login verknüpft." : "No application login linked yet."}</span>{provisioningDialog}</div>;

  async function requestApplicationSecret(): Promise<string | null> {
    const requestedEmail = account.email;
    const requestedAccountId = linked!.id;
    setSecretBusy(true);
    setSecretError(false);
    try {
      const response = await api<{ accountId: string; secret: string }>(`/accounts/${encodeURIComponent(requestedEmail)}/application-secret?accountId=${encodeURIComponent(requestedAccountId)}`);
      if (response.accountId !== requestedAccountId) throw new Error("Unexpected account");
      setApplicationSecret({ email: requestedEmail, accountId: requestedAccountId, value: response.secret });
      return response.secret;
    } catch {
      setSecretError(true);
      return null;
    } finally {
      setSecretBusy(false);
    }
  }

  async function toggleApplicationSecret() {
    if (secretRevealed) {
      setSecretRevealed(false);
      return;
    }
    const secret = displayedApplicationSecret || await requestApplicationSecret();
    if (secret) setSecretRevealed(true);
  }

  async function copyApplicationSecret() {
    const secret = displayedApplicationSecret || await requestApplicationSecret();
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      toast.success(locale === "de" ? "ORISO-App-Passwort kopiert" : "ORISO app password copied");
      window.setTimeout(() => setSecretCopied(false), 1500);
    } catch {
      toast.error(locale === "de" ? "Kopieren fehlgeschlagen" : "Copy failed");
    }
  }

  async function requestOtp() {
    const requestedEmail = account.email;
    const requestedAccountId = linked!.id;
    setBusy(true);
    setError(false);
    setResult(null);
    setWaitingUntil(null);
    try {
      const endpoint = `/accounts/${encodeURIComponent(requestedEmail)}/otp?accountId=${encodeURIComponent(requestedAccountId)}`;
      const value = await requestSafeOtp(
        () => api<OtpResponse>(endpoint),
        { onWait: setWaitingUntil }
      );
      if (value.accountId !== requestedAccountId) throw new Error("Unexpected account");
      setWaitingUntil(null);
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
      <Badge variant="secondary">{labelLinkedEnvironment(locale, [linked]) ?? linked.environment}</Badge>
      {linked.roles.map((role) => <Badge key={role} variant="outline">{role}</Badge>)}
      {!compact && <code className="min-w-0 truncate text-xs">{linked.username}</code>}
      {!compact && <Button asChild variant="ghost" size="sm"><a href={linked.loginUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{locale === "de" ? "App öffnen" : "Open app"}</a></Button>}
    </div>
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border p-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{locale === "de" ? "ORISO-App-Passwort" : "ORISO app password"}</span>
        <Badge variant="secondary">{locale === "de" ? "Fest zugewiesen" : "Permanently assigned"}</Badge>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <code className="min-w-0 flex-1 truncate text-xs">
          {secretRevealed && displayedApplicationSecret ? displayedApplicationSecret : "••••••••••••••••"}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={secretBusy}
          onClick={toggleApplicationSecret}
          aria-label={secretRevealed
            ? (locale === "de" ? "ORISO-App-Passwort maskieren" : "Hide ORISO app password")
            : (locale === "de" ? "ORISO-App-Passwort anzeigen" : "Show ORISO app password")}
        >
          {secretRevealed ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={secretBusy}
          onClick={copyApplicationSecret}
          aria-label={locale === "de" ? "ORISO-App-Passwort kopieren" : "Copy ORISO app password"}
        >
          {secretCopied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
    {secretError && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "App-Passwort konnte nicht abgerufen werden." : "Could not retrieve app password."}</p>}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {hasTotp
        ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={requestOtp}>
            <KeyRoundIcon data-icon="inline-start" />{busy ? (locale === "de" ? "OTP wird geladen…" : "Loading OTP…") : (locale === "de" ? "OTP abrufen" : "Get OTP")}
          </Button>
        : <>
            <TotpEnrollmentDialog
              email={account.email}
              linked={linked}
              locale={locale}
              onEnrolled={(accountId) => setEnrolledRecordIds((current) => new Set(current).add(accountId))}
            />
            {provisioningDialog}
          </>}
      {displayedResult && <><Badge variant="outline">{displayedResult.source === "totp" ? "TOTP" : "E-Mail"}</Badge><code className="font-semibold tabular-nums">{displayedResult.code}</code><CopyButton value={displayedResult.code} label={locale === "de" ? "OTP kopieren" : "Copy OTP"} compact /></>}
    </div>
    {waitingUntil && <OtpValidity expiresAt={waitingUntil} locale={locale} waiting />}
    {displayedResult?.source === "totp" && displayedExpiresAt !== undefined && <OtpValidity expiresAt={displayedExpiresAt} locale={locale} />}
    {error && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "OTP konnte nicht abgerufen werden." : "Could not retrieve OTP."}</p>}
    {!compact && account.access?.latest && <p className="text-xs text-muted-foreground">{locale === "de" ? "Zuletzt verwendet" : "Last used"}: {new Date(account.access.latest.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")} · {account.access.latest.actorId}</p>}
  </div>;
}
