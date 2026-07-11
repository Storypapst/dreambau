import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Locale } from "@/i18n";

export function MultiSelect({ label, options, value, onChange, formatOption = (option) => option, locale = "de", compact = false, disabled = false }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void; formatOption?: (option: string) => string; locale?: Locale; compact?: boolean; disabled?: boolean }) {
  const selected = locale === "de" ? "ausgewählt" : "selected";
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" size={compact ? "sm" : "default"} disabled={disabled} className="w-full justify-between">{value.length ? `${value.length} ${selected}` : label}<ChevronsUpDownIcon data-icon="inline-end" /></Button></PopoverTrigger>
    <PopoverContent className="w-72 p-0" align="start"><Command><CommandInput placeholder={locale === "de" ? `${label} suchen` : `Search ${label.toLowerCase()}`} /><CommandList><CommandEmpty>{locale === "de" ? "Keine Einträge" : "No entries"}</CommandEmpty><CommandGroup>{options.map((option) => <CommandItem key={option} value={`${option} ${formatOption(option)}`} onSelect={() => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])}><CheckIcon className={value.includes(option) ? "opacity-100" : "opacity-0"} />{formatOption(option)}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
  </Popover>;
}
