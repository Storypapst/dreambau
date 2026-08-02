import { useEffect, useState } from "react";
import type { Locale } from "@/i18n";

export function OtpValidity({ expiresAt, locale, waiting = false }: {
  expiresAt: number;
  locale: Locale;
  waiting?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1_000);
  const safe = !waiting && remainingMs >= 8_000;
  const progress = Math.min(100, Math.max(0, remainingMs / 30_000 * 100));
  const label = waiting
    ? (locale === "de"
        ? `Neuer sicherer Code in ${remainingSeconds} s`
        : `New safe code in ${remainingSeconds}s`)
    : (locale === "de"
        ? `Noch ${remainingSeconds} s sicher verwendbar`
        : `Safe to use for ${remainingSeconds}s`);

  return <div className="min-w-44 space-y-1" aria-live="polite">
    <div className={`text-xs ${safe ? "text-emerald-700" : "text-amber-700"}`}>{label}</div>
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={30}
      aria-valuenow={remainingSeconds}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-250 ${safe ? "bg-emerald-500" : "animate-pulse bg-amber-500"}`}
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>;
}
