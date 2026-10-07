import { useEffect, useState, type FormEvent } from "react";
import { BookmarkIcon, BookmarkPlusIcon, XIcon } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { coercePresets, countActiveFilters, sameFilters, type FilterPreset, type FilterState } from "@/filter-state";
import { t, type Locale } from "@/i18n";

const PREFERENCE_PATH = "/auth/me/preferences/filter-presets";

/**
 * Saved filter combinations as one-click chips. They live on the server per
 * user, so the same presets appear on every device.
 */
export function FilterPresets({ locale, current, onApply }: { locale: Locale; current: FilterState; onApply: (filters: FilterState) => void }) {
  const [presets, setPresets] = useState<FilterPreset[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ value: unknown }>(PREFERENCE_PATH)
      .then((result) => { if (live) setPresets(coercePresets(result.value)); })
      .catch(() => { if (live) { setPresets([]); setError(true); } });
    return () => { live = false; };
  }, []);

  async function persist(next: FilterPreset[]) {
    setBusy(true); setError(false);
    try {
      const result = await api<{ value: unknown }>(PREFERENCE_PATH, { method: "PUT", body: JSON.stringify({ value: next }) });
      setPresets(coercePresets(result.value));
      return true;
    } catch { setError(true); return false; }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !presets) return;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const withoutSameName = presets.filter((preset) => preset.name.toLowerCase() !== trimmed.toLowerCase());
    if (await persist([...withoutSameName, { id, name: trimmed, filters: current }])) { setName(""); setSaving(false); }
  }
  async function remove(id: string) {
    if (!presets) return;
    await persist(presets.filter((preset) => preset.id !== id));
  }

  const canSave = countActiveFilters(current) > 0;
  return <div className="flex flex-wrap items-center gap-2" data-testid="filter-presets">
    <BookmarkIcon className="text-muted-foreground" aria-hidden />
    {presets === null && <span className="text-xs text-muted-foreground">{t(locale, "presets.loading")}</span>}
    {presets?.length === 0 && !saving && <span className="text-xs text-muted-foreground">{t(locale, "presets.empty")}</span>}
    {presets?.map((preset) => {
      const active = sameFilters(preset.filters, current);
      return <span key={preset.id} className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-sm ${active ? "border-primary bg-primary/10" : "bg-muted/40"}`} data-testid="preset-chip" data-active={active ? "true" : "false"}>
        <button type="button" className="rounded-full px-2 py-0.5 hover:bg-muted" onClick={() => onApply(preset.filters)} aria-pressed={active}>{preset.name}</button>
        <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${t(locale, "presets.delete")}: ${preset.name}`} disabled={busy} onClick={() => void remove(preset.id)}><XIcon className="size-3.5" /></button>
      </span>;
    })}
    {saving
      ? <form className="flex items-center gap-1" onSubmit={save}>
        <Input aria-label={t(locale, "presets.nameLabel")} className="h-8 w-48" value={name} maxLength={60} placeholder={t(locale, "presets.namePlaceholder")} onChange={(event) => setName(event.target.value)} autoFocus />
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{t(locale, "presets.save")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setSaving(false); setName(""); }}>{t(locale, "presets.cancel")}</Button>
      </form>
      : <Button type="button" size="sm" variant="ghost" disabled={!canSave || presets === null} title={canSave ? undefined : t(locale, "presets.needFilters")} onClick={() => setSaving(true)}><BookmarkPlusIcon data-icon="inline-start" />{t(locale, "presets.saveCurrent")}</Button>}
    {error && <span className="text-xs text-destructive" role="alert">{t(locale, "presets.error")}</span>}
  </div>;
}
