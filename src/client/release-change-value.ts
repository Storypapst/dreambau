export function releaseChangeValue(raw: string, field: string, optionLabel: (id: string) => string, fieldLabel: (name: string) => string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (field === "translations" && parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.entries(parsed).map(([name, value]) => `${fieldLabel(name)}: ${String(value)}`).join("; ");
    }
    return Array.isArray(parsed) ? parsed.map((value) => optionLabel(String(value))).join(", ") : String(parsed);
  } catch { return field === "devStatus" ? optionLabel(raw) : raw; }
}
