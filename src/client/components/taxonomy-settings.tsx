import { useEffect, useState } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Taxonomies } from "@/types";

export function TaxonomySettings({ taxonomies, onSaved }: { taxonomies: Taxonomies; onSaved: (value: Taxonomies) => void }) {
  const [draft, setDraft] = useState(taxonomies); const [open, setOpen] = useState(false);
  useEffect(() => setDraft(taxonomies), [taxonomies]);
  async function save() { try { let latest = draft; for (const kind of ["roles", "topics", "conversationTypes"] as const) latest = await api<Taxonomies>(`/taxonomies/${kind}`, { method: "PUT", body: JSON.stringify({ values: draft[kind] }) }); onSaved(latest); toast.success("Auswahllisten gespeichert"); setOpen(false); } catch { toast.error("Einstellungen konnten nicht gespeichert werden"); } }
  const edit = (kind: keyof Taxonomies, text: string) => setDraft({ ...draft, [kind]: text.split(/\n/).map((v) => v.trim()).filter(Boolean) });
  return <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="outline"><SettingsIcon data-icon="inline-start" />Auswahllisten</Button></SheetTrigger><SheetContent className="w-full overflow-y-auto"><SheetHeader><SheetTitle>Auswahllisten</SheetTitle><SheetDescription>Ein Eintrag pro Zeile. Caritas-Themen werden hier autoritativ ergänzt.</SheetDescription></SheetHeader><FieldGroup className="px-4">{(["roles","topics","conversationTypes"] as const).map((kind) => <Field key={kind}><FieldLabel htmlFor={`taxonomy-${kind}`}>{kind === "roles" ? "Rollen" : kind === "topics" ? "Themengebiete" : "Konversationstypen"}</FieldLabel><Textarea id={`taxonomy-${kind}`} rows={7} value={draft[kind].join("\n")} onChange={(e) => edit(kind, e.target.value)} /></Field>)}</FieldGroup><SheetFooter><Button onClick={save}>Speichern</Button></SheetFooter></SheetContent></Sheet>;
}
