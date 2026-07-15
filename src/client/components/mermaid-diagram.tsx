import { useEffect, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function MermaidDiagram({ source, title }: { source: string; title: string }) {
  const id = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
        const result = await mermaid.render(`coordination-${id}`, source);
        if (active) setSvg(result.svg);
      })
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [id, source]);

  if (failed) {
    return <Alert variant="destructive"><AlertTitle>Diagramm konnte nicht geladen werden</AlertTitle><AlertDescription>Der beschreibende Ablauf bleibt rechts verfügbar.</AlertDescription></Alert>;
  }
  if (!svg) return <div className="min-h-64 animate-pulse rounded-lg bg-muted" aria-label="Diagramm wird geladen" />;
  return <div className="overflow-auto rounded-lg border bg-white p-4" role="img" aria-label={title} dangerouslySetInnerHTML={{ __html: svg }} />;
}
