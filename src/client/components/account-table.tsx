import { useState } from "react";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, MoreHorizontalIcon } from "lucide-react";
import { labelLifecycle, t, type Locale } from "@/i18n";
import { domainClass } from "@/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountMetadata, AccountView, Taxonomies } from "@/types";
import { CopyButton } from "./copy-button";
import { InlineFixtureSelect, InlineProjectSelect, InlineStatusSelect, InlineTaxonomySelect } from "./inline-metadata-controls";

const WEBMAIL_URL = "https://mail.dreambau.com/";

export function AccountTable({ accounts, taxonomies, locale, onDetail, onEdit, onSaved }: { accounts: AccountView[]; taxonomies: Taxonomies; locale: Locale; onDetail: (account: AccountView) => void; onEdit: (account: AccountView) => void; onSaved: (metadata: AccountMetadata) => void }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggle = (email: string) => setRevealed((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next; });
  return <div className="hidden overflow-hidden rounded-xl border bg-card md:block"><Table><TableHeader><TableRow>
    <TableHead>{t(locale, "page.identity")}</TableHead><TableHead>{t(locale, "page.access")}</TableHead><TableHead>{t(locale, "page.project")} / {t(locale, "page.roles")} / {t(locale, "page.topics")}</TableHead><TableHead>{t(locale, "page.version")} / {t(locale, "page.status")}</TableHead><TableHead>{t(locale, "page.testData")}</TableHead><TableHead className="text-right">{t(locale, "page.actions")}</TableHead>
  </TableRow></TableHeader><TableBody>{accounts.map((account) => {
    const domain = domainClass(account.domain);
    return <TableRow key={account.email} className={`domain-row ${domain}`} onDoubleClick={() => onEdit(account)} title={locale === "de" ? "Doppelklick zum Bearbeiten" : "Double-click to edit"}>
      <TableCell className="align-top"><Button variant="outline" size="sm" className="mb-2 max-w-56 justify-start font-semibold" onClick={() => onDetail(account)}>{account.displayName}<ExternalLinkIcon data-icon="inline-end" /></Button><div><Badge variant="outline" className="domain-badge">{account.domain}</Badge></div><div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">{account.encryption.state === "encrypted" ? <LockIcon className="size-3.5" /> : <LockOpenIcon className="size-3.5" />}<span>{account.encryption.state === "encrypted" ? t(locale, "page.encrypted") : t(locale, "page.unencrypted")}</span></div></TableCell>
      <TableCell className="align-top"><div className="flex items-center gap-1"><a href={WEBMAIL_URL} target="_blank" rel="noreferrer" className="font-mono text-xs font-medium underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground" aria-label={`${t(locale, "page.openMail")}: ${account.email}`}>{account.email}</a><CopyButton value={account.email} label={locale === "de" ? "E-Mail kopieren" : "Copy email"} compact /></div><div className="mt-2 flex items-center gap-1"><code className="max-w-44 truncate text-xs text-muted-foreground">{revealed.has(account.email) ? account.password : "••••••••••••••••"}</code><Button variant="ghost" size="icon-sm" onClick={() => toggle(account.email)} aria-label={locale === "de" ? "Passwort anzeigen oder maskieren" : "Show or hide password"}>{revealed.has(account.email) ? <EyeOffIcon /> : <EyeIcon />}</Button><CopyButton value={account.password} label={locale === "de" ? "Passwort kopieren" : "Copy password"} compact /></div></TableCell>
      <TableCell className="w-[22rem] align-top"><div className="grid grid-cols-2 gap-2"><InlineProjectSelect account={account} locale={locale} onSaved={onSaved} /><InlineTaxonomySelect account={account} locale={locale} kind="roles" options={taxonomies.roles} onSaved={onSaved} /><InlineTaxonomySelect account={account} locale={locale} kind="topics" options={taxonomies.topics} onSaved={onSaved} /><InlineTaxonomySelect account={account} locale={locale} kind="conversationTypes" options={taxonomies.conversationTypes} onSaved={onSaved} /></div></TableCell>
      <TableCell className="w-40 align-top"><div className="mb-2 text-sm font-medium">{account.metadata.shippedVersion || "—"}</div><InlineStatusSelect account={account} locale={locale} onSaved={onSaved} />{account.metadata.lifecycleStatus === "active" && <Badge className="mt-2">{labelLifecycle(locale, "active")}</Badge>}</TableCell>
      <TableCell className="w-36 align-top"><InlineFixtureSelect account={account} locale={locale} onSaved={onSaved} /><div className="mt-2 text-xs text-muted-foreground">{account.metadata.sampleFileCount} {t(locale, "page.files")}</div></TableCell>
      <TableCell className="align-top"><div className="flex justify-end gap-1"><Button asChild variant="ghost" size="icon-sm"><a href={WEBMAIL_URL} target="_blank" rel="noreferrer" aria-label={`${t(locale, "page.openMail")}: ${account.email}`}><ExternalLinkIcon /></a></Button><CopyButton value={[account.displayName, account.email, account.password, account.domain, account.metadata.shippedVersion, account.metadata.lifecycleStatus, account.metadata.project].join("\t")} label={locale === "de" ? "Zeile kopieren" : "Copy row"} compact /><Button variant="ghost" size="icon-sm" onClick={() => onEdit(account)} aria-label={locale === "de" ? "Metadaten bearbeiten" : "Edit metadata"}><MoreHorizontalIcon /></Button></div></TableCell>
    </TableRow>;
  })}</TableBody></Table></div>;
}
