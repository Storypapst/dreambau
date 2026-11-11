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

const accessActions = new Set(["secret_requested", "otp_requested", "environment_requested", "browser_session_opened"]);

export function AccountAccessDate({ account, locale }: { account: AccountView; locale: Locale }) {
  const event = account.access?.events?.find(({ action }) => accessActions.has(action));
  if (!event || !Number.isFinite(Date.parse(event.createdAt))) return null;
  const de = locale === "de";
  return <p className="mt-1 text-xs text-muted-foreground">
    {de ? "Letzter Testmails-Zugriff" : "Last Testmails access"}:{" "}
    <time dateTime={event.createdAt} data-testmails-search-text>
      {new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}
    </time>
  </p>;
}
