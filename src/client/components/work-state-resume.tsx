import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadResumeContext } from "@/work-state-client";
import type { Locale } from "@/i18n";
export function WorkStateResume({
  id,
  locale,
  onPermissionDenied,
}: {
  id: string;
  locale: Locale;
  onPermissionDenied: () => void;
}) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [id]);
  async function copy() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState("copying");
    try {
      const context = await loadResumeContext(id, controller.signal);
      if (controller.signal.aborted || pending.current !== controller) return;
      await navigator.clipboard.writeText(JSON.stringify(context));
      if (!controller.signal.aborted && pending.current === controller)
        setState("copied");
    } catch (error) {
      if (controller.signal.aborted || pending.current !== controller) return;
      if (
        error instanceof Error &&
        [
          "scope_denied",
          "unauthorized",
          "session_required",
          "strong_auth_required",
          "HTTP 401",
          "HTTP 403",
        ].includes(error.message)
      )
        onPermissionDenied();
      else setState("error");
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={state === "copying"}
        onClick={() => void copy()}
      >
        {text("Fortsetzung kopieren", "Copy continuation")}
      </Button>
      <p className="text-xs text-muted-foreground">
        {text(
          "Vor dem Weiterarbeiten Repository, Branch, Commit und ungespeicherte Änderungen prüfen.",
          "Check repository, branch, commit and uncommitted changes before continuing.",
        )}
      </p>
      {state === "copied" && (
        <p role="status">
          {text("Fortsetzung kopiert", "Continuation copied")}
        </p>
      )}
      {state === "error" && (
        <p role="alert">
          {text(
            "Kopieren fehlgeschlagen. Zugriff und Zwischenablage prüfen.",
            "Could not copy. Check access and clipboard permissions.",
          )}
        </p>
      )}
    </div>
  );
}
