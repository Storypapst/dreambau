import { topicCatalog } from "../server/catalog";
import type { FixtureQuality, LifecycleStatus, LinkedTestAccount, Project } from "./types";

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
    "login.staySignedIn": "30 Tage angemeldet bleiben",
    "login.hybridOnlyTitle": "Dein Passkey liegt auf einem anderen Gerät",
    "login.hybridOnlyBody": "Dieser Browser findet keinen Passkey auf diesem Gerät, deshalb erscheint der QR-Code für dein Telefon. Nach der Anmeldung kannst du unter „Passkeys“ einen Geräte-Passkey mit Touch ID hinzufügen.",
    "passkeys.button": "Passkeys",
    "passkeys.title": "Meine Passkeys",
    "passkeys.description": "Jeder Passkey meldet dich an. Lege für jedes Gerät und jeden Browser einen eigenen an, dann fragt Touch ID direkt statt über den QR-Code.",
    "passkeys.errorTitle": "Aktion fehlgeschlagen",
    "passkeys.errorLoad": "Die Passkeys konnten nicht geladen werden.",
    "passkeys.errorAdd": "Der Passkey wurde nicht gespeichert. Bitte erneut versuchen.",
    "passkeys.errorRename": "Der Name konnte nicht gespeichert werden.",
    "passkeys.errorDelete": "Der Passkey konnte nicht gelöscht werden.",
    "passkeys.errorLast": "Der letzte Passkey kann nicht gelöscht werden. Lege zuerst einen neuen an.",
    "passkeys.hybridOnlyTitle": "Nur Telefon-Passkeys vorhanden",
    "passkeys.hybridOnlyBody": "Alle Passkeys liegen im Passwortmanager deines Telefons. Füge unten einen Geräte-Passkey hinzu, damit dieser Browser Touch ID nutzt.",
    "passkeys.unnamed": "Unbenannter Passkey",
    "passkeys.badgeHybrid": "Telefon / QR",
    "passkeys.badgeDevice": "Gerät",
    "passkeys.badgeSynced": "synchronisiert",
    "passkeys.created": "Angelegt",
    "passkeys.lastUsed": "Zuletzt genutzt",
    "passkeys.rename": "Umbenennen",
    "passkeys.delete": "Löschen",
    "passkeys.nameLabel": "Name",
    "passkeys.save": "Speichern",
    "passkeys.cancel": "Abbrechen",
    "passkeys.newNameLabel": "Name für den neuen Passkey",
    "passkeys.newNamePlaceholder": "z. B. MacBook Safari",
    "passkeys.add": "Passkey hinzufügen",
    "page.filteredCount": "{shown} von {total} Konten",
    "page.resetFilters": "Zurücksetzen ({count})",
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
    "login.staySignedIn": "Stay signed in for 30 days",
    "login.hybridOnlyTitle": "Your passkey lives on another device",
    "login.hybridOnlyBody": "This browser finds no passkey on this device, so the QR code for your phone appears. After signing in, add a device passkey with Touch ID under “Passkeys”.",
    "passkeys.button": "Passkeys",
    "passkeys.title": "My passkeys",
    "passkeys.description": "Each passkey signs you in. Create one per device and browser so Touch ID prompts directly instead of via the QR code.",
    "passkeys.errorTitle": "Action failed",
    "passkeys.errorLoad": "The passkeys could not be loaded.",
    "passkeys.errorAdd": "The passkey was not saved. Please try again.",
    "passkeys.errorRename": "The name could not be saved.",
    "passkeys.errorDelete": "The passkey could not be deleted.",
    "passkeys.errorLast": "The last passkey cannot be deleted. Add a new one first.",
    "passkeys.hybridOnlyTitle": "Only phone passkeys registered",
    "passkeys.hybridOnlyBody": "All passkeys live in your phone's password manager. Add a device passkey below so this browser uses Touch ID.",
    "passkeys.unnamed": "Unnamed passkey",
    "passkeys.badgeHybrid": "Phone / QR",
    "passkeys.badgeDevice": "Device",
    "passkeys.badgeSynced": "synced",
    "passkeys.created": "Created",
    "passkeys.lastUsed": "Last used",
    "passkeys.rename": "Rename",
    "passkeys.delete": "Delete",
    "passkeys.nameLabel": "Name",
    "passkeys.save": "Save",
    "passkeys.cancel": "Cancel",
    "passkeys.newNameLabel": "Name for the new passkey",
    "passkeys.newNamePlaceholder": "e.g. MacBook Safari",
    "passkeys.add": "Add passkey",
    "page.filteredCount": "{shown} of {total} accounts",
    "page.resetFilters": "Reset ({count})",
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

const orisoEnvironmentLabels = {
  "pre-dev": { de: "PreDev", en: "PreDev" },
  dev: { de: "Dev", en: "Dev" }
} as const;

export function labelLinkedEnvironment(locale: Locale, linkedAccess: LinkedTestAccount[] = []) {
  const environments = Array.from(new Set(linkedAccess
    .filter((linked) => linked.project === "oriso"
      && (linked.kind === "app-user" || linked.kind === "admin"))
    .map((linked) => linked.environment === "pre-dev" || linked.environment === "dev" ? linked.environment : null)
    .filter((environment): environment is keyof typeof orisoEnvironmentLabels => environment !== null)))
    .sort((left, right) => left === right ? 0 : left === "pre-dev" ? -1 : 1)
    .map((environment) => orisoEnvironmentLabels[environment][locale]);
  return environments.length ? `ORISO ${environments.join(" + ")}` : null;
}

export function labelRoleWithEnvironment(locale: Locale, role: string, linkedAccess: LinkedTestAccount[] = []) {
  const environment = labelLinkedEnvironment(locale, linkedAccess);
  return environment ? `${labelRole(locale, role)} · ${environment}` : labelRole(locale, role);
}
