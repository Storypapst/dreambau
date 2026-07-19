import { ExternalLinkIcon } from "lucide-react";
import { labelLifecycle, labelProject, t, type Locale } from "@/i18n";
import { domainClass } from "@/presentation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CopyButton } from "./copy-button";
import type { AccountView } from "@/types";
import { OtpAccess } from "./otp-access";

export function AccountDetailSheet({ account, locale, open, onOpenChange, onEdit }: { account: AccountView | null; locale: Locale; open: boolean; onOpenChange: (value: boolean) => void; onEdit: () => void }) {
  if (!account) return null;
  const endpoints = [["IMAP", account.imap], ["SMTP", account.smtp], ["JMAP", account.jmap], ["CalDAV", account.caldav], ["CardDAV", account.carddav]];
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-hidden sm:max-w-xl"><SheetHeader><SheetTitle>{account.displayName}</SheetTitle><SheetDescription>{account.email}</SheetDescription></SheetHeader>
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
      <div className="flex flex-wrap gap-2"><Badge variant="outline" className={`domain-badge ${domainClass(account.domain)}`}>{account.domain}</Badge><Badge variant={account.encryption.state === "encrypted" ? "default" : "secondary"}>{account.encryption.state === "encrypted" ? "S/MIME · AES-256" : t(locale, "page.unencrypted")}</Badge><Badge variant="outline">{labelLifecycle(locale, account.metadata.lifecycleStatus)}</Badge><Badge variant="outline">{labelProject(locale, account.metadata.project)}</Badge></div>
      <section className="flex flex-col gap-2"><h3 className="font-semibold">{t(locale, "page.access")}</h3><div className="flex items-center justify-between rounded-lg border p-3"><span className="truncate">{account.displayName}</span><CopyButton value={account.displayName} label={locale === "de" ? "Name kopieren" : "Copy name"} compact /></div><div className="flex items-center justify-between rounded-lg border p-3"><code className="truncate">{account.email}</code><div className="flex gap-1"><Button asChild size="sm"><a href="https://mail.dreambau.com/" target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{t(locale, "page.openMail")}</a></Button><CopyButton value={account.email} label={locale === "de" ? "E-Mail kopieren" : "Copy email"} compact /></div></div><div className="flex items-center justify-between rounded-lg border p-3"><code>••••••••••••••••</code><CopyButton value={account.password} label={locale === "de" ? "Passwort kopieren" : "Copy password"} compact /></div></section>
      <section className="flex flex-col gap-2"><h3 className="font-semibold">{locale === "de" ? "App-Login & OTP" : "App login & OTP"}</h3><OtpAccess account={account} locale={locale} /></section>
      <Separator />
      <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">{locale === "de" ? "Technische Verbindungen" : "Technical connections"}</summary><div className="mt-3 flex flex-col gap-2">{endpoints.map(([label, value]) => <div key={label} className="grid gap-1 rounded-lg bg-muted/60 p-3"><span className="text-sm font-medium">{label}</span><div className="flex items-center justify-between gap-2"><code className="min-w-0 break-all text-xs text-muted-foreground">{value}</code><CopyButton value={value} label={`${label} ${locale === "de" ? "kopieren" : "copy"}`} compact /></div></div>)}</div></details>
      <section className="flex flex-col gap-2"><h3 className="font-semibold">{locale === "de" ? "Verschlüsselung" : "Encryption"}</h3>{account.encryption.state === "encrypted" ? <p className="text-sm text-muted-foreground">{locale === "de" ? "S/MIME mit AES-256; neue Nachrichten werden beim Ablegen verschlüsselt. Die private Identität liegt ausschließlich im Operator-Mac-Keychain." : "S/MIME with AES-256; new messages are encrypted when stored. The private identity remains only in the operator Mac Keychain."}</p> : <p className="text-sm text-muted-foreground">{locale === "de" ? "Für oriso.org absichtlich deaktiviert, damit verschlüsselte und unverschlüsselte Testabläufe verglichen werden können." : "Intentionally disabled for oriso.org to compare encrypted and unencrypted test flows."}</p>}</section>
    </div><SheetFooter><Button onClick={onEdit}>{locale === "de" ? "Metadaten bearbeiten" : "Edit metadata"}</Button></SheetFooter></SheetContent></Sheet>;
}
