export function releaseChangeValue(raw: string, field: string, optionLabel: (id: string) => string, fieldLabel: (name: string) => string, oldRaw?: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (field === "translations" && parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      let previous: Record<string, unknown> = {};
      if (oldRaw) {
        try { const old: unknown = JSON.parse(oldRaw); if (old && typeof old === "object" && !Array.isArray(old)) previous = old as Record<string, unknown>; } catch { /* Older raw values have no comparable fields. */ }
      }
      return Object.entries(parsed).filter(([name, value]) => previous[name] !== value).map(([name, value]) => `${fieldLabel(name)}: ${String(value)}`).join("; ");
    }
    return Array.isArray(parsed) ? parsed.map((value) => optionLabel(String(value))).join(", ") : String(parsed);
  } catch { return field === "devStatus" ? optionLabel(raw) : raw; }
}
