import { OrisoAdminDeletionDialog } from "./oriso-admin-deletion-dialog";
import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { cn } from "@/lib/utils";
import { labelRole, labelLinkedEnvironment, t, type Locale } from "@/i18n";
import type { AccountMetadata, AccountView, HumanEntitlements, LinkedTestAccount, OtpResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { beginAccountCopy, finishAccountCopy } from "./account-quick-copy";
import { CopyButton } from "./copy-button";
import { saveMetadataPatch } from "./inline-metadata-controls";
import { OtpValidity } from "./otp-validity";
import { OrisoProvisioningDialog } from "./oriso-provisioning-dialog";
import { TotpEnrollmentDialog } from "./totp-enrollment-dialog";
import { TestAccessLinkResetDialog, type OnTestAccessLinkReset } from "./test-access-link-reset-dialog";
import { requestSafeOtp } from "@/safe-otp";

function isOrisoScoped(account: AccountView) {
  if (account.metadata.project === "ORISO") return true;
  if (["ORIMO", "TRAIL.IST", "DREAMBAU"].includes(account.metadata.project)) return false;
  return account.domain === "oriso.org" || account.domain === "openresilience.cc";
}

// Mirrors orisoEnvironmentByDomain on the server; tests/oriso-domain-scope.test.ts
// fails on drift. getme.global and trail.ist reach this only once their account
// carries project ORISO — isOrisoScoped decides that, this only says where.
export const ORISO_ENVIRONMENT_BY_DOMAIN: Record<string, "pre-dev" | "dev"> = {
  "dreambau.com": "pre-dev",
  "dreambau.de": "pre-dev",
  "oriso.org": "dev",
  "openresilience.cc": "dev",
  "getme.global": "dev",
  "trail.ist": "dev"
};

export function orisoEnvironment(account: AccountView): "pre-dev" | "dev" | null {
  if (!isOrisoScoped(account)) return null;
  // environmentForOrisoEmail lowercases on the server. Without the same
  // treatment here a mixed-case domain hides the button on an account the
  // server would happily provision, or shows one that leads to a 422.
  return ORISO_ENVIRONMENT_BY_DOMAIN[account.domain.trim().toLowerCase()] ?? null;
}

export function OtpAccess({ account, locale, compact = false, favorite = false, canDeleteOrisoAdmin = false, orisoProvisioningEnvironments = [], onProvisioned, onMetadataSaved, onLinkReset, renderMailbox, showLinkedTags = true }: {
  account: AccountView;
  locale: Locale;
  compact?: boolean;
  favorite?: boolean;
  canDeleteOrisoAdmin?: boolean;
  orisoProvisioningEnvironments?: HumanEntitlements["orisoProvisioning"]["environments"];
  onProvisioned?: (email: string, linked: LinkedTestAccount, metadata?: AccountMetadata) => void;
  onMetadataSaved?: (metadata: AccountMetadata) => void;
  onLinkReset?: OnTestAccessLinkReset;
  renderMailbox?: (mailOtp: ReactNode, actions?: ReactNode) => ReactNode;
  showLinkedTags?: boolean;
}) {
  const linked = account.linkedAccess?.[0];
  const environment = orisoEnvironment(account);
  const provisioningDialog = !favorite && environment && orisoProvisioningEnvironments.includes(environment) && onProvisioned
    && (!linked || (linked.project === "oriso" && linked.environment === environment))
    ? <OrisoProvisioningDialog account={account} locale={locale} hasLinkedAccess={Boolean(linked)} compactTrigger={Boolean(renderMailbox && linked)} onProvisioned={onProvisioned} />
    : null;
  const deletionDialogs = !favorite && canDeleteOrisoAdmin && onProvisioned
    ? account.linkedAccess?.filter((record) => record.project === "oriso" && record.kind === "admin" && !record.protectedServiceAdmin
      && (record.environment === "dev" || record.environment === "pre-dev")
      && orisoProvisioningEnvironments.includes(record.environment))
      .map((record) => <OrisoAdminDeletionDialog key={record.id} account={account} linked={record} locale={locale} onDeleted={onProvisioned} />)
    : null;
  const linkResetDialogs = !favorite && onLinkReset
    ? account.linkedAccess?.filter((record) => record.project === "oriso" && record.linkRevision && !record.deletionPending)
      .map((record) => <TestAccessLinkResetDialog key={`${record.id}:${record.linkRevision}`} linked={record} locale={locale} onReset={onLinkReset} />)
    : null;
  const managementActions = (provisioningDialog || deletionDialogs?.length || linkResetDialogs?.length) ? (
    <div className="inline-flex shrink-0 items-center gap-1">{provisioningDialog}{deletionDialogs}{linkResetDialogs}</div>
  ) : null;
  const [result, setResult] = useState<{ email: string; accountId: string; value: OtpResponse; expiresAt: number } | null>(null);
  const [applicationSecret, setApplicationSecret] = useState<{ email: string; accountId: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitingUntil, setWaitingUntil] = useState<number | null>(null);
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [error, setError] = useState(false);
  const [otpDeliverySaving, setOtpDeliverySaving] = useState(false);
  const [secretError, setSecretError] = useState(false);
  const [enrolledRecordIds, setEnrolledRecordIds] = useState<Set<string>>(() => new Set());
  const hasTotp = Boolean(linked?.hasTotp || (linked && enrolledRecordIds.has(linked.id)));
  const usesMailOtp = account.metadata.otpDelivery === "mail";
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
  if (linked?.deletionPending) return <>{renderMailbox?.(null)}<div className="col-span-full flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary">{locale === "de" ? "ORISO-Löschung prüfen" : "Check ORISO deletion"} ({linked.environment})</Badge>{managementActions}</div></>;
  if (linked?.deleted) return <>{renderMailbox?.(null)}<div className="col-span-full flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary">{locale === "de" ? "ORISO-Konto gelöscht" : "ORISO account deleted"} ({linked.environment})</Badge>{managementActions}</div></>;
  if (!linked) return <>{renderMailbox?.(null)}<div className="col-span-full flex min-w-0 flex-wrap items-center gap-2"><Badge variant="secondary">{locale === "de" ? "Nur Mailkonto" : "Mailbox only"}</Badge><span className="text-xs text-muted-foreground">{locale === "de" ? "Noch kein App-Login verknüpft." : "No application login linked yet."}</span>{provisioningDialog}</div></>;

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
    const operation = beginAccountCopy();
    try {
      const secret = displayedApplicationSecret || await requestApplicationSecret();
      if (!secret || operation.signal.aborted) return;
      await navigator.clipboard.writeText(secret);
      if (operation.signal.aborted) return;
      setSecretCopied(true);
      toast.success(locale === "de" ? "App-Passwort kopiert" : "App password copied");
      window.setTimeout(() => setSecretCopied(false), 1500);
    } catch {
      if (!operation.signal.aborted) toast.error(locale === "de" ? "Kopieren fehlgeschlagen" : "Copy failed");
    } finally {
      finishAccountCopy(operation);
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

  async function changeOtpDelivery(otpDelivery: NonNullable<AccountMetadata["otpDelivery"]>) {
    setOtpDeliverySaving(true);
    try {
      const metadata = await saveMetadataPatch(account.email, { otpDelivery });
      setResult(null);
      setError(false);
      onMetadataSaved?.(metadata);
    } catch {
      toast.error(t(locale, "page.saveFailed"));
    } finally {
      setOtpDeliverySaving(false);
    }
  }

  const hasQualifiedAdmin = linked.roles.some((role) => ["platform-admin", "tenant-admin", "agency-admin"].includes(role));
  const displayedRoles = hasQualifiedAdmin ? linked.roles.filter((role) => role !== "admin" && role !== "Admin") : linked.roles;
  const applicationAccess = <>
    <div className={cn("flex min-w-0 items-center gap-1", favorite ? "flex-wrap" : "rounded-lg border p-2")}>
      <span className={cn("shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground", favorite ? "basis-full" : "me-1")}>
        {locale === "de" ? "App-Passwort" : "App password"}
      </span>
      <code data-testmails-search-private className={cn("min-w-0 truncate text-xs", favorite && "flex-1")}>
        {secretRevealed && displayedApplicationSecret ? displayedApplicationSecret : favorite ? "••••••••" : "••••••••••••••••"}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={secretBusy}
        onClick={toggleApplicationSecret}
        aria-label={secretRevealed
          ? (locale === "de" ? "App-Passwort maskieren" : "Hide app password")
          : (locale === "de" ? "App-Passwort anzeigen" : "Show app password")}
      >
        {secretRevealed ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={secretBusy}
        onClick={copyApplicationSecret}
        aria-label={locale === "de" ? "App-Passwort kopieren" : "Copy app password"}
      >
        {secretCopied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
    {secretError && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "App-Passwort konnte nicht abgerufen werden." : "Could not retrieve app password."}</p>}
  </>;

  const otpLabel = busy
    ? (locale === "de" ? "OTP wird geladen…" : "Loading OTP…")
    : (locale === "de" ? "OTP abrufen" : "Get OTP");
  const otpActions = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">

      {usesMailOtp ? <Button asChild variant={favorite ? "secondary" : "default"} size="sm" className={favorite ? "w-full justify-start" : undefined}>
        <a href="https://mail.dreambau.com/" target="_blank" rel="noreferrer" title="Mail 2FA"><ExternalLinkIcon data-icon="inline-start" /><span>{locale === "de" ? "Mail öffnen" : "Open mail"}</span></a>
      </Button> : hasTotp
        ? <Button type="button" variant={favorite ? "secondary" : "default"} size="sm" className={favorite ? "w-full justify-start" : undefined} disabled={busy || otpDeliverySaving} onClick={requestOtp} title={otpLabel}>
            <KeyRoundIcon data-icon="inline-start" /><span>{otpLabel}</span>
          </Button>
        : favorite ? <Badge variant="secondary">{locale === "de" ? "App-2FA nicht eingerichtet" : "App 2FA not set up"}</Badge>
        : <TotpEnrollmentDialog
            email={account.email}
            linked={linked}
            locale={locale}
            onEnrolled={(accountId) => setEnrolledRecordIds((current) => new Set(current).add(accountId))}
          />}
      {managementActions}
    </div>
  );
  const otpFeedback = !usesMailOtp && <>
      {displayedResult && <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{displayedResult.source === "totp" ? "TOTP" : "E-Mail"}</Badge><code data-testmails-search-private className="font-semibold tabular-nums">{displayedResult.code}</code><CopyButton value={displayedResult.code} label={locale === "de" ? "OTP kopieren" : "Copy OTP"} compact /></div>}
      {waitingUntil && <OtpValidity expiresAt={waitingUntil} locale={locale} waiting />}
      {displayedResult?.source === "totp" && displayedExpiresAt !== undefined && <OtpValidity expiresAt={displayedExpiresAt} locale={locale} />}
      {error && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "OTP konnte nicht abgerufen werden." : "Could not retrieve OTP."}</p>}
  </>;

  if (favorite) return <>
    <div className="col-span-full flex min-w-0 flex-col gap-1.5">{otpActions}{otpFeedback}</div>
    <div className="min-w-0">{applicationAccess}</div>
  </>;

  const mailOtpLabel = locale === "de" ? "E-Mail als zweiten Faktor verwenden" : "Use email as the second factor";
  const mailOtp = onMetadataSaved && (
    <label className="inline-flex min-h-8 shrink-0 cursor-pointer items-center justify-center px-1 text-xs text-muted-foreground"
      title={usesMailOtp
        ? (locale === "de" ? "Mail-2FA ist ausgewählt. Abwählen für App-2FA." : "Mail 2FA is selected. Uncheck for app 2FA.")
        : mailOtpLabel}>
      <Checkbox checked={usesMailOtp} disabled={busy || otpDeliverySaving} aria-label={mailOtpLabel}
        onCheckedChange={(checked) => void changeOtpDelivery(checked === true ? "mail" : "app")} />
    </label>
  );

  return <div className="flex min-w-0 flex-col gap-2">
    {renderMailbox ? renderMailbox(mailOtp, otpActions) : mailOtp}
    {(showLinkedTags || !compact) && <div className="flex min-w-0 flex-wrap items-center gap-2">
      {showLinkedTags && <Badge variant="secondary">{labelLinkedEnvironment(locale, [linked]) ?? linked.environment}</Badge>}
      {showLinkedTags && displayedRoles.map((role) => <Badge key={role} variant="outline">{labelRole(locale, role)}</Badge>)}
      {!compact && <code className="min-w-0 truncate text-xs">{linked.username}</code>}
      {!compact && <Button asChild variant="ghost" size="sm"><a href={linked.loginUrl} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{locale === "de" ? "App öffnen" : "Open app"}</a></Button>}
    </div>}
    {!renderMailbox && otpActions}
    {otpFeedback}
    {applicationAccess}
  </div>;
}
