import { useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Locale } from "@/i18n";

const endpoint = "/auth/me/search-history";
interface Entry { id: number; phrase: string }
interface Page { entries: Entry[]; nextBefore: number | null }

export async function rememberSearchPhrase(phrase: string, locale: Locale) {
  const trimmed = phrase.trim();
  if (!trimmed || trimmed.length > 200) return;
  try {
    await api(endpoint, { method: "POST", body: JSON.stringify({ phrase: trimmed }) });
  } catch {
    toast.error(locale === "de" ? "Suchbegriff konnte nicht gespeichert werden." : "Could not save the search phrase.");
  }
}

export function SearchHistory({ locale, onPick }: { locale: Locale; onPick: (phrase: string) => void }) {
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const loading = useRef(false);
  const generation = useRef(0);

  async function load(before?: number) {
    if (loading.current) return;
    const request = generation.current;
    loading.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const page = await api<Page>(before === undefined ? endpoint : `${endpoint}?before=${before}`);
      if (request !== generation.current) return;
      setEntries((current) => before === undefined ? page.entries : [...current, ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch {
      if (request === generation.current) setFailed(true);
    } finally {
      if (request === generation.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  }

  function changeOpen(value: boolean) {
    setOpen(value);
    generation.current += 1;
    loading.current = false;
    setRemoving(null);
    if (value) {
      setEntries([]);
      setNextBefore(null);
      void load();
    }
  }

  async function remove(id: number) {
    const request = generation.current;
    setRemoving(id);
    try {
      await api(`${endpoint}/${id}`, { method: "DELETE" });
      if (request === generation.current) setEntries((current) => current.filter((entry) => entry.id !== id));
    } catch {
      if (request === generation.current) toast.error(de ? "Suchbegriff konnte nicht gelöscht werden." : "Could not remove the search phrase.");
    } finally {
      if (request === generation.current) setRemoving(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={de ? "Suchverlauf" : "Search history"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="10" r="6.5" />
            <path d="M14.7 14.7 21 21M10 6.8v3.4l2.4 1.4" />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] p-2">
        <h3 className="px-2 pb-1 text-sm font-medium">{de ? "Letzte Suchbegriffe" : "Recent searches"}</h3>
        <div className="max-h-64 overflow-y-auto" onScroll={(event) => {
          const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
          if (!failed && nextBefore !== null && scrollHeight - scrollTop - clientHeight < 36) void load(nextBefore);
        }}>
          {entries.map(({ id, phrase }) => (
            <div key={id} className="flex min-w-0 items-start">
              <button type="button" className="min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm break-words hover:bg-muted" onClick={() => {
                changeOpen(false);
                onPick(phrase);
              }}>{phrase}</button>
              <Button type="button" size="icon-sm" variant="ghost" disabled={removing !== null} aria-label={de ? `Suchbegriff löschen: ${phrase}` : `Delete search: ${phrase}`} onClick={() => void remove(id)}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          {!busy && !failed && !entries.length && nextBefore === null &&
            <p className="px-2 py-1 text-sm text-muted-foreground">{de ? "Noch keine Suchbegriffe." : "No recent searches."}</p>}
          {busy && <p role="status" className="px-2 py-1 text-sm text-muted-foreground">{de ? "Wird geladen …" : "Loading…"}</p>}
          {failed && <p role="alert" className="px-2 py-1 text-sm text-destructive">{de ? "Suchverlauf konnte nicht geladen werden." : "Could not load search history."}</p>}
          {!busy && (nextBefore !== null || failed) && <Button type="button" size="sm" variant="ghost" onClick={() => void load(nextBefore ?? undefined)}>
            {failed ? (de ? "Erneut versuchen" : "Retry") : (de ? "Mehr laden" : "Load more")}
          </Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
