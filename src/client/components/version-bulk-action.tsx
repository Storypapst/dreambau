import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountView } from "@/types";

function greater(left: string, right: string) { const a = left.split(".").map(Number), b = right.split(".").map(Number); for (let i=0;i<3;i+=1) { const d=(a[i]??0)-(b[i]??0); if(d) return d>0; } return false; }
export function VersionBulkAction({ accounts, onMarked }: { accounts: AccountView[]; onMarked: (emails: string[]) => void }) {
  const [version, setVersion] = useState(""); const matches = useMemo(() => version ? accounts.filter((a) => a.metadata.shippedVersion && greater(a.metadata.shippedVersion, version)) : [], [accounts, version]);
  async function mark() { try { const emails = matches.map((a) => a.email); await api("/accounts/bulk-status", { method: "POST", body: JSON.stringify({ emails, status: "delete_candidate" }) }); onMarked(emails); toast.success(`${emails.length} Konten vorgemerkt`); } catch { toast.error("Markierung fehlgeschlagen"); } }
  return <div className="flex flex-wrap items-center gap-2"><Input className="w-32" aria-label="Version größer als" placeholder="Version >" value={version} onChange={(e) => setVersion(e.target.value)} /><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={!matches.length}><Trash2Icon data-icon="inline-start" />{matches.length} vormerken</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Konten als Löschkandidaten markieren?</AlertDialogTitle><AlertDialogDescription>{matches.length} Konten nach Version {version} werden nur im Register markiert. Mailboxen werden nicht gelöscht.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={mark}>Markieren</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
