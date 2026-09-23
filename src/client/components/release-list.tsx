import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArchiveIcon, ArrowLeftIcon, CheckIcon, DownloadIcon, FileTextIcon, FilterXIcon, ListChecksIcon, MessageSquareIcon, PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addReleaseComment,
  addReleaseOption,
  archiveReleaseItem,
  createReleaseItem,
  loadReleaseActivity,
  loadReleaseList,
  loadReleaseLists,
  optionColors,
  releaseCsvUrl,
  updateReleaseItem,
  type ItemPatch,
  type ReleaseChange,
  type ReleaseComment,
  type ReleaseItem,
  type ReleaseListDetail,
  type ReleaseOption,
  type ReleaseSelectField
} from "@/release-list-client";
import type { Locale } from "@/i18n";
import { renderMarkdown } from "@/safe-markdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const copy = {
  de: {
    kicker: "Release-Planung", back: "Zurück zu Testkonten", export: "CSV exportieren", add: "Neues Feature", search: "Features durchsuchen",
    clear: "Filter zurücksetzen", showing: (shown: number, total: number) => `${shown} von ${total} Features`, empty: "Keine Features gefunden",
    emptyHint: "Filter oder Suchbegriff anpassen.", noList: "Noch keine Release-Liste für deine Projekte", noListHint: "Die Liste wird auf dem Server importiert.",
    loadError: "Release-Liste konnte nicht geladen werden", loadErrorHint: "Bitte Seite neu laden oder die Anmeldung prüfen.",
    create: (label: string) => `„${label}“ anlegen`, noOptions: "Keine Werte", none: "—", saved: "Gespeichert", saveFailed: "Speichern fehlgeschlagen",
    details: "Details", comments: "Kommentare", activity: "Änderungen", addComment: "Kommentar hinzufügen", post: "Senden", noComments: "Noch keine Kommentare.",
    archive: "Archivieren", archiveTitle: "Feature archivieren?", archiveText: "Das Feature und seine Unterpunkte verschwinden aus der Liste. Die Daten bleiben in der Datenbank.",
    cancel: "Abbrechen", newName: "Name des neuen Features", subItemOf: "Unterpunkt von", lastEdit: (who: string, when: string) => `Zuletzt geändert von ${who}, ${when}`,
    addSubItem: "Unterpunkt hinzufügen", findValue: "Wert suchen", openNotes: "Öffnen", addNotes: "Hinzufügen", preview: "Vorschau", edit: "Bearbeiten", save: "Speichern", close: "Schließen", notesHint: "Markdown: # Überschrift, **fett**, *kursiv*, - Liste, [Link](https://…)", notesEmpty: "Noch keine Release Notes.", discard: "Ungespeicherte Änderungen verwerfen?", linked: "Verknüpfte Features", created: "angelegt", archived: "archiviert"
  },
  en: {
    kicker: "Release planning", back: "Back to test accounts", export: "Export CSV", add: "New feature", search: "Search features",
    clear: "Clear filters", showing: (shown: number, total: number) => `${shown} of ${total} features`, empty: "No features found",
    emptyHint: "Adjust the filters or the search term.", noList: "No release list for your projects yet", noListHint: "The list is imported on the server.",
    loadError: "The release list could not be loaded", loadErrorHint: "Reload the page or check your sign-in.",
    create: (label: string) => `Create “${label}”`, noOptions: "No values", none: "—", saved: "Saved", saveFailed: "Saving failed",
    details: "Details", comments: "Comments", activity: "Changes", addComment: "Add a comment", post: "Post", noComments: "No comments yet.",
    archive: "Archive", archiveTitle: "Archive this feature?", archiveText: "The feature and its sub-items disappear from the list. The data stays in the database.",
    cancel: "Cancel", newName: "Name of the new feature", subItemOf: "Sub-item of", lastEdit: (who: string, when: string) => `Last changed by ${who}, ${when}`,
    addSubItem: "Add sub-item", findValue: "Find a value", openNotes: "Open", addNotes: "Add", preview: "Preview", edit: "Edit", save: "Save", close: "Close", notesHint: "Markdown: # Heading, **bold**, *italic*, - list, [link](https://…)", notesEmpty: "No release notes yet.", discard: "Discard unsaved changes?", linked: "Linked features", created: "created", archived: "archived"
  }
} as const;
type Copy = typeof copy.de | typeof copy.en;

const columns = {
  de: { name: "Feature", areas: "Bereiche", description: "Beschreibung", crossReferences: "Querverweise", devStatus: "Status auf Dev", functional: "Staging", statusComment: "Status-Kommentar", notes: "Notizen", releaseNotes: "Release Notes" },
  en: { name: "Feature", areas: "Areas", description: "Description", crossReferences: "Cross-references", devStatus: "Status on Dev", functional: "Staging", statusComment: "Status comment", notes: "Notes", releaseNotes: "Release notes" }
} as const;

const multiple: Record<ReleaseSelectField, boolean> = { areas: true, devStatus: false, functional: true };
type Filters = Record<ReleaseSelectField, string[]> & { query: string };
const noFilters: Filters = { query: "", areas: [], devStatus: [], functional: [] };

export function ReleaseListPage({ locale, onBack }: { locale: Locale; onBack: () => void }) {
  const text = copy[locale];
  const [detail, setDetail] = useState<ReleaseListDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const lists = await loadReleaseLists();
      if (!lists.length) return setState("empty");
      setDetail(await loadReleaseList(lists[0].id));
      setState("ready");
    } catch { setState((current) => current === "ready" ? current : "error"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  // Several people edit the same list; pick up their changes when the tab regains focus.
  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const replaceItem = (item: ReleaseItem) => setDetail((current) => current && ({ ...current, items: current.items.map((entry) => entry.id === item.id ? item : entry) }));
  async function patch(item: ReleaseItem, change: ItemPatch) {
    if (!detail) return;
    replaceItem({ ...item, ...change });
    try { replaceItem(await updateReleaseItem(detail.list.id, item.id, change)); }
    catch (error) { replaceItem(item); toast.error(`${text.saveFailed}: ${error instanceof Error ? error.message : ""}`); }
  }
  async function createOption(field: ReleaseSelectField, label: string) {
    if (!detail) throw new Error("no list");
    const color = optionColors[detail.options[field].length % optionColors.length];
    const option = await addReleaseOption(detail.list.id, field, label, color);
    setDetail((current) => current && ({ ...current, options: { ...current.options, [field]: [...current.options[field], option] } }));
    return option;
  }
  async function addItem(name: string, parentId: string | null = null) {
    if (!detail) return;
    try {
      const item = await createReleaseItem(detail.list.id, name, parentId);
      await refresh();
      setOpenItemId(item.id);
    } catch (error) { toast.error(`${text.saveFailed}: ${error instanceof Error ? error.message : ""}`); }
  }
  async function archive(item: ReleaseItem) {
    if (!detail) return;
    try {
      await archiveReleaseItem(detail.list.id, item.id);
      setDetail((current) => current && ({ ...current, items: current.items.filter((entry) => entry.id !== item.id && entry.parentId !== item.id) }));
      setOpenItemId(null);
    } catch (error) { toast.error(`${text.saveFailed}: ${error instanceof Error ? error.message : ""}`); }
  }

  const visible = useMemo(() => detail ? filterItems(detail.items, filters) : [], [detail, filters]);
  const filtered = filters.query.trim() !== "" || filters.areas.length > 0 || filters.devStatus.length > 0 || filters.functional.length > 0;

  if (state === "error") return <main className="grid min-h-screen place-items-center p-6"><Alert variant="destructive" className="max-w-lg"><AlertTitle>{text.loadError}</AlertTitle><AlertDescription>{text.loadErrorHint}</AlertDescription></Alert></main>;
  if (state === "empty") return <main className="grid min-h-screen place-items-center p-6"><Card className="max-w-lg"><CardContent><Empty><EmptyHeader><EmptyTitle>{text.noList}</EmptyTitle><EmptyDescription>{text.noListHint}</EmptyDescription></EmptyHeader></Empty><Button variant="ghost" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />{text.back}</Button></CardContent></Card></main>;
  if (!detail) return <main className="min-h-screen animate-pulse bg-muted/40" aria-label={text.kicker} />;

  const { list, options, items } = detail;
  const names = new Map(items.map((item) => [item.id, item.name]));
  const openItem = items.find((item) => item.id === openItemId) ?? null;

  return <main className="min-h-screen bg-muted/20">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-6 lg:px-8">
      <Button variant="ghost" className="w-fit" onClick={onBack}><ArrowLeftIcon data-icon="inline-start" />{text.back}</Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4"><div className="rounded-xl bg-primary p-3 text-primary-foreground"><ListChecksIcon /></div><div className="flex max-w-4xl flex-col gap-2"><p className="text-sm font-medium text-muted-foreground">{text.kicker}</p><h1 className="text-3xl font-bold tracking-tight">{list.title}</h1>{list.intro && <p className="text-muted-foreground">{list.intro}</p>}</div></div>
        <div className="flex flex-wrap gap-2"><NewItemButton label={text.add} placeholder={text.newName} onCreate={(name) => addItem(name)} /><Button variant="outline" asChild><a href={releaseCsvUrl(list.id)}><DownloadIcon data-icon="inline-start" />{text.export}</a></Button></div>
      </div>
      <StatusSummary items={items} options={options} filters={filters} onToggle={(field, id) => setFilters((current) => ({ ...current, [field]: toggle(current[field], id) }))} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80"><SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={text.search} placeholder={text.search} value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="pl-9" /></div>
        {(["areas", "devStatus", "functional"] as const).map((field) => <OptionPicker key={field} options={options[field]} value={filters[field]} multiple onChange={(value) => setFilters((current) => ({ ...current, [field]: value }))} text={text}>
          <Button variant="outline" aria-label={columns[locale][field]}>{columns[locale][field]}{filters[field].length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{filters[field].length}</span>}</Button>
        </OptionPicker>)}
        {filtered && <Button variant="ghost" onClick={() => setFilters(noFilters)}><FilterXIcon data-icon="inline-start" />{text.clear}</Button>}
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">{text.showing(visible.length, items.length)}</p>
      </div>
    </div></header>
    <section className="mx-auto max-w-[1800px] px-4 py-6 lg:px-8">
      {visible.length ? <Card className="py-0"><Table className="release-table min-w-[1660px] table-fixed">
        <colgroup><col className="w-72" /><col className="w-56" /><col className="w-80" /><col className="w-44" /><col className="w-40" /><col className="w-44" /><col className="w-72" /><col className="w-80" /><col className="w-64" /></colgroup>
        <TableHeader><TableRow>{(["name", "areas", "description", "crossReferences", "devStatus", "functional", "statusComment", "notes", "releaseNotes"] as const).map((key) => <TableHead key={key} className="text-muted-foreground">{columns[locale][key]}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{visible.map((item) => <TableRow key={item.id} className="align-top">
          <TableCell className="py-3 align-top whitespace-normal"><button type="button" className={`flex w-full items-start gap-2 text-left font-semibold hover:underline ${item.parentId ? "pl-5 font-medium text-muted-foreground" : ""}`} onClick={() => setOpenItemId(item.id)}>{item.parentId && <span aria-hidden>↳</span>}<span className="min-w-0 flex-1">{item.name}</span>{item.commentCount > 0 && <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground"><MessageSquareIcon className="size-3.5" />{item.commentCount}</span>}</button></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><SelectCell field="areas" label={columns[locale].areas} item={item} options={options.areas} text={text} onChange={(value) => patch(item, { areas: value })} onCreate={(label) => createOption("areas", label)} /></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><Clamp>{item.description}</Clamp></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><div className="flex flex-col gap-1">{item.crossReferenceIds.map((id) => names.has(id) && <button key={id} type="button" className="w-fit text-left text-sm text-blue-700 hover:underline" onClick={() => setOpenItemId(id)}>{names.get(id)}</button>)}{item.crossReferences && <Clamp>{item.crossReferences}</Clamp>}</div></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><SelectCell field="devStatus" label={columns[locale].devStatus} item={item} options={options.devStatus} text={text} onChange={(value) => patch(item, { devStatus: value[0] ?? null })} onCreate={(label) => createOption("devStatus", label)} /></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><SelectCell field="functional" label={columns[locale].functional} item={item} options={options.functional} text={text} onChange={(value) => patch(item, { functional: value })} onCreate={(label) => createOption("functional", label)} /></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><Clamp>{item.statusComment}</Clamp></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><Clamp>{item.notes}</Clamp></TableCell>
          <TableCell className="py-3 align-top whitespace-normal"><ReleaseNotesField item={item} text={text} title={columns[locale].releaseNotes} onSave={(value) => patch(item, { releaseNotes: value })} /></TableCell>
        </TableRow>)}</TableBody>
      </Table></Card> : <Card><CardContent><Empty><EmptyHeader><EmptyTitle>{text.empty}</EmptyTitle><EmptyDescription>{text.emptyHint}</EmptyDescription></EmptyHeader></Empty></CardContent></Card>}
    </section>
    <ItemSheet key={openItem?.id ?? "closed"} listId={list.id} item={openItem} items={items} options={options} locale={locale} text={text}
      onClose={() => setOpenItemId(null)} onPatch={patch} onCreateOption={createOption} onArchive={archive} onOpen={setOpenItemId}
      onAddSubItem={(name, parentId) => addItem(name, parentId)} onCommented={(itemId) => setDetail((current) => current && ({ ...current, items: current.items.map((entry) => entry.id === itemId ? { ...entry, commentCount: entry.commentCount + 1 } : entry) }))} />
  </main>;
}

export function filterItems(items: ReleaseItem[], filters: Filters) {
  const query = filters.query.trim().toLowerCase();
  return items.filter((item) =>
    (!query || [item.name, item.description, item.crossReferences, item.statusComment, item.notes, item.releaseNotes].some((value) => value.toLowerCase().includes(query)))
    && (!filters.areas.length || item.areas.some((id) => filters.areas.includes(id)))
    && (!filters.devStatus.length || (item.devStatus !== null && filters.devStatus.includes(item.devStatus)))
    && (!filters.functional.length || item.functional.some((id) => filters.functional.includes(id))));
}

function toggle(values: string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }

function Clamp({ children }: { children: string }) {
  if (!children) return null;
  return <p className="line-clamp-4 text-sm whitespace-pre-line text-foreground/90" title={children}>{children}</p>;
}

export function OptionPill({ option }: { option: ReleaseOption }) {
  return <span className={`opt-pill opt-${option.color}`}>{option.label}</span>;
}

function StatusSummary({ items, options, filters, onToggle }: { items: ReleaseItem[]; options: ReleaseListDetail["options"]; filters: Filters; onToggle: (field: "devStatus" | "functional", id: string) => void }) {
  const count = (field: "devStatus" | "functional", id: string) => items.filter((item) => field === "devStatus" ? item.devStatus === id : item.functional.includes(id)).length;
  return <div className="flex flex-wrap gap-x-6 gap-y-2">{(["devStatus", "functional"] as const).map((field) => <div key={field} className="flex flex-wrap items-center gap-1.5">{options[field].map((option) => {
    const active = filters[field].includes(option.id);
    return <button key={option.id} type="button" aria-pressed={active} onClick={() => onToggle(field, option.id)} className={`opt-pill opt-${option.color} gap-1.5 ${active ? "ring-2 ring-ring ring-offset-1" : "opacity-90 hover:opacity-100"}`}>{option.label}<span className="font-semibold tabular-nums">{count(field, option.id)}</span></button>;
  })}</div>)}</div>;
}

function SelectCell({ field, label, item, options, text, onChange, onCreate }: { field: ReleaseSelectField; label: string; item: ReleaseItem; options: ReleaseOption[]; text: Copy; onChange: (value: string[]) => void; onCreate: (label: string) => Promise<ReleaseOption> }) {
  const value = field === "devStatus" ? (item.devStatus ? [item.devStatus] : []) : item[field];
  const selected = value.map((id) => options.find((option) => option.id === id)).filter((option): option is ReleaseOption => Boolean(option));
  return <OptionPicker options={options} value={value} multiple={multiple[field]} onChange={onChange} onCreate={onCreate} text={text}>
    <button type="button" className="flex min-h-8 w-full flex-wrap content-start items-start gap-1 rounded-md p-1 text-left hover:bg-muted" aria-label={`${label}: ${item.name}`}>
      {selected.length ? selected.map((option) => <OptionPill key={option.id} option={option} />) : <span className="px-1 text-sm text-muted-foreground">{text.none}</span>}
    </button>
  </OptionPicker>;
}

export function OptionPicker({ options, value, multiple: isMultiple, onChange, onCreate, text, children }: { options: ReleaseOption[]; value: string[]; multiple: boolean; onChange: (value: string[]) => void; onCreate?: (label: string) => Promise<ReleaseOption>; text: Copy; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const exists = options.some((option) => option.label.toLowerCase() === search.trim().toLowerCase());
  function choose(id: string) {
    if (isMultiple) return onChange(toggle(value, id));
    onChange(value.includes(id) ? [] : [id]);
    setOpen(false);
  }
  async function create() {
    if (!onCreate) return;
    try { const option = await onCreate(search.trim()); setSearch(""); choose(option.id); }
    catch (error) { toast.error(`${text.saveFailed}: ${error instanceof Error ? error.message : ""}`); }
  }
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}><PopoverTrigger asChild>{children}</PopoverTrigger>
    <PopoverContent className="w-72 p-0" align="start"><Command><CommandInput value={search} onValueChange={setSearch} placeholder={text.findValue} /><CommandList>
      <CommandEmpty>{text.noOptions}</CommandEmpty>
      <CommandGroup>{options.map((option) => <CommandItem key={option.id} value={option.label} onSelect={() => choose(option.id)}><CheckIcon className={value.includes(option.id) ? "opacity-100" : "opacity-0"} /><OptionPill option={option} /></CommandItem>)}</CommandGroup>
      {onCreate && search.trim() && !exists && <CommandGroup forceMount><CommandItem forceMount value={`__create ${search}`} onSelect={() => void create()}><PlusIcon />{text.create(search.trim())}</CommandItem></CommandGroup>}
    </CommandList></Command></PopoverContent>
  </Popover>;
}

function NewItemButton({ label, placeholder, onCreate, variant = "default" }: { label: string; placeholder: string; onCreate: (name: string) => Promise<void> | void; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant={variant} className="w-fit"><PlusIcon data-icon="inline-start" />{label}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-80"><form className="flex flex-col gap-3" onSubmit={async (event) => { event.preventDefault(); if (!name.trim()) return; await onCreate(name.trim()); setName(""); setOpen(false); }}>
      <Input autoFocus aria-label={placeholder} placeholder={placeholder} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
      <Button type="submit" disabled={!name.trim()}><PlusIcon data-icon="inline-start" />{label}</Button>
    </form></PopoverContent>
  </Popover>;
}

const textFields = ["description", "statusComment", "notes", "crossReferences"] as const;

function ItemSheet({ listId, item, items, options, locale, text, onClose, onPatch, onCreateOption, onArchive, onOpen, onAddSubItem, onCommented }: {
  listId: string; item: ReleaseItem | null; items: ReleaseItem[]; options: ReleaseListDetail["options"]; locale: Locale; text: Copy;
  onClose: () => void; onPatch: (item: ReleaseItem, change: ItemPatch) => Promise<void>; onCreateOption: (field: ReleaseSelectField, label: string) => Promise<ReleaseOption>;
  onArchive: (item: ReleaseItem) => Promise<void>; onOpen: (id: string) => void; onAddSubItem: (name: string, parentId: string) => Promise<void>; onCommented: (itemId: string) => void;
}) {
  type Editable = "name" | typeof textFields[number];
  const snapshot = (source: ReleaseItem | null): Record<Editable, string> => ({ name: source?.name ?? "", description: source?.description ?? "", statusComment: source?.statusComment ?? "", notes: source?.notes ?? "", crossReferences: source?.crossReferences ?? "" });
  const [drafts, setDrafts] = useState(() => snapshot(item));
  // What each field held when this person last saw it. A blur saves only their own edits,
  // so a focus refresh that brought in someone else's change is never written back over it.
  const baseline = useRef(snapshot(item));
  const name = drafts.name;
  const setName = (value: string) => setDrafts((current) => ({ ...current, name: value }));
  useEffect(() => {
    if (!item) return;
    const fresh = snapshot(item);
    setDrafts((current) => {
      const next = { ...current };
      for (const key of Object.keys(fresh) as Editable[]) {
        if (current[key] === baseline.current[key] && fresh[key] !== baseline.current[key]) { next[key] = fresh[key]; baseline.current[key] = fresh[key]; }
      }
      return next;
    });
  }, [item]);
  function commit(field: Editable, value: string) {
    if (value === baseline.current[field]) return;
    baseline.current[field] = value;
    void save({ [field]: value });
  }
  const [activity, setActivity] = useState<{ comments: ReleaseComment[]; changes: ReleaseChange[] }>({ comments: [], changes: [] });
  const [comment, setComment] = useState("");
  const labels = columns[locale];
  const itemId = item?.id;
  const reloadActivity = useCallback(async () => {
    if (!itemId) return;
    try { setActivity(await loadReleaseActivity(listId, itemId)); } catch { /* the sheet still works without history */ }
  }, [listId, itemId]);
  useEffect(() => { void reloadActivity(); }, [reloadActivity]);
  if (!item) return null;
  const current = item;
  const names = new Map(items.map((entry) => [entry.id, entry.name]));
  const optionLabel = (id: string) => [...options.areas, ...options.devStatus, ...options.functional].find((option) => option.id === id)?.label ?? id;

  async function save(change: ItemPatch) { await onPatch(current, change); void reloadActivity(); }
  async function postComment() {
    if (!comment.trim()) return;
    try { const created = await addReleaseComment(listId, current.id, comment.trim()); setActivity((value) => ({ ...value, comments: [...value.comments, created] })); setComment(""); onCommented(current.id); }
    catch (error) { toast.error(`${text.saveFailed}: ${error instanceof Error ? error.message : ""}`); }
  }
  const describe = (change: ReleaseChange) => {
    if (change.field === "created") return text.created;
    if (change.field === "archived") return text.archived;
    const label = (labels as Record<string, string>)[change.field] ?? change.field;
    const show = (raw: string) => { try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(optionLabel).join(", ") : String(parsed); } catch { return change.field === "devStatus" ? optionLabel(raw) : raw; } };
    const next = show(change.newValue);
    return `${label}: ${next.length > 80 ? `${next.slice(0, 80)}…` : next || text.none}`;
  };

  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={(event) => event.preventDefault()}>
      <SheetHeader><SheetTitle className="sr-only">{current.name}</SheetTitle><SheetDescription>{text.lastEdit(current.updatedBy, new Date(current.updatedAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB"))}</SheetDescription></SheetHeader>
      <div className="flex flex-col gap-6 px-4 pb-8">
        {current.parentId && <p className="text-sm text-muted-foreground">{text.subItemOf} <button type="button" className="text-blue-700 hover:underline" onClick={() => onOpen(current.parentId!)}>{names.get(current.parentId)}</button></p>}
        <Input aria-label={labels.name} className="h-auto border-transparent px-0 text-2xl font-bold shadow-none focus-visible:border-input focus-visible:px-2 md:text-2xl" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name.trim()) { setName(name.trim()); commit("name", name.trim()); } else setName(baseline.current.name); }} />
        <dl className="grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 text-sm">
          {(["areas", "devStatus", "functional"] as const).map((field) => <div key={field} className="contents"><dt className="pt-1.5 text-muted-foreground">{labels[field]}</dt><dd><SelectCell field={field} label={labels[field]} item={current} options={options[field]} text={text} onChange={(value) => save(field === "devStatus" ? { devStatus: value[0] ?? null } : { [field]: value })} onCreate={(label) => onCreateOption(field, label)} /></dd></div>)}
          {current.crossReferenceIds.length > 0 && <><dt className="text-muted-foreground">{text.linked}</dt><dd className="flex flex-col gap-1">{current.crossReferenceIds.map((id) => names.has(id) && <button key={id} type="button" className="w-fit text-left text-blue-700 hover:underline" onClick={() => onOpen(id)}>{names.get(id)}</button>)}</dd></>}
        </dl>
        <FieldGroup>{textFields.map((field) => <Field key={field}><FieldLabel htmlFor={`release-${field}`}>{labels[field]}</FieldLabel><Textarea id={`release-${field}`} value={drafts[field]} maxLength={field === "notes" ? 8000 : 4000} onChange={(event) => setDrafts((value) => ({ ...value, [field]: event.target.value }))} onBlur={() => commit(field, drafts[field])} /></Field>)}</FieldGroup>
        <div className="flex flex-col gap-2"><p className="text-sm font-medium">{labels.releaseNotes}</p><ReleaseNotesField item={current} text={text} title={labels.releaseNotes} onSave={(value) => save({ releaseNotes: value })} /></div>
        {!current.parentId && <NewItemButton variant="outline" label={text.addSubItem} placeholder={text.newName} onCreate={(subName) => onAddSubItem(subName, current.id)} />}
        <Separator />
        <section className="flex flex-col gap-3"><h3 className="font-semibold">{text.comments}</h3>
          {activity.comments.length ? activity.comments.map((entry) => <div key={entry.id} className="rounded-lg border bg-muted/30 p-3"><p className="mb-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{entry.authorName}</span> · {new Date(entry.createdAt).toLocaleString(locale === "de" ? "de-DE" : "en-GB")}</p><p className="text-sm whitespace-pre-line">{entry.body}</p></div>) : <p className="text-sm text-muted-foreground">{text.noComments}</p>}
          <Textarea aria-label={text.addComment} placeholder={text.addComment} value={comment} maxLength={4000} onChange={(event) => setComment(event.target.value)} />
          <Button className="w-fit" onClick={() => void postComment()} disabled={!comment.trim()}><MessageSquareIcon data-icon="inline-start" />{text.post}</Button>
        </section>
        {activity.changes.length > 0 && <section className="flex flex-col gap-2"><h3 className="font-semibold">{text.activity}</h3><ul className="flex flex-col gap-1 text-sm text-muted-foreground">{activity.changes.slice(0, 20).map((change) => <li key={change.id}><span className="text-foreground">{change.actorName}</span> · {describe(change)} · {new Date(change.changedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB")}</li>)}</ul></section>}
        <Separator />
        <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="w-fit"><ArchiveIcon data-icon="inline-start" />{text.archive}</Button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{text.archiveTitle}</AlertDialogTitle><AlertDialogDescription>{text.archiveText}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{text.cancel}</AlertDialogCancel><AlertDialogAction onClick={() => void onArchive(current)}>{text.archive}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </div>
    </SheetContent>
  </Sheet>;
}

/** Plain-text teaser for the table cell; the dialog renders the real Markdown. */
function markdownTeaser(source: string) {
  return source.replace(/```[\s\S]*?```/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^[#>\-*+\s]+/gm, "").replace(/[*_`~]/g, "").trim();
}

export function ReleaseNotesField({ item, title, text, onSave }: { item: ReleaseItem; title: string; text: Copy; onSave: (value: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [draft, setDraft] = useState(item.releaseNotes);
  const html = useMemo(() => renderMarkdown(draft), [draft]);
  function show() { setDraft(item.releaseNotes); setMode(item.releaseNotes ? "preview" : "edit"); setOpen(true); }
  async function save() { await onSave(draft); setOpen(false); }
  const dirty = draft !== item.releaseNotes;
  return <>
    <button type="button" onClick={show} className="flex w-full flex-col items-start gap-1 rounded-md p-1 text-left hover:bg-muted" aria-label={`${title}: ${item.name}`}>
      {item.releaseNotes ? <><span className="line-clamp-3 text-sm text-foreground/90">{markdownTeaser(item.releaseNotes)}</span><span className="flex items-center gap-1 text-xs font-medium text-blue-700"><FileTextIcon className="size-3.5" />{text.openNotes}</span></>
        : <span className="flex items-center gap-1 text-sm text-muted-foreground"><PlusIcon className="size-3.5" />{text.addNotes}</span>}
    </button>
    <Dialog open={open} onOpenChange={(next) => { if (!next && dirty && !window.confirm(text.discard)) return; setOpen(next); }}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[calc(100vw-2rem)] flex-col gap-4 sm:max-w-5xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{item.name}</DialogDescription></DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as "preview" | "edit")} className="flex min-h-0 flex-1 flex-col">
          <TabsList><TabsTrigger value="preview">{text.preview}</TabsTrigger><TabsTrigger value="edit">{text.edit}</TabsTrigger></TabsList>
          <TabsContent value="preview" className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-6">
            {draft.trim() ? <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-muted-foreground">{text.notesEmpty}</p>}
          </TabsContent>
          <TabsContent value="edit" className="flex min-h-0 flex-1 flex-col gap-2">
            <Textarea aria-label={title} value={draft} maxLength={15000} onChange={(event) => setDraft(event.target.value)} className="min-h-0 flex-1 resize-none font-mono text-sm [field-sizing:fixed]" />
            <p className="text-xs text-muted-foreground">{text.notesHint}</p>
          </TabsContent>
        </Tabs>
        <DialogFooter><Button variant="outline" onClick={() => { setDraft(item.releaseNotes); setOpen(false); }}>{text.close}</Button><Button onClick={() => void save()} disabled={!dirty}>{text.save}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
