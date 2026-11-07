import { CheckCircle2Icon, CircleAlertIcon, Clock3Icon, InfoIcon, MinusIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import type { Locale } from "@/i18n";
import type { WorkspaceRunSummary, WorkspaceResult, WorkspaceEvent } from "../../shared/workspace.js";
export const workspaceCopy = {
 de: {
  title:"Testläufe & Evidence",subtitle:"Läufe, Belege und Dokumentation gemeinsam prüfen.",back:"Testkonten",language:"Sprache wechseln",project:"Projekt auswählen",runs:"Testläufe & Belege",documents:"Dokumentation",
  search:"Testläufe und Belege durchsuchen",documentSearch:"Dokumentation durchsuchen",placeholder:"Titel, Repository oder Verknüpfung suchen …",source:"Herkunft",allSources:"Alle Einträge",testRuns:"Testläufe mit Testkonten",evidenceRuns:"Evidence-Einträge",environment:"Umgebung",allEnvironments:"Alle Umgebungen",result:"Ergebnis",allResults:"Alle Ergebnisse",clear:"Filter zurücksetzen",
  documentPlaceholder:"Titel, Dateiname oder Beschreibung suchen …",
  refineSearch:"Suche eingrenzen",refineSearchHint:"Diese Suche umfasst zu viele verknüpfte Einträge. Ergänze einen genaueren Suchbegriff oder grenze die Filter ein.",editSearch:"Suchbegriff bearbeiten",
  empty:"Keine Testläufe oder Belege gefunden",emptyHint:"Passe die Filter an. Neue Einträge erscheinen hier, sobald sie tatsächlich erfasst wurden.",emptyDocuments:"Keine Dokumentation gefunden",emptyDocumentsHint:"Hier erscheinen freigegebene Dokument-Artefakte deiner Projekte.",denied:"Zugriff verweigert",deniedHint:"Für diese Auswahl besteht keine aktuelle Berechtigung. Wähle ein anderes freigegebenes Projekt oder melde dich erneut an.",unavailable:"Der Arbeitsbereich ist gerade nicht erreichbar",unavailableHint:"Bitte erneut versuchen. Es werden keine früheren Daten als aktuelle Ergebnisse angezeigt.",retry:"Erneut versuchen",loading:"Einträge werden geladen",loadingDetail:"Details werden geladen",more:"Mehr laden",loadingMore:"Weitere Einträge werden geladen …",pageError:"Weitere Einträge konnten nicht geladen werden.",choose:"Wähle einen Eintrag aus.",
  evidenceUnavailable:"Evidence ist vorübergehend nicht erreichbar",evidenceUnavailableHint:"Vorhandene lokale Testläufe bleiben sichtbar. Der Belegbestand kann gerade nicht vollständig geladen werden.",evidenceUnconfigured:"Evidence ist noch nicht angebunden",evidenceUnconfiguredHint:"Die lokalen Testläufe sind verfügbar. Belege und Dokumentation werden nach der Anbindung angezeigt.",
  testRun:"Testlauf mit Testkonten",evidenceRun:"Evidence-Eintrag",evidenceOnly:"Kein Testlauf mit Testkonten ist dadurch belegt. Dieser Eintrag stammt aus dem Evidence-Dienst.",unknownResult:"Kein Ergebnis erfasst",released:"Konten freigegeben",published:"Veröffentlicht",reserved:"Konten reserviert",running:"Läuft",finished:"Lauf beendet",draft:"Entwurf",processing:"In Verarbeitung",quarantined:"Gesperrt",archived:"Freigabe zurückgezogen",unknownStatus:"Status unbekannt",
  files:"Belege",fileCount:"Dateien",unknownCount:"Anzahl unbekannt",noFiles:"Keine Belege mit diesem Eintrag verknüpft.",links:"Verknüpfungen",noLinks:"Keine ausdrücklichen Verknüpfungen hinterlegt.",addLink:"Verknüpfung hinzufügen",referenceHint:"Nur ausdrücklich zugeordnete Issues, PRs, Dokumente und Testläufe werden angezeigt.",activity:"Protokoll",noEvents:"Keine protokollierten Schritte vorhanden.",repository:"Repository",version:"Version",commit:"Commit",owner:"Erfasst durch",open:"Beleg öffnen",openDocument:"Dokument öffnen",pending:"Noch nicht verfügbar",ready:"Bereit",rejected:"Abgelehnt",issue:"Issue",pullRequest:"Pull Request",githubUrl:"GitHub-URL",linkKind:"Art der Verknüpfung",saveLink:"Verknüpfung speichern",saving:"Speichert …",cancel:"Abbrechen",invalidLink:"Bitte eine vollständige HTTPS-Adresse eines GitHub-Issues oder Pull Requests angeben.",linkError:"Die Verknüpfung konnte nicht gespeichert werden.",linkDescription:"Die Zuordnung wird gespeichert und bei diesem Eintrag angezeigt. Sie wird nicht aus Datum oder Commit abgeleitet.",events:{run_reserved:"Testkonten reserviert",run_running:"Testlauf gestartet",run_passed:"Testergebnis: bestanden",run_created:"Testlauf angelegt",run_started:"Testlauf gestartet",run_finished:"Testergebnis erfasst",run_released:"Testkonten freigegeben",run_failed:"Fehlschlag erfasst",reference_added:"Verknüpfung ergänzt",created:"Eintrag angelegt",published:"Belege veröffentlicht"},genericEvent:"Aktivität erfasst"
 },
 en: {
  title:"Test runs & Evidence",subtitle:"Review runs, evidence and documentation together.",back:"Test accounts",language:"Change language",project:"Choose project",runs:"Runs & evidence",documents:"Documents",
  search:"Search runs and evidence",documentSearch:"Search documents",placeholder:"Search title, repository or reference …",source:"Source",allSources:"All entries",testRuns:"Test-account runs",evidenceRuns:"Evidence entries",environment:"Environment",allEnvironments:"All environments",result:"Result",allResults:"All results",clear:"Clear filters",
  documentPlaceholder:"Search title, filename or caption …",
  refineSearch:"Refine your search",refineSearchHint:"This search matches too many linked entries. Add a more specific search term or narrow the filters.",editSearch:"Edit search",
  empty:"No runs or evidence found",emptyHint:"Adjust the filters. Entries appear only after they have actually been recorded.",emptyDocuments:"No documents found",emptyDocumentsHint:"Published document artifacts for your projects appear here.",denied:"Access denied",deniedHint:"You do not currently have access to this selection. Choose another permitted project or sign in again.",unavailable:"The workspace is temporarily unavailable",unavailableHint:"Please try again. Previous data is not presented as a current result.",retry:"Try again",loading:"Loading entries",loadingDetail:"Loading details",more:"Load more",loadingMore:"Loading more entries …",pageError:"More entries could not be loaded.",choose:"Select an entry.",
  evidenceUnavailable:"Evidence is temporarily unavailable",evidenceUnavailableHint:"Existing local test runs remain visible. The evidence catalog cannot currently be loaded completely.",evidenceUnconfigured:"Evidence is not connected yet",evidenceUnconfiguredHint:"Local test runs are available. Evidence and documents appear when the connection is configured.",
  testRun:"Test-account run",evidenceRun:"Evidence entry",evidenceOnly:"No test-account run is evidenced by this entry. This record comes from the evidence service.",unknownResult:"No result recorded",released:"Accounts released",published:"Published",reserved:"Accounts reserved",running:"Running",finished:"Run finished",draft:"Draft",processing:"Processing",quarantined:"Restricted",archived:"Access withdrawn",unknownStatus:"Unknown status",
  files:"Evidence",fileCount:"files",unknownCount:"Count unavailable",noFiles:"No evidence linked to this entry.",links:"Links",noLinks:"No explicit links recorded.",addLink:"Add link",referenceHint:"Only explicitly recorded issues, PRs, documents and test runs are shown.",activity:"Activity",noEvents:"No recorded steps.",repository:"Repository",version:"Version",commit:"Commit",owner:"Recorded by",open:"Open evidence",openDocument:"Open document",pending:"Not available yet",ready:"Ready",rejected:"Rejected",issue:"Issue",pullRequest:"Pull request",githubUrl:"GitHub URL",linkKind:"Link type",saveLink:"Save link",saving:"Saving …",cancel:"Cancel",invalidLink:"Enter a full HTTPS URL for a GitHub issue or pull request.",linkError:"The link could not be saved.",linkDescription:"This association is saved explicitly for this entry. It is not inferred from a date or commit.",events:{run_reserved:"Test accounts reserved",run_running:"Test run started",run_passed:"Test result: passed",run_created:"Test run created",run_started:"Test run started",run_finished:"Test result recorded",run_released:"Test accounts released",run_failed:"Failure recorded",reference_added:"Link added",created:"Entry created",published:"Evidence published"},genericEvent:"Activity recorded"
 }
} as const;
export function workspaceResultLabel(result:WorkspaceResult|null,locale:Locale) {
 const labels={passed:{de:"Bestanden",en:"Passed"},failed:{de:"Fehlgeschlagen",en:"Failed"},flaky:{de:"Instabil",en:"Flaky"},blocked:{de:"Blockiert",en:"Blocked"},informational:{de:"Informativ",en:"Informational"}};
 return result?labels[result][locale]:workspaceCopy[locale].unknownResult;
}
export function WorkspaceResultBadge({result,locale}:{result:WorkspaceResult|null;locale:Locale}) {
 const Icon=result==="passed"?CheckCircle2Icon:result==="failed"||result==="blocked"?CircleAlertIcon:result==="flaky"?Clock3Icon:result?InfoIcon:MinusIcon;
 return <Badge variant={result==="failed"?"destructive":"outline"}><Icon data-icon="inline-start"/>{workspaceResultLabel(result,locale)}</Badge>;
}
export function workspaceLifecycle(run:WorkspaceRunSummary,locale:Locale) {
 const text=workspaceCopy[locale];
 return ({released:text.released,published:text.published,reserved:text.reserved,running:text.running,passed:text.finished,failed:text.finished,draft:text.draft,processing:text.processing,quarantined:text.quarantined,archived:text.archived})[run.lifecycle]??text.unknownStatus;
}
const workspaceDateFormatters = {
 de: new Intl.DateTimeFormat("de-DE", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),
 en: new Intl.DateTimeFormat("en-GB", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})
};
export function workspaceDate(value:string,locale:Locale) {
 const date=new Date(value);return Number.isNaN(date.getTime())?"—":workspaceDateFormatters[locale].format(date);
}
export function workspaceEventLabel(event:WorkspaceEvent,locale:Locale) {
 const labels:Record<string,string>=workspaceCopy[locale].events;return labels[event.type]??workspaceCopy[locale].genericEvent;
}

/** Display recorded counters only; absence never becomes a fabricated zero. */
export function workspaceEventCounts(event:WorkspaceEvent,locale:Locale):string|null {
 const labels={checks:locale==="de"?"Prüfungen":"Checks",failures:locale==="de"?"Fehler":"Failures"};
 const values=(["checks","failures"] as const).flatMap(key=>{const value=event.payload[key];return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?[labels[key]+": "+value]:[];});
 return values.length?values.join(" · "):null;
}
