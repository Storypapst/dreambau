import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, ExternalLinkIcon, GitBranchIcon, PlusIcon, RouteIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addCoordinationDiscussion,
  addCoordinationTag,
  loadCoordination,
  type CoordinationCatalog,
  type CoordinationItemView,
  type CoordinationProject
} from "@/coordination-client";
import type { Locale } from "@/i18n";
import { MermaidDiagram } from "./mermaid-diagram";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const labels = {
  de: {
    kicker: "Dreambau Control Plane",
    title: "Koordinationszentrum",
    description: "Ein Einstieg für Projektlogik, Entscheidungen, Prompts, Qualität und laufende Systeme.",
    back: "Zurück zu Testkonten",
    problem: "Welches Problem löst das?",
    details: "Details öffnen",
    resources: "Verknüpfte Quellen",
    steps: "Ablauf und Besonderheiten",
    tag: "Tag hinzufügen",
    add: "Hinzufügen",
    discussionLabel: "Bezeichnung",
    discussionUrl: "Slack-, GitHub- oder Matrix-Link",
    discussion: "Diskussion verknüpfen",
    empty: "Für dieses Projekt ist noch kein Bereich freigeschaltet."
  },
  en: {
    kicker: "Dreambau Control Plane",
    title: "Coordination center",
    description: "One entry point for project logic, decisions, prompts, quality, and running systems.",
    back: "Back to test accounts",
    problem: "What problem does this solve?",
    details: "Open details",
    resources: "Linked sources",
    steps: "Flow and specifics",
    tag: "Add tag",
    add: "Add",
    discussionLabel: "Label",
    discussionUrl: "Slack, GitHub, or Matrix link",
    discussion: "Link discussion",
    empty: "No area has been enabled for this project yet."
  }
} as const;

export function CoordinationDashboard({
  locale,
  onBack,
  initialCatalog
}: {
  locale: Locale;
  onBack: () => void;
  initialCatalog?: CoordinationCatalog;
}) {
  const copy = labels[locale];
  const [catalog, setCatalog] = useState<CoordinationCatalog | null>(initialCatalog ?? null);
  const [error, setError] = useState(false);
  const [project, setProject] = useState<CoordinationProject | null>(initialCatalog?.projects[0]?.id ?? null);

  useEffect(() => {
    if (initialCatalog) return;
    void loadCoordination()
      .then((next) => { setCatalog(next); setProject(next.projects[0]?.id ?? null); })
      .catch(() => setError(true));
  }, [initialCatalog]);

  function updateMetadata(itemId: string, tags: string[], discussions: CoordinationItemView["discussions"]) {
    setCatalog((current) => current && ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, tags, discussions } : item)
    }));
  }

  if (error) return <main className="grid min-h-screen place-items-center p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>Koordinationszentrum nicht erreichbar</AlertTitle><AlertDescription>Bitte Serverstatus und Passkey-Sitzung prüfen.</AlertDescription></Alert></main>;
  if (!catalog || !project) return <main className="min-h-screen animate-pulse bg-muted/40" aria-label="Koordinationszentrum wird geladen" />;

  return <main className="min-h-screen bg-muted/20">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-8 lg:px-8">
      <Button variant="ghost" className="w-fit" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />{copy.back}</Button>
      <div className="flex items-start gap-4"><div className="rounded-xl bg-primary p-3 text-primary-foreground"><RouteIcon /></div><div className="flex flex-col gap-2"><p className="text-sm font-medium text-muted-foreground">{copy.kicker}</p><h1 className="text-3xl font-bold tracking-tight md:text-4xl">{copy.title}</h1><p className="max-w-3xl text-muted-foreground">{copy.description}</p></div></div>
    </div></header>
    <section className="mx-auto max-w-[1600px] px-4 py-8 lg:px-8">
      <Tabs value={project} onValueChange={(value) => setProject(value as CoordinationProject)}>
        <TabsList>{catalog.projects.map((entry) => <TabsTrigger key={entry.id} value={entry.id}>{entry.name}</TabsTrigger>)}</TabsList>
        {catalog.projects.map((entry) => <TabsContent key={entry.id} value={entry.id} className="flex flex-col gap-6 pt-4">
          <div><h2 className="text-2xl font-semibold">{entry.name}</h2><p className="text-muted-foreground">{entry.description}</p></div>
          <ProjectCards items={catalog.items.filter((item) => item.projects.includes(entry.id))} copy={copy} onMetadata={updateMetadata} />
        </TabsContent>)}
      </Tabs>
    </section>
  </main>;
}

function ProjectCards({ items, copy, onMetadata }: { items: CoordinationItemView[]; copy: typeof labels.de | typeof labels.en; onMetadata: (itemId: string, tags: string[], discussions: CoordinationItemView["discussions"]) => void }) {
  if (!items.length) return <Card><CardContent><Empty><EmptyHeader><EmptyTitle>Noch keine Inhalte</EmptyTitle><EmptyDescription>{copy.empty}</EmptyDescription></EmptyHeader></Empty></CardContent></Card>;
  return <div className="grid gap-5 xl:grid-cols-2">{items.map((item) => <Card key={item.id}>
    <CardHeader><CardTitle className="text-xl">{item.title}</CardTitle><CardDescription>{item.summary}</CardDescription><CardAction><Badge variant="outline">{item.resources.length} Quellen</Badge></CardAction></CardHeader>
    <CardContent className="flex flex-col gap-5"><div className="rounded-lg border bg-muted/30 p-4"><p className="mb-1 text-sm font-semibold">{copy.problem}</p><p className="text-sm text-muted-foreground">{item.problem}</p></div><div className="flex flex-wrap gap-2">{item.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div></CardContent>
    <CardFooter className="justify-between gap-3"><div className="flex flex-wrap gap-2">{item.resources.slice(0, 3).map((resource) => <Badge key={`${resource.kind}-${resource.title}`} variant="outline">{resource.title}</Badge>)}</div><CoordinationDetail item={item} copy={copy} onMetadata={onMetadata} /></CardFooter>
  </Card>)}</div>;
}

export function CoordinationDetail({ item, copy, onMetadata }: { item: CoordinationItemView; copy: typeof labels.de | typeof labels.en; onMetadata: (itemId: string, tags: string[], discussions: CoordinationItemView["discussions"]) => void }) {
  const [tag, setTag] = useState("");
  const [discussionLabel, setDiscussionLabel] = useState("");
  const [discussionUrl, setDiscussionUrl] = useState("");
  const resourceGroups = useMemo(() => item.resources.reduce<Record<string, CoordinationItemView["resources"]>>(
    (groups, resource) => ({ ...groups, [resource.kind]: [...(groups[resource.kind] ?? []), resource] }),
    {}
  ), [item.resources]);
  async function saveTag() {
    if (!tag.trim()) return;
    try { const result = await addCoordinationTag(item.id, tag.trim()); onMetadata(item.id, result.tags, result.discussions); setTag(""); toast.success("Tag gespeichert"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Tag konnte nicht gespeichert werden"); }
  }
  async function saveDiscussion() {
    if (!discussionLabel.trim() || !discussionUrl.trim()) return;
    try { const result = await addCoordinationDiscussion(item.id, { label: discussionLabel.trim(), url: discussionUrl.trim() }); onMetadata(item.id, result.tags, result.discussions); setDiscussionLabel(""); setDiscussionUrl(""); toast.success("Diskussion verknüpft"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Link konnte nicht gespeichert werden"); }
  }
  return <Dialog><DialogTrigger asChild><Button><GitBranchIcon data-icon="inline-start" />{copy.details}</Button></DialogTrigger><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
    <DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>{item.summary}</DialogDescription></DialogHeader>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
      <div>{item.diagram ? <MermaidDiagram source={item.diagram} title={`${item.title} Ablaufdiagramm`} /> : <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">Für diesen Bereich ist noch kein Diagramm hinterlegt.</div>}</div>
      <div className="flex flex-col gap-6"><section className="flex flex-col gap-3"><h3 className="font-semibold">{copy.steps}</h3>{item.details.map((detail) => <div key={detail.title} className="border-l-2 border-primary pl-3"><h4 className="text-sm font-semibold">{detail.title}</h4><p className="text-sm text-muted-foreground">{detail.description}</p></div>)}</section>
      <Separator />
      <section className="flex flex-col gap-3"><h3 className="font-semibold">{copy.resources}</h3>{Object.entries(resourceGroups).map(([kind, resources]) => <div key={kind} className="flex flex-col gap-2"><Badge className="w-fit" variant="secondary">{kind}</Badge>{resources?.map((resource) => <div key={resource.title} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{resource.title}</h4>{resource.url && <Button size="icon-sm" variant="ghost" asChild><a href={resource.url} target="_blank" rel="noreferrer" aria-label={`${resource.title} öffnen`}><ExternalLinkIcon /></a></Button>}</div><p className="text-sm text-muted-foreground">{resource.description}</p></div>)}</div>)}</section>
      <Separator />
      <section className="flex flex-col gap-4"><div className="flex flex-wrap gap-2">{item.tags.map((value) => <Badge key={value} variant="secondary">{value}</Badge>)}</div><FieldGroup><Field orientation="responsive"><FieldLabel htmlFor={`tag-${item.id}`}>{copy.tag}</FieldLabel><Input id={`tag-${item.id}`} value={tag} onChange={(event) => setTag(event.target.value)} maxLength={40} /><Button type="button" onClick={saveTag}><PlusIcon data-icon="inline-start" />{copy.add}</Button></Field><Field><FieldLabel htmlFor={`discussion-label-${item.id}`}>{copy.discussionLabel}</FieldLabel><Input id={`discussion-label-${item.id}`} value={discussionLabel} onChange={(event) => setDiscussionLabel(event.target.value)} maxLength={80} /></Field><Field><FieldLabel htmlFor={`discussion-url-${item.id}`}>{copy.discussionUrl}</FieldLabel><Input id={`discussion-url-${item.id}`} type="url" value={discussionUrl} onChange={(event) => setDiscussionUrl(event.target.value)} /></Field><Button type="button" onClick={saveDiscussion}><PlusIcon data-icon="inline-start" />{copy.discussion}</Button></FieldGroup>{item.discussions.map((discussion) => <Button key={discussion.url} variant="outline" className="justify-start" asChild><a href={discussion.url} target="_blank" rel="noreferrer"><ExternalLinkIcon data-icon="inline-start" />{discussion.label}</a></Button>)}</section>
      </div>
    </div>
  </DialogContent></Dialog>;
}
