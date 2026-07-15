import { useEffect, useState } from "react";
import { ActivityIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { loadRuntimeStatuses, type RuntimeState, type RuntimeStatusView } from "@/coordination-client";
import type { Locale } from "@/i18n";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const stateLabels: Record<Locale, Record<RuntimeState, string>> = {
  de: { healthy: "Gesund", degraded: "Beeinträchtigt", offline: "Offline", unavailable: "Noch nicht verbunden" },
  en: { healthy: "Healthy", degraded: "Degraded", offline: "Offline", unavailable: "Not connected yet" }
};

export function RuntimeStatusCards({ locale, initialStatuses }: { locale: Locale; initialStatuses?: RuntimeStatusView[] }) {
  const [statuses, setStatuses] = useState<RuntimeStatusView[] | null>(initialStatuses ?? null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setFailed(false);
    try { setStatuses(await loadRuntimeStatuses()); }
    catch { setFailed(true); }
    finally { setRefreshing(false); }
  }

  useEffect(() => { if (!initialStatuses) void refresh(); }, [initialStatuses]);

  if (failed) return <Alert variant="destructive"><AlertTitle>{locale === "de" ? "Live-Status nicht erreichbar" : "Live status unavailable"}</AlertTitle><AlertDescription>{locale === "de" ? "Die Wissensansicht bleibt nutzbar. Bitte später erneut laden." : "The knowledge view remains available. Try again later."}</AlertDescription></Alert>;
  if (!statuses) return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label={locale === "de" ? "Live-Systeme werden geprüft" : "Checking live systems"} />;

  return <section className="flex flex-col gap-4" aria-labelledby="runtime-status-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="runtime-status-heading" className="text-2xl font-semibold">{locale === "de" ? "Live-Systeme" : "Live systems"}</h2><p className="text-sm text-muted-foreground">{locale === "de" ? "Direkt geprüft – nicht aus einer Statusdatei kopiert." : "Probed directly, not copied from a status file."}</p></div><Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCwIcon data-icon="inline-start" />{locale === "de" ? "Neu prüfen" : "Refresh"}</Button></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{statuses.map((status) => <Card key={status.id}>
      <CardHeader><CardTitle className="flex items-center gap-2"><ActivityIcon />{status.name}</CardTitle><CardDescription>{status.project.toUpperCase()} · {status.environment}</CardDescription><CardAction><StateBadge state={status.state} locale={locale} /></CardAction></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">{status.latencyMs === null ? (locale === "de" ? "Keine Antwortzeit verfügbar" : "No latency available") : `${status.latencyMs} ms`}</p></CardContent>
      <CardFooter className="justify-between gap-3"><p className="text-xs text-muted-foreground">{new Date(status.checkedAt).toLocaleTimeString(locale === "de" ? "de-DE" : "en-GB")}</p><Button size="sm" variant="ghost" asChild><a href={status.url} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{locale === "de" ? "Öffnen" : "Open"}</a></Button></CardFooter>
    </Card>)}</div>
  </section>;
}

function StateBadge({ state, locale }: { state: RuntimeState; locale: Locale }) {
  const variant = state === "offline" ? "destructive" : state === "healthy" ? "secondary" : "outline";
  return <Badge variant={variant}>{stateLabels[locale][state]}</Badge>;
}
