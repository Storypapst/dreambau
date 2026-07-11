import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label = "Kopieren", compact = false }: { value: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success(`${label} kopiert`); window.setTimeout(() => setCopied(false), 1500); }
    catch { toast.error("Kopieren fehlgeschlagen"); }
  }
  return <Button type="button" variant="ghost" size={compact ? "icon-sm" : "sm"} onClick={copy} aria-label={label}>{copied ? <CheckIcon /> : <CopyIcon />}{compact ? null : label}</Button>;
}
