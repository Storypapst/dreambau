import { useState, type FormEvent } from "react";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { api } from "@/api";
import type { Locale } from "@/i18n";
import type { AccountMetadata, AccountView, TeamProject } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveMetadataPatch } from "./inline-metadata-controls";

export interface LoginTarget { label: string; url: string }
export type ProjectLoginTargets = Partial<Record<TeamProject, LoginTarget[]>>;

export function loginTargetsEndpoint(project: TeamProject) {
  return `/taxonomies/loginTargets/${project}`;
}

export function AccountLoginTarget({ account, locale, project, options, onSaved, onOptionsChanged }: {
  account: AccountView;
  locale: Locale;
  project: TeamProject;
  options: LoginTarget[];
  onSaved: (metadata: AccountMetadata) => void;
  onOptionsChanged?: (project: TeamProject, options: LoginTarget[]) => void;
}) {
  const de = locale === "de";
  const current = options.find((option) => option.url === account.metadata.loginTargetUrl);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function selectTarget(loginTargetUrl: string) {
    setBusy(true);
    setError("");
    try {
      onSaved(await saveMetadataPatch(account.email, { loginTargetUrl }));
    } catch {
      setError(de ? "Login-Ziel konnte nicht gespeichert werden." : "Could not save the sign-in target.");
    } finally {
      setBusy(false);
    }
  }

  async function addTarget(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ values: LoginTarget[] }>(loginTargetsEndpoint(project), {
        method: "POST",
        body: JSON.stringify({ label: label.trim(), url: url.trim() })
      });
      onOptionsChanged?.(project, result.values);
      setOpen(false);
    } catch {
      setError(de ? "Adresse konnte nicht hinzugefügt werden. Prüfe die HTTPS-Adresse und mögliche Duplikate." : "Could not add this target. Check the HTTPS address and any duplicates.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{de ? "Login-Ziel" : "Sign-in target"}</p>
      <div className="flex min-w-0 items-center gap-1">
        <select
          className="h-8 min-w-0 flex-1 truncate rounded-md border bg-background px-2 text-sm"
          aria-label={de ? "Login-Ziel auswählen" : "Choose sign-in target"}
          value={current?.url ?? ""}
          onChange={(event) => void selectTarget(event.target.value)}
          disabled={busy}
        >
          <option value="">{de ? "Login-Ziel wählen" : "Choose a target"}</option>
          {options.map(({ label, url }) => <option key={url} value={url}>{label}</option>)}
        </select>
        {onOptionsChanged && (
          <Dialog open={open} onOpenChange={(next) => {
            if (busy) return;
            setOpen(next);
            setError("");
            if (next) { setLabel(""); setUrl(""); }
          }}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label={de ? "Login-Ziel hinzufügen" : "Add sign-in target"}><PlusIcon /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{de ? "Login-Ziel hinzufügen" : "Add a sign-in target"}</DialogTitle>
                <DialogDescription>{de ? "Der Eintrag steht anschließend für dieses Projekt zur Auswahl." : "The target will be available to select for this project."}</DialogDescription>
              </DialogHeader>
              <form className="grid gap-3" onSubmit={addTarget}>
                <Field><FieldLabel className="flex-col items-stretch">{de ? "Anzeigename" : "Display name"}<Input value={label} maxLength={80} required onChange={(event) => setLabel(event.target.value)} /></FieldLabel></Field>
                <Field><FieldLabel className="flex-col items-stretch">{de ? "Link" : "URL"}<Input type="url" value={url} maxLength={2048} placeholder="https://" required onChange={(event) => setUrl(event.target.value)} /></FieldLabel></Field>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter><Button type="submit" disabled={busy || !label.trim() || !url.trim()}>{de ? "Hinzufügen" : "Add target"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {current && (
        <a className="inline-flex max-w-full items-center gap-1 break-all text-xs font-medium underline" href={current.url} target="_blank" rel="noreferrer">
          <ExternalLinkIcon className="size-3 shrink-0" />{current.label}
        </a>
      )}
      {error && !open && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
