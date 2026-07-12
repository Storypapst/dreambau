import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Taxonomies } from "@/types";
import { labelConversation, labelRole, labelTopic, type Locale } from "@/i18n";
import { TagEditor } from "./tag-editor";

export function TaxonomySettings({ taxonomies, locale, onSaved }: { taxonomies: Taxonomies; locale: Locale; onSaved: (value: Taxonomies) => void }) {
  const [draft, setDraft] = useState(taxonomies); const [open, setOpen] = useState(false);
  useEffect(() => setDraft(taxonomies), [taxonomies]);
  async function save() { try { let latest = draft; for (const kind of ["roles", "topics", "conversationTypes"] as const) latest = await api<Taxonomies>(`/taxonomies/${kind}`, { method: "PUT", body: JSON.stringify({ values: draft[kind] }) }); onSaved(latest); toast.success(locale === "de" ? "Auswahllisten gespeichert" : "Lists saved"); setOpen(false); } catch { toast.error(locale === "de" ? "Einstellungen konnten nicht gespeichert werden" : "Could not save settings"); } }
  const definitions = {
    roles: { label: locale === "de" ? "Rollen" : "Roles", tone: "role" as const, format: (value: string) => labelRole(locale, value) },
    topics: { label: locale === "de" ? "Themengebiete" : "Topics", tone: "topic" as const, format: (value: string) => labelTopic(locale, value) },
    conversationTypes: { label: locale === "de" ? "Konversationstypen" : "Conversation types", tone: "conversation" as const, format: (value: string) => labelConversation(locale, value) }
  };
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline"><SettingsIcon data-icon="inline-start" />{locale === "de" ? "Auswahllisten" : "Lists"}</Button></SheetTrigger><SheetContent className="w-full overflow-hidden"><SheetHeader><SheetTitle>{locale === "de" ? "Auswahllisten" : "Lists"}</SheetTitle><SheetDescription>{locale === "de" ? "Einträge hinzufügen oder über ihre Pille entfernen. ORISO-Themen werden verständlich übersetzt angezeigt." : "Add entries or remove them from their pill. ORISO topics are shown with readable translations."}</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto"><FieldGroup className="px-4 pb-4">{(["roles","topics","conversationTypes"] as const).map((kind) => { const definition = definitions[kind]; return <Field key={kind}><FieldLabel>{definition.label}</FieldLabel><TagEditor label={definition.label} values={draft[kind]} formatOption={definition.format} tone={definition.tone} addLabel={locale === "de" ? "Hinzufügen" : "Add"} removeLabel={locale === "de" ? "entfernen" : "remove"} inputLabel={locale === "de" ? `Neues ${definition.label}-Tag` : `New ${definition.label} tag`} onChange={(values) => setDraft({ ...draft, [kind]: values })} /></Field>; })}</FieldGroup><SheetFooter className="mt-0 border-t bg-background"><Button onClick={save}>{locale === "de" ? "Speichern" : "Save"}</Button></SheetFooter></div></SheetContent></Sheet>;
}
