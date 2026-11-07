import { distinctRoleOptions, labelRoleWithEnvironment, type Locale } from "@/i18n";
import type { LinkedTestAccount } from "@/types";

export function LinkedRoleTags({ linkedAccess = [], locale }: { linkedAccess?: LinkedTestAccount[]; locale: Locale }) {
  const active = linkedAccess.filter((link) => !link.deleted && !link.deletionPending && link.roles.length);
  if (!active.length) return null;
  const label = locale === "de" ? "Aus Verknüpfung" : "From linked account";
  const explanation = locale === "de"
    ? "Diese Rollen stammen aus dem verknüpften Konto und können hier nicht geändert werden. ORISO-Berechtigungen werden hier nicht bearbeitet."
    : "These roles come from the linked account and cannot be changed here. ORISO permissions are not edited here.";
  return <div role="group" aria-label={label} title={explanation} className="flex min-w-0 flex-col gap-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-wrap gap-1.5">{active.flatMap((link) => distinctRoleOptions(link.roles).map((role) =>
      <span key={`${link.id}:${role}`} className="tag-pill tag-role" data-testmails-search-text>{labelRoleWithEnvironment(locale, role, [link])}</span>
    ))}</div>
  </div>;
}
