import { XIcon } from "lucide-react";

export type TagTone = "role" | "topic" | "conversation" | "filter";

export function SelectedTags({ values, formatOption, tone, onRemove, removeLabel = "entfernen" }: { values: string[]; formatOption: (value: string) => string; tone: TagTone; onRemove?: (value: string) => void; removeLabel?: string }) {
  if (!values.length) return null;
  return <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Ausgewählte Werte">{values.map((value) => {
    const label = formatOption(value);
    return <span key={value} className={`tag-pill tag-${tone}`} title={label}><span className="min-w-0 truncate">{label}</span>{onRemove && <button type="button" className="tag-remove" onClick={() => onRemove(value)} aria-label={`${label} ${removeLabel}`}><XIcon /></button>}</span>;
  })}</div>;
}
