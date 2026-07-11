export interface LocalizedCatalogEntry {
  key: string;
  de: string;
  en: string;
}

// Canonical ORISO counseling topics from ConsultingTypeService migration 0011.
export const topicCatalog = [
  { key: "boys-and-mens-counseling", de: "Jungen- und Männerberatung", en: "Boys' and men's counseling" },
  { key: "child-and-youth-rehabilitation", de: "Kind & Jugend Reha", en: "Child & youth rehabilitation" },
  { key: "health-cures-for-parents", de: "Kuren Mütter & Väter", en: "Health cures for mothers & fathers" },
  { key: "emigration-return-and-onward-migration", de: "Aus-/Rück- & Weiterwanderung", en: "Emigration / return & onward migration" },
  { key: "disability-and-psychological-impairment", de: "Behinderung & psych. Beeinträchtigung", en: "Disability & psychological impairment" },
  { key: "hiv-and-aids", de: "HIV & Aids", en: "HIV & AIDS" },
  { key: "parents-and-family", de: "Eltern und Familie", en: "Parents and family" },
  { key: "hospice-and-palliative-care", de: "Hospiz & Palliativberatung", en: "Hospice & palliative care counseling" },
  { key: "children-and-youth-counseling", de: "Kinder und Jugendlicheberatung", en: "Children and youth counseling" },
  { key: "legal-guardianship-and-advance-care", de: "Rechtliche Betreuung & Vorsorge", en: "Legal guardianship & advance care planning" },
  { key: "living-in-old-age", de: "Leben im Alter", en: "Living in old age" },
  { key: "debt", de: "Schulden", en: "Debt" },
  { key: "social-counseling", de: "Sozialberatung", en: "Social counseling" },
  { key: "pregnancy", de: "Schwangerschaft", en: "Pregnancy" },
  { key: "offending", de: "Straffälligkeit", en: "Offending / criminal-justice support" },
  { key: "u25-suicide-prevention", de: "U25 Suizidprävention", en: "U25 suicide prevention" }
] as const satisfies readonly LocalizedCatalogEntry[];

export const topicKeys = topicCatalog.map((topic) => topic.key);
