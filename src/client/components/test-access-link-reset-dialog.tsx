import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { AccountMetadata, LinkedTestAccount } from "@/types";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type OnTestAccessLinkReset = (linked: LinkedTestAccount, metadata: AccountMetadata) => void;

export function TestAccessLinkResetDialog({ linked, locale, onReset }: {
  linked: LinkedTestAccount; locale: Locale; onReset: OnTestAccessLinkReset;
}) {
  const de = locale === "de";
  const title = de ? "Testmails-Verknüpfung entfernen" : "Remove Testmails link";
  const label = `${title} (${linked.environment})`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const { metadata } = await api<{ metadata: AccountMetadata }>(
        `/accounts/${encodeURIComponent(linked.email)}/test-access-link/${linked.environment}`, {
          method: "DELETE",
          body: JSON.stringify({ accountId: linked.id, revision: linked.linkRevision })
        }
      );
      setOpen(false);
      onReset(linked, metadata);
      toast.success(de ? "Testmails-Verknüpfung entfernt." : "Testmails link removed.");
    } catch (failure) {
      const stale = failure instanceof Error && failure.message === "cleanup_preview_stale";
      setError(stale
        ? (de ? "Die Verknüpfung hat sich geändert oder ist in Benutzung. Lade die Kontenliste neu." : "The link has changed or is in use. Reload the account list.")
        : (de ? "Die Verknüpfung konnte nicht entfernt werden." : "Could not remove the link."));
    } finally {
      setBusy(false);
    }
  }

  return <AlertDialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    setError("");
  }}>
    <AlertDialogTrigger asChild>
      <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label}>
        <Trash2Icon />
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>
          {de
            ? `Die ORISO-${linked.environment}-Anmeldedaten für ${linked.username} werden aus dieser Testmails-Ansicht entfernt. Das ORISO-Konto, das Postfach und die Mails bleiben erhalten.`
            : `This removes the ORISO ${linked.environment} login for ${linked.username} from this Testmails view. The ORISO account, mailbox, and messages are kept.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{de ? "Abbrechen" : "Cancel"}</AlertDialogCancel>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>
          {de ? "Verknüpfung entfernen" : "Remove link"}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
