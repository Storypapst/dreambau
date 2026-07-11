import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Taxonomies } from "@/types";
import type { Locale } from "@/i18n";

export function TaxonomySettings({ taxonomies, locale, onSaved }: { taxonomies: Taxonomies; locale: Locale; onSaved: (value: Taxonomies) => void }) {
  const [draft, setDraft] = useState(taxonomies); const [open, setOpen] = useState(false);
  useEffect(() => setDraft(taxonomies), [taxonomies]);
  async function save() { try { let latest = draft; for (const kind of ["roles", "topics", "conversationTypes"] as const) latest = await api<Taxonomies>(`/taxonomies/${kind}`, { method: "PUT", body: JSON.stringify({ values: draft[kind] }) }); onSaved(latest); toast.success(locale === "de" ? "Auswahllisten gespeichert" : "Lists saved"); setOpen(false); } catch { toast.error(locale === "de" ? "Einstellungen konnten nicht gespeichert werden" : "Could not save settings"); } }
  const edit = (kind: keyof Taxonomies, text: string) => setDraft({ ...draft, [kind]: text.split(/\n/).map((v) => v.trim()).filter(Boolean) });
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline"><SettingsIcon data-icon="inline-start" />{locale === "de" ? "Auswahllisten" : "Lists"}</Button></SheetTrigger><SheetContent className="w-full overflow-hidden"><SheetHeader><SheetTitle>{locale === "de" ? "Auswahllisten" : "Lists"}</SheetTitle><SheetDescription>{locale === "de" ? "Ein Eintrag pro Zeile. Die 16 ORISO-Themen sind als stabile Schlüssel hinterlegt." : "One entry per line. The 16 ORISO topics are stored as stable keys."}</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto"><FieldGroup className="px-4 pb-4">{(["roles","topics","conversationTypes"] as const).map((kind) => <Field key={kind}><FieldLabel htmlFor={`taxonomy-${kind}`}>{kind === "roles" ? (locale === "de" ? "Rollen" : "Roles") : kind === "topics" ? (locale === "de" ? "Themengebiete" : "Topics") : (locale === "de" ? "Konversationstypen" : "Conversation types")}</FieldLabel><Textarea id={`taxonomy-${kind}`} rows={7} value={draft[kind].join("\n")} onChange={(e) => edit(kind, e.target.value)} /></Field>)}</FieldGroup></div><SheetFooter className="shrink-0 border-t bg-background"><Button onClick={save}>{locale === "de" ? "Speichern" : "Save"}</Button></SheetFooter></SheetContent></Sheet>;
}
