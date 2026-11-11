import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import type { FavoriteDisplay } from "@/favorites";
import { t, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";
import type { AccountMetadata, AccountView } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccountRowSummary } from "./account-row-summary";
import { AccountAccessDate, accountRoleLabels, accountTopicLabels } from "./account-context-display";
import { AccountInlineNotes } from "./account-inline-notes";
import { accountPasswordDate } from "./account-test-context";
import { CopyButton } from "./copy-button";
import { FavoriteButton } from "./favorite-button";
import { OtpAccess } from "./otp-access";

type FavoriteAccountViewProps = {
  accounts: AccountView[];
  locale: Locale;
  display: FavoriteDisplay;
  expandedEmail: string | null;
  onToggleExpanded: (email: string) => void;
  onSaved: (metadata: AccountMetadata) => void;
  onMove: (email: string, direction: -1 | 1) => void;
  onToggleFavorite: (email: string) => void;
};

const groupLabel = "text-xs font-medium text-muted-foreground";
const groupBorder = "min-w-0 border-t pt-2.5 lg:border-t-0 lg:pt-0";

export function FavoriteAccountView({ accounts, locale, display, expandedEmail, onToggleExpanded, onSaved, onMove, onToggleFavorite }: FavoriteAccountViewProps) {
  const de = locale === "de";
  const rowLayout = cn(
    "gap-x-4 px-3.5 lg:px-4",
    display.testContext && display.notes
      ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_2rem]"
      : display.testContext || display.notes
        ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)_2rem]"
        : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]"
  );
  return (
    <div className="rounded-xl border bg-card">
      <ul role="list" className="divide-y">
        {accounts.map((account, index) => {
          const expanded = expandedEmail === account.email;
          return <li key={account.email}>
            <AccountRowSummary account={account} locale={locale} expanded={expanded} showAgencies={display.testContext} showDomain={false}
              onToggle={() => onToggleExpanded(account.email)}>
              <FavoriteButton favorite locale={locale} name={account.displayName} onToggle={() => onToggleFavorite(account.email)} />
            </AccountRowSummary>
            {expanded && <div className={cn("relative grid min-w-0 gap-y-3 border-t py-3.5 sm:grid-cols-2", rowLayout)}>
              <FavoriteIdentity account={account} locale={locale} />
              <div className="grid min-w-0 grid-cols-2 content-start gap-x-3 gap-y-1.5 sm:col-span-2 lg:col-span-1 lg:grid-cols-1" role="group" aria-label={t(locale, "page.access")}>
                <OtpAccess account={account} locale={locale} favorite />
                <MailboxPassword account={account} locale={locale} />
              </div>
              {display.testContext && (
                <div className={cn(groupBorder, !display.notes && "sm:col-span-2 lg:col-span-1")}>
                  <FavoriteTestContext account={account} locale={locale} />
                </div>
              )}
              {display.notes && (
                <div className={cn(groupBorder, !display.testContext && "sm:col-span-2 lg:col-span-1")}>
                  <AccountInlineNotes account={account} locale={locale} onSaved={onSaved} />
                </div>
              )}
              <div className="absolute right-3.5 top-3.5 flex gap-1 lg:static lg:flex-col">
                <Button type="button" variant="outline" size="icon-sm"
                  aria-label={de ? `${account.displayName} nach oben verschieben` : `Move ${account.displayName} up`}
                  disabled={index === 0}
                  onClick={() => onMove(account.email, -1)}
                ><ChevronUpIcon /></Button>
                <Button type="button" variant="outline" size="icon-sm"
                  aria-label={de ? `${account.displayName} nach unten verschieben` : `Move ${account.displayName} down`}
                  disabled={index === accounts.length - 1}
                  onClick={() => onMove(account.email, 1)}
                ><ChevronDownIcon /></Button>
              </div>
            </div>}
          </li>;
        })}
      </ul>
    </div>
  );
}

function FavoriteIdentity({ account, locale }: { account: AccountView; locale: Locale }) {
  const de = locale === "de";
  const linked = (account.linkedAccess ?? []).filter((access) => !access.deleted && !access.deletionPending);
  const usernames = [...new Set(linked.map((access) => access.username).filter(Boolean))];
  const visibleRoles = accountRoleLabels(account, locale);

  return (
    <div className="min-w-0 sm:col-span-2 lg:col-span-1">
      <div className="flex min-h-8 min-w-0 items-center gap-0.5 pr-20 lg:min-h-0 lg:pr-0">
        <span className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]" data-testmails-search-text>{account.email}</span>
        <CopyButton value={account.email} label={de ? "E-Mail kopieren" : "Copy email"} compact />
      </div>
      {visibleRoles.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">
        {visibleRoles.map((role) => <Badge key={role} variant="secondary" className="max-w-full whitespace-normal [overflow-wrap:anywhere]" data-testmails-search-text>{role}</Badge>)}
      </div>}
      {account.metadata.documentedUsername && <dl>
        <dt className={groupLabel}>{de ? "Dokumentierter Benutzername" : "Documented username"}</dt>
        <dd><code className="text-xs [overflow-wrap:anywhere]" data-testmails-search-text>{account.metadata.documentedUsername}</code></dd>
      </dl>}
      {usernames.length > 0 && <dl>
        <dt className={groupLabel}>{de ? "Benutzername" : "Username"}</dt>
        {usernames.map((username) => <dd key={username}><code className="text-xs [overflow-wrap:anywhere]" data-testmails-search-text>{username}</code></dd>)}
      </dl>}
    </div>
  );
}

function MailboxPassword({ account, locale }: { account: AccountView; locale: Locale }) {
  const de = locale === "de";
  const [revealed, setRevealed] = useState(false);
  const revealLabel = revealed
    ? (de ? "Mail-Passwort maskieren" : "Hide mailbox password")
    : (de ? "Mail-Passwort anzeigen" : "Show mailbox password");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className={groupLabel}>{de ? "Mail-Passwort" : "Mailbox password"}</div>
      <div className="flex min-w-0 items-center gap-1">
        <code data-testmails-search-private className="min-w-0 flex-1 truncate text-xs">{revealed ? account.password : "••••••••"}</code>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRevealed(!revealed)} aria-label={revealLabel}>
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <CopyButton value={account.password} label={de ? "Mail-Passwort kopieren" : "Copy mailbox password"} compact />
      </div>
    </div>
  );
}

function FavoriteTestContext({ account, locale }: { account: AccountView; locale: Locale }) {
  const de = locale === "de";
  const { agencies, carrier, postalCode, supervisor, shippedVersion } = account.metadata;
  const agencyNames = [...new Set(agencies ?? [])];
  const topics = accountTopicLabels(account, locale);
  const passwordDate = accountPasswordDate(account, locale);

  return (
    <section className="flex min-w-0 flex-col gap-1 text-sm [overflow-wrap:anywhere]" aria-label={de ? "Testkontext" : "Test context"}>
      <h3 className={groupLabel}>{de ? "Beratungsstellen" : "Counselling centres"}</h3>
      {agencyNames.length > 0 ? (
        <ul role="list" className="flex flex-wrap gap-1">
          {agencyNames.map((agency) => <li key={agency} className="min-w-0">
            <Badge variant="outline" className="max-w-full rounded-md whitespace-normal [overflow-wrap:anywhere]" data-testmails-search-text>{agency}</Badge>
          </li>)}
        </ul>
      ) : <p className="text-xs text-muted-foreground">{de ? "Nicht hinterlegt" : "Not documented"}</p>}
      {topics.length > 0 && <>
        <h3 className={groupLabel}>{de ? "Themen in ORISO" : "Topics in ORISO"}</h3>
        <ul className="flex flex-wrap gap-1" role="list">
          {topics.map((topic) => <li key={topic} className="tag-pill tag-topic whitespace-normal" data-testmails-search-text>{topic}</li>)}
        </ul>
      </>}
      <AccountAccessDate account={account} locale={locale} />
      {carrier && <p><span className={groupLabel}>{de ? "Träger" : "Provider"}</span>{" "}
        <span data-testmails-search-text>{carrier}</span></p>}
      {postalCode && <p><span className={groupLabel}>{de ? "Postleitzahl" : "Postal code"}</span>{" "}
        <span data-testmails-search-text>{postalCode}</span></p>}
      {supervisor && <p className="text-xs text-muted-foreground">Supervisor · <span data-testmails-search-text>{supervisor}</span></p>}
      {shippedVersion ? <p className="text-xs text-muted-foreground">Version <span data-testmails-search-text>{shippedVersion}</span></p>
        : passwordDate && <p className="text-xs text-muted-foreground">
          {de ? "App-Passwort gesetzt am" : "App password set on"} <span data-testmails-search-text>{passwordDate}</span>
        </p>}
    </section>
  );
}
