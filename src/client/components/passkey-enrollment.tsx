import { useState } from "react";
import { KeyRoundIcon, ShieldCheckIcon } from "lucide-react";
import { registerBootstrapPasskey } from "@/passkey-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/i18n";

export function PasskeyEnrollment({ locale, onComplete }: { locale: Locale; onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function register() {
    setBusy(true); setError(false);
    try { await registerBootstrapPasskey(); onComplete(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheckIcon /></div>
        <CardTitle>{locale === "de" ? "Passkey einrichten" : "Set up a passkey"}</CardTitle>
        <CardDescription>{locale === "de" ? "Das gemeinsame Passwort ist nur der einmalige Bootstrap. Richte jetzt Touch ID, Face ID oder einen Sicherheitsschlüssel ein." : "The shared password is bootstrap-only. Set up Touch ID, Face ID, or a security key now."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Registrierung fehlgeschlagen" : "Registration failed"}</AlertTitle><AlertDescription>{locale === "de" ? "Der Passkey wurde nicht gespeichert. Bitte erneut versuchen." : "The passkey was not saved. Please try again."}</AlertDescription></Alert>}
        <Button onClick={register} disabled={busy}><KeyRoundIcon />{busy ? (locale === "de" ? "Passkey wird eingerichtet …" : "Setting up passkey …") : (locale === "de" ? "Passkey jetzt einrichten" : "Set up passkey now")}</Button>
      </CardContent>
    </Card>
  </main>;
}
