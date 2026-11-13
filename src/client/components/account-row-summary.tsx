import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { domainClass } from "@/presentation";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import type { AccountView } from "@/types";
import { accountPrimaryRoles, accountTopicLabels } from "./account-context-display";
import { AccountQuickCopy } from "./account-quick-copy";
import { CopyButton } from "./copy-button";

export function AccountRowSummary({ account, locale, expanded, onToggle, children, showAgencies = true, showDomain = true }: {
  account: AccountView;
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  showAgencies?: boolean;
  showDomain?: boolean;
}) {
  const agencies = showAgencies ? account.metadata.agencies ?? [] : [];
  const de = locale === "de";
  const role = accountPrimaryRoles(account, locale);
  const roles = role.labels;
  const topics = showAgencies ? accountTopicLabels(account, locale) : [];
  const postcode = showAgencies ? account.metadata.postalCode : undefined;
  const carrier = showAgencies ? account.metadata.carrier : undefined;
  const contextLabels = [roles.join(" · "), agencies.join(" · "), carrier, postcode && `${de ? "PLZ" : "Postcode"} ${postcode}`, topics.join(" · ")].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-start gap-1 px-2 py-1 max-[360px]:gap-0.5 max-[360px]:px-1 sm:items-center sm:gap-2 sm:px-3">
      <Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 min-w-0 flex-1 justify-start gap-1 overflow-hidden py-1.5 has-[>svg]:px-1 sm:has-[>svg]:px-2"
        data-account-expander aria-expanded={expanded}
        aria-label={account.displayName} aria-description={expanded ? undefined : contextLabels || undefined} onClick={(event) => {
          const selection = window.getSelection();
          if (event.detail && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
          onToggle();
        }}>
        {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
          <span className="flex max-w-full min-w-0 items-center gap-2">
            <span className="max-w-full truncate font-semibold" title={account.displayName} data-testmails-search-text>{account.displayName}</span>
            {!expanded && roles.length > 0 && <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary" title={role.source === "linked" ? (de ? "Verifizierte App-Rolle" : "Verified app role") : (de ? "Dokumentierte Rolle" : "Documented role")} data-testmails-search-text>{roles[0]}{roles.length > 1 && ` +${roles.length - 1}`}</span>}
          </span>
          {!expanded && contextLabels && <span className="flex max-w-full min-w-0 flex-col items-start gap-0.5 overflow-hidden text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:gap-1 sm:text-xs" title={contextLabels}>
            {agencies.length > 0 && <span className="max-w-full whitespace-normal break-words text-left font-medium leading-tight sm:max-w-64 sm:truncate sm:whitespace-nowrap" data-testmails-search-text>{agencies[0]}{agencies.length > 1 && ` +${agencies.length - 1}`}</span>}
            {carrier && <span className="max-w-full truncate sm:max-w-48" data-testmails-search-text><span className="hidden sm:inline">· </span>{de ? "Träger" : "Provider"} {carrier}</span>}
            {postcode && <span className="shrink-0" data-testmails-search-text><span className="hidden sm:inline">· </span>{de ? "PLZ" : "ZIP"} {postcode}</span>}
            {topics.length > 0 && <span className="max-w-full whitespace-normal text-left leading-tight sm:max-w-40 sm:truncate sm:whitespace-nowrap" data-testmails-search-text><span className="hidden sm:inline">· </span>{de ? "ORISO-Thema" : "App topic"} {topics[0]}{topics.length > 1 && ` +${topics.length - 1}`}</span>}
          </span>}
        </span>
      </Button>
      {!expanded && <div className="hidden min-w-0 max-w-36 items-center gap-0.5 lg:flex">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={account.email}
          data-testmails-search-text>{account.email}</span>
        <CopyButton value={account.email} label={de ? "E-Mail kopieren" : "Copy email"} locale={locale} compact />
      </div>}
      {expanded && <span className="hidden flex-1 sm:block" />}
      {showDomain && <Badge variant="outline" className={`domain-badge hidden shrink-0 px-1 text-[10px] lg:inline-flex ${domainClass(account.domain)}`} title={account.domain}>
        {account.domain}
      </Badge>}
      <AccountQuickCopy account={account} locale={locale} />
      {children}
    </div>
  );
}
