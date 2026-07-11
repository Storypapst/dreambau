import { useState, type FormEvent } from "react";
import { LanguagesIcon, LockKeyholeIcon } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t, type Locale } from "@/i18n";

export function LoginForm({ locale, onLocaleChange, onAuthenticated }: { locale: Locale; onLocaleChange: (locale: Locale) => void; onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) }); onAuthenticated(); }
    catch (reason) { setError(reason instanceof Error && reason.message === "rate_limited" ? (locale === "de" ? "Zu viele Versuche. Bitte später erneut probieren." : "Too many attempts. Please try again later.") : (locale === "de" ? "Das Passwort ist nicht korrekt." : "The password is incorrect.")); }
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
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="password">{locale === "de" ? "Gemeinsames Passwort" : "Shared password"}</FieldLabel>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} required autoFocus />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? (locale === "de" ? "Wird geprüft …" : "Checking …") : (locale === "de" ? "Anmelden" : "Sign in")}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </main>;
}
