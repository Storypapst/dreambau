import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";
import { loadWorkspaceDocumentText, safeWorkspaceContentUrl } from "@/workspace-client";
import type { WorkspaceRunDetail } from "../../shared/workspace.js";
import { parseTestStepsReport, testStepsFilename, testStepsMaxBytes, type TestStepsReport } from "../../shared/workspace-test-steps.js";
import { Badge } from "./ui/badge";

export function EvidenceWorkspaceSteps({ detail, locale }: { detail: WorkspaceRunDetail; locale: Locale }) {
  const de = locale === "de";
  const candidates = detail.files.filter(file => file.filename === testStepsFilename && file.processingState === "ready"
    && (detail.source !== "evidence-run" || file.runId === detail.id));
  const report = candidates.length === 1 && candidates[0].byteSize <= testStepsMaxBytes ? candidates[0] : null;
  const url = report && safeWorkspaceContentUrl(report, "preview");
  const key = url ? detail.source + ":" + detail.id + ":" + url + ":" + report?.sha256 : null;
  const [state, setState] = useState<{ key: string; value: TestStepsReport | null }>();
  useEffect(() => {
    if (!key || !report) return;
    const controller = new AbortController();
    void loadWorkspaceDocumentText(report, controller.signal).then(parseTestStepsReport)
      .then(value => { if (!controller.signal.aborted) setState({ key, value }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, value: null }); });
    return () => controller.abort();
  }, [key, report]);
  const title = de ? "Testschritte" : "Test steps";
  const results = de ? { passed: "Bestanden", failed: "Fehlgeschlagen", skipped: "Übersprungen" }
    : { passed: "Passed", failed: "Failed", skipped: "Skipped" };
  const value = key && state?.key === key ? state.value : null;
  return <section aria-label={title}>
    <div className="workspace-section-heading"><h3>{title}</h3></div>
    {value ? <>
      <p className="workspace-hint">{de ? "Laut Schrittprotokoll." : "From the step report."}</p>
      <ol className="ml-6 list-decimal space-y-2 text-sm">
        {value.steps.map((step, index) => <li key={index} className="pl-1">
          <span>{step.label}</span>{" "}<Badge variant={step.result === "failed" ? "destructive" : "outline"}>{results[step.result]}</Badge>
        </li>)}
      </ol>
    </> : <p className="workspace-hint" role={key && state?.key !== key ? "status" : undefined}>
      {key && state?.key !== key ? (de ? "Schritte werden geladen …" : "Loading test steps …")
        : candidates.length > 1 ? (de ? "Mehrere Schrittprotokolle vorhanden. Öffne sie bei den Belegen." : "Multiple step reports are available under Evidence.")
        : candidates.length ? (de ? "Das Schrittprotokoll ist nicht lesbar." : "The step report could not be read.")
        : (de ? "Für diesen Eintrag wurden keine Schritte aufgezeichnet. GitHub-Checklisten stehen getrennt darunter." : "No steps were recorded for this entry. GitHub checklists are shown separately below.")}
    </p>}
  </section>;
}
