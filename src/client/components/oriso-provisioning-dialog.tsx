import { useState } from "react";
import { CircleCheckIcon, MailPlusIcon, RefreshCwIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type {
  AccountView,
  LinkedTestAccount,
  OrisoOnboardingState,
  OrisoProvisioningResult,
  OrisoProvisioningRole,
  OrisoProvisioningStateView,
  OrisoProvisioningView
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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
    de: "TOTP-Schlüssel aus dem ORISO-Onboarding über „2FA hinterlegen“ im verknüpften Record speichern.",
    en: "Store the TOTP key from ORISO onboarding via “Set up 2FA” in the linked record."
  },
  none: {
    de: "Konto ist bereit. OTP über „OTP abrufen“ verfügbar.",
    en: "Account is ready. OTP available via “Get OTP”."
  }
};

const roleLabels: Record<OrisoProvisioningRole, { de: string; en: string }> = {
  "tenant-admin": { de: "Träger-Admin", en: "Tenant admin" },
  "agency-admin": { de: "Agentur-Admin", en: "Agency admin" },
  counsellor: { de: "Berater:in", en: "Counsellor" }
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
    if (value) {
      setView(null);
      void load();
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
        ? "Einladung konnte nicht angelegt werden. Details stehen im Server-Log; Zugangsdaten erscheinen dort nicht."
        : "Could not create the invitation. Details are in the server log; credentials never appear there.");
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
            ? "Legt über den verwalteten Platform-Admin eine echte ORISO-Einladung für dieses Springfield-Postfach an. Zugangsdaten bleiben im Test-Access-Record."
            : "Creates a real ORISO invitation for this Springfield mailbox through the managed platform admin. Credentials stay inside the Test Access record."}
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
          ? "Für diese Einladung existiert noch kein Test-Access-Record. Erst nach dem Verknüpfen erscheinen „App-Passwort abrufen“ und „2FA hinterlegen“ in der Zeile."
          : "This invitation has no Test Access record yet. “Get app password” and “Set up 2FA” appear in the row only after linking."}
      </p>}
      {view?.configured && !view.state && <div className="flex flex-col gap-3">
        <p className="text-sm">{locale === "de" ? "Keine aktive Einladung. Rolle wählen und Einladung senden:" : "No active invitation. Choose a role and send the invitation:"}</p>
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
            : (locale === "de" ? "Einladung senden" : "Send invitation")}
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
