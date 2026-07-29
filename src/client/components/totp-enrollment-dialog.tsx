import { useState, type FormEvent } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { LinkedTestAccount } from "@/types";
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface EnrollmentResponse {
  accountId: string;
  enrolled: true;
  updatedAt: string;
}

export function TotpEnrollmentDialog({
  email,
  linked,
  locale,
  onEnrolled
}: {
  email: string;
  linked: LinkedTestAccount;
  locale: Locale;
  onEnrolled: (accountId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [totpSecret, setTotpSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) {
      setTotpSecret("");
      setError(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const response = await api<EnrollmentResponse>(
        `/accounts/${encodeURIComponent(email)}/totp`,
        {
          method: "POST",
          body: JSON.stringify({ accountId: linked.id, totpSecret })
        }
      );
      if (!response.enrolled || response.accountId !== linked.id) throw new Error("Unexpected enrollment response");
      onEnrolled(linked.id);
      changeOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm">
        <ShieldCheckIcon data-icon="inline-start" />
        {locale === "de" ? "2FA hinterlegen" : "Set up 2FA"}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <form className="flex flex-col gap-6" onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>{locale === "de" ? "2FA hinterlegen" : "Set up 2FA"}</DialogTitle>
          <DialogDescription>
            {locale === "de"
              ? "Der TOTP-Schlüssel wird einmalig an Testmails gesendet und ausschließlich im zugeordneten Infisical-Record gespeichert."
              : "The TOTP key is sent to Testmails once and stored only in the linked Infisical record."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={error}>
            <FieldLabel htmlFor={`totp-secret-${linked.id}`}>{locale === "de" ? "TOTP-Schlüssel" : "TOTP key"}</FieldLabel>
            <Input
              id={`totp-secret-${linked.id}`}
              name="totpSecret"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={totpSecret}
              onChange={(event) => setTotpSecret(event.target.value)}
              aria-invalid={error}
              disabled={busy}
              required
            />
            <FieldDescription>
              {locale === "de"
                ? "Base32-Schlüssel aus dem ORISO-2FA-Dialog. Er wird nicht im Browser gespeichert."
                : "Base32 key from the ORISO 2FA dialog. It is not stored in the browser."}
            </FieldDescription>
            {error && <FieldError>{locale === "de" ? "Der TOTP-Schlüssel wurde nicht gespeichert." : "The TOTP key was not stored."}</FieldError>}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={busy}>
            {locale === "de" ? "Abbrechen" : "Cancel"}
          </Button>
          <Button type="submit" disabled={busy || !totpSecret.trim()}>
            <ShieldCheckIcon data-icon="inline-start" />
            {busy
              ? (locale === "de" ? "Wird gespeichert…" : "Saving…")
              : (locale === "de" ? "Sicher hinterlegen" : "Store securely")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
