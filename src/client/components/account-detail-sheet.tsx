import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CopyButton } from "./copy-button";
import type { AccountView } from "@/types";

export function AccountDetailSheet({ account, open, onOpenChange, onEdit }: { account: AccountView | null; open: boolean; onOpenChange: (value: boolean) => void; onEdit: () => void }) {
  if (!account) return null;
  const endpoints = [["IMAP", account.imap], ["SMTP", account.smtp], ["JMAP", account.jmap], ["CalDAV", account.caldav], ["CardDAV", account.carddav]];
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full overflow-hidden sm:max-w-xl"><SheetHeader><SheetTitle>{account.displayName}</SheetTitle><SheetDescription>{account.email}</SheetDescription></SheetHeader>
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
      <div className="flex flex-wrap gap-2"><Badge>{account.domain}</Badge><Badge variant={account.encryption.state === "encrypted" ? "default" : "secondary"}>{account.encryption.state === "encrypted" ? "S/MIME · AES-256" : "Unverschlüsselt"}</Badge><Badge variant="outline">{account.metadata.lifecycleStatus}</Badge></div>
      <section className="flex flex-col gap-2"><h3 className="font-semibold">Zugang</h3><div className="flex items-center justify-between rounded-lg border p-3"><span className="truncate">{account.displayName}</span><CopyButton value={account.displayName} label="Name kopieren" compact /></div><div className="flex items-center justify-between rounded-lg border p-3"><code className="truncate">{account.email}</code><CopyButton value={account.email} label="E-Mail kopieren" compact /></div><div className="flex items-center justify-between rounded-lg border p-3"><code>••••••••••••••••</code><CopyButton value={account.password} label="Passwort kopieren" compact /></div></section>
      <Separator />
      <section className="flex flex-col gap-2"><h3 className="font-semibold">Verbindungen</h3>{endpoints.map(([label, value]) => <div key={label} className="grid gap-1 rounded-lg border p-3"><span className="text-sm font-medium">{label}</span><div className="flex items-center justify-between gap-2"><code className="min-w-0 break-all text-xs text-muted-foreground">{value}</code><CopyButton value={value} label={`${label} kopieren`} compact /></div></div>)}</section>
      <Separator />
      <section className="flex flex-col gap-2"><h3 className="font-semibold">Verschlüsselung</h3>{account.encryption.state === "encrypted" ? <p className="text-sm text-muted-foreground">S/MIME mit AES-256; neue Nachrichten werden beim Ablegen verschlüsselt. Spamtraining ist deaktiviert. Die private PKCS#12-Identität liegt ausschließlich im Operator-Mac-Keychain.</p> : <p className="text-sm text-muted-foreground">Für oriso.org absichtlich deaktiviert, damit verschlüsselte und unverschlüsselte Testabläufe verglichen werden können.</p>}</section>
    </div><SheetFooter><Button onClick={onEdit}>Metadaten bearbeiten</Button></SheetFooter></SheetContent></Sheet>;
}
