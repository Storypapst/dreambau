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
import { labelConversation, labelFixture, labelLifecycle, labelProject, labelRole, labelTopic, type Locale } from "@/i18n";
import type { Project } from "@/types";

export function MetadataEditor({ account, taxonomies, locale, open, onOpenChange, onSaved }: { account: AccountView | null; taxonomies: Taxonomies; locale: Locale; open: boolean; onOpenChange: (value: boolean) => void; onSaved: (metadata: AccountMetadata) => void }) {
  const [value, setValue] = useState<AccountMetadata | null>(account?.metadata ?? null); const [busy, setBusy] = useState(false);
  useEffect(() => setValue(account?.metadata ?? null), [account]);
  if (!account || !value) return null;
  const email = account.email;
  const currentValue = value;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    const { email: _email, updatedAt: _updatedAt, ...patch } = currentValue;
    try { const saved = await api<AccountMetadata>(`/accounts/${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify(patch) }); onSaved(saved); toast.success(locale === "de" ? "Metadaten gespeichert" : "Metadata saved"); onOpenChange(false); }
    catch { toast.error(locale === "de" ? "Speichern fehlgeschlagen" : "Could not save"); } finally { setBusy(false); }
  }
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{locale === "de" ? "Testprofil bearbeiten" : "Edit test profile"}</SheetTitle><SheetDescription>{account.email}</SheetDescription></SheetHeader><form onSubmit={submit} className="px-4"><FieldGroup>
    <Field><FieldLabel htmlFor="version">{locale === "de" ? "Verschifft in Version" : "Shipped in version"}</FieldLabel><Input id="version" placeholder="3.1.0" value={value.shippedVersion} onChange={(e) => setValue({ ...value, shippedVersion: e.target.value })} pattern="^$|^\d+(\.\d+){0,2}$" /></Field>
    <Field><FieldLabel>{locale === "de" ? "Projekt" : "Project"}</FieldLabel><Select value={value.project} onValueChange={(project) => setValue({ ...value, project: project as Project })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(["NONE","ORI","ORISO","ORIMO","TRAIL.IST","DREAMBAU","OTHER"] as Project[]).map((item) => <SelectItem key={item} value={item}>{labelProject(locale, item)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>Status</FieldLabel><Select value={value.lifecycleStatus} onValueChange={(v) => setValue({ ...value, lifecycleStatus: v as LifecycleStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(["unused","active","needs_review","delete_candidate","archived"] as LifecycleStatus[]).map((item) => <SelectItem key={item} value={item}>{labelLifecycle(locale, item)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel>{locale === "de" ? "Rollen" : "Roles"}</FieldLabel><MultiSelect locale={locale} label={locale === "de" ? "Rollen wählen" : "Choose roles"} options={taxonomies.roles} value={value.roles} onChange={(roles) => setValue({ ...value, roles })} formatOption={(item) => labelRole(locale, item)} /></Field>
    <Field><FieldLabel>{locale === "de" ? "Themengebiete" : "Topics"}</FieldLabel><MultiSelect locale={locale} label={locale === "de" ? "Themen wählen" : "Choose topics"} options={taxonomies.topics} value={value.topics} onChange={(topics) => setValue({ ...value, topics })} formatOption={(item) => labelTopic(locale, item)} /></Field>
    <Field><FieldLabel>{locale === "de" ? "Konversationstypen" : "Conversation types"}</FieldLabel><MultiSelect locale={locale} label={locale === "de" ? "Typen wählen" : "Choose types"} options={taxonomies.conversationTypes} value={value.conversationTypes} onChange={(conversationTypes) => setValue({ ...value, conversationTypes })} formatOption={(item) => labelConversation(locale, item)} /></Field>
    <Field><FieldLabel>{locale === "de" ? "Beispieldaten" : "Sample data"}</FieldLabel><Select value={value.fixtureQuality} onValueChange={(v) => setValue({ ...value, fixtureQuality: v as FixtureQuality })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{(["empty","synthetic","realistic","gold"] as FixtureQuality[]).map((item) => <SelectItem key={item} value={item}>{labelFixture(locale, item)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="files">{locale === "de" ? "Beispieldateien" : "Sample files"}</FieldLabel><Input id="files" type="number" min="0" value={value.sampleFileCount} onChange={(e) => setValue({ ...value, sampleFileCount: Number(e.target.value) })} /></Field>
    <Field><FieldLabel htmlFor="notes">{locale === "de" ? "Notizen" : "Notes"}</FieldLabel><Textarea id="notes" value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} /></Field>
    <SheetFooter className="px-0"><Button type="submit" disabled={busy}>{busy ? (locale === "de" ? "Speichert …" : "Saving …") : (locale === "de" ? "Speichern" : "Save")}</Button></SheetFooter>
  </FieldGroup></form></SheetContent></Sheet>;
}
