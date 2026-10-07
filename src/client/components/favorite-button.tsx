import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n";

/** Star toggle that marks an account as a favorite; the pressed state is announced, not only colored. */
export function FavoriteButton({ favorite, onToggle, locale, name, disabled = false }: { favorite: boolean; onToggle: () => void; locale: Locale; name: string; disabled?: boolean }) {
  const label = locale === "de"
    ? `${favorite ? "Favorit entfernen" : "Als Favorit merken"}: ${name}`
    : `${favorite ? "Remove favorite" : "Mark as favorite"}: ${name}`;
  return <Button type="button" variant="ghost" size="icon-sm" aria-pressed={favorite} aria-label={label} title={label} onClick={onToggle} disabled={disabled} data-testid="favorite-toggle">
    <StarIcon className={favorite ? "fill-current" : undefined} />
  </Button>;
}
