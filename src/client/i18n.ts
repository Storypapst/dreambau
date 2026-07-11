import { topicCatalog } from "../server/catalog";
import type { FixtureQuality, LifecycleStatus, Project } from "./types";

export type Locale = "de" | "en";

const messages = {
  de: {
    "page.title": "Springfield Testkonten",
    "page.kicker": "Geschützter Testraum",
    "page.description": "180 Identitäten für Mail-, Kalender-, Adressbuch- und Beratungstests.",
    "page.webmail": "Webmail öffnen",
    "page.markdown": "Markdown",
    "page.logout": "Abmelden",
    "page.settings": "Auswahllisten",
    "page.search": "Name, E-Mail, Rolle, Thema, Projekt, Notiz …",
    "page.accounts": "Konten",
    "page.all": "Alle",
    "page.status": "Status",
    "page.project": "Projekt",
    "page.testData": "Testdaten",
    "page.roles": "Rollen",
    "page.topics": "Themen",
    "page.conversations": "Konversationen",
    "page.version": "Version",
    "page.actions": "Aktionen",
    "page.identity": "Identität",
    "page.access": "Zugang",
    "page.noAssignment": "Nicht zugeordnet",
    "page.files": "Dateien",
    "page.inUse": "Im Einsatz",
    "page.unencrypted": "Unverschlüsselt",
    "page.encrypted": "Verschlüsselt",
    "page.edit": "Bearbeiten",
    "page.openProfile": "Testprofil öffnen",
    "page.saved": "Gespeichert",
    "page.saveFailed": "Speichern fehlgeschlagen",
    "page.openMail": "Mail öffnen",
    "page.language": "Sprache",
    "page.filteredCount": "{shown} von {total} Konten",
    "page.noAccounts": "Keine Konten gefunden",
    "page.adjustFilters": "Filter oder Suchbegriff anpassen."
  },
  en: {
    "page.title": "Springfield test accounts",
    "page.kicker": "Protected test workspace",
    "page.description": "180 identities for email, calendar, address book, and counseling tests.",
    "page.webmail": "Open webmail",
    "page.markdown": "Markdown",
    "page.logout": "Sign out",
    "page.settings": "Lists",
    "page.search": "Name, email, role, topic, project, note …",
    "page.accounts": "accounts",
    "page.all": "All",
    "page.status": "Status",
    "page.project": "Project",
    "page.testData": "Test data",
    "page.roles": "Roles",
    "page.topics": "Topics",
    "page.conversations": "Conversations",
    "page.version": "Version",
    "page.actions": "Actions",
    "page.identity": "Identity",
    "page.access": "Access",
    "page.noAssignment": "Not assigned",
    "page.files": "files",
    "page.inUse": "In use",
    "page.unencrypted": "Unencrypted",
    "page.encrypted": "Encrypted",
    "page.edit": "Edit",
    "page.openProfile": "Open test profile",
    "page.saved": "Saved",
    "page.saveFailed": "Could not save",
    "page.openMail": "Open mail",
    "page.language": "Language",
    "page.filteredCount": "{shown} of {total} accounts",
    "page.noAccounts": "No accounts found",
    "page.adjustFilters": "Adjust filters or search terms."
  }
} as const;

export type MessageKey = keyof typeof messages.de;

export function t(locale: Locale, key: MessageKey, values: Record<string, string | number> = {}) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), messages[locale][key] as string);
}

export function labelTopic(locale: Locale, key: string) {
  const topic = topicCatalog.find((entry) => entry.key === key);
  return topic?.[locale] ?? key;
}

const lifecycleLabels: Record<LifecycleStatus, Record<Locale, string>> = {
  unused: { de: "Unbenutzt", en: "Unused" }, active: { de: "Im Einsatz", en: "In use" },
  needs_review: { de: "Prüfen", en: "Needs review" }, delete_candidate: { de: "Löschkandidat", en: "Delete candidate" }, archived: { de: "Archiviert", en: "Archived" }
};
const fixtureLabels: Record<FixtureQuality, Record<Locale, string>> = {
  empty: { de: "Leer", en: "Empty" }, synthetic: { de: "Synthetisch", en: "Synthetic" }, realistic: { de: "Realistisch", en: "Realistic" }, gold: { de: "Goldstandard", en: "Gold standard" }
};
const roleLabels: Record<string, Record<Locale, string>> = {
  "Träger": { de: "Träger", en: "Provider" }, "Berater": { de: "Berater", en: "Counselor" }, "Ratsuchender": { de: "Ratsuchender", en: "Client" }, Admin: { de: "Admin", en: "Admin" }
};
const conversationLabels: Record<string, Record<Locale, string>> = {
  Chat: { de: "Chat", en: "Chat" }, "E-Mail": { de: "E-Mail", en: "Email" }, Video: { de: "Video", en: "Video" }, Termin: { de: "Termin", en: "Appointment" },
  Dateiaustausch: { de: "Dateiaustausch", en: "File exchange" }, Langzeitdialog: { de: "Langzeitdialog", en: "Long-term dialog" }
};

export const labelLifecycle = (locale: Locale, value: LifecycleStatus) => lifecycleLabels[value][locale];
export const labelFixture = (locale: Locale, value: FixtureQuality) => fixtureLabels[value][locale];
export const labelRole = (locale: Locale, value: string) => roleLabels[value]?.[locale] ?? value;
export const labelConversation = (locale: Locale, value: string) => conversationLabels[value]?.[locale] ?? value;
export const labelProject = (locale: Locale, value: Project) => value === "NONE" ? (locale === "de" ? "Keines" : "None") : value === "OTHER" ? (locale === "de" ? "Sonstiges" : "Other") : value;
