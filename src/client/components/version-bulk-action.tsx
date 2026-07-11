import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccountView } from "@/types";
import type { Locale } from "@/i18n";

function greater(left: string, right: string) { const a = left.split(".").map(Number), b = right.split(".").map(Number); for (let i=0;i<3;i+=1) { const d=(a[i]??0)-(b[i]??0); if(d) return d>0; } return false; }
export function VersionBulkAction({ accounts, locale, onMarked }: { accounts: AccountView[]; locale: Locale; onMarked: (emails: string[]) => void }) {
  const [version, setVersion] = useState(""); const matches = useMemo(() => version ? accounts.filter((a) => a.metadata.shippedVersion && greater(a.metadata.shippedVersion, version)) : [], [accounts, version]);
  async function mark() { try { const emails = matches.map((a) => a.email); await api("/accounts/bulk-status", { method: "POST", body: JSON.stringify({ emails, status: "delete_candidate" }) }); onMarked(emails); toast.success(locale === "de" ? `${emails.length} Konten vorgemerkt` : `${emails.length} accounts marked`); } catch { toast.error(locale === "de" ? "Markierung fehlgeschlagen" : "Could not mark accounts"); } }
  return <div className="flex flex-wrap items-center gap-2"><Input className="w-32" aria-label={locale === "de" ? "Version größer als" : "Version greater than"} placeholder="Version >" value={version} onChange={(e) => setVersion(e.target.value)} /><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={!matches.length}><Trash2Icon data-icon="inline-start" />{matches.length} {locale === "de" ? "vormerken" : "mark"}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{locale === "de" ? "Konten als Löschkandidaten markieren?" : "Mark accounts as delete candidates?"}</AlertDialogTitle><AlertDialogDescription>{locale === "de" ? `${matches.length} Konten nach Version ${version} werden nur im Register markiert. Mailboxen werden nicht gelöscht.` : `${matches.length} accounts after version ${version} are marked only in the registry. Mailboxes are not deleted.`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{locale === "de" ? "Abbrechen" : "Cancel"}</AlertDialogCancel><AlertDialogAction onClick={mark}>{locale === "de" ? "Markieren" : "Mark"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
