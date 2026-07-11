import { useMemo, useState } from "react";
import { DownloadIcon, LogOutIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { api } from "@/api";
import { AccountCard } from "./account-card";
import { AccountDetailSheet } from "./account-detail-sheet";
import { AccountTable } from "./account-table";
import { MetadataEditor } from "./metadata-editor";
import { TaxonomySettings } from "./taxonomy-settings";
import { VersionBulkAction } from "./version-bulk-action";
import { MultiSelect } from "./multi-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AccountMetadata, AccountView, Taxonomies } from "@/types";

const domains = ["all", "dreambau.com", "dreambau.de", "getme.global", "openresilience.cc", "oriso.org", "trail.ist"];
export function AccountDirectory({ initialAccounts, initialTaxonomies, onLogout }: { initialAccounts: AccountView[]; initialTaxonomies: Taxonomies; onLogout: () => void }) {
  const [accounts, setAccounts] = useState(initialAccounts); const [taxonomies, setTaxonomies] = useState(initialTaxonomies);
  const [query, setQuery] = useState(""); const [domain, setDomain] = useState("all"); const [status, setStatus] = useState("all"); const [quality, setQuality] = useState("all");
  const [versionAfter, setVersionAfter] = useState(""); const [roleFilters, setRoleFilters] = useState<string[]>([]); const [topicFilters, setTopicFilters] = useState<string[]>([]); const [conversationFilters, setConversationFilters] = useState<string[]>([]);
  const [selected, setSelected] = useState<AccountView | null>(null); const [detailOpen, setDetailOpen] = useState(false); const [editOpen, setEditOpen] = useState(false);
  const filtered = useMemo(() => accounts.filter((account) => {
    const haystack = [account.displayName, account.email, account.domain, account.metadata.shippedVersion, account.metadata.lifecycleStatus, account.metadata.fixtureQuality, account.metadata.notes, ...account.metadata.roles, ...account.metadata.topics, ...account.metadata.conversationTypes].join(" ").toLowerCase();
    const aboveVersion = !versionAfter || (account.metadata.shippedVersion && compareVersions(account.metadata.shippedVersion, versionAfter) > 0);
    return (domain === "all" || account.domain === domain) && (status === "all" || account.metadata.lifecycleStatus === status) && (quality === "all" || account.metadata.fixtureQuality === quality) && aboveVersion && roleFilters.every((item) => account.metadata.roles.includes(item)) && topicFilters.every((item) => account.metadata.topics.includes(item)) && conversationFilters.every((item) => account.metadata.conversationTypes.includes(item)) && haystack.includes(query.toLowerCase());
  }), [accounts, domain, status, quality, query, versionAfter, roleFilters, topicFilters, conversationFilters]);
  function replaceMetadata(metadata: AccountMetadata) { setAccounts((current) => current.map((account) => account.email === metadata.email ? { ...account, metadata } : account)); setSelected((current) => current?.email === metadata.email ? { ...current, metadata } : current); }
  function edit(account: AccountView) { setSelected(account); setDetailOpen(false); setEditOpen(true); }
  async function logout() { await api("/auth/logout", { method: "POST" }); onLogout(); }
  return <main className="min-h-screen"><header className="border-b bg-card"><div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheckIcon />Geschützter Testraum</div><h1 className="text-3xl font-bold tracking-tight">Springfield Testkonten</h1><p className="mt-1 text-muted-foreground">180 Identitäten für Mail-, Kalender-, Adressbuch- und Beratungstests.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><a href="/testmails/testmails.md"><DownloadIcon data-icon="inline-start" />Markdown</a></Button><TaxonomySettings taxonomies={taxonomies} onSaved={setTaxonomies} /><Button variant="ghost" onClick={logout}><LogOutIcon data-icon="inline-start" />Abmelden</Button></div></div>
    <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_auto_auto_auto]"><div className="relative"><SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input className="pl-10" placeholder="Name, E-Mail, Rolle, Thema, Notiz …" value={query} onChange={(e) => setQuery(e.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectGroup>{["all","active","needs_review","delete_candidate","archived"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup></SelectContent></Select><Select value={quality} onValueChange={setQuality}><SelectTrigger className="w-full lg:w-40"><SelectValue placeholder="Testdaten" /></SelectTrigger><SelectContent><SelectGroup>{["all","empty","synthetic","realistic","gold"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectGroup></SelectContent></Select><VersionBulkAction accounts={accounts} onMarked={(emails) => setAccounts((current) => current.map((a) => emails.includes(a.email) ? { ...a, metadata: { ...a.metadata, lifecycleStatus: "delete_candidate" } } : a))} /></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input aria-label="Konten nach Version filtern" placeholder="Liste: Version >" value={versionAfter} onChange={(event) => setVersionAfter(event.target.value)} /><MultiSelect label="Rollen filtern" options={taxonomies.roles} value={roleFilters} onChange={setRoleFilters} /><MultiSelect label="Themen filtern" options={taxonomies.topics} value={topicFilters} onChange={setTopicFilters} /><MultiSelect label="Konversationen filtern" options={taxonomies.conversationTypes} value={conversationFilters} onChange={setConversationFilters} /></div>
    <div className="max-w-full overflow-x-auto pb-1"><ToggleGroup type="single" value={domain} onValueChange={(value) => value && setDomain(value)} variant="outline" className="w-max justify-start">{domains.map((value) => <ToggleGroupItem key={value} value={value}>{value === "all" ? "Alle" : value}</ToggleGroupItem>)}</ToggleGroup></div></div></header>
    <section className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-6 lg:px-8"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{filtered.length} von {accounts.length} Konten</p><div className="flex gap-2"><Badge variant="outline">150 S/MIME</Badge><Badge variant="secondary">30 Vergleichskonten</Badge></div></div>{accounts.length !== 180 && <Alert variant="destructive"><AlertTitle>Accountbestand unvollständig</AlertTitle><AlertDescription>Erwartet werden 180 eindeutige Konten.</AlertDescription></Alert>}{filtered.length ? <><AccountTable accounts={filtered} onDetail={(account) => { setSelected(account); setDetailOpen(true); }} onEdit={edit} /><div className="grid gap-4 sm:grid-cols-2">{filtered.map((account) => <AccountCard key={account.email} account={account} onDetail={() => { setSelected(account); setDetailOpen(true); }} onEdit={() => edit(account)} />)}</div></> : <Card><CardContent><Empty><EmptyHeader><EmptyTitle>Keine Konten gefunden</EmptyTitle><EmptyDescription>Filter oder Suchbegriff anpassen.</EmptyDescription></EmptyHeader></Empty></CardContent></Card>}</section>
    <AccountDetailSheet account={selected} open={detailOpen} onOpenChange={setDetailOpen} onEdit={() => selected && edit(selected)} /><MetadataEditor account={selected} taxonomies={taxonomies} open={editOpen} onOpenChange={setEditOpen} onSaved={replaceMetadata} />
  </main>;
}

function compareVersions(left: string, right: string) { const a = left.split(".").map(Number), b = right.split(".").map(Number); for (let index = 0; index < 3; index += 1) { const difference = (a[index] ?? 0) - (b[index] ?? 0); if (difference) return difference; } return 0; }
