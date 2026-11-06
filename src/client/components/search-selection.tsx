import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";

interface SelectionAnchor { phrase: string; top: number; left: number; dialog: Element | null }
const valueSelector = "[data-testmails-search-text]";
const scopeSelector = "[data-testmails-selection-scope]";
const privateSelector = "[data-testmails-search-private]";
const notesSelector = "textarea[data-testmails-search-input]";

function asElement(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement;
}

function selectedValue() {
  const field = document.activeElement;
  if (field instanceof HTMLTextAreaElement && field.matches(notesSelector)) {
    const phrase = field.value.slice(field.selectionStart, field.selectionEnd).trim();
    if (phrase) return { phrase, element: field, rect: () => field.getBoundingClientRect() };
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
  const start = asElement(selection.anchorNode);
  const end = asElement(selection.focusNode);
  if (!start || !end || start.closest(privateSelector) || end.closest(privateSelector)) return;
  const scope = start.closest(scopeSelector) ?? start.closest(valueSelector);
  if (!scope || !scope.contains(end)) return;
  const range = selection.getRangeAt(0);
  const element = asElement(range.commonAncestorContainer);
  if (!element || Array.from(element.querySelectorAll(privateSelector)).some((node) => range.intersectsNode(node))) return;
  return { phrase: selection.toString().trim(), element, rect: () => range.getBoundingClientRect() };
}

export function SearchSelection({ locale, onSearch }: { locale: Locale; onSearch: (phrase: string) => void }) {
  const [anchor, setAnchor] = useState<SelectionAnchor>();
  const contextOrigin = useRef<{ element: Element; left: number; top: number } | null>(null);
  useEffect(() => {
    function show(phrase: string, left: number, top: number, element: Element) {
      setAnchor({
        phrase,
        dialog: element.closest('[role="dialog"]'),
        left: Math.max(8, Math.min(left, window.innerWidth - 182)),
        top: Math.max(8, Math.min(top, window.innerHeight - 42))
      });
    }
    function dismiss() {
      contextOrigin.current = null;
      setAnchor(undefined);
    }
    function update() {
      if (contextOrigin.current) return;
      const selected = selectedValue();
      if (!selected?.phrase || selected.phrase.length > 200) return dismiss();
      const rect = selected.rect();
      show(selected.phrase, rect.left, rect.top < 48 ? rect.bottom + 6 : rect.top - 38, selected.element);
    }
    function openContext(event: MouseEvent) {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest(privateSelector)) return dismiss();
      const selected = selectedValue();
      const element = event.target.closest(valueSelector);
      if (element?.querySelector(privateSelector)) return dismiss();
      const phrase = selected?.element.contains(event.target)
        ? selected.phrase
        : element?.textContent?.trim();
      if (!phrase || phrase.length > 200 || phrase === "–") return dismiss();
      event.preventDefault();
      const target = element ?? event.target;
      const { left, top } = target.getBoundingClientRect();
      contextOrigin.current = { element: target, left, top };
      show(phrase, event.clientX, event.clientY, target);
    }
    function onScroll() {
      const origin = contextOrigin.current;
      if (origin?.element.isConnected) {
        const { left, top } = origin.element.getBoundingClientRect();
        // A scroll event queued before the right-click can arrive after it.
        if (left === origin.left && top === origin.top) return;
      }
      dismiss();
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Element && !event.target.closest("[data-selection-filter]")) dismiss();
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") dismiss(); }
    document.addEventListener("selectionchange", update);
    document.addEventListener("select", update);
    document.addEventListener("contextmenu", openContext);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("select", update);
      document.removeEventListener("contextmenu", openContext);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  if (!anchor) return null;
  const action = (
    <Button className="fixed z-[60] shadow-md" style={{ left: anchor.left, top: anchor.top }} size="sm" type="button"
      data-selection-filter onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        contextOrigin.current = null;
        onSearch(anchor.phrase);
        window.getSelection()?.removeAllRanges();
        setAnchor(undefined);
      }}>
      <SearchIcon data-icon="inline-start" />{locale === "de" ? "Danach filtern" : "Filter by selection"}
    </Button>
  );
  return anchor.dialog ? createPortal(action, anchor.dialog) : action;
}
