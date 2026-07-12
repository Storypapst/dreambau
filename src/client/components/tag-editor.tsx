import { useState, type FormEvent } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectedTags, type TagTone } from "./selected-tags";

export function addUniqueTag(values: string[], input: string) {
  const next = input.trim();
  return !next || values.includes(next) ? values : [...values, next];
}

export function TagEditor({ label, values, formatOption, tone, onChange, addLabel = "Hinzufügen", removeLabel = "entfernen", inputLabel = `Neues ${label}-Tag` }: { label: string; values: string[]; formatOption: (value: string) => string; tone: TagTone; onChange: (values: string[]) => void; addLabel?: string; removeLabel?: string; inputLabel?: string }) {
  const [input, setInput] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = addUniqueTag(values, input);
    if (next !== values) onChange(next);
    setInput("");
  }
  return <div className="flex min-w-0 flex-col gap-3"><form className="flex min-w-0 gap-2" onSubmit={submit}><Input aria-label={inputLabel} className="min-w-0" value={input} onChange={(event) => setInput(event.target.value)} /><Button type="submit" variant="outline" disabled={!input.trim()}><PlusIcon data-icon="inline-start" />{addLabel}</Button></form><SelectedTags values={values} formatOption={formatOption} tone={tone} removeLabel={removeLabel} onRemove={(removed) => onChange(values.filter((value) => value !== removed))} /></div>;
}
