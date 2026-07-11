import type { AccountView } from "./types";

const domainClasses: Record<string, string> = {
  "dreambau.com": "domain-dreambau-com",
  "dreambau.de": "domain-dreambau-de",
  "getme.global": "domain-getme-global",
  "openresilience.cc": "domain-openresilience-cc",
  "oriso.org": "domain-oriso-org",
  "trail.ist": "domain-trail-ist"
};

export const domainClass = (domain: string) => domainClasses[domain] ?? "domain-neutral";

const workPriority = (account: AccountView) => account.metadata.lifecycleStatus === "active" ? 0 : account.metadata.lifecycleStatus === "unused" ? 2 : 1;

export function sortAccountsForWork(accounts: AccountView[]) {
  return [...accounts].sort((left, right) => workPriority(left) - workPriority(right) || left.displayName.localeCompare(right.displayName, "de"));
}
