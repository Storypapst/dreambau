import { WorkStateDetails } from "./work-state-details";
import {
  safeLink,
  reasonLabel,
  reasonNext,
  relativeAge,
  absoluteTime,
} from "@/work-state-presentation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { Locale } from "@/i18n";
import {
  loadAttention,
  refreshWorkState,
  type AttentionList,
  type AttentionQuery,
  type AttentionRow,
  type AttentionView,
} from "@/work-state-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

const views: AttentionView[] = ["action", "waiting", "merged", "data"];
function readQuery(): AttentionQuery {
  const params = new URLSearchParams(window.location.search);
  const candidate = params.get("wsView");
  const priority = params.get("wsPriority");
  const cursor = Number(params.get("wsPage") ?? 0);
  return {
    view: views.includes(candidate as AttentionView)
      ? (candidate as AttentionView)
      : "action",
    repositoryId: params.get("wsRepo") || undefined,
    person: params.get("wsPerson") || undefined,
    reason: params.get("wsReason") || undefined,
    priority: ["P0", "P1", "P2", "P3", "unknown"].includes(priority ?? "")
      ? (priority as AttentionQuery["priority"])
      : undefined,
    cursor: Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : 0,
  };
}
export function WorkStateDashboard({
  locale,
  onBack,
}: {
  locale: Locale;
  onBack: () => void;
}) {
  const de = locale === "de";
  const text = (german: string, english: string) => (de ? german : english);
  const [query, setQuery] = useState<AttentionQuery>(readQuery);
  const [revision, reload] = useState(0);
  const [data, setData] = useState<AttentionList | null>(null);
  const [detailRevision, refreshDetails] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detailOrigin = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<{
    repositoryId: string;
    number: number;
  } | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    const pop = () => setQuery(readQuery());
    window.addEventListener("popstate", pop);
    const interval = window.setInterval(
      () => reload((value) => value + 1),
      60000,
    );
    return () => {
      window.removeEventListener("popstate", pop);
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "work-state");
    for (const [key, param] of [
      ["view", "wsView"],
      ["repositoryId", "wsRepo"],
      ["person", "wsPerson"],
      ["priority", "wsPriority"],
      ["reason", "wsReason"],
      ["cursor", "wsPage"],
    ] as const) {
      const value = query[key];
      if (value === undefined || value === 0) url.searchParams.delete(param);
      else url.searchParams.set(param, String(value));
    }
    window.history.replaceState(null, "", url.pathname + url.search);
    loadAttention(query, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setSelected((current) =>
            current &&
            result.repositories.some((repo) => repo.id === current.repositoryId)
              ? current
              : null,
          );
          refreshDetails((value) => value + 1);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setSelected(null);
          setError(cause instanceof Error ? cause.message : "failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, revision]);

  const update = (patch: Partial<AttentionQuery>) =>
    setQuery((current) => ({
      ...current,
      ...patch,
      cursor: patch.cursor ?? 0,
    }));
  const label = (code: string) => reasonLabel(locale, code);
  const next = (code: string) => reasonNext(locale, code);
  const age = (at: string | null | undefined) => relativeAge(locale, at);
  const absolute = (at: string | null | undefined) => absoluteTime(locale, at);
  const unknown = text("Unbekannt", "Unknown");
  const notRecorded = text("Nicht erfasst", "Not recorded");
  async function enqueue() {
    if (!data) return;
    setQueueing(true);
    setQueued(false);
    try {
      for (const repo of data.repositories.filter(
        (repo) => !query.repositoryId || repo.id === query.repositoryId,
      ))
        await refreshWorkState(repo.id);
      setQueued(true);
      reload((value) => value + 1);
    } catch (cause) {
      setData(null);
      setSelected(null);
      setError(cause instanceof Error ? cause.message : "failed");
    } finally {
      setQueueing(false);
    }
  }
  const filter = (
    key: "repositoryId" | "person" | "priority" | "reason",
    title: string,
    options: Array<{ value: string; label: string }>,
  ) => (
    <Field>
      <FieldLabel htmlFor={`ws-${key}`}>{title}</FieldLabel>
      <Select
        value={query[key] ?? "all"}
        onValueChange={(value) =>
          update({ [key]: value === "all" ? undefined : value })
        }
      >
        <SelectTrigger id={`ws-${key}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{text("Alle", "All")}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
  const renderRow = (row: AttentionRow) => (
    <Card key={`${row.pr.repositoryId}-${row.pr.number}`}>
      <CardHeader>
        <CardDescription>
          {row.repository.fullName} · #{row.pr.number}
        </CardDescription>
        <CardTitle className="break-words">
          <a href={safeLink(row.pr.url)} target="_blank" rel="noreferrer">
            {row.pr.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {row.reasons.map((reason, index) => (
            <a
              key={`${reason.code}-${index}`}
              href={safeLink(reason.url)}
              title={`${next(reason.code)} · ${absolute(reason.observedAt)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Badge
                variant={
                  reason.category === "action" ? "destructive" : "outline"
                }
              >
                {label(reason.code)}
                {reason.count !== undefined ? ` (${reason.count})` : ""}
              </Badge>
            </a>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {text("Zuständig", "Responsible")}:{" "}
          {row.assignments.map((item) => item.owner ?? unknown).join(", ") ||
            unknown}{" "}
          · {text("Priorität", "Priority")}:{" "}
          {row.assignments.map((item) => item.priority ?? unknown).join(", ") ||
            unknown}
        </p>
        <p
          className="text-sm text-muted-foreground"
          title={absolute(row.observedAt)}
        >
          {text("Quelle geprüft", "Source observed")}: {age(row.observedAt)}
          {row.pr.lifecycle === "merged"
            ? ` · ${text("Deployment", "Deployment")}: ${notRecorded}`
            : ""}
        </p>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-3">
        <span className="text-sm">
          {row.reasons[0]
            ? next(row.reasons[0].code)
            : text(
                "Merge ansehen; Abnahme getrennt prüfen",
                "Inspect merge; verify acceptance separately",
              )}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            detailOrigin.current = event.currentTarget;
            setSelected({
              repositoryId: row.pr.repositoryId,
              number: row.pr.number,
            });
          }}
        >
          {text("Details", "Details")}
        </Button>
      </CardFooter>
    </Card>
  );
  return (
    <section
      className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6"
      aria-label={text("ORISO Arbeitsstand", "ORISO work state")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          {text("Zurück", "Back")}
        </Button>
        <Button
          variant="outline"
          disabled={loading || queueing || !data?.repositories.length}
          onClick={() => void enqueue()}
        >
          <RefreshCw data-icon="inline-start" />
          {queueing
            ? text("Wird vorgemerkt…", "Queueing…")
            : text("Quelle aktualisieren", "Refresh source")}
        </Button>
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {text("ORISO Arbeitsstand", "ORISO work state")}
        </h1>
        <p className="text-muted-foreground">
          {text(
            "Pull Requests mit belegtem Grund, Quelle und nächstem Schritt.",
            "Pull requests with a source-backed reason and next step.",
          )}
        </p>
        {data?.mode === "polling_pilot" && (
          <Badge variant="outline">
            {text(
              "Pollingpilot · veraltet nach 15 Minuten",
              "Polling pilot · stale after 15 minutes",
            )}
          </Badge>
        )}
      </header>
      {queued && (
        <p role="status">
          {text(
            "Aktualisierung vorgemerkt. Angezeigt bleibt der letzte bestätigte Stand.",
            "Refresh queued. The last confirmed observations remain visible.",
          )}
        </p>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>
            {error === "scope_denied"
              ? text("Zugriff nicht freigegeben", "Access not granted")
              : text(
                  "Arbeitsstand konnte nicht geladen werden",
                  "Could not load work state",
                )}
          </AlertTitle>
          <AlertDescription>
            {text(
              "Bitte Zugriff oder Dienst prüfen und erneut laden.",
              "Check access or service availability and retry.",
            )}
            <Button
              variant="outline"
              onClick={() => reload((value) => value + 1)}
            >
              {text("Erneut laden", "Retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data && (
        <>
          <FieldGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {filter(
              "repositoryId",
              "Repository",
              data.repositories.map((repo) => ({
                value: repo.id,
                label: repo.fullName,
              })),
            )}
            {filter("person", text("Zuständig", "Responsible"), [
              { value: "unknown", label: unknown },
              ...data.options.people.map((person) => ({
                value: person,
                label: person,
              })),
            ])}
            {filter("priority", text("Priorität", "Priority"), [
              ...["P0", "P1", "P2", "P3"].map((priority) => ({
                value: priority,
                label: priority,
              })),
              { value: "unknown", label: unknown },
            ])}
            {filter(
              "reason",
              text("Grund", "Reason"),
              data.options.reasons.map((reason) => ({
                value: reason,
                label: label(reason),
              })),
            )}
          </FieldGroup>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery({ view: query.view })}
            >
              {text("Filter zurücksetzen", "Reset filters")}
            </Button>
          </div>
        </>
      )}
      {data?.repositories.some(
        (repo) => repo.coverage !== "complete" || repo.errorCode,
      ) && (
        <Alert>
          <AlertTitle>{text("Teilweise Daten", "Partial data")}</AlertTitle>
          <AlertDescription>
            {text(
              "Mindestens ein Repository ist nicht vollständig geprüft. Bestätigte Beobachtungen bleiben mit ihrem Alter sichtbar.",
              "At least one repository is incompletely observed. Confirmed observations retain their age.",
            )}
          </AlertDescription>
        </Alert>
      )}
      <Tabs
        value={query.view ?? "action"}
        onValueChange={(value) => update({ view: value as AttentionView })}
      >
        <TabsList
          className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 group-data-[orientation=horizontal]/tabs:h-auto"
          aria-label={text("Ansichten", "Views")}
        >
          {views.map((view, index) => (
            <TabsTrigger
              key={view}
              value={view}
              className="h-auto min-h-9 whitespace-normal"
            >
              {
                (de
                  ? [
                      "Handlung nötig",
                      "Wartet",
                      "Zuletzt gemerged",
                      "Datenstand",
                    ]
                  : [
                      "Action needed",
                      "Waiting",
                      "Recently merged",
                      "Data freshness",
                    ])[index]
              }
              {data ? ` (${data.counts[view]})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>
        {views.map((view) => (
          <TabsContent key={view} value={view} className="flex flex-col gap-4">
            {view === "data" && data && (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.repositories
                  .filter(
                    (repo) =>
                      !query.repositoryId || repo.id === query.repositoryId,
                  )
                  .map((repo) => (
                    <Card key={repo.id}>
                      <CardHeader>
                        <CardTitle className="break-all">
                          {repo.fullName}
                        </CardTitle>
                        <CardDescription>
                          {text("Repository-Inventar", "Repository inventory")}:{" "}
                          {repo.coverage === "complete"
                            ? text("Vollständig", "Complete")
                            : repo.coverage === "partial"
                              ? text("Teilweise", "Partial")
                              : unknown}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p title={absolute(repo.lastSuccessAt)}>
                          {text(
                            "Letzter erfolgreicher Abgleich",
                            "Last successful source scan",
                          )}
                          : {age(repo.lastSuccessAt)}
                        </p>
                        {repo.errorCode && (
                          <p className="break-all text-sm text-muted-foreground">
                            {repo.errorCode}
                          </p>
                        )}
                      </CardContent>
                      <CardFooter>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={queueing}
                          onClick={() => {
                            update({ repositoryId: repo.id });
                          }}
                        >
                          {text(
                            "PRs dieses Repositorys",
                            "PRs in this repository",
                          )}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
              </div>
            )}
            {loading ? (
              <div
                role="status"
                aria-label={text("Arbeitsstand lädt", "Loading work state")}
              >
                <p>{text("Lädt…", "Loading…")}</p>
                <Skeleton className="h-28 w-full" />
              </div>
            ) : data && data.items.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.items.map(renderRow)}
              </div>
            ) : (
              !error && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>
                      {data && !data.repositories.length
                        ? text(
                            "Keine Repository-Freigabe",
                            "No repository access",
                          )
                        : text(
                            "Keine passenden Pull Requests",
                            "No matching pull requests",
                          )}
                    </EmptyTitle>
                    <EmptyDescription>
                      {text(
                        "Filter und Datenstand prüfen. Eine leere Liste ist kein Nachweis bestandener Tests.",
                        "Check filters and source freshness. An empty list does not prove tests passed.",
                      )}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            )}
            {data && (
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={!query.cursor || loading}
                  onClick={() =>
                    update({
                      cursor: Math.max(0, Number(query.cursor ?? 0) - 25),
                    })
                  }
                >
                  {text("Vorherige", "Previous")}
                </Button>
                <span className="text-sm">
                  {data.total} {text("Treffer", "results")}
                </span>
                <Button
                  variant="outline"
                  disabled={data.nextCursor === null || loading}
                  onClick={() => update({ cursor: data.nextCursor ?? 0 })}
                >
                  {text("Weitere", "Next")}
                </Button>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <WorkStateDetails
        selection={selected}
        revision={detailRevision}
        locale={locale}
        mode={data?.mode ?? "normal"}
        onClose={() => setSelected(null)}
        onPermissionDenied={() => {
          setData(null);
          setError("scope_denied");
          setSelected(null);
        }}
        onRestoreFocus={() => detailOrigin.current?.focus()}
      />
    </section>
  );
}
