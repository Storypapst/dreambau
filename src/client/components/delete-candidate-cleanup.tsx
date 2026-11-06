import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Locale } from "@/i18n";

interface CleanupPreview {
  revision: string;
  skipped: number;
  links: { id: string; email: string; environment: "dev" | "pre-dev" }[];
}

const endpoint = "/accounts/delete-candidate-cleanup";

export function DeleteCandidateCleanup({ locale, onCleaned }: { locale: Locale; onCleaned: () => Promise<void> }) {
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadPreview() {
    setPreview(undefined);
    setError("");
    setBusy(true);
    try {
      setPreview(await api<CleanupPreview>(endpoint));
    } catch {
      setError(de ? "Die Vorschau konnte nicht geladen werden." : "Could not load the preview.");
    } finally {
      setBusy(false);
    }
  }

  async function cleanUp() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const { count } = await api<{ count: number }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ revision: preview.revision })
      });
      setPreview(undefined);
      setOpen(false);
      toast.success(de ? `${count} Verknüpfungen entfernt.` : `${count} links removed.`);
      await onCleaned().catch(() => {
        toast.error(de
          ? "Die Kontenliste konnte nicht aktualisiert werden. Bitte lade die Seite neu."
          : "Could not refresh the account list. Reload the page.");
      });
    } catch (failure) {
      if (failure instanceof Error && failure.message === "cleanup_preview_stale") {
        await loadPreview();
        setError(de ? "Die Liste hat sich geändert. Bitte prüfe die neue Vorschau." : "The list changed. Review the new preview.");
      } else {
        setPreview(undefined);
        setError(de ? "Der aktuelle Stand konnte nicht bestätigt werden. Lade die Vorschau erneut." : "Could not confirm the current state. Reload the preview.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => {
      if (busy) return;
      setOpen(next);
      if (next) void loadPreview();
    }}>
      <SheetTrigger asChild>
        <Button variant="outline"><SettingsIcon data-icon="inline-start" />{de ? "Löschkandidaten" : "Delete candidates"}</Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-hidden">
        <SheetHeader>
          <SheetTitle>{de ? "Löschkandidaten bereinigen" : "Clean up delete candidates"}</SheetTitle>
          <SheetDescription>
            {de
              ? "Entfernt Testmails-Verknüpfungen für markierte ORISO-Dev- und Pre-Dev-Konten. ORISO-Konten, Postfächer und Mails bleiben erhalten."
              : "Removes Testmails links for marked ORISO Dev and Pre-Dev accounts. ORISO accounts, mailboxes and messages are kept."}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
          {busy && !preview && <p role="status">{de ? "Vorschau wird geladen…" : "Loading preview…"}</p>}
          {preview && (
            <>
              {preview.skipped > 0 && <p className="mb-2 text-sm text-muted-foreground">
                {de ? `${preview.skipped} geschützte oder belegte Verknüpfungen werden übersprungen.` : `${preview.skipped} protected or in-use links will be skipped.`}
              </p>}
              {preview.links.length > 0 ? (
                <ul className="divide-y">
                  {preview.links.map(({ id, email, environment }) => (
                    <li key={id} className="flex justify-between gap-2 py-2 text-sm">
                      <span className="break-all">{email}</span>
                      <span className="shrink-0 text-muted-foreground">{environment === "dev" ? "Dev" : "Pre-Dev"}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>{de ? "Keine bereinigbaren Verknüpfungen." : "No links to clean up."}</p>}
            </>
          )}
        </div>
        <SheetFooter>
          {!preview && !busy && <Button variant="outline" onClick={() => void loadPreview()}>{de ? "Vorschau laden" : "Load preview"}</Button>}
          {preview && preview.links.length > 0 && (
            <Button variant="destructive" disabled={busy} onClick={() => void cleanUp()}>
              {de ? `${preview.links.length} Verknüpfungen entfernen` : `Remove ${preview.links.length} links`}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
