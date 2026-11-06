import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";
import type { AccountView } from "@/types";
import { CopyButton } from "./copy-button";

export function AccountRowSummary({ account, locale, expanded, onToggle, children, showAgencies = true }: {
  account: AccountView;
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  showAgencies?: boolean;
}) {
  const agencies = showAgencies ? account.metadata.agencies ?? [] : [];
  const de = locale === "de";
  return (
    <div className="flex min-w-0 items-center gap-1 px-2 py-1 sm:gap-2 sm:px-3">
      <Button type="button" variant="ghost" size="sm" className="min-w-0 shrink justify-start px-1.5 sm:px-2"
        data-account-expander data-testmails-search-text aria-expanded={expanded} onClick={(event) => {
          const selection = window.getSelection();
          if (event.detail && selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
          onToggle();
        }}>
        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        <span className="truncate" title={account.displayName}>{account.displayName}</span>
      </Button>
      {!expanded && <div className={agencies.length
        ? "hidden min-w-0 flex-1 items-center gap-0.5 sm:flex"
        : "flex min-w-0 flex-1 items-center gap-0.5"}>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={account.email}
          data-testmails-search-text>{account.email}</span>
        <CopyButton value={account.email} label={de ? "E-Mail kopieren" : "Copy email"} compact />
      </div>}
      {expanded && <span className="flex-1" />}
      {!expanded && agencies.length > 0 && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground sm:max-w-[30%] sm:flex-none"
        title={agencies.join(" · ")}>{agencies.map((agency, index) => <span key={agency}>
          {index > 0 && " · "}<span data-testmails-search-text>{agency}</span>
        </span>)}</span>}
      {children}
    </div>
  );
}
