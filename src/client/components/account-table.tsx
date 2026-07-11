import { useState } from "react";
import { EyeIcon, EyeOffIcon, MoreHorizontalIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountView } from "@/types";
import { CopyButton } from "./copy-button";

export function AccountTable({ accounts, onDetail, onEdit }: { accounts: AccountView[]; onDetail: (account: AccountView) => void; onEdit: (account: AccountView) => void }) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const toggle = (email: string) => setRevealed((current) => { const next = new Set(current); next.has(email) ? next.delete(email) : next.add(email); return next; });
  return <div className="hidden overflow-hidden rounded-xl border bg-card md:block"><Table><TableHeader><TableRow><TableHead>Identität</TableHead><TableHead>Zugang</TableHead><TableHead>Rolle / Thema</TableHead><TableHead>Version / Status</TableHead><TableHead>Testdaten</TableHead><TableHead className="text-right">Aktionen</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.email}>
    <TableCell><button className="text-left font-medium hover:underline" onClick={() => onDetail(account)}>{account.displayName}</button><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{account.domain}</span><span className={account.encryption.state === "encrypted" ? "h-4 w-1 rounded-full bg-primary" : "h-4 w-1 rounded-full bg-muted-foreground"} aria-label={account.encryption.state === "encrypted" ? "verschlüsselt" : "unverschlüsselt"} /></div></TableCell>
    <TableCell><div className="flex items-center gap-1"><code className="text-xs">{account.email}</code><CopyButton value={account.email} label="E-Mail kopieren" compact /></div><div className="flex items-center gap-1"><code className="max-w-36 truncate text-xs text-muted-foreground">{revealed.has(account.email) ? account.password : "••••••••••••••••"}</code><Button variant="ghost" size="icon-sm" onClick={() => toggle(account.email)} aria-label="Passwort anzeigen oder maskieren">{revealed.has(account.email) ? <EyeOffIcon /> : <EyeIcon />}</Button><CopyButton value={account.password} label="Passwort kopieren" compact /></div></TableCell>
    <TableCell><div className="flex max-w-52 flex-wrap gap-1">{[...account.metadata.roles, ...account.metadata.topics].slice(0,3).map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}{!account.metadata.roles.length && !account.metadata.topics.length && <span className="text-xs text-muted-foreground">Nicht zugeordnet</span>}</div></TableCell>
    <TableCell><div className="text-sm">{account.metadata.shippedVersion || "—"}</div><Badge variant={account.metadata.lifecycleStatus === "delete_candidate" ? "destructive" : "outline"}>{account.metadata.lifecycleStatus}</Badge></TableCell>
    <TableCell><Badge variant={account.metadata.fixtureQuality === "gold" ? "default" : "secondary"}>{account.metadata.fixtureQuality}</Badge><div className="text-xs text-muted-foreground">{account.metadata.sampleFileCount} Dateien</div></TableCell>
    <TableCell><div className="flex justify-end gap-1"><CopyButton value={[account.displayName, account.email, account.password, account.domain, account.metadata.shippedVersion, account.metadata.lifecycleStatus].join("\t")} label="Zeile kopieren" compact /><Button variant="ghost" size="icon-sm" onClick={() => onEdit(account)} aria-label="Metadaten bearbeiten"><MoreHorizontalIcon /></Button></div></TableCell>
  </TableRow>)}</TableBody></Table></div>;
}
