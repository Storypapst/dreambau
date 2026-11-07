import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/api";
import { canonicalRole, distinctRoleOptions, labelLinkedEnvironment, labelRole, labelConversation, labelFixture, labelLifecycle, labelProject, labelRoleWithEnvironment, labelTopic, t, type Locale } from "@/i18n";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountMetadata, AccountView, FixtureQuality, LifecycleStatus, Project } from "@/types";
import { MultiSelect } from "./multi-select";
import { SelectedTags, type TagTone } from "./selected-tags";
import { LinkedRoleTags } from "./linked-role-tags";

type MetadataPatch = Partial<Omit<AccountMetadata, "email" | "updatedAt" | "documentedRoles">>;

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
    <SelectTrigger size="sm" aria-label={t(locale, "page.status")} className="min-w-0 w-full"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{lifecycleValues.map((value) => <SelectItem key={value} value={value}>{labelLifecycle(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineProjectSelect({ account, locale, onSaved }: { account: AccountView; locale: Locale; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  return <Select value={account.metadata.project} disabled={busy} onValueChange={(value) => save({ project: value as Project })}>
    <SelectTrigger size="sm" aria-label={t(locale, "page.project")} className="min-w-0 w-full"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{projectValues.map((value) => <SelectItem key={value} value={value}>{labelProject(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineFixtureSelect({ account, locale, onSaved }: { account: AccountView; locale: Locale; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  return <Select value={account.metadata.fixtureQuality} disabled={busy} onValueChange={(value) => save({ fixtureQuality: value as FixtureQuality })}>
    <SelectTrigger size="sm" aria-label={t(locale, "page.testData")} className="min-w-0 w-full"><SelectValue /></SelectTrigger>
    <SelectContent><SelectGroup>{fixtureValues.map((value) => <SelectItem key={value} value={value}>{labelFixture(locale, value)}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

export function InlineTaxonomySelect({ account, locale, kind, options, onSaved }: { account: AccountView; locale: Locale; kind: "roles" | "topics" | "conversationTypes"; options: string[]; onSaved: (metadata: AccountMetadata) => void }) {
  const { busy, save } = useInstantSave(account, onSaved, locale);
  const labels = { roles: locale === "de" ? "Rollen (Dokumentation)" : "Roles (documentation)", topics: t(locale, "page.topics"), conversationTypes: t(locale, "page.conversations") };
  const selected = kind === "roles" ? account.metadata.documentedRoles ?? account.metadata.roles : account.metadata[kind];
  const format = kind === "topics"
    ? (value: string) => labelTopic(locale, value)
    : kind === "roles"
      ? (value: string) => labelRoleWithEnvironment(locale, value, account.linkedAccess)
      : (value: string) => labelConversation(locale, value);
  const tone: Record<typeof kind, TagTone> = { roles: "role", topics: "topic", conversationTypes: "conversation" };
  return <div className="flex min-w-0 flex-col gap-1.5"><MultiSelect compact disabled={busy} label={labels[kind]} options={kind === "roles" ? distinctRoleOptions(options, selected) : options} value={selected} onChange={(value) => save({ [kind]: value })} formatOption={format} locale={locale} /><SelectedTags values={selected} formatOption={format} tone={tone[kind]} removeLabel={locale === "de" ? "entfernen" : "remove"} onRemove={(removed) => save({ [kind]: selected.filter((value) => value !== removed) })} />{kind === "roles" && <LinkedRoleTags linkedAccess={account.linkedAccess} locale={locale} />}</div>;
}


type AccountMetadataControlProps = {
  account: AccountView;
  locale: Locale;
  onSaved: (metadata: AccountMetadata) => void;
};

export function AccountClassificationTags({ account, locale }: Pick<AccountMetadataControlProps, "account" | "locale">) {
  const links = (account.linkedAccess ?? []).filter((link) => !link.deleted && !link.deletionPending);
  const environments = [...new Set(links.map((link) => labelLinkedEnvironment(locale, [link])).filter(Boolean))];
  const roles = distinctRoleOptions([...account.metadata.roles, ...links.flatMap((link) => link.roles)]);
  const hasScopedAdmin = roles.some((role) => ["platform-admin", "tenant-admin", "agency-admin"].includes(canonicalRole(role)));
  const displayedRoles = [...new Set(roles.filter((role) => !hasScopedAdmin || canonicalRole(role) !== "Admin")
    .map((role) => labelRole(locale, role)))];
  const topics = account.metadata.topics;
  if (!environments.length && !displayedRoles.length && !topics.length) return null;

  return <div className="mt-2 flex min-w-0 flex-wrap gap-1" aria-label={locale === "de" ? "Umgebungen, Rollen und Themen" : "Environments, roles and topics"}>
    {environments.map((environment) => <Badge key={environment} variant="secondary" data-testmails-search-text>{environment}</Badge>)}
    {displayedRoles.map((role) => <span key={role} className="tag-pill tag-role" data-testmails-search-text>{role}</span>)}
    {topics.map((topic) => <span key={topic} className="tag-pill tag-topic" data-testmails-search-text>{labelTopic(locale, topic)}</span>)}
  </div>;
}

export function AccountVersion({ account, locale, onSaved, fallback }: AccountMetadataControlProps & { fallback?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const de = locale === "de";
  const label = de ? "Versionsnummer bearbeiten" : "Edit version number";
  const version = account.metadata.shippedVersion;

  function edit() {
    setError(false);
    setDraft(version);
  }

  async function save() {
    if (draft === null || busy) return;
    const shippedVersion = draft.trim();
    if (!/^$|^\d+(\.\d+){0,2}$/.test(shippedVersion)) {
      setError(true);
      return;
    }
    if (shippedVersion === version) {
      setDraft(null);
      return;
    }
    setBusy(true);
    try {
      onSaved(await saveMetadataPatch(account.email, { shippedVersion }));
      setDraft(null);
    } catch {
      toast.error(t(locale, "page.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (draft !== null) return <span className="inline-flex flex-wrap items-center gap-1" onDoubleClick={(event) => event.stopPropagation()}>
    <Input autoFocus className="h-6 w-24 px-1.5 text-xs" aria-label={label} aria-invalid={error || undefined}
      value={draft} placeholder="2.0.15" readOnly={busy}
      onChange={(event) => { setError(false); setDraft(event.currentTarget.value); }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); }
      }} />
    {error && <span className="text-xs text-destructive" role="alert">{de ? "Format wie 2.0.15" : "Use a format like 2.0.15"}</span>}
  </span>;

  return <button type="button" className="rounded px-0.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2"
    aria-label={label} title={de ? "Doppelklick zum Bearbeiten" : "Double-click to edit"} data-testmails-search-text
    onClick={(event) => { if (event.detail === 0) edit(); }}
    onDoubleClick={(event) => { event.stopPropagation(); edit(); }}
    onPointerUp={(event) => { if (event.pointerType === "touch") edit(); }}>
    {version ? `v${version}` : fallback ?? (de ? "Version setzen" : "Set version")}
  </button>;
}
