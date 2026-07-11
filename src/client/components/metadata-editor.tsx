import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { AccountMetadata, AccountView, FixtureQuality, LifecycleStatus, Taxonomies } from "@/types";
import { MultiSelect } from "./multi-select";

export function MetadataEditor({ account, taxonomies, open, onOpenChange, onSaved }: { account: AccountView | null; taxonomies: Taxonomies; open: boolean; onOpenChange: (value: boolean) => void; onSaved: (metadata: AccountMetadata) => void }) {
  const [value, setValue] = useState<AccountMetadata | null>(account?.metadata ?? null); const [busy, setBusy] = useState(false);
  useEffect(() => setValue(account?.metadata ?? null), [account]);
  if (!account || !value) return null;
  const email = account.email;
  const currentValue = value;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const { email: _email, updatedAt: _updatedAt, ...patch } = currentValue;
    try { const saved = await api<AccountMetadata>(`/accounts/${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify(patch) }); onSaved(saved); toast.success("Metadaten gespeichert"); onOpenChange(false); }
    catch { toast.error("Speichern fehlgeschlagen"); } finally { setBusy(false); }
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Testprofil bearbeiten</SheetTitle><SheetDescription>{account.email}</SheetDescription></SheetHeader><form onSubmit={submit} className="px-4"><FieldGroup>
    <Field><FieldLabel htmlFor="version">Verschifft in Version</FieldLabel><Input id="version" placeholder="3.1.0" value={value.shippedVersion} onChange={(e) => setValue({ ...value, shippedVersion: e.target.value })} pattern="^$|^\d+(\.\d+){0,2}$" /></Field>
    <Field><FieldLabel>Status</FieldLabel><Select value={value.lifecycleStatus} onValueChange={(v) => setValue({ ...value, lifecycleStatus: v as LifecycleStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["active","needs_review","delete_candidate","archived"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Rollen</FieldLabel><MultiSelect label="Rollen wählen" options={taxonomies.roles} value={value.roles} onChange={(roles) => setValue({ ...value, roles })} /></Field>
    <Field><FieldLabel>Themengebiete</FieldLabel><MultiSelect label="Themen wählen" options={taxonomies.topics} value={value.topics} onChange={(topics) => setValue({ ...value, topics })} /></Field>
    <Field><FieldLabel>Konversationstypen</FieldLabel><MultiSelect label="Typen wählen" options={taxonomies.conversationTypes} value={value.conversationTypes} onChange={(conversationTypes) => setValue({ ...value, conversationTypes })} /></Field>
    <Field><FieldLabel>Beispieldaten</FieldLabel><Select value={value.fixtureQuality} onValueChange={(v) => setValue({ ...value, fixtureQuality: v as FixtureQuality })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["empty","synthetic","realistic","gold"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="files">Beispieldateien</FieldLabel><Input id="files" type="number" min="0" value={value.sampleFileCount} onChange={(e) => setValue({ ...value, sampleFileCount: Number(e.target.value) })} /></Field>
    <Field><FieldLabel htmlFor="notes">Notizen</FieldLabel><Textarea id="notes" value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
    <SheetFooter className="px-0"><Button type="submit" disabled={busy}>{busy ? "Speichert …" : "Speichern"}</Button></SheetFooter>
  </FieldGroup></form></SheetContent></Sheet>;
}
