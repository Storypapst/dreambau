import { useEffect, useState, type FormEvent } from "react";
import { KeyRoundIcon, LanguagesIcon, LockKeyholeIcon } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t, type Locale } from "@/i18n";
import { rememberLoginEmail, rememberedLoginEmail } from "@/login-hint";
import { authenticateWithPasskey } from "@/passkey-client";

export function LoginForm({ locale, onLocaleChange, onAuthenticated }: { locale: Locale; onLocaleChange: (locale: Locale) => void; onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(rememberedLoginEmail);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [bootstrapEnabled, setBootstrapEnabled] = useState<boolean | "error" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ enabled: boolean }>("/auth/bootstrap-status").then((value) => setBootstrapEnabled(value.enabled)).catch(() => setBootstrapEnabled("error")); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) }); onAuthenticated(); }
    catch (reason) { setError(reason instanceof Error && reason.message === "rate_limited" ? (locale === "de" ? "Zu viele Versuche. Bitte später erneut probieren." : "Too many attempts. Please try again later.") : reason instanceof Error && reason.message === "bootstrap_disabled" ? (locale === "de" ? "Der Passwort-Bootstrap ist bereits dauerhaft deaktiviert." : "Password bootstrap is already permanently disabled.") : (locale === "de" ? "Das Passwort ist nicht korrekt." : "The password is incorrect.")); }
    finally { setBusy(false); }
  }
  async function passkeyLogin() {
    setBusy(true); setError("");
    try { await authenticateWithPasskey(email); rememberLoginEmail(email); onAuthenticated(); }
    catch (reason) { setError(reason instanceof Error && reason.message === "passkey_not_registered"
      ? (locale === "de" ? "Für dieses Konto ist noch kein Passkey registriert. Bitte den Enrollment-Code unten verwenden und danach den Passkey einrichten." : "No passkey is registered for this account yet. Use the enrollment code below, then set up the passkey.")
      : (locale === "de" ? "Passkey-Anmeldung fehlgeschlagen." : "Passkey sign-in failed.")); }
    finally { setBusy(false); }
  }
  async function recoveryLogin() {
    setBusy(true); setError("");
    try { await api("/auth/recovery", { method: "POST", body: JSON.stringify({ email, code: recoveryCode }) }); onAuthenticated(); }
    catch { setError(locale === "de" ? "Recovery-Code ungültig oder bereits verwendet." : "Recovery code is invalid or already used."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><LockKeyholeIcon /></div>
        <div className="flex items-center justify-between gap-3"><CardTitle>{locale === "de" ? "Testkonten öffnen" : "Open test accounts"}</CardTitle><Button type="button" variant="outline" size="sm" onClick={() => onLocaleChange(locale === "de" ? "en" : "de")} aria-label={t(locale, "page.language")}><LanguagesIcon />{locale === "de" ? "EN" : "DE"}</Button></div>
        <CardDescription>{locale === "de" ? "Geschütztes Verzeichnis für Simpsons-Testidentitäten." : "Protected directory for Simpsons test identities."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            {error && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Anmeldung fehlgeschlagen" : "Sign-in failed"}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {bootstrapEnabled === null && <div className="text-center text-sm text-muted-foreground">{locale === "de" ? "Zugangsmodus wird geprüft …" : "Checking access mode …"}</div>}
            {bootstrapEnabled === "error" && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Zugangsstatus konnte nicht geladen werden" : "Access status could not be loaded"}</AlertTitle><AlertDescription>{locale === "de" ? "Bitte lade die Seite erneut." : "Please reload the page."}</AlertDescription></Alert>}
            {bootstrapEnabled === false && <><Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="email">E-Mail</FieldLabel>
              <Input id="email" type="email" autoComplete="username webauthn" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Button type="button" onClick={passkeyLogin} disabled={busy || !email}><KeyRoundIcon />{locale === "de" ? "Mit Passkey anmelden" : "Sign in with passkey"}</Button>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="recovery-code">{locale === "de" ? "Enrollment-/Recovery-Code" : "Enrollment/recovery code"}</FieldLabel>
              <Input id="recovery-code" type="password" autoComplete="one-time-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} />
            </Field>
            <Button type="button" variant="outline" onClick={recoveryLogin} disabled={busy || !email || !recoveryCode}>{locale === "de" ? "Enrollment-/Recovery-Code verwenden" : "Use enrollment/recovery code"}</Button></>}
            {bootstrapEnabled === true && <><div className="text-center"><div className="font-medium">{locale === "de" ? "Ersteinrichtung auf diesem System" : "First-time setup on this system"}</div><div className="mt-1 text-xs text-muted-foreground">{locale === "de" ? "Lege jetzt den ersten Passkey für den geschützten Zugang an." : "Create the first passkey for protected access now."}</div></div>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="password">{locale === "de" ? "Gemeinsames Passwort" : "Shared password"}</FieldLabel>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} required />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? (locale === "de" ? "Wird geprüft …" : "Checking …") : (locale === "de" ? "Ersteinrichtung starten" : "Start first-time setup")}</Button></>}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </main>;
}
