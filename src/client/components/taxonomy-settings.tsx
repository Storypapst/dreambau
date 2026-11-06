import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Taxonomies } from "@/types";
import { labelRole, labelTopic, type Locale } from "@/i18n";
import { TagEditor } from "./tag-editor";

export function TaxonomySettings({ taxonomies, locale, onSaved }: { taxonomies: Taxonomies; locale: Locale; onSaved: (value: Taxonomies) => void }) {
  const [draft, setDraft] = useState(taxonomies); const [open, setOpen] = useState(false);
  useEffect(() => setDraft(taxonomies), [taxonomies]);
  async function save() { try { let latest = draft; for (const kind of ["roles", "topics"] as const) latest = await api<Taxonomies>(`/taxonomies/${kind}`, { method: "PUT", body: JSON.stringify({ values: draft[kind] }) }); onSaved(latest); toast.success(locale === "de" ? "Rollen und Themen gespeichert" : "Roles and topics saved"); setOpen(false); } catch { toast.error(locale === "de" ? "Einstellungen konnten nicht gespeichert werden" : "Could not save settings"); } }
  const definitions = {
    roles: { label: locale === "de" ? "Rollen" : "Roles", inputLabel: locale === "de" ? "Neue Rolle" : "New role", tone: "role" as const, format: (value: string) => labelRole(locale, value) },
    topics: { label: locale === "de" ? "Themen" : "Topics", inputLabel: locale === "de" ? "Neues Thema" : "New topic", tone: "topic" as const, format: (value: string) => labelTopic(locale, value) }
  };
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline"><SettingsIcon data-icon="inline-start" />{locale === "de" ? "Einstellungen" : "Settings"}</Button></SheetTrigger><SheetContent className="w-full overflow-hidden"><SheetHeader><SheetTitle>{locale === "de" ? "Rollen und Themen bearbeiten" : "Edit roles and topics"}</SheetTitle><SheetDescription>{locale === "de" ? "Lege fest, welche Rollen und Themen zur Auswahl stehen. Hier kannst du Einträge hinzufügen oder entfernen." : "Choose which roles and topics are available. Add or remove entries here."}</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto"><FieldGroup className="px-4 pb-4">{(["roles","topics"] as const).map((kind) => { const definition = definitions[kind]; return <Field key={kind}><FieldLabel>{definition.label}</FieldLabel><TagEditor label={definition.label} values={draft[kind]} formatOption={definition.format} tone={definition.tone} addLabel={locale === "de" ? "Hinzufügen" : "Add"} removeLabel={locale === "de" ? "entfernen" : "remove"} inputLabel={definition.inputLabel} onChange={(values) => setDraft({ ...draft, [kind]: values })} /></Field>; })}</FieldGroup><SheetFooter className="mt-0 border-t bg-background"><Button onClick={save}>{locale === "de" ? "Speichern" : "Save"}</Button></SheetFooter></div></SheetContent></Sheet>;
}
