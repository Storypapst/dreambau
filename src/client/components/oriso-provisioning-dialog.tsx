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
    de: "Onboarding abschließen: Passwort aus dem Test-Access-Record (App-Passwort abrufen) setzen.",
    en: "Complete onboarding: set the password from the Test Access record (Get app password)."
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

function StateSummary({ state, locale }: { state: OrisoProvisioningStateView; locale: Locale }) {
  return <div className="flex flex-col gap-2" data-testid="oriso-provisioning-state">
    <div className="flex flex-wrap items-center gap-2">
      <Badge>{stateLabels[state.state][locale]}</Badge>
      {state.role && <Badge variant="outline">{roleLabels[state.role][locale]}</Badge>}
      <Badge variant="secondary">pre-dev</Badge>
    </div>
    <p className="text-sm">{nextStepLabels[state.nextStep][locale]}</p>
    {state.expiresAt && state.state === "invited" && <p className="text-xs text-muted-foreground">
      {locale === "de" ? "Einladung gültig bis" : "Invitation valid until"}: {new Date(state.expiresAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}
    </p>}
  </div>;
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
  const [totpSecret, setTotpSecret] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollError, setEnrollError] = useState(false);
  const [otp, setOtp] = useState<{ code: string } | null>(null);
  const [otpError, setOtpError] = useState(false);

  async function load() {
    setError(null);
    try {
      setView(await api<OrisoProvisioningView>(`/accounts/${encodeURIComponent(account.email)}/oriso-provisioning`));
    } catch {
      setError(locale === "de" ? "Status konnte nicht geladen werden." : "Could not load the provisioning status.");
    }
  }

  function changeOpen(value: boolean) {
    setOpen(value);
    setError(null);
    setTotpSecret("");
    setEnrollError(false);
    setOtp(null);
    setOtpError(false);
    if (value) {
      setView(null);
      void load();
    }
  }

  async function requestOtp(accountId: string) {
    setOtpError(false);
    try {
      const value = await api<OtpResponse>(
        `/accounts/${encodeURIComponent(account.email)}/otp?accountId=${encodeURIComponent(accountId)}`
      );
      setOtp({ code: value.code });
    } catch {
      setOtpError(true);
    }
  }

  async function enrollAndGenerate() {
    const linked = view?.linked;
    if (!linked) return;
    setEnrollBusy(true);
    setEnrollError(false);
    try {
      await api(`/accounts/${encodeURIComponent(account.email)}/totp`, {
        method: "POST",
        body: JSON.stringify({ accountId: linked.id, totpSecret })
      });
      setTotpSecret("");
      const updated = { ...linked, hasTotp: true };
      setView((current) => current ? { ...current, linked: updated } : current);
      onProvisioned(account.email, updated);
      await requestOtp(linked.id);
    } catch {
      setEnrollError(true);
    } finally {
      setEnrollBusy(false);
    }
  }

  async function provision(selectedRole: OrisoProvisioningRole) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<OrisoProvisioningResult>(
        `/accounts/${encodeURIComponent(account.email)}/oriso-provisioning`,
        { method: "POST", body: JSON.stringify({ environment: "pre-dev", role: selectedRole }) }
      );
      setView((current) => current ? { ...current, state: result.state, linked: result.linked } : current);
      onProvisioned(account.email, result.linked);
    } catch {
      setError(locale === "de"
        ? "Konto konnte nicht vollständig angelegt oder geprüft werden. Details stehen im Server-Log; Zugangsdaten erscheinen dort nicht."
        : "Could not fully provision or verify the account. Details are in the server log; credentials never appear there.");
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
        <DialogTitle>{locale === "de" ? "ORISO PreDev Konto" : "ORISO PreDev account"}</DialogTitle>
        <DialogDescription>
          {locale === "de"
            ? "Legt über den verwalteten Plattform-Admin ein wiederverwendbares ORISO-Konto für dieses Springfield-Postfach an, aktiviert 2FA und prüft den Login. Zugangsdaten bleiben im Test-Access-Record."
            : "Creates a reusable ORISO account for this Springfield mailbox through the managed platform admin, activates 2FA, and verifies login. Credentials stay inside the Test Access record."}
        </DialogDescription>
      </DialogHeader>
      {!view && !error && <p className="text-sm text-muted-foreground">{locale === "de" ? "Status wird geladen…" : "Loading status…"}</p>}
      {view && !view.configured && <p className="text-sm text-muted-foreground">
        {locale === "de"
          ? "ORISO-Provisioning ist auf diesem Server nicht konfiguriert (ORISO_PREDEV_ADMIN_RECORD_ID fehlt)."
          : "ORISO provisioning is not configured on this server (ORISO_PREDEV_ADMIN_RECORD_ID missing)."}
      </p>}
      {view?.configured && view.state && <StateSummary state={view.state} locale={locale} />}
      {view?.configured && view.state && !view.linked && view.state.role && <p className="text-sm text-muted-foreground">
        {locale === "de"
          ? "Für dieses ORISO-Konto existiert noch kein Test-Access-Record. Erst nach dem Verknüpfen erscheinen „App-Passwort abrufen“ und „2FA hinterlegen“ in der Zeile."
          : "This ORISO account has no Test Access record yet. “Get app password” and “Set up 2FA” appear in the row only after linking."}
      </p>}
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
          <Button type="button" size="sm" onClick={enrollAndGenerate} disabled={enrollBusy || !totpSecret.trim()}>
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
        {view?.configured && view.state && !view.linked && view.state.role && <Button type="button" onClick={() => provision(view.state!.role!)} disabled={busy}>
          <CircleCheckIcon data-icon="inline-start" />
          {busy
            ? (locale === "de" ? "Wird verknüpft…" : "Linking…")
            : (locale === "de" ? "Test-Access-Record verknüpfen" : "Link Test Access record")}
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
