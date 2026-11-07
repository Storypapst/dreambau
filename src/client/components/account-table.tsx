import { useState } from "react";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, LockIcon, LockOpenIcon, MoreHorizontalIcon } from "lucide-react";
import { labelFixture, labelLifecycle, labelLinkedEnvironment, labelProject, t, type Locale } from "@/i18n";
import { domainClass } from "@/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountMetadata, AccountView, HumanEntitlements, LinkedTestAccount, Taxonomies } from "@/types";
import { CopyButton } from "./copy-button";
import { FavoriteButton } from "./favorite-button";
import { accountPasswordDate, AccountTestContext, AccountTestSettings, type AccountTestContextOptions } from "./account-test-context";
import { AccountClassificationTags, AccountVersion } from "./inline-metadata-controls";
import { AccountInlineNotes } from "./account-inline-notes";
import { OtpAccess } from "./otp-access";
import type { OnTestAccessLinkReset } from "./test-access-link-reset-dialog";

const WEBMAIL_URL = "https://mail.dreambau.com/";

export function AccountTable({ accounts, locale, onDetail, onEdit, onSaved, projectConversationTypes, onTypesChanged, projectLoginTargets, onLoginTargetsChanged, canDeleteOrisoAdmin = false, orisoProvisioningEnvironments = [], onProvisioned, onLinkReset, favorites = new Set<string>(), onToggleFavorite, favoritesReady = true }: { accounts: AccountView[]; taxonomies: Taxonomies; locale: Locale; onDetail: (account: AccountView) => void; onEdit: (account: AccountView) => void; onSaved: (metadata: AccountMetadata) => void; canDeleteOrisoAdmin?: boolean; orisoProvisioningEnvironments?: HumanEntitlements["orisoProvisioning"]["environments"]; onProvisioned?: (email: string, linked: LinkedTestAccount, metadata?: AccountMetadata) => void; onLinkReset?: OnTestAccessLinkReset; favorites?: ReadonlySet<string>; favoritesReady?: boolean; onToggleFavorite?: (email: string) => void } & AccountTestContextOptions) {
  const de = locale === "de";
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggle = (email: string) => setRevealed((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next; });
  return <div className="hidden overflow-hidden rounded-xl border bg-card lg:block"><Table className="table-fixed"><TableHeader><TableRow><TableHead className="w-[26%]">{t(locale, "page.identity")}</TableHead><TableHead className="w-[33%]">{de ? "Testeinstellungen" : "Test settings"}</TableHead><TableHead className="w-[33%]">{de ? "Testkontext und Notizen" : "Test context and notes"}</TableHead><TableHead className="w-[8%] text-right">{t(locale, "page.actions")}</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => {
    const domain = domainClass(account.domain);
    const showProject = account.metadata.project !== "ORISO" || !account.linkedAccess?.some((link) =>
      !link.deleted && !link.deletionPending && labelLinkedEnvironment(locale, [link]));
    return <TableRow key={account.email} className={domain}>
      <TableCell className="min-w-0 align-top whitespace-normal"><div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">{onToggleFavorite && <FavoriteButton disabled={!favoritesReady} favorite={favorites.has(account.email)} onToggle={() => onToggleFavorite(account.email)} locale={locale} name={account.displayName} />}<Button variant="outline" size="sm" className="min-w-0 max-w-full justify-start overflow-hidden font-semibold" onClick={() => onDetail(account)}><span data-testmails-search-text className="min-w-0 truncate">{account.displayName}</span><ExternalLinkIcon className="shrink-0" data-icon="inline-end" /></Button><Badge variant="outline" className="domain-badge max-w-full truncate">{account.domain}</Badge></div><div className="mt-2 flex min-w-0 items-center gap-1"><a data-testmails-search-text href={WEBMAIL_URL} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-xs font-medium underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground" title={account.email} aria-label={`${t(locale, "page.openMail")}: ${account.email}`}>{account.email}</a><CopyButton value={account.email} label={locale === "de" ? "E-Mail kopieren" : "Copy email"} compact /></div><div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">{account.encryption.state === "encrypted" ? <LockIcon className="size-3.5 shrink-0" /> : <LockOpenIcon className="size-3.5 shrink-0" />}<span className="min-w-0 truncate">{account.encryption.state === "encrypted" ? t(locale, "page.encrypted") : t(locale, "page.unencrypted")}</span></div>
        <section className="mt-3 border-t pt-2" aria-label={t(locale, "page.access")}>
          <OtpAccess canDeleteOrisoAdmin={canDeleteOrisoAdmin} account={account} locale={locale} compact orisoProvisioningEnvironments={orisoProvisioningEnvironments} onProvisioned={onProvisioned} onMetadataSaved={onSaved} onLinkReset={onLinkReset}
            showLinkedTags={false}
            renderMailbox={(mailOtp, actions) => <div className="flex min-w-0 items-end gap-x-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground"><span>{locale === "de" ? "Mail-Passwort" : "Mailbox password"}</span>{mailOtp}</div><div className="flex min-w-0 items-center gap-1"><code data-testmails-search-private className="min-w-0 truncate text-xs text-muted-foreground">{revealed.has(account.email) ? account.password : "••••••••••••••••"}</code><Button variant="ghost" size="icon-sm" onClick={() => toggle(account.email)} aria-label={locale === "de" ? "Mail-Passwort anzeigen oder maskieren" : "Show or hide mailbox password"}>{revealed.has(account.email) ? <EyeOffIcon /> : <EyeIcon />}</Button><CopyButton value={account.password} label={locale === "de" ? "Mail-Passwort kopieren" : "Copy mailbox password"} compact /></div></div>{actions}</div>}
          />
        </section>
      </TableCell>
      <TableCell className="min-w-0 align-top whitespace-normal">
        <div><AccountTestSettings account={account} locale={locale} onSaved={onSaved} projectConversationTypes={projectConversationTypes} onTypesChanged={onTypesChanged} projectLoginTargets={projectLoginTargets} onLoginTargetsChanged={onLoginTargetsChanged} /></div>
        <section className="mt-3 border-t pt-2" aria-label={de ? "Einordnung" : "Classification"}>
          <h3 className="text-xs font-semibold text-muted-foreground">{de ? "Einordnung" : "Classification"}</h3>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {showProject &&
              <span className="font-medium" data-testmails-search-text>{labelProject(locale, account.metadata.project)}</span>}
            <Badge data-testmails-search-text variant={account.metadata.lifecycleStatus === "active" ? "default" : "secondary"}>{labelLifecycle(locale, account.metadata.lifecycleStatus)}</Badge>
            <AccountVersion account={account} locale={locale} onSaved={onSaved} fallback={accountPasswordDate(account, locale)} />
            <span className="text-xs text-muted-foreground">{labelFixture(locale, account.metadata.fixtureQuality)} · {account.metadata.sampleFileCount} {t(locale, "page.files")}</span>
          </div>
          <AccountClassificationTags account={account} locale={locale} />
        </section>
      </TableCell>
      <TableCell className="min-w-0 align-top whitespace-normal">
        <div className="[&>section]:border-0 [&>section]:pt-0"><AccountTestContext account={account} locale={locale} onSaved={onSaved} /></div>
        <div className="mt-3"><AccountInlineNotes account={account} locale={locale} onSaved={onSaved} /></div>
      </TableCell>
      <TableCell className="align-top"><div className="flex flex-wrap justify-end gap-1"><Button asChild variant="ghost" size="icon-sm"><a href={WEBMAIL_URL} target="_blank" rel="noreferrer" aria-label={`${t(locale, "page.openMail")}: ${account.email}`}><ExternalLinkIcon /></a></Button><CopyButton value={[account.displayName, account.email, account.password, account.domain, account.metadata.shippedVersion, account.metadata.lifecycleStatus, account.metadata.project].join("\t")} label={locale === "de" ? "Zeile kopieren" : "Copy row"} compact /><Button variant="ghost" size="icon-sm" onClick={() => onEdit(account)} aria-label={locale === "de" ? "Metadaten bearbeiten" : "Edit metadata"}><MoreHorizontalIcon /></Button></div></TableCell>
    </TableRow>;
  })}</TableBody></Table></div>;
}
