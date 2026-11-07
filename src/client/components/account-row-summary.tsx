import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { domainClass } from "@/presentation";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import type { AccountView } from "@/types";
import { AccountQuickCopy, cancelPendingAccountCopy } from "./account-quick-copy";
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
  return (
    <div className="flex min-w-0 items-center gap-1 px-2 py-1 sm:gap-2 sm:px-3">
      <Button type="button" variant="ghost" size="sm" className="min-w-0 flex-1 justify-start gap-1 overflow-hidden px-1 sm:max-w-[35%] sm:flex-none sm:px-2"
        data-account-expander data-testmails-search-text aria-expanded={expanded} onClick={(event) => {
          const selection = window.getSelection();
          if (event.detail && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
          onToggle();
        }}>
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <span className="min-w-0 truncate" title={account.displayName}>{account.displayName}</span>
      </Button>
      {!expanded && <div className="hidden min-w-0 flex-1 items-center gap-0.5 sm:flex">
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={account.email}
          data-testmails-search-text>{account.email}</span>
        <CopyButton value={account.email} label={de ? "E-Mail kopieren" : "Copy email"} locale={locale} beforeCopy={cancelPendingAccountCopy} compact />
      </div>}
      {expanded && <span className="hidden flex-1 sm:block" />}
      {!expanded && agencies.length > 0 && <span className="hidden min-w-0 max-w-[30%] truncate text-xs text-muted-foreground sm:block"
        title={agencies.join(" · ")}>{agencies.map((agency, index) => <span key={agency}>
          {index > 0 && " · "}<span data-testmails-search-text>{agency}</span>
        </span>)}</span>}
      {showDomain && <Badge variant="outline" className={`domain-badge shrink-0 px-1 text-[10px] sm:px-2 sm:text-xs ${domainClass(account.domain)}`}>
        {account.domain}
      </Badge>}
      <AccountQuickCopy account={account} locale={locale} />
      {children}
    </div>
  );
}
