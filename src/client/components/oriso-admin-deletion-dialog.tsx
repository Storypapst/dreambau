import { useEffect, useId, useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { AccountView, LinkedTestAccount } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { OrisoAdminDeletionPreview } from "@/types";

const messages: Record<string, { de: string; en: string }> = {
  admin_deletion_outcome_unknown: { de: "Das Ergebnis der Löschung ist noch unklar. Das Konto ist bis zur erneuten Prüfung nicht als bereit markiert.", en: "The deletion outcome is uncertain. The account is not marked ready until it is checked again." },
  managed_admin_protected: { de: "Das verwaltete Service-Admin-Konto ist geschützt.", en: "The managed service administrator is protected." },
  shared_admin_identity_protected: { de: "Dieses Konto besitzt auch eine Berater-Identität. Bitte den ORISO-Admin verwenden.", en: "This account also has a counsellor identity. Please use ORISO Admin." },
  admin_record_not_supported: { de: "Diese Rollen können hier nicht eindeutig gelöscht werden. Bitte den ORISO-Admin verwenden.", en: "These roles cannot be deleted unambiguously here. Please use ORISO Admin." },
  admin_identity_changed: { de: "Das Konto hat sich geändert. Bitte erneut prüfen.", en: "The account has changed. Please check again." },
  admin_role_changed: { de: "Die live gemessene Rolle stimmt nicht mit der Verknüpfung überein.", en: "The live role does not match the linked record." },
  admin_identity_ambiguous: { de: "Mehrere Konten passen zu dieser Mailadresse. Es wurde nichts gelöscht.", en: "Several accounts match this email address. Nothing was deleted." },
  admin_deleted_registry_update_failed: { de: "Das ORISO-Konto wurde entfernt, aber der Testmails-Status konnte nicht gespeichert werden. Erneut prüfen und den Status abgleichen.", en: "The ORISO account was removed, but the Testmails status could not be saved. Check again and reconcile the status." },
  admin_delete_not_verified: { de: "Die Löschung konnte noch nicht bestätigt werden. Bitte erneut prüfen.", en: "Deletion could not yet be verified. Please check again." }
};

export function OrisoAdminDeletionDialog({ account, linked, locale, onDeleted }: {
  account: AccountView; linked: LinkedTestAccount; locale: Locale;
  onDeleted(email: string, linked: LinkedTestAccount): void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<OrisoAdminDeletionPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const generation = useRef(0);
  useEffect(() => {
    setOpen(false); setBusy(false); setPreview(null); setConfirmation(""); setError(null);
    return () => { generation.current++; };
  }, [account.email, linked.id, linked.environment]);
  const endpoint = `/accounts/${encodeURIComponent(account.email)}/oriso-admin-deletion`;
  const selection = { accountId: linked.id, environment: linked.environment };
  async function check() {
    const attempt = ++generation.current;
    setBusy(true); setError(null); setPreview(null); setConfirmation("");
    try {
      const next = await api<OrisoAdminDeletionPreview>(`${endpoint}?${new URLSearchParams(selection)}`);
      if (next.accountId !== linked.id || next.environment !== linked.environment || next.email.toLowerCase() !== account.email.toLowerCase()) throw new Error("admin_identity_changed");
      if (attempt === generation.current) setPreview(next);
    } catch (failure) {
      if (attempt === generation.current) setError(failure instanceof Error ? failure.message : "unknown");
    } finally { if (attempt === generation.current) setBusy(false); }
  }
  async function remove() {
    if (!preview || busy || confirmation.trim().toLowerCase() !== preview.email.toLowerCase()) return;
    const attempt = ++generation.current;
    setBusy(true); setError(null);
    try {
      const result = await api<{ deleted: boolean; mailboxPreserved: boolean; linked: LinkedTestAccount }>(endpoint, {
        method: "POST", body: JSON.stringify({ ...selection, productId: preview.productId, confirmEmail: confirmation.trim(), confirmed: true })
      });
      if (!result.deleted || !result.mailboxPreserved || result.linked.id !== linked.id || result.linked.environment !== linked.environment
        || result.linked.email.toLowerCase() !== account.email.toLowerCase() || !result.linked.deleted) throw new Error("unknown");
      if (attempt === generation.current) { onDeleted(account.email, result.linked); setOpen(false); }
    } catch (failure) {
      if (attempt === generation.current) { setError(failure instanceof Error ? failure.message : "unknown"); setPreview(null); }
    } finally { if (attempt === generation.current) setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    if (next) void check(); else { generation.current++; setPreview(null); setConfirmation(""); setError(null); }
  }}>
    <DialogTrigger asChild><Button className="min-h-11" type="button" variant="outline" size="sm"><Trash2Icon data-icon="inline-start" />{locale === "de" ? "ORISO-Admin löschen" : "Delete ORISO admin"} ({linked.environment})</Button></DialogTrigger>
    <DialogContent className="[&>button]:min-h-11 [&>button]:min-w-11">
      <DialogHeader><DialogTitle>{locale === "de" ? "ORISO-Admin-Konto löschen" : "Delete ORISO admin account"}</DialogTitle>
        <DialogDescription>{locale === "de" ? "Nur das gewählte ORISO-Admin-Konto wird entfernt. Das Mailpostfach und die gespeicherte Verknüpfung bleiben erhalten." : "Only the selected ORISO admin account is removed. The mailbox and stored linked record are retained."}</DialogDescription>
      </DialogHeader>
      <dl className="grid min-w-0 gap-2"><dt>{locale === "de" ? "Umgebung" : "Environment"}</dt><dd>{linked.environment}</dd><dt>{locale === "de" ? "Konto" : "Account"}</dt><dd className="break-all">{account.email}</dd>{preview && <><dt>{locale === "de" ? "Rolle" : "Role"}</dt><dd>{preview.role}</dd><dt>{locale === "de" ? "Benutzername" : "Username"}</dt><dd className="break-all">{preview.username}</dd></>}</dl>
      {busy && <p role="status">{locale === "de" ? "Konto wird geprüft…" : "Checking account…"}</p>}
      {error && <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Aktion nicht abgeschlossen" : "Action not completed"}</AlertTitle><AlertDescription>{messages[error]?.[locale] ?? (locale === "de" ? "Die Aktion ist nicht verfügbar oder fehlgeschlagen. Bitte erneut prüfen oder den ORISO-Admin verwenden." : "The action is unavailable or failed. Check again or use ORISO Admin.")}</AlertDescription></Alert>}
      {preview?.state === "absent" && <p>{locale === "de" ? "Das ORISO-Admin-Konto ist bereits nicht mehr vorhanden. Du kannst den gespeicherten Status abgleichen." : "The ORISO admin account is already absent. You can reconcile its stored status."}</p>}
      {preview && <FieldGroup><Field><FieldLabel htmlFor={inputId}>{locale === "de" ? "Zur Bestätigung die Mailadresse eingeben" : "Enter the email address to confirm"}</FieldLabel><Input className="min-h-11" id={inputId} autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></Field></FieldGroup>}
      <DialogFooter><Button className="min-h-11" type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{locale === "de" ? "Abbrechen" : "Cancel"}</Button>
        {!preview && <Button className="min-h-11" type="button" disabled={busy} onClick={() => void check()}>{locale === "de" ? "Erneut prüfen" : "Check again"}</Button>}
        {preview && <Button className="min-h-11" type="button" variant="destructive" disabled={busy || confirmation.trim().toLowerCase() !== preview.email.toLowerCase()} onClick={() => void remove()}>{preview.state === "absent" ? (locale === "de" ? "Status abgleichen" : "Reconcile status") : (locale === "de" ? "Admin-Konto endgültig löschen" : "Permanently delete admin account")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
