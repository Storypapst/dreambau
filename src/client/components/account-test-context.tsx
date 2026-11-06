import { useState, type FormEvent } from "react";
import { PencilIcon, PlusIcon, WandSparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { testFixtureDateSuffix } from "@/test-fixture-names";
import { labelConversation, type Locale } from "@/i18n";
import type { AccountMetadata, AccountView, TeamProject } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cancelPendingAccountCopy } from "./account-quick-copy";
import { AccountLoginTarget, type LoginTarget, type ProjectLoginTargets } from "./account-login-target";
import { MultiSelect } from "./multi-select";
import { saveMetadataPatch } from "./inline-metadata-controls";

export type ProjectConversationTypes = Partial<Record<TeamProject, string[]>>;

export function accountTestProject(account: AccountView): TeamProject {
  const project = account.metadata.project;
  if (project === "ORISO" || project === "ORIMO" || project === "DREAMBAU") {
    return project.toLowerCase() as TeamProject;
  }
  if (project === "TRAIL.IST" || account.domain === "trail.ist") return "orimo";
  if (account.domain === "oriso.org" || account.domain === "openresilience.cc") return "oriso";
  return "dreambau";
}

export function accountPasswordDate(account: AccountView, locale: Locale) {
  if (account.metadata.shippedVersion) return undefined;
  const timestamp = account.linkedAccess?.find((access) => !access.deleted && !access.deletionPending)?.applicationPasswordSetAt;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return undefined;
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "medium" }).format(new Date(timestamp));
}

export function conversationTypesEndpoint(project: TeamProject) {
  return `/taxonomies/conversationTypes/${project}`;
}

const projectLabels = { oriso: "ORISO", orimo: "ORIMO", dreambau: "Dreambau" };
const contextNameLimit = 255;
const agencyDraftLimit = 1000;
const emptyDraft = { documentedUsername: "", carrier: "", agencies: "", postalCode: "", supervisor: "" };

export interface AccountTestContextOptions {
  projectConversationTypes?: ProjectConversationTypes;
  projectLoginTargets?: ProjectLoginTargets;
  onLoginTargetsChanged?: (project: TeamProject, values: LoginTarget[]) => void;
  onTypesChanged?: (project: TeamProject, values: string[], previous?: string, value?: string) => void;
}

type AccountTestContextProps = {
  account: AccountView;
  locale: Locale;
  onSaved: (metadata: AccountMetadata) => void;
};

export function AccountTestContext({ account, locale, onSaved }: AccountTestContextProps) {
  const de = locale === "de";
  const metadata = account.metadata;
  const passwordDate = accountPasswordDate(account, locale);
  const usernames = [...new Set((account.linkedAccess ?? []).filter((access) => !access.deleted).map((access) => access.username))];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = [
    { key: "carrier", label: de ? "Träger" : "Provider", value: metadata.carrier, max: contextNameLimit },
    { key: "agencies", label: de ? "Beratungsstellen" : "Counselling centres", value: metadata.agencies?.join(", "), max: agencyDraftLimit },
    { key: "postalCode", label: de ? "Postleitzahl" : "Postcode", value: metadata.postalCode, max: 16 },
    { key: "supervisor", label: "Supervisor", value: metadata.supervisor, max: 255 },
    { key: "documentedUsername", label: de ? "Dokumentierter Benutzername" : "Documented username", value: metadata.documentedUsername, max: 255 }
  ] as const;

  async function generateName(key: "carrier" | "agencies") {
    const prefix = "QA ";
    const ending = ` ${key === "carrier" ? "Träger" : "Beratung"}${testFixtureDateSuffix()}`;
    const displayName = account.displayName.slice(0, contextNameLimit - prefix.length - ending.length).trim();
    const name = `${prefix}${displayName}${ending}`;
    setError("");
    if (key === "carrier") {
      setDraft({ ...draft, carrier: name });
    } else {
      const names = draft.agencies.split("\n").map((value) => value.trim()).filter(Boolean);
      if (!names.includes(name)) {
        const agencies = [...names, name].join("\n");
        if (agencies.length > agencyDraftLimit) {
          setError(de ? "Bitte kürze die Liste der Beratungsstellen." : "Please shorten the list of counselling centres.");
          return;
        }
        setDraft({ ...draft, agencies });
      }
    }
    cancelPendingAccountCopy();
    try {
      await navigator.clipboard.writeText(name);
      toast.success(de ? "Name kopiert" : "Name copied");
    } catch {
      toast.error(de ? "Name erzeugt. Kopieren fehlgeschlagen." : "Name generated. Could not copy it.");
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await saveMetadataPatch(account.email, {
        documentedUsername: draft.documentedUsername,
        carrier: draft.carrier,
        agencies: [...new Set(draft.agencies.split("\n").map((name) => name.trim()).filter(Boolean))],
        postalCode: draft.postalCode,
        supervisor: draft.supervisor
      }));
      setDetailsOpen(false);
    } catch {
      setError(de ? "Testkontext konnte nicht gespeichert werden." : "Could not save test context.");
    } finally {
      setBusy(false);
    }
  }


  return (
    <section className="min-w-0 space-y-2 border-t pt-2" aria-label={de ? "Testkontext" : "Test context"}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">{de ? "Testkontext" : "Test context"}</h3>
        <Dialog open={detailsOpen} onOpenChange={(open) => {
          if (busy) return;
          setDetailsOpen(open);
          setError("");
          if (open) setDraft({
            documentedUsername: metadata.documentedUsername ?? "",
            carrier: metadata.carrier ?? "", agencies: metadata.agencies?.join("\n") ?? "",
            postalCode: metadata.postalCode ?? "", supervisor: metadata.supervisor ?? ""
          });
        }}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={de ? "Testkontext bearbeiten" : "Edit test context"}><PencilIcon /></Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{de ? "Testkontext bearbeiten" : "Edit test context"}</DialogTitle><DialogDescription>{account.email}</DialogDescription></DialogHeader>
            <form className="grid gap-3" onSubmit={saveDetails}>
              {fields.map(({ key, label, max }) => {
                const canGenerate = key === "carrier" || key === "agencies";
                const generateLabel = key === "carrier"
                  ? (de ? "Trägernamen generieren" : "Generate provider name")
                  : (de ? "Namen für Beratungsstelle generieren" : "Generate counselling centre name");
                return <Field key={key} className={canGenerate ? "grid grid-cols-[minmax(0,1fr)_auto] items-end" : undefined}>
                  <FieldLabel className="flex-col items-stretch">
                    {label}
                    {key === "agencies" ? (
                      <Textarea value={draft[key]} maxLength={max} rows={2}
                        onChange={(event) => setDraft({ ...draft, agencies: event.target.value })} />
                    ) : (
                      <Input value={draft[key]} maxLength={max}
                        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                    )}
                  </FieldLabel>
                  {canGenerate && <Button type="button" variant="outline" size="icon-sm"
                    aria-label={generateLabel} title={generateLabel} disabled={busy} onClick={() => void generateName(key)}>
                    <WandSparklesIcon />
                  </Button>}
                </Field>;
              })}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter><Button type="submit" disabled={busy}>{de ? "Speichern" : "Save"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <div className="col-span-2 min-w-0">
          <dt className="text-muted-foreground">{de ? "Verknüpfter Benutzername" : "Linked username"}</dt>
          <dd className="space-y-0.5 break-all font-mono font-medium">
            {usernames.length ? usernames.map((username) => <div key={username} data-testmails-search-text>{username}</div>) : "–"}
          </dd>
        </div>
        {fields.map(({ key, label, value: text }) => (
          <div key={key} className="min-w-0">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">
              {key === "agencies" && metadata.agencies?.length
                ? <ul className="space-y-0.5">{metadata.agencies.map((agency) => <li key={agency} data-testmails-search-text>{agency}</li>)}</ul>
                : text ? <span data-testmails-search-text>{text}</span> : "–"}
            </dd>
          </div>
        ))}
      </dl>
      {passwordDate && <p className="text-xs text-muted-foreground">
        {de ? "App-Passwort gesetzt am" : "App password set on"} <span data-testmails-search-text>{passwordDate}</span>
      </p>}
    </section>
  );
}

export function AccountTestSettings({ account, locale, projectConversationTypes, projectLoginTargets, onSaved, onTypesChanged, onLoginTargetsChanged }: AccountTestContextProps & AccountTestContextOptions) {
  const de = locale === "de";
  const project = accountTestProject(account);
  const selected = account.metadata.conversationTypes;
  const options = projectConversationTypes?.[project] ?? [];
  const [typesOpen, setTypesOpen] = useState(false);
  const [previous, setPrevious] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveTypes(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ values: string[] }>(conversationTypesEndpoint(project), {
        method: "PATCH",
        body: JSON.stringify({ value: value.trim(), ...(previous ? { previous } : {}) })
      });
      onTypesChanged?.(project, result.values, previous || undefined, value.trim());
      setTypesOpen(false);
    } catch {
      setError(de ? "Gesprächstyp konnte nicht gespeichert werden." : "Could not save conversation type.");
    } finally {
      setBusy(false);
    }
  }

  async function selectTypes(conversationTypes: string[]) {
    setBusy(true);
    setError("");
    try {
      onSaved(await saveMetadataPatch(account.email, { conversationTypes }));
    } catch {
      setError(de ? "Auswahl konnte nicht gespeichert werden." : "Could not save selection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2 border-t pt-2">
      <AccountLoginTarget account={account} locale={locale} project={project} options={projectLoginTargets?.[project] ?? []} onSaved={onSaved} onOptionsChanged={onLoginTargetsChanged} />
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">{de ? "Areas in Use · Gesprächstypen" : "Areas in use · conversation types"}</p>
        <div className="flex min-w-0 gap-1">
          <MultiSelect locale={locale} compact label={de ? "Gesprächstypen wählen" : "Select conversation types"} options={[...new Set([...options, ...selected])]} value={selected} onChange={(next) => void selectTypes(next)} disabled={busy} formatOption={(option) => labelConversation(locale, option)} />
          {onTypesChanged && <Dialog open={typesOpen} onOpenChange={(open) => {
            if (busy) return;
            setTypesOpen(open);
            setError("");
            if (open) { setPrevious(""); setValue(""); }
          }}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="icon-sm" aria-label={de ? "Projektliste bearbeiten" : "Edit project list"}><PlusIcon /></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{projectLabels[project]} · {de ? "Gesprächstypen" : "Conversation types"}</DialogTitle>
                <DialogDescription>{de ? "Füge einen Eintrag hinzu oder benenne ihn für dieses Projekt um." : "Add or rename an option for this project."}</DialogDescription>
              </DialogHeader>
              <form className="grid gap-3" onSubmit={saveTypes}>
                <Field>
                  <FieldLabel className="flex-col items-stretch">{de ? "Eintrag wählen" : "Choose an option"}
                    <select className="min-h-9 rounded-md border bg-background px-2" value={previous} onChange={(event) => {
                      setPrevious(event.target.value);
                      setValue(event.target.value);
                    }}>
                      <option value="">{de ? "Neuen Eintrag hinzufügen" : "Add a new option"}</option>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </FieldLabel>
                </Field>
                <Field><FieldLabel className="flex-col items-stretch">Name<Input value={value} maxLength={80} onChange={(event) => setValue(event.target.value)} /></FieldLabel></Field>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <DialogFooter><Button type="submit" disabled={busy || !value.trim() || value.trim() === previous}>{de ? "Speichern" : "Save"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>}
        </div>
        {selected.length > 0 && <div className="flex flex-wrap gap-1">{selected.map((type) => <span key={type} className="tag-pill tag-conversation" data-testmails-search-text>{labelConversation(locale, type)}</span>)}</div>}
        {error && !typesOpen && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
