import { useEffect, useState } from "react";
import { loadAccountRuns, runDeepLink } from "@/workspace-client";
import type { WorkspaceRunSummary } from "../../shared/workspace.js";
import type { Locale, } from "@/i18n";
import type { TeamProject } from "@/types";

export function AccountRunLinks({ email, project, locale }: { email: string; project: TeamProject; locale: Locale }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; runs: WorkspaceRunSummary[] }>({ status: "loading", runs: [] });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", runs: [] });
    void loadAccountRuns(email, controller.signal).then(({ runs }) => setState({ status: "ready", runs }))
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error", runs: [] }); });
    return () => controller.abort();
  }, [email]);
  const de = locale === "de";
  return <section className="mt-2 rounded-lg border bg-muted/20 p-3" aria-label={de ? "Verwendet in E2E-Läufen" : "Used in E2E runs"}>
    <h3 className="text-sm font-semibold">{de ? "Verwendet in E2E-Läufen" : "Used in E2E runs"}</h3>
    {state.status === "loading" ? <p className="text-xs text-muted-foreground">{de ? "Lade Testläufe…" : "Loading runs…"}</p>
      : state.status === "error" ? <p role="alert" className="text-xs text-destructive">{de ? "Testläufe konnten nicht geladen werden." : "Runs could not be loaded."}</p>
      : state.runs.length === 0 ? <p className="text-xs text-muted-foreground">{de ? "Noch kein Testlauf ausdrücklich zugeordnet." : "No run explicitly associated yet."}</p>
      : <ul className="mt-1 space-y-1">{state.runs.map(run => <li key={run.source+":"+run.id}>
        <a className="text-sm underline underline-offset-4" href={runDeepLink(run.source, run.id, project)}>
          {run.title} · {run.environment} · {new Date(run.createdAt).toLocaleDateString(de ? "de-DE" : "en-GB")}
        </a>
      </li>)}</ul>}
  </section>;
}
