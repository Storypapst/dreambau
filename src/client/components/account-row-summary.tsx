import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { domainClass } from "@/presentation";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import type { AccountView } from "@/types";
import { accountRoleLabels, accountTopicLabels } from "./account-context-display";
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
  const roles = accountRoleLabels(account, locale);
  const topics = showAgencies ? accountTopicLabels(account, locale) : [];
  const postcode = showAgencies ? account.metadata.postalCode : undefined;
  const contextLabels = [roles.join(" · "), postcode && `${de ? "PLZ" : "Postcode"} ${postcode}`].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-1 px-2 py-1 max-[360px]:gap-0.5 max-[360px]:px-1 sm:gap-2 sm:px-3">
      <Button type="button" variant="ghost" size="sm" className="min-w-0 flex-1 justify-start gap-1 overflow-hidden has-[>svg]:px-1 sm:max-w-[35%] sm:flex-none sm:has-[>svg]:px-2"
        data-account-expander aria-expanded={expanded}
        aria-label={account.displayName} aria-description={expanded ? undefined : contextLabels || undefined} onClick={(event) => {
          const selection = window.getSelection();
          if (event.detail && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
          onToggle();
        }}>
        {expanded ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
        <span className="flex min-w-0 flex-col items-start sm:flex-row sm:items-center sm:gap-2">
          <span className="max-w-full truncate" title={account.displayName} data-testmails-search-text>{account.displayName}</span>
          {!expanded && contextLabels && <span className="max-w-full truncate text-[10px] text-muted-foreground sm:text-xs" title={contextLabels}>
            {roles.length > 0 && <><span data-testmails-search-text>{roles[0]}</span>{roles.length > 1 && ` +${roles.length - 1}`}</>}
            {roles.length > 0 && postcode && " · "}
            {postcode && <span>{de ? "PLZ" : "ZIP"} <span data-testmails-search-text>{postcode}</span></span>}
          </span>}
        </span>
      </Button>
      {!expanded && <div className="hidden min-w-0 flex-1 items-center gap-0.5 sm:flex">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={account.email}
          data-testmails-search-text>{account.email}</span>
        <CopyButton value={account.email} label={de ? "E-Mail kopieren" : "Copy email"} locale={locale} compact />
      </div>}
      {expanded && <span className="hidden flex-1 sm:block" />}
      {!expanded && (agencies.length > 0 || topics.length > 0) && (
        <div data-account-context-preview className="hidden min-w-0 max-w-[32%] items-center gap-2 text-xs text-muted-foreground sm:flex">
          <ContextPreview values={agencies} label={de ? "Beratungsstellen" : "Counselling centres"} />
          <ContextPreview values={topics} label={de ? "Themen in Testmails" : "Topics in Testmails"} />
        </div>
      )}
      {showDomain && <Badge variant="outline" className={`domain-badge shrink-0 px-1 text-[10px] sm:px-2 sm:text-xs ${domainClass(account.domain)}`} title={account.domain}>
        {account.domain}
      </Badge>}
      <AccountQuickCopy account={account} locale={locale} />
      {children}
    </div>
  );
}


function ContextPreview({ values, label }: { values: string[]; label: string }) {
  if (!values.length) return null;
  const fullText = `${label}: ${values.join(" · ")}`;
  return <span className="flex min-w-0 items-center gap-1" title={fullText} aria-label={fullText}>
    <span className="min-w-0 truncate" data-testmails-search-text>{values[0]}</span>
    {values.length > 1 && <span className="shrink-0 tabular-nums">+{values.length - 1}</span>}
  </span>;
}
