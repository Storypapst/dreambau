import { useState } from "react";
import { CircleCheckIcon, KeyRoundIcon, MailPlusIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type {
  AccountView,
  LinkedTestAccount,
  OrisoOnboardingState,
  OrisoProvisioningResult,
  OrisoProvisioningRole,
  OrisoProvisioningStateView,
  OrisoProvisioningView,
  OtpResponse
} from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { CopyButton } from "./copy-button";
import { OtpValidity } from "./otp-validity";
import { requestSafeOtp } from "@/safe-otp";

const stateLabels: Record<OrisoOnboardingState, { de: string; en: string }> = {
  invited: { de: "Eingeladen", en: "Invited" },
  "onboarding-pending": { de: "Onboarding offen", en: "Onboarding pending" },
  "two-factor-pending": { de: "2FA ausstehend", en: "2FA pending" },
  ready: { de: "Bereit", en: "Ready" }
};

const nextStepLabels: Record<OrisoProvisioningStateView["nextStep"], { de: string; en: string }> = {
  "open-invitation-mail": {
    de: "Einladungsmail im Springfield-Postfach öffnen und das Onboarding starten.",
    en: "Open the invitation mail in the Springfield mailbox and start onboarding."
  },
  "complete-onboarding": {
    de: "Onboarding abschließen: das fest zugewiesene ORISO-App-Passwort aus der Testkonto-Zeile verwenden.",
    en: "Complete onboarding with the permanently assigned ORISO app password from the test-account row."
  },
  "store-totp": {
    de: "TOTP-Schlüssel aus dem ORISO-Onboarding unten einfügen — der Antwortcode für ORISO erscheint direkt danach.",
    en: "Paste the TOTP key from ORISO onboarding below — the response code for ORISO appears right after."
  },
  none: {
    de: "Konto ist bereit. OTP über „OTP abrufen“ verfügbar.",
    en: "Account is ready. OTP available via “Get OTP”."
  }
};

const roleLabels: Record<OrisoProvisioningRole, { de: string; en: string }> = {
  "platform-admin": { de: "Plattform-Admin", en: "Platform admin" },
  "tenant-admin": { de: "Träger-Admin", en: "Tenant admin" },
  "agency-admin": { de: "Beratungsstellen-Admin", en: "Agency admin" },
  counsellor: { de: "Berater:in", en: "Counsellor" },
  "advice-seeker": { de: "Ratsuchende:r", en: "Advice seeker" }
};

function StateSummary({
  state,
  locale,
  environment
}: {
  state: OrisoProvisioningStateView;
  locale: Locale;
  environment: "pre-dev" | "dev";
}) {
  return <div className="flex flex-col gap-2" data-testid="oriso-provisioning-state">
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{stateLabels[state.state][locale]}</Badge>
      {state.role && <Badge variant="outline">{roleLabels[state.role][locale]}</Badge>}
      <Badge variant="secondary">{environment}</Badge>
    </div>
    <p className="text-sm">{nextStepLabels[state.nextStep][locale]}</p>
    {state.expiresAt && state.state === "invited" && <p className="text-xs text-muted-foreground">
      {locale === "de" ? "Einladung gültig bis" : "Invitation valid until"}: {new Date(state.expiresAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}
    </p>}
  </div>;
}

function provisioningErrorMessage(code: string, locale: Locale) {
  if (code === "application_password_required") {
    return locale === "de"
      ? "Das bestehende ORISO-Konto muss mit dem Passwort verknüpft werden, das im Onboarding verwendet wurde."
      : "Link the existing ORISO account with the password used during onboarding.";
  }
  if (code === "account_credentials_mismatch") {
    return locale === "de"
      ? "Das gespeicherte ORISO-App-Passwort passt nicht zum bestehenden Konto. Bitte das tatsächlich verwendete Passwort erneut hinterlegen."
      : "The stored ORISO app password does not match the existing account. Store the password actually used.";
  }
  if (code === "oriso_onboarding_state_mismatch") {
    return locale === "de"
      ? "Der aktuelle ORISO-Onboarding-Status passt nicht mehr zu dieser Rolle. Status neu laden und die angezeigte Rolle prüfen."
      : "The current ORISO onboarding state no longer matches this role. Reload the status and check the displayed role.";
  }
  if (code === "managed_record_password_locked") {
    return locale === "de"
      ? "Das Passwort eines bereits verwalteten Kontos wird hier nicht überschrieben."
      : "The password of an already managed account is not overwritten here.";
  }
  if (code === "record_password_update_unavailable" || code === "record_password_update_failed") {
    return locale === "de"
      ? "Das ORISO-App-Passwort wurde nicht dauerhaft im Test-Access-Record gespeichert."
      : "The ORISO app password was not persisted in the Test Access record.";
  }
  return locale === "de"
    ? "Konto konnte nicht vollständig angelegt oder geprüft werden. Der gespeicherte Zustand wurde nicht als bereit markiert."
    : "Could not fully provision or verify the account. The stored state was not marked ready.";
}

export function OrisoProvisioningDialog({
  account,
  locale,
  hasLinkedAccess,
  onProvisioned
}: {
  account: AccountView;
  locale: Locale;
  hasLinkedAccess: boolean;
  onProvisioned: (email: string, linked: LinkedTestAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<OrisoProvisioningView | null>(null);
  const [role, setRole] = useState<OrisoProvisioningRole>("tenant-admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationPassword, setApplicationPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState(false);
  const [otp, setOtp] = useState<{ code: string; expiresAt?: number } | null>(null);
  const [otpWaitingUntil, setOtpWaitingUntil] = useState<number | null>(null);
  const [otpError, setOtpError] = useState(false);
  const [liveVerified, setLiveVerified] = useState(false);
  const environment = view?.environment
    ?? (account.domain === "oriso.org" || account.domain === "openresilience.cc" ? "dev" : "pre-dev");
  const environmentLabel = environment === "pre-dev" ? "PreDev" : "Dev";

  async function load() {
    setError(null);
    setApplicationPassword("");
    try {
      setView(await api<OrisoProvisioningView>(`/accounts/${encodeURIComponent(account.email)}/oriso-provisioning`));
    } catch {
      setError(locale === "de" ? "Status konnte nicht geladen werden." : "Could not load the provisioning status.");
    }
  }

  function changeOpen(value: boolean) {
    setOpen(value);
    setError(null);
    setApplicationPassword("");
    setTotpSecret("");
    setEnrollError(false);
    setOtp(null);
    setOtpWaitingUntil(null);
    setOtpError(false);
    setLiveVerified(false);
    if (value) {
      setView(null);
      void load();
    }
  }

  async function requestOtp(accountId: string) {
    setOtpError(false);
    try {
      const endpoint = `/accounts/${encodeURIComponent(account.email)}/otp?accountId=${encodeURIComponent(accountId)}`;
      const value = await requestSafeOtp(
        () => api<OtpResponse>(endpoint),
        { onWait: setOtpWaitingUntil }
      );
      setOtpWaitingUntil(null);
      setOtp({
        code: value.code,
        expiresAt: value.source === "totp" ? new Date(value.expiresAt).getTime() : undefined
      });
    } catch {
      setOtpError(true);
    }
  }

  async function enrollAndGenerate() {
    const currentView = view;
    let linked = currentView?.linked;
    if (!currentView || !linked) return;
    setEnrollBusy(true);
    setEnrollError(false);
    setError(null);
    if (currentView.requiresApplicationPassword && currentView.state?.role && applicationPassword) {
      try {
        const result = await api<OrisoProvisioningResult>(
          `/accounts/${encodeURIComponent(account.email)}/oriso-provisioning`,
          {
            method: "POST",
            body: JSON.stringify({ environment, role: currentView.state.role, applicationPassword })
          }
        );
        linked = result.linked;
        setView((current) => current ? {
          ...current,
          state: result.state,
          linked: result.linked,
          requiresApplicationPassword: result.requiresApplicationPassword
        } : current);
        onProvisioned(account.email, result.linked);
        setApplicationPassword("");
      } catch (cause) {
        setError(provisioningErrorMessage(cause instanceof Error ? cause.message : "", locale));
        setEnrollBusy(false);
        return;
      }
    }
    try {
      await api(`/accounts/${encodeURIComponent(account.email)}/totp`, {
        method: "POST",
        body: JSON.stringify({ accountId: linked.id, totpSecret })
      });
      setApplicationPassword("");
      setTotpSecret("");
      const updated = { ...linked, hasTotp: true };
      setView((current) => current ? { ...current, linked: updated, requiresApplicationPassword: false } : current);
      onProvisioned(account.email, updated);
      await requestOtp(linked.id);
    } catch {
      setEnrollError(true);
    } finally {
      setEnrollBusy(false);
    }
  }

  async function provision(selectedRole: OrisoProvisioningRole, existingPassword?: string) {
    setBusy(true);
    setError(null);
    setLiveVerified(false);
    try {
      const result = await api<OrisoProvisioningResult>(
        `/accounts/${encodeURIComponent(account.email)}/oriso-provisioning`,
        {
          method: "POST",
          body: JSON.stringify({
            environment,
            role: selectedRole,
            ...(existingPassword ? { applicationPassword: existingPassword } : {})
          })
        }
      );
      setView((current) => current ? {
        ...current,
        state: result.state,
        linked: result.linked,
        requiresApplicationPassword: result.requiresApplicationPassword
      } : current);
      setLiveVerified(result.state.state === "ready" && result.linked.hasTotp);
      onProvisioned(account.email, result.linked);
      if (existingPassword) {
        setApplicationPassword("");
      }
    } catch (cause) {
      setError(provisioningErrorMessage(cause instanceof Error ? cause.message : "", locale));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm">
        {hasLinkedAccess
          ? <><RefreshCwIcon data-icon="inline-start" />{locale === "de" ? "ORISO-Status" : "ORISO status"}</>
          : <><MailPlusIcon data-icon="inline-start" />{locale === "de" ? "ORISO-Konto anlegen" : "Provision ORISO account"}</>}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{locale === "de" ? `ORISO ${environmentLabel} Konto` : `ORISO ${environmentLabel} account`}</DialogTitle>
        <DialogDescription>
          {locale === "de"
            ? "Legt über den verwalteten Plattform-Admin ein wiederverwendbares ORISO-Konto für dieses Springfield-Postfach an, aktiviert 2FA und prüft den Login. Das App-Passwort wird genau einmal vergeben, bleibt unverändert und ist anschließend geschützt in der Testkonto-Zeile abrufbar."
            : "Creates a reusable ORISO account for this Springfield mailbox through the managed platform admin, activates 2FA, and verifies login. The app password is assigned once, stays unchanged, and can then be retrieved securely from the test-account row."}
        </DialogDescription>
      </DialogHeader>
      {!view && !error && <p className="text-sm text-muted-foreground">{locale === "de" ? "Status wird geladen…" : "Loading status…"}</p>}
      {view && !view.configured && <p className="text-sm text-muted-foreground">
        {locale === "de"
          ? `ORISO-Provisioning ist für ${environmentLabel} auf diesem Server nicht konfiguriert.`
          : `ORISO provisioning is not configured for ${environmentLabel} on this server.`}
      </p>}
      {view?.configured && view.state && <StateSummary state={view.state} locale={locale} environment={view.environment} />}
      {view?.configured && view.state && view.linked?.hasTotp && <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">
          {liveVerified
            ? (locale === "de" ? "Live geprüft" : "Verified live")
            : (locale === "de" ? "Gespeicherter Status" : "Stored status")}
        </p>
        <p className="text-xs text-muted-foreground">
          {liveVerified
            ? (locale === "de"
                ? "Die gespeicherten Zugangsdaten wurden gerade gegen die aktuelle ORISO-Umgebung geprüft."
                : "The stored credentials were just verified against the current ORISO environment.")
            : (locale === "de"
                ? "„Bereit“ stammt aus dem Test-Access-Record und überlebt einen Neuaufbau der ORISO-Umgebung. Die Live-Prüfung unten stellt ein fehlendes Konto mit derselben Rolle, demselben Passwort und demselben TOTP wieder her."
                : "“Ready” comes from the Test Access record and survives an ORISO environment rebuild. The live check below restores a missing account with the same role, password, and TOTP.")}
        </p>
      </div>}
      {view?.configured && view.state && !view.linked && view.state.role && <p className="text-sm text-muted-foreground">
        {locale === "de"
          ? "Für dieses ORISO-Konto existiert noch kein Test-Access-Record. Erst nach dem Verknüpfen erscheinen das fest zugewiesene ORISO-App-Passwort und „2FA hinterlegen“ in der Zeile."
          : "This ORISO account has no Test Access record yet. The permanently assigned ORISO app password and “Set up 2FA” appear in the row only after linking."}
      </p>}
      {view?.configured && view.state?.role && (!view.linked || view.requiresApplicationPassword) && <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{locale === "de" ? "ORISO-App-Passwort verknüpfen" : "Link ORISO app password"}</p>
        <p className="text-xs text-muted-foreground">
          {locale === "de"
            ? "Exakt das Passwort eintragen, das im ORISO-Onboarding verwendet wurde oder dort verwendet werden soll. Es wird nur im geschützten Infisical-Record gespeichert und nie in der Antwort ausgegeben."
            : "Enter exactly the password used during ORISO onboarding, or the one that will be used there. It is stored only in the protected Infisical record and is never returned in the response."}
        </p>
        <Input
          aria-label={locale === "de" ? "Bestehendes ORISO-App-Passwort" : "Existing ORISO app password"}
          name="existingOrisoPassword"
          type="password"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          value={applicationPassword}
          onChange={(event) => setApplicationPassword(event.target.value)}
          disabled={busy || enrollBusy}
        />
      </div>}
      {view?.configured && view.linked && !view.linked.hasTotp && <div className="flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-sm font-medium">{locale === "de" ? "2FA direkt hier abschließen" : "Finish 2FA right here"}</p>
        <p className="text-xs text-muted-foreground">
          {locale === "de"
            ? "Base32-Schlüssel aus dem ORISO-2FA-Dialog einfügen. Er wird nur im verknüpften Infisical-Record gespeichert; danach erscheint sofort der Antwortcode für ORISO."
            : "Paste the Base32 key from the ORISO 2FA dialog. It is stored only in the linked Infisical record; the response code for ORISO appears right after."}
        </p>
        <Input
          aria-label={locale === "de" ? "TOTP-Schlüssel" : "TOTP key"}
          name="dialogTotpSecret"
          type="password"
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          spellCheck={false}
          placeholder={locale === "de" ? "TOTP-Schlüssel (Base32)" : "TOTP key (Base32)"}
          value={totpSecret}
          onChange={(event) => setTotpSecret(event.target.value)}
          aria-invalid={enrollError}
          disabled={enrollBusy}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={enrollAndGenerate} disabled={enrollBusy || (view.requiresApplicationPassword && !applicationPassword) || !totpSecret.trim()}>
            <ShieldCheckIcon data-icon="inline-start" />
            {enrollBusy
              ? (locale === "de" ? "Wird gespeichert…" : "Saving…")
              : (locale === "de" ? "Hinterlegen & Code erzeugen" : "Store & generate code")}
          </Button>
        </div>
        {enrollError && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "Der TOTP-Schlüssel wurde nicht gespeichert." : "The TOTP key was not stored."}</p>}
      </div>}
      {view?.configured && view.linked?.hasTotp && !otp && <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => requestOtp(view.linked!.id)}>
          <KeyRoundIcon data-icon="inline-start" />
          {locale === "de" ? "Antwortcode erzeugen" : "Generate response code"}
        </Button>
      </div>}
      {otp && <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <span className="text-sm">{locale === "de" ? "Code für ORISO:" : "Code for ORISO:"}</span>
        <code className="font-semibold tabular-nums" data-testid="oriso-dialog-otp">{otp.code}</code>
        <CopyButton value={otp.code} label={locale === "de" ? "Code kopieren" : "Copy code"} compact />
        <Button type="button" variant="ghost" size="sm" onClick={() => view?.linked && requestOtp(view.linked.id)}>
          <RefreshCwIcon data-icon="inline-start" />
          {locale === "de" ? "Neu" : "Refresh"}
        </Button>
      </div>}
      {otpWaitingUntil && <OtpValidity expiresAt={otpWaitingUntil} locale={locale} waiting />}
      {otp?.expiresAt && <OtpValidity expiresAt={otp.expiresAt} locale={locale} />}
      {otpError && <p role="alert" className="text-sm text-destructive">{locale === "de" ? "Code konnte nicht erzeugt werden." : "Could not generate the code."}</p>}
      {view?.configured && !view.state && <div className="flex flex-col gap-3">
        <p className="text-sm">{locale === "de" ? "Noch kein ORISO-Konto. Rolle wählen und Konto vollständig anlegen:" : "No ORISO account yet. Choose a role and provision the complete account:"}</p>
        <Select value={role} onValueChange={(value) => setRole(value as OrisoProvisioningRole)}>
          <SelectTrigger aria-label={locale === "de" ? "Rolle" : "Role"}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            {view.supportedRoles.map((value) => <SelectItem key={value} value={value}>{roleLabels[value][locale]}</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={busy}>
          {locale === "de" ? "Schließen" : "Close"}
        </Button>
        {view?.configured && !view.state && <Button type="button" onClick={() => provision(role)} disabled={busy}>
          <CircleCheckIcon data-icon="inline-start" />
          {busy
            ? (locale === "de" ? "Wird angelegt…" : "Provisioning…")
            : (locale === "de" ? "Konto anlegen & prüfen" : "Provision & verify account")}
        </Button>}
        {view?.configured && view.state && !view.linked && view.state.role && <Button type="button" onClick={() => provision(view.state!.role!, applicationPassword)} disabled={busy || !applicationPassword}>
          <CircleCheckIcon data-icon="inline-start" />
          {busy
            ? (locale === "de" ? "Wird verknüpft…" : "Linking…")
            : (locale === "de" ? "Test-Access-Record verknüpfen" : "Link Test Access record")}
        </Button>}
        {view?.configured && view.state?.role && view.linked?.hasTotp && <Button type="button" onClick={() => provision(view.state!.role!)} disabled={busy}>
          <RefreshCwIcon data-icon="inline-start" />
          {busy
            ? (locale === "de" ? "Wird live geprüft…" : "Verifying live…")
            : (locale === "de" ? "Konto live prüfen & ggf. wiederherstellen" : "Verify live & restore if needed")}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
