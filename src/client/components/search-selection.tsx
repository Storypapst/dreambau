import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";

interface SelectionAnchor { phrase: string; top: number; left: number }

export function SearchSelection({ locale, onSearch }: { locale: Locale; onSearch: (phrase: string) => void }) {
  const [anchor, setAnchor] = useState<SelectionAnchor>();
  useEffect(() => {
    function update() {
      const field = document.activeElement;
      const selectedInput = field instanceof HTMLTextAreaElement && field.hasAttribute("data-testmails-search-input");
      const selection = window.getSelection();
      const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
      const phrase = selectedInput
        ? field.value.slice(field.selectionStart, field.selectionEnd).trim()
        : selection?.toString().trim() ?? "";
      const element = range?.commonAncestorContainer.parentElement;
      if (!phrase || phrase.length > 200 || (!selectedInput && !element?.closest("[data-testmails-search-text]"))) {
        setAnchor(undefined);
        return;
      }
      const rect = selectedInput ? field.getBoundingClientRect() : range!.getBoundingClientRect();
      setAnchor({
        phrase,
        top: rect.top < 48 ? rect.bottom + 6 : rect.top - 38,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 182))
      });
    }
    function dismiss() { setAnchor(undefined); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") dismiss(); }
    document.addEventListener("selectionchange", update);
    document.addEventListener("select", update);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("select", update);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  if (!anchor) return null;
  return (
    <Button className="fixed z-40 shadow-md" style={{ left: anchor.left, top: anchor.top }} size="sm" type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onSearch(anchor.phrase);
        window.getSelection()?.removeAllRanges();
        setAnchor(undefined);
      }}>
      <SearchIcon data-icon="inline-start" />{locale === "de" ? "Danach filtern" : "Filter by selection"}
    </Button>
  );
}
