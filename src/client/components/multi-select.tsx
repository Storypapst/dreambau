import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-between">{value.length ? `${value.length} ausgewählt` : label}<ChevronsUpDownIcon data-icon="inline-end" /></Button></PopoverTrigger>
    <PopoverContent className="w-72 p-0" align="start"><Command><CommandInput placeholder={`${label} suchen`} /><CommandList><CommandEmpty>Keine Einträge</CommandEmpty><CommandGroup>{options.map((option) => <CommandItem key={option} value={option} onSelect={() => onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])}><CheckIcon className={value.includes(option) ? "opacity-100" : "opacity-0"} />{option}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
  </Popover>;
}
