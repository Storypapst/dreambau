import { canonicalRole, labelRole, labelTopic, type Locale } from "@/i18n";
import type { AccountView } from "@/types";

export function accountRoleLabels(account: AccountView, locale: Locale) {
  const linked = (account.linkedAccess ?? []).filter((link) => !link.deleted && !link.deletionPending);
  const roles = new Set([...(account.metadata.roles ?? []), ...linked.flatMap((link) => link.roles ?? [])].map(canonicalRole));
  if (["platform-admin", "tenant-admin", "agency-admin"].some((role) => roles.has(role))) roles.delete("Admin");
  return [...new Set([...roles].map((role) => labelRole(locale, role)))];
}

export function accountTopicLabels(account: AccountView, locale: Locale) {
  return [...new Set((account.metadata.topics ?? []).map((topic) => labelTopic(locale, topic)))];
}

const accessDateFormats = {
  de: new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }),
  en: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" })
};

export function accountAccessDate(account: AccountView, locale: Locale) {
  const timestamp = account.access?.latestUseAt;
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return undefined;
  return { timestamp, value: accessDateFormats[locale].format(new Date(timestamp)) };
}

export function AccountAccessDate({ account, locale }: { account: AccountView; locale: Locale }) {
  const date = accountAccessDate(account, locale);
  if (!date) return null;
  return <p className="mt-1 text-xs text-muted-foreground">
    {locale === "de" ? "Letzter Testmails-Zugriff" : "Last Testmails access"}:{" "}
    <time dateTime={date.timestamp} data-testmails-search-text>{date.value}</time>
  </p>;
}
