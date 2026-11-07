import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Locale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cancelPendingAccountCopy } from "./account-quick-copy";

export function CopyButton({ value, label = "Kopieren", compact = false, locale }: { value: string; label?: string; compact?: boolean; locale?: Locale }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    cancelPendingAccountCopy();
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success(locale ? (locale === "en" ? "Copied" : "Kopiert") : `${label} kopiert`); window.setTimeout(() => setCopied(false), 1500); }
    catch { toast.error(locale === "en" ? "Copy failed" : "Kopieren fehlgeschlagen"); }
  }
  return <Button type="button" variant="ghost" size={compact ? "icon-sm" : "sm"} onClick={copy} aria-label={label}>{copied ? <CheckIcon /> : <CopyIcon />}{compact ? null : label}</Button>;
}
