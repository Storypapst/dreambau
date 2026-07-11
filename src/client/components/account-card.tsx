import { useState } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountView } from "@/types";
import { CopyButton } from "./copy-button";

export function AccountCard({ account, onDetail, onEdit }: { account: AccountView; onDetail: () => void; onEdit: () => void }) {
  const [revealed, setRevealed] = useState(false);
  return <Card className="md:hidden"><CardHeader><div className="flex items-start justify-between gap-2"><div><CardTitle><button className="text-left hover:underline" onClick={onDetail}>{account.displayName}</button></CardTitle><CardDescription>{account.email}</CardDescription></div><span className={account.encryption.state === "encrypted" ? "h-10 w-1.5 rounded-full bg-primary" : "h-10 w-1.5 rounded-full bg-muted-foreground"} /></div></CardHeader><CardContent className="flex flex-col gap-3"><div className="flex flex-wrap gap-1"><Badge>{account.domain}</Badge><Badge variant="outline">{account.metadata.lifecycleStatus}</Badge><Badge variant="secondary">{account.metadata.fixtureQuality}</Badge></div><div className="flex items-center justify-between rounded-lg bg-muted p-2"><code className="truncate text-xs">{revealed ? account.password : "••••••••••••••••"}</code><div className="flex"><Button variant="ghost" size="icon-sm" onClick={() => setRevealed(!revealed)} aria-label="Passwort anzeigen oder maskieren">{revealed ? <EyeOffIcon /> : <EyeIcon />}</Button><CopyButton value={account.password} label="Passwort kopieren" compact /></div></div></CardContent><CardFooter className="justify-between"><CopyButton value={account.email} label="E-Mail" /><Button variant="outline" onClick={onEdit}><PencilIcon data-icon="inline-start" />Bearbeiten</Button></CardFooter></Card>;
}
