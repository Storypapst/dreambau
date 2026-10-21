import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";
import { loadPullDetail, type AttentionDetail } from "@/work-state-client";
import {
  safeLink,
  reasonLabel,
  reasonNext,
  relativeAge,
  absoluteTime,
} from "@/work-state-presentation";
import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
export function WorkStateDetails({
  selection,
  revision,
  locale,
  mode,
  onClose,
  onPermissionDenied,
  onRestoreFocus,
}: {
  selection: { repositoryId: string; number: number } | null;
  revision: number;
  locale: Locale;
  mode: "normal" | "polling_pilot";
  onClose: () => void;
  onPermissionDenied: () => void;
  onRestoreFocus: () => void;
}) {
  const [detail, setDetail] = useState<AttentionDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const text = (de: string, en: string) => (locale === "de" ? de : en);
  const unknown = text("Unbekannt", "Unknown");
  const notRecorded = text("Nicht erfasst", "Not recorded");
  const label = (code: string) => reasonLabel(locale, code);
  const next = (code: string) => reasonNext(locale, code);
  const age = (at: string | null | undefined) => relativeAge(locale, at);
  const absolute = (at: string | null | undefined) => absoluteTime(locale, at);
  useEffect(() => {
    if (!selection) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetail(null);
    setDetailError(false);
    loadPullDetail(selection.repositoryId, selection.number, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setDetailError(true);
          if (cause instanceof Error && cause.message === "scope_denied")
            onPermissionDenied();
        }
      });
    return () => controller.abort();
  }, [selection, revision]);
  return (
    <Sheet
      open={selection !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {detail?.pr.title ?? text("PR-Details", "PR details")}
          </SheetTitle>
          <SheetDescription>
            {text(
              "Gespeicherter Stand und erlaubte Arbeitsnotizen.",
              "Stored observations and authorized work notes.",
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          {detailError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {text("Details nicht verfügbar", "Details unavailable")}
              </AlertTitle>
            </Alert>
          ) : !detail ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <a
                href={safeLink(detail.pr.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 underline"
              >
                {text("Pull Request öffnen", "Open pull request")}
                <ExternalLink className="size-4" />
              </a>
              <p className="break-all text-sm">
                {detail.pr.base} ← {detail.pr.head} · {detail.pr.headSha}
              </p>
              <p>
                {text("Deployment", "Deployment")}: {notRecorded} ·{" "}
                {text("Dev-Abnahme", "Dev acceptance")}: {notRecorded}
              </p>
              <div className="flex flex-col gap-2">
                {Object.entries(detail.pr.facets).map(([name, facet]) => (
                  <p key={name} className="text-sm">
                    {
                      (
                        {
                          checks: text("Checks", "Checks"),
                          statuses: text("Commit-Statuses", "Commit statuses"),
                          reviewDecision: text(
                            "Reviewentscheidung",
                            "Review decision",
                          ),
                          reviewThreads: text(
                            "Review-Gespräche",
                            "Review conversations",
                          ),
                          mergeability: text("Mergefähigkeit", "Mergeability"),
                        } as Record<string, string>
                      )[name]
                    }
                    :{" "}
                    {facet?.coverage === "complete" &&
                    !facet.errorCode &&
                    facet.sourceRevision ===
                      `${detail.pr.headSha}:${detail.pr.baseSha}:${detail.pr.head}:${detail.pr.base}` &&
                    facet.observedAt &&
                    Date.now() - Date.parse(facet.observedAt) <=
                      (mode === "polling_pilot" ? 15 : 75) * 60000
                      ? text("Beobachtet", "Observed")
                      : text("Nicht aktuell belegt", "Not current")}{" "}
                    ·{" "}
                    <span title={absolute(facet?.observedAt)}>
                      {age(facet?.observedAt)}
                    </span>
                    {facet?.errorCode ? ` · ${facet.errorCode}` : ""}
                    <code className="block break-all">
                      {facet?.sourceRevision ?? unknown}
                    </code>
                    {Array.isArray(facet?.value) &&
                      facet.value.map((value, index) => {
                        if (
                          !value ||
                          typeof value !== "object" ||
                          Array.isArray(value)
                        )
                          return null;
                        const url = safeLink(value.url);
                        return url ? (
                          <a
                            className="block break-all underline"
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {String(
                              value.name ??
                                value.context ??
                                text("Quellbeleg", "Source evidence"),
                            )}{" "}
                            ·{" "}
                            {String(
                              value.conclusion ??
                                value.state ??
                                value.status ??
                                "",
                            )}
                          </a>
                        ) : null;
                      })}
                  </p>
                ))}
              </div>
              {detail.reasons.map((reason, index) => (
                <a
                  key={`${reason.code}-${index}`}
                  href={safeLink(reason.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {label(reason.code)} · {next(reason.code)}
                </a>
              ))}
              {detail.workItems.length ? (
                detail.workItems.map((item) => (
                  <Card key={item.id}>
                    <CardHeader>
                      <CardTitle>{item.goal}</CardTitle>
                      <CardDescription>
                        {item.owner ?? unknown} · {item.priority ?? unknown}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {item.checkpoint ? (
                        <>
                          <p>
                            <strong>
                              {text("Zuletzt verifiziert", "Last verified")}
                              :{" "}
                            </strong>
                            {item.checkpoint.lastVerifiedAction}
                          </p>
                          <p>
                            <strong>
                              {text("Nächster Schritt", "Next step")}:{" "}
                            </strong>
                            {item.checkpoint.nextAction}
                          </p>
                          {item.checkpoint.blockers.map((blocker, index) => (
                            <p key={index}>{blocker}</p>
                          ))}
                          {item.checkpoint.branch && (
                            <p className="break-all">
                              Branch: {item.checkpoint.branch} ·{" "}
                              {item.checkpoint.commit}
                            </p>
                          )}
                          {item.checkpoint.evidenceLinks.map((url) => (
                            <a
                              key={url}
                              href={safeLink(url)}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all underline"
                            >
                              {text("Beleg öffnen", "Open evidence")}
                            </a>
                          ))}
                          {item.checkpoint.optionalSessionUrl && (
                            <a
                              href={safeLink(
                                item.checkpoint.optionalSessionUrl,
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              {text(
                                "Gespeicherte Sitzung öffnen",
                                "Open saved session",
                              )}
                            </a>
                          )}
                        </>
                      ) : (
                        <p>
                          {text(
                            "Keine Fortsetzungsnotiz erfasst.",
                            "No continuation note recorded.",
                          )}
                        </p>
                      )}
                    </CardContent>
                    <CardFooter>
                      {item.links.map((link) => (
                        <a
                          key={link.url}
                          href={safeLink(link.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline"
                        >
                          {link.kind} {link.number ?? ""}
                        </a>
                      ))}
                    </CardFooter>
                  </Card>
                ))
              ) : (
                <p>
                  {text(
                    "Kein erlaubtes Arbeitspaket zugeordnet.",
                    "No authorized work item linked.",
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
