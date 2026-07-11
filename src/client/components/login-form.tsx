import { useState, type FormEvent } from "react";
import { LockKeyholeIcon } from "lucide-react";
import { api } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ password }) }); onAuthenticated(); }
    catch (reason) { setError(reason instanceof Error && reason.message === "rate_limited" ? "Zu viele Versuche. Bitte später erneut probieren." : "Das Passwort ist nicht korrekt."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center p-6">
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground"><LockKeyholeIcon /></div>
        <CardTitle>Testkonten öffnen</CardTitle>
        <CardDescription>Geschütztes Verzeichnis für Simpsons-Testidentitäten.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            {error && <Alert variant="destructive"><AlertTitle>Anmeldung fehlgeschlagen</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="password">Gemeinsames Passwort</FieldLabel>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} required autoFocus />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? "Wird geprüft …" : "Anmelden"}</Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  </main>;
}
