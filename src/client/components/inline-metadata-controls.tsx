import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { labelConversation, labelFixture, labelLifecycle, labelProject, labelRole, labelTopic, t, type Locale } from "@/i18n";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountMetadata, AccountView, FixtureQuality, LifecycleStatus, Project } from "@/types";
import { MultiSelect } from "./multi-select";

type MetadataPatch = Partial<Omit<AccountMetadata, "email" | "updatedAt">>;

export function saveMetadataPatch(email: string, patch: MetadataPatch) {
  return api<AccountMetadata>(`/accounts/${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify(patch) });
}

function useInstantSave(account: AccountView, onSaved: (metadata: AccountMetadata) => void, locale: Locale) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    save: async (patch: MetadataPatch) => {
      setBusy(true);
      try { onSaved(await saveMetadataPatch(account.email, patch)); toast.success(t(locale, "page.saved")); }
      catch { toast.error(t(locale, "page.saveFailed")); }
      finally { setBusy(false); }
    }
  };
}

const lifecycleValues: LifecycleStatus[] = ["unused", "active", "needs_review", "delete_candidate", "archived"];
const projectValues: Project[] = ["NONE", "ORI", "ORISO", "ORIMO", "TRAIL.IST", "DREAMBAU", "OTHER"];
const fixtureValues: FixtureQuality[] = ["empty", "synthetic", "realistic", "gold"];

export function InlineStatusSelect({ account, locale, onSaved }: { account: AccountView; locale: Locale; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  return <Select value={account.metadata.lifecycleStatus} disabled={busy} onValueChange={(value) => save({ lifecycleStatus: value as LifecycleStatus })}>
    <SelectTrigger size="sm" aria-label={t(locale, "page.status")} className="w-full min-w-32"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{lifecycleValues.map((value) => <SelectItem key={value} value={value}>{labelLifecycle(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineProjectSelect({ account, locale, onSaved }: { account: AccountView; locale: Locale; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  return <Select value={account.metadata.project} disabled={busy} onValueChange={(value) => save({ project: value as Project })}>
    <SelectTrigger size="sm" aria-label={t(locale, "page.project")} className="w-full min-w-28"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{projectValues.map((value) => <SelectItem key={value} value={value}>{labelProject(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineFixtureSelect({ account, locale, onSaved }: { account: AccountView; locale: Locale; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  return <Select value={account.metadata.fixtureQuality} disabled={busy} onValueChange={(value) => save({ fixtureQuality: value as FixtureQuality })}>
    <SelectTrigger size="sm" aria-label={t(locale, "page.testData")} className="w-full min-w-28"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{fixtureValues.map((value) => <SelectItem key={value} value={value}>{labelFixture(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineTaxonomySelect({ account, locale, kind, options, onSaved }: { account: AccountView; locale: Locale; kind: "roles" | "topics" | "conversationTypes"; options: string[]; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  const labels = { roles: t(locale, "page.roles"), topics: t(locale, "page.topics"), conversationTypes: t(locale, "page.conversations") };
  const format = kind === "topics" ? (value: string) => labelTopic(locale, value) : kind === "roles" ? (value: string) => labelRole(locale, value) : (value: string) => labelConversation(locale, value);
  return <MultiSelect compact disabled={busy} label={labels[kind]} options={options} value={account.metadata[kind]} onChange={(value) => save({ [kind]: value })} formatOption={format} locale={locale} />;
}
