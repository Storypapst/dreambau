(function(){
'use strict';
(function(){var n=document.getElementById('nojs');if(n)n.parentNode.removeChild(n);})();

/* ───────────── Daten (Quelle: build.py, Stand 22.10.2026; Ausgangscode-Kacheln aus feature-inventory.md) ───────────── */

var SB_FE = {u:'https://dev.oriso.org/storybook-frontend/', de:'Storybook Beratungs-App', en:'Storybook counselling app'};
var SB_AD = {u:'https://dev.oriso.org/storybook-admin/', de:'Storybook Verwaltung', en:'Storybook administration'};
var DOCS  = {u:'https://docs.oriso.org/', de:'Dokumentation', en:'Documentation'};
var ADR   = {u:'https://docs.oriso.org/decisions/', de:'Architekturentscheidungen', en:'Architecture decisions'};
var UND   = {u:'https://understand.oriso.org/', de:'ORISO Understand', en:'ORISO Understand'};
var DSFA  = {u:'https://understand.oriso.org/legal/dsfa/', de:'Datenschutz-Folgenabschätzung', en:'Data protection impact assessment'};

/* Kachel: t=Titel kurz, was, warum (nur wenn in der Quelle), um=Umfang, w=Gewicht (Tests; sonst Zeilen÷25; sonst Standard), cat: b|x, st: ok|open|unk */
var GROUPS = [
 {id:'CAR-01', name:{de:'Supervision',en:'Supervision'}, meta:{de:'Fassung 3 · 280 Stunden',en:'Version 3 · 280 hours'},
  b:{de:['Supervisor-Rolle mit Rechten je Fall','Nur-Lese-Ansicht mit eigenem Supervisions-Chat','Schlüssel für supervidierte Räume','Nachrichten für die Supervision unscharf schalten oder ausblenden'],
     en:['Supervisor role with rights per case','Read-only view with its own supervision chat','Keys for supervised rooms','Blur or hide messages for supervision']},
  tiles:[
   {cat:'b',st:'ok',w:238,t:{de:'Supervisionsraum und Supervisor-Rolle',en:'Supervision room and supervisor role'},
    was:{de:'Getrennter Supervisionsraum, Nur-Lese-Zugriff, Supervisor-Rolle.',en:'Separate supervision room, read-only access, supervisor role.'},
    um:{de:['238 Tests'],en:['238 tests']}, links:[SB_FE]},
   {cat:'b',st:'unk',t:{de:'Unscharf schalten / Ausblenden',en:'Blur / hide messages'},
    was:{de:'Nachrichten für die Supervision unscharf schalten oder ausblenden. Umfang mit Caritas zu klären.',en:'Blur or hide messages for supervision. Scope to be clarified with Caritas.'}},
   {cat:'x',t:{de:'Opt-out der Ratsuchenden',en:'Opt-out for help-seekers'},
    was:{de:'Ratsuchende können der Supervision ihres Falls widersprechen.',en:'Help-seekers can opt out of supervision of their case.'}},
   {cat:'x',t:{de:'Fest zuweisbare Supervisoren',en:'Assignable supervisors'},
    was:{de:'Fest zuweisbare Supervisoren: einzelne Personen je Beratendem, zugewiesen über die Verwaltungsoberfläche.',en:'Fixed supervisors: individual people per counsellor, assigned in the administration interface.'}, links:[SB_AD]},
   {cat:'x',t:{de:'Sprach-Feedback neben dem Fall',en:'Voice feedback next to the case'},
    was:{de:'Sprach-Feedback: Sprachchat der Supervision direkt neben dem Fall (Side-by-Side).',en:'Voice feedback: the supervision voice chat sits right next to the case (side by side).'}},
   {cat:'x',t:{de:'Filter für Supervisoren',en:'Filter for supervisors'},
    was:{de:'Eigener Filter für Supervisoren über alle ihre Supervisionsgespräche in der App.',en:'A dedicated filter for supervisors across all their supervision conversations in the app.'}}
  ]},
 {id:'CAR-02', name:{de:'Anonymer Live-Chat',en:'Anonymous live chat'}, meta:{de:'Fassung 3 · 240 Stunden',en:'Version 3 · 240 hours'},
  b:{de:['Warteschlange','Automatisches Löschen anonymer Chats','Echtzeit-Ereignisse für Beitritt, Austritt, Verfügbarkeit','Wartebildschirm, Annahme-Ansicht, Umwandlung in ein Konto'],
     en:['Waiting queue','Automatic deletion of anonymous chats','Real-time events for joining, leaving, availability','Waiting screen, acceptance view, conversion into an account']},
  tiles:[
   {cat:'b',st:'ok',w:444,t:{de:'Live-Chat mit Warteschlange',en:'Live chat with queue'},
    was:{de:'Live-Chat mit Warteschlange und Positionsanzeige, Annahme durch Beratende, Verfügbarkeit, automatisches Löschen.',en:'Live chat with queue and position display, acceptance by counsellors, availability, automatic deletion.'},
    um:{de:['444 Tests'],en:['444 tests']}, links:[SB_FE]},
   {cat:'b',st:'unk',t:{de:'Umwandlung in ein Konto',en:'Conversion into an account'},
    was:{de:'Umwandlung eines anonymen Chats in ein Konto. Umfang mit Caritas zu klären.',en:'Converting an anonymous chat into an account. Scope to be clarified with Caritas.'}},
   {cat:'b',st:'unk',t:{de:'Löschfrist anonymer Chats',en:'Retention period for anonymous chats'},
    was:{de:'Löschfrist anonymer Chats: Angebot nennt 3 Stunden, eingestellt sind derzeit 47 Stunden – mit Caritas abzustimmen.',en:'Retention period for anonymous chats: the offer states 3 hours, currently 47 hours are configured – to be agreed with Caritas.'}},
   {cat:'x',w:111,t:{de:'Warteschlange exakt über mehrere Server',en:'Exact queue across several servers'},
    was:{de:'Warteschlange live und exakt gemessen, auch wenn mehrere Server parallel laufen.',en:'The queue is measured live and exactly, even when several servers run in parallel.'},
    um:{de:['111 Tests'],en:['111 tests']}},
   {cat:'x',t:{de:'Interaktive Elemente im Warteraum',en:'Interactive elements in the waiting room'},
    was:{de:'Interaktive Elemente im Warteraum: kurze Atemübung, Infobereiche, anschauliche Erklärung, wie der Chat abläuft.',en:'Interactive elements in the waiting room: a short breathing exercise, information areas, a clear explanation of how the chat works.'}, links:[SB_FE]},
   {cat:'x',t:{de:'Live-Chat für alle Themengebiete',en:'Live chat for all topic areas'},
    was:{de:'Live-Chat für alle Themengebiete, über Links, die in der Verwaltung erstellt werden.',en:'Live chat for all topic areas, via links created in the administration.'}},
   {cat:'x',w:151,t:{de:'Pseudonym mit Tier-Avatar',en:'Pseudonym with animal avatar'},
    was:{de:'Pseudonym mit Tier-Avatar, das Ratsuchende vor dem Chat sehen und bestätigen; automatisch erzeugte Namen gab es schon im Ausgangscode.',en:'Pseudonym with an animal avatar that help-seekers see and confirm before the chat; automatically generated names already existed in the starting code.'},
    um:{de:['3.786 Zeilen Code'],en:['3,786 lines of code']}}
  ]},
 {id:'CAR-03', name:{de:'KDG-Anpassung',en:'KDG compliance'}, meta:{de:'Fassung 5 · 200 Stunden',en:'Version 5 · 200 hours'},
  b:{de:['Aufbewahrungsfristen je Mandant','Täglicher Bereinigungsjob','Fristen-Hinweis für Ratsuchende','Admin-Oberfläche für Fristen'],
     en:['Retention periods per tenant','Daily clean-up job','Notice of retention periods for help-seekers','Admin interface for retention periods']},
  tiles:[
   {cat:'b',st:'ok',t:{de:'Automatische Löschabläufe',en:'Automatic deletion runs'},
    was:{de:'Automatische Löschabläufe mit festen Fristen je Datenart, auch für neue Datenarten wie Team-Besprechungen und Benachrichtigungen; einzelne Abläufe sind bis zum Löschkonzept abgeschaltet.',en:'Automatic deletion runs with fixed periods per data type, also for new data types such as team discussions and notifications; some runs stay switched off until the deletion concept exists.'}},
   {cat:'b',st:'open',t:{de:'Löschfristen je Träger einstellen',en:'Retention periods per provider'},
    was:{de:'Löschfristen je Träger selbst einstellen (Verwaltungsoberfläche) und Ratsuchenden anzeigen.',en:'Providers set their own retention periods (administration interface) and show them to help-seekers.'}},
   {cat:'b',st:'open',t:{de:'Verbindliches Löschkonzept',en:'Binding deletion concept'},
    was:{de:'Verbindliches Löschkonzept erstellen und die standardmäßig abgeschalteten Löschjobs einschalten.',en:'Write a binding deletion concept and switch on the deletion jobs that are off by default.'}, links:[DSFA]},
   {cat:'x',w:651,hl:1,t:{de:'Fallübergabe',en:'Case handover'},
    was:{de:'Ersetzt die offene Team-Beratungsstelle, in der alle in alle Fälle sehen konnten. Einfaches Zuweisen an andere Beratende gab es schon im Ausgangscode. Fälle werden mit Grund abgegeben oder geholt, als Einsichtnahme oder Übernahme, mit Zustimmung der Ratsuchenden, Rückgabe und Sammelübergabe. Ein Fall lässt sich auch aus der Ferne holen, wenn die bisherige Beratende nicht erreichbar ist. Die Nachrichten sind nur für die Beratenden derselben Beratungsstelle verschlüsselt; eine Übergabe ändert nur, wer den Fall sieht. Gründe und Systembenachrichtigungen sind je Grund einstellbar.',
         en:'Replaces the open team counselling centre, where everyone could see every case. Simple reassignment to other counsellors already existed in the starting code. Cases are handed over or taken over with a reason, as a view or a full takeover, with the help-seeker’s consent, return and bulk handover. A case can also be fetched remotely when the previous counsellor cannot be reached. Messages are encrypted only for counsellors of the same counselling centre; a handover changes only who sees the case. Reasons and system notifications are configurable per reason.'},
    warum:{de:'Datenschutz und Arbeitsschutz: Nur wer den Fall braucht, sieht ihn. Bei Urlaub, Krankheit oder Ausscheiden gehen Fälle nicht verloren, und der Verlauf bleibt vollständig.',
           en:'Data protection and staff protection: only those who need the case see it. Cases are not lost during holidays, illness or when someone leaves, and the history stays complete.'},
    um:{de:['651 Tests','11.803 Zeilen Code'],en:['651 tests','11,803 lines of code']}, links:[SB_FE,UND]},
   {cat:'x',w:312,hl:1,t:{de:'Kontolöschung mit Schutzfenster',en:'Account deletion with safety window'},
    was:{de:'Kontolöschung gab es schon im Ausgangscode. Neu ist ein 48-Stunden-Schutzfenster vor der endgültigen Löschung; danach wird sauber über Datenbank, Anmeldung und Chat hinweg gelöscht.',
         en:'Account deletion already existed in the starting code. New is a 48-hour safety window before final deletion; after that, data is deleted cleanly across database, login and chat.'},
    warum:{de:'Keine Datenreste in Nebensystemen; Fehlbedienung lässt sich rückgängig machen.',en:'No leftover data in side systems; mistakes can be undone.'},
    um:{de:['312 Tests','vorher rund 95 Tests'],en:['312 tests','previously about 95 tests']}},
   {cat:'x',t:{de:'Lösch-Aktionen für jede neue Datenart',en:'Deletion actions for every new data type'},
    was:{de:'Lösch-Aktionen für jede neue Datenart.',en:'Deletion actions for every new data type.'}}
  ]},
 {id:'CAR-13', name:{de:'Mandantenfähigkeit und Verwaltung',en:'Multi-tenancy and administration'}, meta:{de:'Fassung 6 (ergänzend Fassung 5) · 280 Stunden',en:'Version 6 (plus version 5) · 280 hours'},
  b:{de:['Mandantentrennung','Verwaltung von Mandanten, Agenturen, Beratungsarten, Fachbereichen mit eigenem Impressum und Datenschutz','Vertragsunterlagen (Auftragsverarbeitung) je Träger','Admins und Beratende verwalten, Rollen je Mandant','Statistik in drei Ebenen','2FA (Zwei-Faktor-Anmeldung)','QR- und Direktlinks'],
     en:['Tenant separation','Administration of tenants, agencies, counselling types and departments with their own imprint and privacy notice','Contract documents (data processing) per provider','Manage admins and counsellors, roles per tenant','Statistics on three levels','2FA (two-factor login)','QR and direct links']},
  tiles:[
   {cat:'b',st:'ok',w:1612,t:{de:'Mandantentrennung und Verwaltung',en:'Tenant separation and administration'},
    was:{de:'Mandantentrennung; Verwaltung von Mandanten, Agenturen, Beratungsarten und Fachbereichen mit eigenem Impressum und Datenschutz; Admins und Beratende, Rollen je Mandant; QR- und Direktlinks – mit eigenen Trennungstests.',
         en:'Tenant separation; administration of tenants, agencies, counselling types and departments with their own imprint and privacy notice; admins and counsellors, roles per tenant; QR and direct links – with dedicated separation tests.'},
    um:{de:['1.612 Tests'],en:['1,612 tests']}, links:[SB_AD]},
   {cat:'b',st:'ok',w:662,t:{de:'Ablauf der Vertragsunterlagen',en:'Contract documents workflow'},
    was:{de:'Vertragsunterlagen (Auftragsverarbeitung) je Träger, mit Ablauf in der Verwaltung.',en:'Contract documents (data processing) per provider, with a workflow in the administration.'},
    um:{de:['662 Tests'],en:['662 tests']}, links:[SB_AD]},
   {cat:'b',st:'ok',w:129,t:{de:'Statistik in drei Ebenen',en:'Statistics on three levels'},
    was:{de:'Statistik in drei Ebenen.',en:'Statistics on three levels.'}, um:{de:['129 Tests'],en:['129 tests']}},
   {cat:'b',st:'ok',w:190,t:{de:'Pflicht-2FA',en:'Mandatory 2FA'},
    was:{de:'Zwei-Faktor-Anmeldung als Pflicht.',en:'Two-factor login as a requirement.'}, um:{de:['190 Tests'],en:['190 tests']}},
   {cat:'b',st:'open',t:{de:'Abnahmetest mit Leitungen',en:'Acceptance test with centre heads'},
    was:{de:'UAT (Abnahmetest) mit Beratungsstellenleitungen (Anfang November).',en:'UAT (user acceptance test) with heads of counselling centres (early November).'}},
   {cat:'x',t:{de:'Statistik mit Schutz kleiner Zahlen',en:'Statistics that protect small numbers'},
    was:{de:'Statistik mit Schutz kleiner Zahlen: Werte einer Beratungsstelle oder eines Trägers erscheinen erst, wenn mindestens fünf Beratende dahinterstehen; die eigenen Zahlen der Beratenden werden pseudonymisiert gespeichert.',
         en:'Statistics that protect small numbers: figures for a counselling centre or provider appear only when at least five counsellors stand behind them; counsellors’ own figures are stored pseudonymised.'}},
   {cat:'x',w:375,hl:1,t:{de:'Funktionsfreigaben je Ebene und Chat-Art',en:'Feature permissions per level and chat type'},
    was:{de:'Eine eigene Oberfläche, in der Plattform, Träger und Beratungsstelle festlegen, welche Funktionen in welcher Chat-Art erlaubt sind: Anrufe, Uploads, Benachrichtigungen, Fallübergabe, Gruppen. 55 Schalter, serverseitig durchgesetzt, Vorgaben werden nach unten vererbt und können gesperrt werden.',
         en:'A dedicated interface in which platform, provider and counselling centre decide which functions are allowed in which chat type: calls, uploads, notifications, case handover, groups. 55 switches, enforced on the server; settings are inherited downwards and can be locked.'},
    warum:{de:'Jeder Träger arbeitet anders. Ohne Freigaben müsste jede Anpassung programmiert werden; mit ihnen stellt der Träger es selbst ein, ohne andere Träger zu berühren. Mit CAR-07 beauftragt waren feste Voreinstellungen ohne neue Auslieferung, nicht die drei Ebenen und die Regeln je Chat-Art.',
           en:'Every provider works differently. Without permissions every adjustment would have to be programmed; with them the provider sets it up alone, without touching other providers. CAR-07 commissioned fixed defaults without a new release, not the three levels and the rules per chat type.'},
    um:{de:['Verwaltungsoberfläche rund 3.100 Zeilen Code, 180 Tests','Durchsetzung im Backend 195 Tests'],en:['Administration interface about 3,100 lines of code, 180 tests','Enforcement in the backend 195 tests']}, links:[SB_AD,ADR]},
   {cat:'x',w:1300,hl:1,t:{de:'Rechtstexte: Vorlagen, Vererbung, Versionen',en:'Legal texts: templates, inheritance, versions'},
    was:{de:'Die Plattform stellt Vorlagen für Impressum, Datenschutzerklärung und Einwilligungssatz bereit. Träger, Beratungsstellen und Fachbereiche übernehmen sie halbautomatisch; im einfachsten Fall trägt eine Beratungsstelle nur noch ihre Datenschutzbeauftragte ein. Jede Fassung wird versioniert und lässt sich mit der Vorlage vergleichen und per KI übersetzen. Ändert sich ein Text, werden Ratsuchende im Chat darauf hingewiesen.',
         en:'The platform provides templates for imprint, privacy notice and consent statement. Providers, counselling centres and departments adopt them semi-automatically; in the simplest case a counselling centre only enters its data protection officer. Every version is tracked, can be compared with the template and translated with AI. When a text changes, help-seekers are notified in the chat.'},
    warum:{de:'Der Betreiber gibt die Verantwortung für die Texte an den Träger ab, und der Träger kann sie an seine Beratungsstellen weitergeben. Das verschlankt das rechtliche Backoffice. Eigene Texte je Beratungsstelle waren in CAR-13 beauftragt, Vorlagen und Vererbung nicht.',
           en:'The operator hands responsibility for the texts to the provider, and the provider can pass it on to its counselling centres. This slims down the legal back office. Separate texts per counselling centre were commissioned in CAR-13; templates and inheritance were not.'},
    um:{de:['rund 1.300 Tests','rund 21.000 Zeilen Code'],en:['about 1,300 tests','about 21,000 lines of code']}, links:[SB_AD]},
   {cat:'x',w:320,hl:1,t:{de:'Vertragsunterlagen: Weiterleitung und erneute Bestätigung',en:'Contract documents: forwarding and re-confirmation'},
    was:{de:'Wer nicht unterschreiben darf, leitet die Vertragsunterlagen per E-Mail oder Link an die vertretungsberechtigte Person weiter. Die Verwaltung zeigt, ob die E-Mail versendet wurde und ob bestätigt ist; nach der Bestätigung kommt eine Nachricht per E-Mail. Jede neue Fassung wird erneut bestätigt. Der Betreiber setzt dafür eine Übergangsfrist: Bis dahin arbeiten Träger normal weiter, danach sind nur neue Beratungen gesperrt.',
         en:'Anyone not allowed to sign forwards the contract documents by e-mail or link to the authorised person. The administration shows whether the e-mail was sent and whether it has been confirmed; after confirmation a message arrives by e-mail. Every new version is confirmed again. The operator sets a transition period: until then providers work as usual, afterwards only new counselling sessions are blocked.'},
    warum:{de:'Die Unterschrift liegt in der Praxis selten bei der Person, die die Plattform einrichtet. Laufende Beratungen werden nie unterbrochen. Den Grundablauf hatte CAR-13 beauftragt; die Zahlen betreffen Weiterleitung, erneute Bestätigung und Frist.',
           en:'In practice, the person who signs is rarely the person who sets up the platform. Ongoing counselling is never interrupted. CAR-13 commissioned the basic workflow; the figures cover forwarding, re-confirmation and the deadline.'},
    um:{de:['rund 320 Tests','rund 4.100 Zeilen Code'],en:['about 320 tests','about 4,100 lines of code']}, links:[SB_AD]},
   {cat:'x',w:260,hl:1,t:{de:'Eigenes Erscheinungsbild je Träger',en:'Own look per provider'},
    was:{de:'Träger stellen ihre Farben in der Verwaltung selbst ein: dunkle und helle Akzentfarbe sowie Fehlerfarbe. Die Plattform leitet daraus alle Farbtöne ab, zeigt vorher und nachher in einer App-Vorschau und warnt, wenn eine Farbe zu blass ist oder sich mit der Fehlerfarbe verwechseln lässt. Dazu kommen Logo, Verbandslogo und ein wählbarer Effekt auf der Anmeldeseite.',
         en:'Providers set their own colours in the administration: dark and light accent colour plus error colour. The platform derives all shades from them, shows before and after in an app preview and warns when a colour is too pale or could be confused with the error colour. On top come logo, association logo and a selectable effect on the login page.'},
    warum:{de:'Ratsuchende erkennen ihren Träger wieder, ohne dass für jeden Träger programmiert wird. Logo und Grundfarben gab es schon im Ausgangscode; die durchgängige Farbquelle mit Kontrastprüfung für alle Seiten ist Teil von CAR-15.',
           en:'Help-seekers recognise their provider without programming work for each provider. Logo and base colours already existed in the starting code; a single colour source with contrast checks for all pages is part of CAR-15.'},
    um:{de:['rund 260 Tests','rund 6.500 Zeilen Code'],en:['about 260 tests','about 6,500 lines of code']}, links:[SB_AD]},
   {cat:'x',w:370,hl:1,t:{de:'E-Mails im Namen des Trägers',en:'E-mails in the provider’s name'},
    was:{de:'Jeder Träger versendet über seinen eigenen Mailserver, mit Testversand; Passwörter liegen nie im Klartext. Alle Mails erscheinen im Erscheinungsbild des Trägers: Logo oder Verbandslogo, Farbe und Fußzeile mit eigenem Impressum und Datenschutz. Eine Vorschau in der Verwaltung zeigt die Mail vor dem Versand.',
         en:'Each provider sends through its own mail server, with a test send; passwords are never stored in plain text. All mails use the provider’s look: logo or association logo, colour and a footer with its own imprint and privacy notice. A preview in the administration shows the mail before sending.'},
    warum:{de:'Mails kommen als Mails des Trägers an, nicht als Mails einer fremden Plattform; Zugangsdaten sind geschützt.',en:'Mails arrive as the provider’s mails, not as mails from an unknown platform; credentials are protected.'},
    um:{de:['rund 370 Tests','rund 11.000 Zeilen Code'],en:['about 370 tests','about 11,000 lines of code']}},
   {cat:'x',w:147,hl:1,t:{de:'E-Mail-Vorlagen',en:'E-mail templates'},
    was:{de:'Plattform, Träger und Beratungsstellen-Leitungen legen eigene Vorlagen für Einladungs-Mails an, mit Platzhaltern und einer Vorschau vor dem Versand. Eine Vorlage gehört dem Träger, in dem sie angelegt wurde; andere Träger sehen sie nicht. Standardvorlagen liegen auf Deutsch und Englisch bei. Alle übrigen Mails kommen aus einem gemeinsamen Katalog mit 24 Anlässen in sieben Sprach- und Anredevarianten.',
         en:'Platform, providers and heads of counselling centres create their own templates for invitation mails, with placeholders and a preview before sending. A template belongs to the provider where it was created; other providers do not see it. Default templates come in German and English. All other mails come from a shared catalogue with 24 occasions in seven language and form-of-address variants.'},
    warum:{de:'Jeder Träger spricht die Eingeladenen in eigenen Worten an, ohne Entwicklungsaufwand. Französisch, Russisch, Türkisch und Tigrinya sind im Katalog maschinell übersetzt; die Prüfung durch Muttersprachler steht aus.',
           en:'Each provider addresses invitees in its own words, without development effort. French, Russian, Turkish and Tigrinya in the catalogue are machine-translated; review by native speakers is pending.'},
    um:{de:['147 Tests','rund 1.400 Zeilen Code'],en:['147 tests','about 1,400 lines of code']}},
   {cat:'x',w:199,hl:1,t:{de:'Einladungen mit Fortschrittsanzeige',en:'Invitations with progress tracking'},
    was:{de:'Die Verwaltung verfolgt jede Einladung bis zum fertigen Konto: vorbereitet, eingeladen, Konto angelegt, fertig, oder „braucht Aktion“ mit Grund, etwa Mail nicht zustellbar oder Link abgelaufen. Einladungen in eine Beratungsstelle, die es noch nicht gibt, warten ungesendet, bis deren erste Leitung sich eingerichtet hat. In einer Einladungsrunde oder per Tabelle lassen sich mehrere neue Beratungsstellen samt Leitung, Beratenden und Themenrechten anlegen.',
         en:'The administration tracks each invitation through to the finished account: prepared, invited, account created, done, or “needs action” with a reason, such as mail undeliverable or link expired. Invitations to a counselling centre that does not exist yet wait unsent until its first head has set up. In one invitation round or via a spreadsheet, several new counselling centres can be created with heads, counsellors and topic rights.'},
    warum:{de:'Bei vielen Einladungen sieht der Träger auf einen Blick, wer wo hängt, und keine Einladung geht ins Leere.',en:'With many invitations the provider sees at a glance who is stuck where, and no invitation gets lost.'},
    um:{de:['199 Tests','rund 3.800 Zeilen Code'],en:['199 tests','about 3,800 lines of code']}, links:[SB_AD]},
   {cat:'x',w:370,hl:1,t:{de:'Rollen- und Stellenwechsel',en:'Role and centre changes'},
    was:{de:'Wer einen Träger oder eine Beratungsstelle verwaltet, kann zusätzlich selbst beraten. Beratende können weiteren Beratungsstellen zugeordnet oder aus einer herausgenommen werden. Die Zugänge zu den verschlüsselten Gesprächsräumen werden dabei automatisch nachgezogen oder entzogen.',
         en:'People who manage a provider or counselling centre can also counsel themselves. Counsellors can be added to further counselling centres or removed from one. Access to the encrypted conversation rooms is granted or withdrawn automatically.'},
    warum:{de:'In kleinen Stellen beraten Leitungen mit, und Personal wechselt. Wegen der Verschlüsselung entscheidet jede solche Änderung, wer welche Gespräche lesen kann; das muss ohne Handarbeit und ohne Lücken laufen.',
           en:'In small centres the heads also counsel, and staff change. Because of encryption, every such change decides who can read which conversations; this must work without manual steps and without gaps.'},
    um:{de:['rund 370 Tests','rund 6.400 Zeilen Code'],en:['about 370 tests','about 6,400 lines of code']}}
  ]},
 {id:'CAR-05', name:{de:'Spring Boot und Java',en:'Spring Boot and Java'}, meta:{de:'Fassung 3 · 416 Stunden',en:'Version 3 · 416 hours'},
  b:{de:['Spring Boot 4, Java 21','Monitoring und Tracing','Runbooks (Betriebsanleitungen)'],en:['Spring Boot 4, Java 21','Monitoring and tracing','Runbooks (operating manuals)']},
  tiles:[
   {cat:'b',st:'ok',t:{de:'Spring Boot 4.0 und Java 21',en:'Spring Boot 4.0 and Java 21'},
    was:{de:'Spring Boot 4.0 und Java 21 in allen Diensten (vorher Spring Boot 3.3, Java 17).',en:'Spring Boot 4.0 and Java 21 in all services (previously Spring Boot 3.3, Java 17).'}},
   {cat:'b',st:'ok',w:75,t:{de:'Betriebsüberwachung über SigNoz',en:'Monitoring with SigNoz'},
    was:{de:'Betriebsüberwachung über SigNoz: Nachverfolgung von Anfragen und Messwerte.',en:'Operational monitoring with SigNoz: request tracing and metrics.'},
    um:{de:['rund 75 Tests'],en:['about 75 tests']}},
   {cat:'b',st:'ok',t:{de:'17 Runbooks',en:'17 runbooks'},
    was:{de:'17 Runbooks: Betriebsanleitungen für den Störungsfall.',en:'17 runbooks: operating manuals for incidents.'}, links:[DOCS]},
   {cat:'b',st:'ok',t:{de:'Keycloak 26.6.3',en:'Keycloak 26.6.3'},
    was:{de:'Keycloak (Anmeldesystem) auf 26.6.3: Server, Zwei-Faktor, Dienste (vorher Zwei-Faktor 22.0.3, Dienste 17.0.0).',en:'Keycloak (login system) on 26.6.3: server, two-factor and services (previously two-factor 22.0.3, services 17.0.0).'}},
   {cat:'b',st:'open',t:{de:'Lasttests',en:'Load tests'},
    was:{de:'Lasttests (Teil der Stabilisierung in CAR-15).',en:'Load tests (part of the stabilisation in CAR-15).'}},
   {cat:'x',w:229,t:{de:'Prüfung von Schnittstellen und Datenbank',en:'Interface and database checks'},
    was:{de:'Automatische Prüfung, dass Schnittstellen und Datenbank der Dienste zusammenpassen, in 4 Diensten.',en:'Automatic check that the services’ interfaces and database fit together, in 4 services.'},
    um:{de:['229 Tests'],en:['229 tests']}, links:[ADR]}
  ]},
 {id:'CAR-06', name:{de:'Video',en:'Video'}, meta:{de:'Fassung 3 · 240 Stunden',en:'Version 3 · 240 hours'},
  b:{de:['Selbst betriebenes Video über LiveKit','Einheitlicher Video-Container, mobil im Hochformat','Anbindung externer Anbieter per Schnittstelle'],en:['Self-hosted video via LiveKit','Uniform video container, portrait on mobile','Connecting external providers via an interface']},
  tiles:[
   {cat:'b',st:'ok',w:501,t:{de:'Video über LiveKit',en:'Video via LiveKit'},
    was:{de:'Video über LiveKit, Gruppenanrufe, eigener, stark angepasster Video-Container (auf Basis von Element Call), Anruf-Regeln je Chat-Art.',en:'Video via LiveKit, group calls, own heavily adapted video container (based on Element Call), call rules per chat type.'},
    um:{de:['501 Tests'],en:['501 tests']}, links:[SB_FE]},
   {cat:'b',st:'open',t:{de:'Externe Anbieter (Zoom, Teams, Jitsi)',en:'External providers (Zoom, Teams, Jitsi)'},
    was:{de:'Anbindung externer Anbieter (Zoom, Teams, Jitsi).',en:'Connecting external providers (Zoom, Teams, Jitsi).'}},
   {cat:'x',w:150,hl:1,t:{de:'Vorraum, Anrufstatus und Sprachnachrichten',en:'Lobby, call status and voice messages'},
    was:{de:'Geräte-Check vor dem Anruf (Mikrofonpegel, Lautsprechertest, Kamera-Vorschau, Notizen im Chat), Anrufstatus im Verlauf („läuft / verpasst / beendet“), Sprachnachrichten. Anrufe ohne Kamera gab es schon im Ausgangscode; sie laufen jetzt über die eigene Videotechnik.',en:'Device check before the call (microphone level, speaker test, camera preview, notes in the chat), call status in the history (“running / missed / ended”), voice messages. Calls without camera already existed in the starting code; they now run on our own video technology.'},
    warum:{de:'Weniger Abbrüche durch Technikprobleme. Wer ungern schreibt, kann eine Sprachnachricht schicken.',en:'Fewer drop-outs caused by technical problems. People who dislike writing can send a voice message.'},
    um:{de:['rund 150 Tests','rund 4.000 Zeilen Code'],en:['about 150 tests','about 4,000 lines of code']}, links:[SB_FE]}
  ]},
 {id:'CAR-07', name:{de:'Matrix-Migration',en:'Matrix migration'}, meta:{de:'540 Stunden',en:'540 hours'},
  b:{de:['Rocket.Chat durch Matrix ersetzen','Räume je Agentur und Thema','Upload','Betrieb mit Betriebsüberwachung und Backups','Verschlüsselung prüfen, Schlüssel-Sicherung und Wiederherstellung','Willkommens-Nachricht'],
     en:['Replace Rocket.Chat with Matrix','Rooms per agency and topic','Upload','Operation with monitoring and backups','Review encryption, key backup and recovery','Welcome message']},
  tiles:[
   {cat:'b',st:'ok',w:3094,t:{de:'Matrix statt Rocket.Chat',en:'Matrix instead of Rocket.Chat'},
    was:{de:'Matrix statt Rocket.Chat mit eigener Chat-Oberfläche, Upload, Betriebsüberwachung, Runbooks.',en:'Matrix instead of Rocket.Chat with its own chat interface, upload, monitoring, runbooks.'},
    um:{de:['3.094 Tests (Chat-Kern)'],en:['3,094 tests (chat core)']}, links:[SB_FE,ADR]},
   {cat:'b',st:'ok',w:295,t:{de:'Schlüssel-Backup mit Wiederherstellung',en:'Key backup with recovery'},
    was:{de:'Schlüssel-Backup mit Wiederherstellung: Verlauf bleibt nach Passwortwechsel lesbar.',en:'Key backup with recovery: the history stays readable after a password change.'},
    um:{de:['295 Tests'],en:['295 tests']}},
   {cat:'b',st:'open',t:{de:'Lasttests und Skalierung',en:'Load tests and scaling'},
    was:{de:'Lasttests und Skalierung über mehrere Server (Teil der Stabilisierung in CAR-15).',en:'Load tests and scaling across several servers (part of the stabilisation in CAR-15).'}},
   {cat:'x',w:210,hl:1,t:{de:'Höhere Schlüssel-Sicherheit, je Rolle einstellbar',en:'Stronger key security, per role'},
    was:{de:'Beauftragt waren mit CAR-07 das Schlüssel-Backup, der Wiederherstellungsschlüssel und die gegenseitige Bestätigung der Geräte. Darüber hinaus legt die Plattform-Administration in der Verwaltung getrennt für Ratsuchende und Beratende fest, ob neue Konten ihren Verlauf mit dem Anmeldepasswort oder mit einem eigenen Wiederherstellungsschlüssel entsperren. Dazu kommen zwei Schutzstufen aus dem Element-Projekt: Nachrichten bleiben lesbar, auch wenn sie während einer Abmeldung eintreffen, und Schlüssel gehen auf Wunsch nur an bestätigte Geräte.',
         en:'CAR-07 commissioned the key backup, the recovery key and mutual device verification. Beyond that, platform administration decides in the administration, separately for help-seekers and counsellors, whether new accounts unlock their history with the login password or with their own recovery key. On top come two protection levels from the Element project: messages stay readable even if they arrive while logged out, and keys can be limited to verified devices.'},
    warum:{de:'Ein höheres Schutzniveau, etwa für Beratende, lässt sich mit einer Einstellung einschalten, ohne neue Entwicklung und ohne Ratsuchende zu überfordern. Zwei der Stufen sind fertig gebaut und werden je Installation zugeschaltet.',
           en:'A higher protection level, for example for counsellors, can be switched on with one setting, without new development and without overwhelming help-seekers. Two of the levels are fully built and are switched on per installation.'},
    um:{de:['rund 210 Tests','rund 4.000 Zeilen Code'],en:['about 210 tests','about 4,000 lines of code']}},
   {cat:'x',w:151,t:{de:'Mehrsprachige automatische Erstantwort',en:'Multilingual automatic first reply'},
    was:{de:'Mehrsprachige automatische Erstantwort.',en:'Multilingual automatic first reply.'}, um:{de:['151 Tests'],en:['151 tests']}},
   {cat:'x',t:{de:'Upload-Schalter je Chat-Art',en:'Upload switch per chat type'},
    was:{de:'Upload-Schalter je Chat-Art.',en:'Upload switch per chat type.'}},
   {cat:'x',w:127,t:{de:'E-Mail-Benachrichtigungen je Gesprächsart',en:'E-mail notifications per conversation type'},
    was:{de:'E-Mail-Benachrichtigungen je Gesprächsart einstellbar, getrennt für Ratsuchende und Beratende; vorher nur einfache Schalter.',en:'E-mail notifications configurable per conversation type, separately for help-seekers and counsellors; previously only simple switches.'}, um:{de:['127 Tests'],en:['127 tests']}}
  ]},
 {id:'CAR-08', name:{de:'Frontend React 19',en:'Frontend React 19'}, meta:{de:'Fassung 3 · 180 Stunden',en:'Version 3 · 180 hours'},
  b:{de:['React 19, Router-Update, Abhängigkeiten aktualisiert','Browsertests für Kernabläufe'],en:['React 19, router update, dependencies updated','Browser tests for core flows']},
  tiles:[
   {cat:'b',st:'ok',t:{de:'React 19.2, Router v7',en:'React 19.2, Router v7'},
    was:{de:'React 19.2, Router v7.',en:'React 19.2, Router v7.'}},
   {cat:'b',st:'ok',w:203,t:{de:'203 Browsertests',en:'203 browser tests'},
    was:{de:'203 Browsertests für Kernabläufe.',en:'203 browser tests for core flows.'}, um:{de:['203 Tests'],en:['203 tests']}},
   {cat:'x',w:10000,cap:1,t:{de:'Über 10.000 Logik- und Komponententests',en:'Over 10,000 logic and component tests'},
    was:{de:'Über 10.000 Logik- und Komponententests in Frontend und Verwaltung. Vorher gab es dort nur 169 Browsertests.',en:'Over 10,000 logic and component tests in frontend and administration. Previously there were only 169 browser tests.'},
    warum:{de:'Macht eine Änderung etwas Bestehendes kaputt, schlagen die Tests sofort an. Fehlerhafter Code gelangt so nicht unbemerkt in die Plattform, und das Team liefert schneller aus.',
           en:'If a change breaks something that exists, the tests fail immediately. Faulty code therefore does not slip into the platform unnoticed, and the team ships faster.'},
    um:{de:['10.212 Tests in Frontend und Verwaltung (vorher 169)'],en:['10,212 tests in frontend and administration (previously 169)']}, links:[SB_FE,SB_AD]},
   {cat:'x',w:2720,hl:1,t:{de:'Neugestaltung von Beratungs-App und Verwaltung',en:'Redesign of counselling app and administration'},
    was:{de:'Anmeldung, Registrierung, Profil, Gesprächsliste, Chat und die gesamte Verwaltung wurden in über 150 Schritten nach neuen Figma-Vorlagen einheitlich neu gestaltet, auch für das Handy. Beauftragt war mit CAR-07 die neue Chat-Oberfläche, nicht die übrigen Bereiche.',
         en:'Login, registration, profile, conversation list, chat and the entire administration were redesigned consistently in over 150 steps from new Figma designs, including for mobile. CAR-07 commissioned the new chat interface, not the other areas.'},
    warum:{de:'Ein einheitliches Bild erleichtert die Einarbeitung. Jeder Oberflächenbaustein ist in Storybook einzeln geprüft.',en:'A consistent look makes onboarding easier. Every interface component is checked individually in Storybook.'},
    um:{de:['rund 68.000 Zeilen Code für die Gestaltung','vorher rund 19.000 Zeilen Code'],en:['about 68,000 lines of code for the design','previously about 19,000 lines of code']}, links:[SB_FE,SB_AD]},
   {cat:'x',w:220,hl:1,t:{de:'Mehrsprachigkeit',en:'Multiple languages'},
    was:{de:'Die Beratungs-App ist vollständig in sechs Sprachen verfügbar (Deutsch, Englisch, Französisch, Russisch, Türkisch, Tigrinya), dazu Deutsch in Du-Form; vorher waren es Deutsch (auch in Du-Form) und Englisch. Die Verwaltung ist vollständig auf Deutsch und Englisch, vorher nur auf Deutsch. Rechtstexte lassen sich vor dem Veröffentlichen per KI übersetzen.',
         en:'The counselling app is fully available in six languages (German, English, French, Russian, Turkish, Tigrinya), plus informal German; previously German (including the informal form) and English. The administration is fully in German and English, previously only German. Legal texts can be translated with AI before publishing.'},
    warum:{de:'Viele Ratsuchende sprechen wenig Deutsch. Rechtstexte müssen nicht mehr in jede Sprache von Hand übersetzt werden.',en:'Many help-seekers speak little German. Legal texts no longer have to be translated into every language by hand.'},
    um:{de:['rund 220 Tests','rund 5.300 Zeilen Code','je Sprache rund 4.100 Textbausteine'],en:['about 220 tests','about 5,300 lines of code','about 4,100 text strings per language']}}
  ]},
 {id:'CAR-REFACT', name:{de:'Betrieb und Grundlagen',en:'Operations and foundations'}, meta:{de:'4 × 50 Stunden',en:'4 × 50 hours'},
  b:{de:['Produktionskonfiguration','Versionierte Datenbankschemata','Gruppenchat für weitere Nutzergruppen, auch unter Beratenden (Erstellen, Beitreten, Einladen, Rechte)','Storybook (Katalog der Oberflächenbausteine), HTTPS-Härtung'],
     en:['Production configuration','Versioned database schemas','Group chat for further user groups, also among counsellors (create, join, invite, rights)','Storybook (catalogue of interface components), HTTPS hardening']},
  tiles:[
   {cat:'b',st:'ok',w:782,t:{de:'Gruppenchat, auch unter Beratenden',en:'Group chat, also among counsellors'},
    was:{de:'Gruppenchat für weitere Nutzergruppen, auch unter Beratenden, einschließlich Teamraum für Beratende.',en:'Group chat for further user groups, also among counsellors, including a team room for counsellors.'},
    um:{de:['782 Tests'],en:['782 tests']}, links:[SB_FE]},
   {cat:'b',st:'ok',t:{de:'Produktionskonfiguration und Datenbankschemata',en:'Production configuration and database schemas'},
    was:{de:'Produktionskonfiguration und versionierte Datenbankschemata.',en:'Production configuration and versioned database schemas.'},
    um:{de:['82 Prüfdateien der Betriebskonfiguration'],en:['82 test files for the operating configuration']}},
   {cat:'b',st:'ok',t:{de:'Storybook und HTTPS-Härtung',en:'Storybook and HTTPS hardening'},
    was:{de:'Storybook (Katalog der Oberflächenbausteine) und HTTPS-Härtung.',en:'Storybook (catalogue of interface components) and HTTPS hardening.'}, links:[SB_FE,SB_AD]},
   {cat:'x',w:380,hl:1,t:{de:'Selbsthilfegruppen',en:'Self-help groups'},
    was:{de:'Beauftragt war der Gruppenchat für weitere Nutzergruppen. Daraus sind vollständige Selbsthilfegruppen geworden: Beitrittsanfrage mit Zulassung durch die Leitung, Wartebereich mit Countdown und Gruppenregeln, Übergabe der Gruppenleitung und Teilgruppen, in denen nur Mitglieder lesen. Über einen Gruppenlink ist der Beitritt auch ohne eigenes Konto möglich; dieser Zugang gilt nur im eigenen Browser und wird nach 24 Stunden gelöscht.',
         en:'The group chat for further user groups was commissioned. It became full self-help groups: join requests approved by the group lead, a waiting area with countdown and group rules, handover of group leadership, and sub-groups that only members can read. Via a group link, people can also join without their own account; this access works only in their own browser and is deleted after 24 hours.'},
    warum:{de:'Selbsthilfe braucht geschützte Räume, in die nicht jede Person ungefragt hineinkommt, und eine Leitung, die vertreten werden kann.',en:'Self-help needs protected rooms that not everyone can enter unasked, and a lead who can be covered by someone else.'},
    um:{de:['rund 380 Tests','rund 10.000 Zeilen Code'],en:['about 380 tests','about 10,000 lines of code']}, links:[SB_FE]},
   {cat:'x',w:507,hl:1,nb:1,t:{de:'Gruppentermine und Kalender',en:'Group appointments and calendar'},
    was:{de:'Wiederkehrende Gruppentermine, Zeitleiste mit kommenden Terminen, Erinnerungs-Mails. Einzeltermine und Kalenderdatei gab es schon im Ausgangscode.',en:'Recurring group appointments, a timeline of upcoming appointments, reminder mails. Single appointments and calendar files already existed in the starting code.'},
    warum:{de:'Selbsthilfegruppen und Gruppenangebote lassen sich planen.',en:'Self-help groups and group services can be planned.'},
    um:{de:['507 Tests','rund 5.200 Zeilen Code','vorher 119 Tests'],en:['507 tests','about 5,200 lines of code','previously 119 tests']}},
   {cat:'x',w:511,t:{de:'Storybook mit automatischer Prüfung',en:'Storybook with automatic checks'},
    was:{de:'Automatische Prüfung jedes Storybook-Bausteins auf Bedienung und Barrierefreiheit.',en:'Automatic check of every Storybook component for operability and accessibility.'},
    um:{de:['511 Bausteine','rund 3.000 Ansichten'],en:['511 components','about 3,000 views']}, links:[SB_FE,SB_AD]},
   {cat:'x',w:239,t:{de:'Härtung des Anmeldesystems Keycloak',en:'Hardening of the Keycloak login system'},
    was:{de:'Härtung des Anmeldesystems Keycloak.',en:'Hardening of the Keycloak login system.'}, um:{de:['239 Tests','vorher 56 Tests'],en:['239 tests','previously 56 tests']}},
   {cat:'x',w:206,t:{de:'Hintergrundaufgaben nur einmal',en:'Background jobs run only once'},
    was:{de:'Hintergrundaufgaben laufen auch bei mehreren parallelen Servern nur einmal.',en:'Background jobs run only once, even with several servers in parallel.'}, um:{de:['206 Tests'],en:['206 tests']}}
  ]},
 {id:'CAR-14', name:{de:'Einrichtungs-Assistent und Tour',en:'Setup wizard and tour'}, meta:{de:'190 Stunden',en:'190 hours'},
  b:{de:['Geführte Einrichtung für Träger','Mehrsprachige Tour'],en:['Guided setup for providers','Multilingual tour']},
  tiles:[
   {cat:'b',st:'ok',w:183,t:{de:'Träger-Assistent',en:'Provider wizard'},
    was:{de:'Träger-Assistent (Konto, 2FA, Vertragsunterlagen).',en:'Provider wizard (account, 2FA, contract documents).'}, um:{de:['183 Tests'],en:['183 tests']}, links:[SB_AD]},
   {cat:'b',st:'ok',w:327,t:{de:'Vier Touren in der Beratungsoberfläche',en:'Four tours in the counselling interface'},
    was:{de:'Vier Touren in der Beratungsoberfläche: Rundgang, Mail-Beratung und die Übungstouren „Anfrage annehmen“ und „Supervision hinzuziehen“.',en:'Four tours in the counselling interface: overview, e-mail counselling and the practice tours “accept a request” and “bring in supervision”.'},
    um:{de:['327 Tests'],en:['327 tests']}, links:[SB_FE]},
   {cat:'b',st:'open',t:{de:'Tour für die Verwaltung',en:'Tour for the administration'},
    was:{de:'Tour für die Verwaltungsoberfläche.',en:'Tour for the administration interface.'}},
   {cat:'x',w:210,t:{de:'Einrichtung für Beratende und Leitungen',en:'Setup for counsellors and heads'},
    was:{de:'Einrichtung für Beratende und Leitungen von Beratungsstellen: Themen je Einladung vorgeben oder selbst anlegen, beim Einrichten eine neue Beratungsstelle anlegen; Leitungen entscheiden, ob sie selbst beraten.',
         en:'Setup for counsellors and heads of counselling centres: topics are assigned per invitation or created by themselves, a new counselling centre can be created during setup; heads decide whether they counsel themselves.'},
    um:{de:['rund 210 Tests','rund 3.500 Zeilen Code'],en:['about 210 tests','about 3,500 lines of code']}},
   {cat:'x',w:262,t:{de:'Übungsbereich',en:'Practice area'},
    was:{de:'Übungsbereich: Beratende probieren alle Funktionen an Übungsfällen aus, ohne echte Ratsuchende.',
         en:'Practice area: counsellors try out every function on practice cases, without real help-seekers.'},
    warum:{de:'So gelingt die Einarbeitung ohne Risiko.',en:'This makes onboarding risk-free.'},
    um:{de:['262 Tests','4.674 Zeilen Code'],en:['262 tests','4,674 lines of code']}, links:[SB_FE]}
  ]},
 {id:'MORE', name:{de:'Ohne Angebotsbezug',en:'Not tied to an offer'}, code:{de:'Weitere',en:'Other'}, meta:{de:'zusätzlich geliefert',en:'delivered in addition'},
  tiles:[
   {cat:'x',w:120,hl:1,t:{de:'Konto-Inaktivität',en:'Account inactivity'},
    was:{de:'Inaktive Konten werden angeschrieben, ruhend gestellt und können reaktiviert werden.',en:'Inactive accounts are contacted, set to dormant and can be reactivated.'},
    warum:{de:'Datensparsamkeit nach KDG, ohne aktive Nutzer zu verlieren.',en:'Data minimisation under KDG without losing active users.'},
    um:{de:['120 Tests','2.959 Zeilen Code','vorher 13 Tests'],en:['120 tests','2,959 lines of code','previously 13 tests']}},
   {cat:'x',w:103,hl:1,t:{de:'Team-Besprechung neben der Anfrage',en:'Team discussion next to the request'},
    was:{de:'Zu jeder offenen Anfrage gibt es automatisch einen internen Raum, in dem Beratende sich abstimmen; Ratsuchende sind nie Mitglied. Mit der Annahme der Anfrage wird er geschlossen und nach 90 Tagen gelöscht.',en:'Every open request automatically gets an internal room where counsellors coordinate; help-seekers are never members. When the request is accepted the room is closed and deleted after 90 days.'},
    warum:{de:'Abstimmung im Team, ohne den Chat mit der ratsuchenden Person zu belasten.',en:'Team coordination without cluttering the chat with the help-seeker.'},
    um:{de:['103 Tests','2.482 Zeilen Code'],en:['103 tests','2,482 lines of code']}},
   {cat:'x',w:400,hl:1,t:{de:'Aktivitäts-Zeitleiste, Benachrichtigungen und Töne',en:'Activity timeline, notifications and sounds'},
    was:{de:'Alle Ereignisse an einem Ort, filterbar; Nicht-stören-Zeiten und Service-Hinweise. Beratende wählen je Ereignisart aus zwölf Tönen oder schalten sie stumm.',en:'All events in one place, filterable; do-not-disturb times and service notices. Counsellors choose from twelve sounds per event type or mute them.'},
    warum:{de:'Beratende stellen selbst ein, was sie wann sehen und hören.',en:'Counsellors decide for themselves what they see and hear, and when.'},
    um:{de:['rund 400 Tests','rund 14.000 Zeilen Code'],en:['about 400 tests','about 14,000 lines of code']}, links:[SB_FE]},
   {cat:'x',small:1,t:{de:'Threads, Bearbeiten, Reaktionen',en:'Threads, editing, reactions'},
    was:{de:'Antworten auf einzelne Nachrichten (Threads) · Nachrichten bearbeiten, Reaktionen und @-Erwähnungen · sichtbarer Hinweis bei nicht zustellbaren Nachrichten.',en:'Replies to individual messages (threads) · editing messages, reactions and @-mentions · a visible notice for undeliverable messages.'}},
   {cat:'x',small:1,t:{de:'Anzeigefilter und Suche in der Gesprächsliste',en:'Display filters and conversation list search'},
    was:{de:'Anzeigefilter: Beratende legen fest, welche Gesprächsarten in Listen erscheinen und wie sie sortiert werden · Suche in der Gesprächsliste nach Ratsuchenden, Beratenden und Beratungsstellen.',en:'Display filters: counsellors decide which conversation types appear in lists and how they are sorted · search in the conversation list for help-seekers, counsellors and counselling centres.'}},
   {cat:'x',small:1,t:{de:'Steckbrief der Beratungsstelle',en:'Counselling centre profile'},
    was:{de:'Steckbrief der Beratungsstelle für Ratsuchende: Adresse mit Kartenlink, Öffnungszeiten, Telefon, Rechtstexte · Tier-Avatare zur Wahl.',en:'Counselling centre profile for help-seekers: address with map link, opening hours, phone, legal texts · animal avatars to choose from.'}},
   {cat:'x',small:1,t:{de:'Anmeldung per E-Mail-Link',en:'Login via e-mail link'},
    was:{de:'Anmeldung per E-Mail-Link (Magic Link).',en:'Login via e-mail link (magic link).'}},
   {cat:'x',small:1,t:{de:'Protokolle, Statusseite, IP-Anonymizer',en:'Logs, status page, IP anonymiser'},
    was:{de:'Protokolle zu Übergabe, Supervision und Inaktivität · Statusseite für den Betrieb · IP-Anonymizer (Dienste sehen keine echten IP-Adressen).',en:'Logs of handover, supervision and inactivity · status page for operations · IP anonymiser (services never see real IP addresses).'}}
  ]}
];

/* Ausgangscode: Funktionen mit Tests im Original (feature-inventory.md, Spalte „Tests ORISO / Original“) */
var OLD = [
 [281,1612,'Mandantenverwaltung und -trennung','Tenant management and separation','Mandanten anlegen und bearbeiten, Auflösung über Subdomain, Cookie oder Token, Mandantenfilter in den Diensten.','Create and edit tenants, resolution via subdomain, cookie or token, tenant filter in the services.','STARK ERWEITERT','greatly extended'],
 [394,1825,'Träger, Agenturen, Fachbereiche','Providers, agencies, departments','Agenturen und Beratungsarten mit ihren Grunddaten.','Agencies and counselling types with their basic data.','STARK ERWEITERT','greatly extended'],
 [332,1222,'Rollen und Rechte','Roles and rights','Rollen und Rechte der Nutzergruppen. Die öffentlichen Schnittstellen von Agentur- und Beratungsarten-Dienst hatten laut eigener Beschreibung keine Autorisierung.','Roles and rights of user groups. According to their own README, the public interfaces of the agency and counselling-type services had no authorisation.','STARK ERWEITERT','greatly extended'],
 [451,3094,'Chat über Rocket.Chat','Chat via Rocket.Chat','Chat über Rocket.Chat mit eigener Verschlüsselung im Browser und auf dem Server.','Chat via Rocket.Chat with its own encryption in the browser and on the server.','UMGEBAUT/ERSETZT (Matrix)','rebuilt/replaced (Matrix)'],
 [201,782,'Gruppenchat','Group chat','Gruppenchat anlegen, starten, beenden und beitreten, mit Wiederholung.','Create, start, end and join a group chat, with repetition.','STARK ERWEITERT','greatly extended'],
 [166,528,'Nutzer- und Kontenverwaltung','User and account management','Verwaltung von Beratenden, Agentur-Admins und Mandanten-Admins.','Management of counsellors, agency admins and tenant admins.','STARK ERWEITERT','greatly extended'],
 [153,534,'Löschung und Deaktivierung','Deletion and deactivation','Drei Abläufe: deaktivieren, löschen, Erinnerung an offene Anfragen.','Three runs: deactivate, delete, reminder about open requests.','STARK ERWEITERT','greatly extended'],
 [130,1792,'Benachrichtigungen','Notifications','E-Mail über einen externen Mail-Dienst, Live-Ereignisse, mobile Push-Nachrichten.','E-mail via an external mail service, live events, mobile push messages.','STARK ERWEITERT','greatly extended'],
 [119,507,'Termine','Appointments','Einzeltermine und Kalenderdatei.','Single appointments and calendar file.','UMGEBAUT (teilweise)','partly rebuilt'],
 [111,415,'Themen','Topics','Themen der Beratung mit ihren Grunddaten.','Counselling topics with their basic data.','STARK ERWEITERT','greatly extended'],
 [61,444,'Live-Chat','Live chat','Live-Chat mit Verfügbarkeit der Beratenden.','Live chat with counsellor availability.','STARK ERWEITERT','greatly extended'],
 [43,501,'Video über Jitsi','Video via Jitsi','Video über Jitsi mit Wartezimmer.','Video via Jitsi with a waiting room.','UMGEBAUT/ERSETZT (LiveKit)','rebuilt/replaced (LiveKit)'],
 [37,1788,'Registrierung, Links, QR-Code','Registration, links, QR code','Registrierung nach Beratungsart und Thema, Agentur- und Beraterlink, QR-Code. Keine Einladungen.','Registration by counselling type and topic, agency and counsellor link, QR code. No invitations.','STARK ERWEITERT','greatly extended'],
 [36,190,'Anmeldung und 2FA','Login and 2FA','Anmeldung über Keycloak mit freiwilliger Zwei-Faktor-Anmeldung.','Login via Keycloak with optional two-factor login.','STARK ERWEITERT','greatly extended'],
 [25,1884,'Rechtstexte je Mandant','Legal texts per tenant','Je Mandant Textfelder für Impressum, Datenschutz und Nutzungsbedingungen mit Aktivierungsdatum. Keine Versionen, keine Vertragsunterlagen.','Per tenant, text fields for imprint, privacy and terms with an activation date. No versions, no contract documents.','STARK ERWEITERT','greatly extended'],
 [20,154,'Betriebsüberwachung','Operational monitoring','Einfache Überwachung der Dienste.','Basic monitoring of the services.','NEU aufgebaut (SigNoz)','rebuilt (SigNoz)'],
 [18,129,'Statistik','Statistics','Statistik-Ereignisse an einen externen Dienst, CSV-Download in der Verwaltung.','Statistics events to an external service, CSV download in the administration.','UMGEBAUT/ERSETZT','rebuilt/replaced'],
 [10,294,'Team-Beratungsstelle','Team counselling centre','Offene Team-Beratungsstelle, in der alle Beratenden einer Stelle alle Fälle sahen.','Open team counselling centre, where all counsellors of a centre saw every case.','ERSETZT (Fallübergabe, Teamraum)','replaced (case handover, team room)'],
 [5,356,'Upload-Dienst','Upload service','Getrennter Upload-Dienst.','Separate upload service.','UMGEBAUT/ERSETZT (Matrix)','rebuilt/replaced (Matrix)'],
 [0,339,'Logo und Grundfarben','Logo and base colours','Logo, Verbandslogo, Favicon, Primär- und Sekundärfarbe.','Logo, association logo, favicon, primary and secondary colour.','STARK ERWEITERT','greatly extended'],
 [0,295,'Verschlüsselung über Passwort','Encryption via password','Hauptschlüssel aus Chat-Kennung und Passwort abgeleitet.','Master key derived from chat ID and password.','UMGEBAUT/ERSETZT','rebuilt/replaced'],
 [0,477,'Einfacher Rundgang','Simple walkthrough','Eine einfache Rundgang-Komponente.','A simple walkthrough component.','NEU gebaut (Übungsbereich, Touren)','rebuilt (practice area, tours)'],
 [null,null,'Zustellhäkchen','Delivery ticks','Häkchen zeigen, dass eine Nachricht zugestellt ist.','Ticks show that a message has been delivered.','weiter vorhanden','still in place'],
 [null,null,'Audioanrufe','Audio calls','Anrufe ohne Kamera.','Calls without camera.','UMGEBAUT (läuft jetzt über die eigene Videotechnik)','rebuilt (now runs on our own video technology)'],
 [null,null,'Einwilligung im Warteraum','Consent in the waiting room','Einwilligung vor dem anonymen Chat im Warteraum.','Consent before the anonymous chat in the waiting room.','weiter vorhanden','still in place'],
 [null,null,'Automatische Pseudonyme','Automatic pseudonyms','Automatisch erzeugte Namen für Ratsuchende.','Automatically generated names for help-seekers.','ERWEITERT (Tier-Avatar, Bestätigung vor dem Chat)','extended (animal avatar, confirmation before the chat)']
];

/* CAR-15: Texte aus dem Angebot „CAR15 – final v2.1 + 7 extra modules“ */
var PLAN = [
 {t:{de:'Virenscanner',en:'Virus scanner'},
  was:{de:'Ein Upload mit Schadcode wird abgelehnt; die Ratsuchende sieht einen Hinweis, die Beratende sieht nichts davon. Optional lässt sich eine Bilderkennung per KI zuschalten. Ergebnis: Scanner aktiv für alle Uploads, Signaturen aktualisieren sich selbst, ein Ausfall löst Alarm aus und lässt keine Datei ungeprüft durch.',
       en:'An upload containing malware is rejected; the help-seeker sees a notice, the counsellor sees nothing of it. Optionally, AI image recognition can be switched on. Result: scanner active for all uploads, signatures update themselves, a failure raises an alarm and lets no file through unchecked.'},
  warum:{de:'Eine einzige infizierte Datei kann das Netz eines Trägers lahmlegen. Unerwünschte Bilder belasten Beratende und können strafrechtlich relevant sein.',en:'A single infected file can bring down a provider’s network. Unwanted images burden counsellors and can be criminally relevant.'}},
 {t:{de:'Design-Tokens',en:'Design tokens'},
  was:{de:'Ein neuer Träger trägt seine Farbe einmal ein. Die Plattform prüft den Kontrast und warnt, bevor etwas live geht. Ergebnis: Frontend und Verwaltung beziehen Farben aus einer Quelle; Kontrastprüfung je Träger.',en:'A new provider enters its colour once. The platform checks the contrast and warns before anything goes live. Result: frontend and administration take colours from one source; contrast check per provider.'},
  warum:{de:'Jede neue Trägerfarbe kann an Dutzenden Stellen Text unlesbar machen. Das fällt oft erst Ratsuchenden oder Beratenden auf.',en:'Every new provider colour can make text unreadable in dozens of places. Often help-seekers or counsellors are the first to notice.'}},
 {t:{de:'Hoher Kontrast',en:'High contrast'},
  was:{de:'Ein Schalter stellt die ganze Oberfläche auf hohen Kontrast um, unabhängig von der Trägerfarbe. Ergebnis: umschaltbarer Hochkontrast-Modus in Frontend und Verwaltung, aufgebaut auf den Design-Tokens.',en:'One switch puts the whole interface into high contrast, independent of the provider colour. Result: a switchable high-contrast mode in frontend and administration, built on the design tokens.'},
  warum:{de:'Barrierefreiheit ist für öffentlich geförderte Angebote Pflicht und für Menschen mit Sehschwäche die Voraussetzung, das Angebot überhaupt zu nutzen.',en:'Accessibility is mandatory for publicly funded services and, for people with low vision, the precondition for using the service at all.'}},
 {t:{de:'Video ohne Anmeldung',en:'Video without login'},
  was:{de:'Die Beratende verschickt einen Einmal-Link oder QR-Code. Die Ratsuchende klickt und ist im Termin, ohne Konto; der Raum gilt nur für diesen Termin.',en:'The counsellor sends a one-time link or QR code. The help-seeker clicks and is in the appointment, without an account; the room is valid for this appointment only.'},
  warum:{de:'Jede Hürde vor dem ersten Gespräch kostet Menschen in Krisen. Weichen Beratende auf externe Videodienste aus, verlassen Beratungsinhalte den KDG-geschützten Rahmen.',en:'Every hurdle before the first conversation costs people in crisis. If counsellors switch to external video services, counselling content leaves the KDG-protected setting.'}},
 {t:{de:'Bot-Schutz',en:'Bot protection'},
  was:{de:'Eine selbst betriebene Open-Source-Prüfung hält Bots am anonymen Eingang auf; Menschen merken davon meist nichts. Ohne Drittanbieter, mit Kennzahl zu abgewehrten Anfragen.',en:'A self-hosted open-source check stops bots at the anonymous entrance; people usually notice nothing. No third party, with a metric on blocked requests.'},
  warum:{de:'Jede Spam-Anfrage landet bei einer Beratenden und verdrängt echte Anfragen. Google-Captcha wäre eine Datenübermittlung an Google und passt nicht zum KDG.',en:'Every spam request lands with a counsellor and pushes out real requests. Google Captcha would transfer data to Google and does not fit the KDG.'}},
 {t:{de:'Support-Admin nur lesen',en:'Read-only support admin'},
  was:{de:'Der Support sieht die Einstellungen eines Trägers, kann sie aber nicht verändern. Ergebnis: Lese-Rolle getestet und gegen Rechteausweitung gehärtet.',en:'Support sees a provider’s settings but cannot change them. Result: read-only role tested and hardened against privilege escalation.'},
  warum:{de:'Wer nur nachsehen will, kann versehentlich mit vollen Rechten etwas ändern oder löschen. Je weniger Rechte, desto kleiner der mögliche Schaden.',en:'Someone who only wants to look can accidentally change or delete something with full rights. The fewer the rights, the smaller the possible damage.'}},
 {t:{de:'Support-Sitzung mit Doppel-Freigabe',en:'Support session with double approval'},
  was:{de:'Der Support fragt eine Support-Sitzung an, die Beratende stimmt live mit ihrem Passwort zu. Beide klären das Problem in einem eigenen 1:1-Chat mit Audio und Video. Der Support sieht dabei keine Falldaten, die Beratende kann die Sitzung jederzeit beenden, jeder Zugriff wird protokolliert.',en:'Support requests a support session, the counsellor approves it live with her password. Both solve the problem in a dedicated 1:1 chat with audio and video. Support sees no case data, the counsellor can end the session at any time, and every access is logged.'},
  warum:{de:'Ohne geregelten Weg bleibt der Fehler bestehen, oder der Support bekommt pauschale Zugriffsrechte, die er für die Hilfe gar nicht braucht.',en:'Without a defined path, the fault remains, or support gets blanket access rights it does not need to help.'}}
];

var MEASURES = [
 {id:'prod', de:'Produktivzeilen', en:'Production lines', a:136955, b:512923},
 {id:'all',  de:'Zeilen gesamt (Produktiv + Test)', en:'All lines (production + test)', a:223197, b:1017526},
 {id:'tests',de:'Testfälle', en:'Test cases', a:3117, b:20902}
];

var KPIS = [
 {de:'Automatisierte Testfälle',en:'Automated test cases',a:3117,b:20902,dd:'Gesamt über alle Dienste, Frontend und Verwaltung',de2:'Total across all services, frontend and administration'},
 {de:'Tests Frontend und Verwaltung',en:'Tests frontend and administration',a:169,b:10212,dd:'Vorher nur Browsertests',de2:'Previously browser tests only'},
 {de:'Testzeilen je 100 Produktivzeilen',en:'Test lines per 100 production lines',a:63,b:98,dd:'Verhältnis Test- zu Produktivcode',de2:'Ratio of test code to production code'},
 {de:'Doppelter Produktivcode',en:'Duplicated production code',a:2.8,b:2.0,pct:1,low:1,dd:'Weniger ist besser, trotz 3,7-facher Codemenge',de2:'Lower is better, despite 3.7 times the code'},
 {de:'Architekturentscheidungen',en:'Architecture decisions',b:27,single:1,dd:'Dokumentiert; laut Review 2023 gab es keine Architektur-Doku',de2:'Documented; according to the 2023 review there was no architecture documentation',link:ADR},
 {de:'Funktionsschalter',en:'Feature switches',b:55,single:1,dd:'Auf drei Ebenen: Plattform, Träger, Beratungsstelle',de2:'On three levels: platform, provider, counselling centre'},
 {de:'Bausteine im Storybook',en:'Components in Storybook',a:0,b:511,dd:'Mit rund 3.000 geprüften Ansichten',de2:'With about 3,000 checked views',link:SB_FE}
];

var T = {
 de:{steht:'steht',offen:'offen',unk:'offen, ungeklärt',extra:'zusätzlich geliefert',old:'aus dem Ausgangscode',plan:'geplant',
     catO:'aus dem Ausgangscode',catB:'beauftragt',catBO:'beauftragt, offen',catX:'zusätzlich geliefert',catP:'Angebot CAR-15 (geplant)',
     was:'Was',warum:'Warum wichtig',um:'Umfang',offer:'Angebot',status:'Status',beauftragt:'In diesem Angebot beauftragt',links:'Mehr dazu',
     noCount:'nicht einzeln gezählt',close:'Schließen',nb:'angefragt, nicht bepreist',cap:'Kachel verkleinert dargestellt, damit die übrigen lesbar bleiben',
     oldUm:function(a,b){return a===null ? ['nicht einzeln gezählt'] : ['Tests im Ausgangscode: '+fmt(a),'Tests heute: '+fmt(b)+' (Zuordnung über Dateinamen, Näherung)'];},
     today:'Heute',planUm:['noch nicht gebaut','Teil des Kontingents von höchstens 1.390 Stunden über zwölf Wochen'],
     planOffer:'CAR-15 · Stabilisierung, Härtung und sieben Zusatzbausteine',oldOffer:'Ausgangscode 2024/2025',
     more:'Ohne Angebotsbezug',list:function(n){return 'Alle '+n+' Bausteine als Liste anzeigen';},
     area:function(m,a,b,f){return 'Fläche nach '+m+': '+fmt(a)+' → '+fmt(b);},
     factor:function(f,m){return '× '+f+' mehr '+m;},
     hint:'<b>Tipp:</b> Jede Kachel öffnet ein Fenster mit Details. Gestreifte Kacheln sind beauftragt, aber noch offen. Die Kachelgröße folgt grob den Tests des Bausteins.',
     hintM:' Flächen, die zum Antippen zu klein sind, öffnen die Liste ihres Angebots; die Zahl „+N“ im Kopf zeigt, wie viele es sind.',
     kpiFrom:'vorher',kpiNone:'keine'},
 en:{steht:'done',offen:'open',unk:'open, to be clarified',extra:'delivered in addition',old:'from the starting code',plan:'planned',
     catO:'from the starting code',catB:'commissioned',catBO:'commissioned, open',catX:'delivered in addition',catP:'Offer CAR-15 (planned)',
     was:'What',warum:'Why it matters',um:'Size',offer:'Offer',status:'Status',beauftragt:'Commissioned in this offer',links:'More',
     noCount:'not counted separately',close:'Close',nb:'requested, not priced',cap:'Tile drawn smaller so the others stay readable',
     oldUm:function(a,b){return a===null ? ['not counted separately'] : ['Tests in the starting code: '+fmt(a),'Tests today: '+fmt(b)+' (matched by file name, approximate)'];},
     today:'Today',planUm:['not built yet','part of a budget of at most 1,390 hours over twelve weeks'],
     planOffer:'CAR-15 · stabilisation, hardening and seven add-on modules',oldOffer:'Starting code 2024/2025',
     more:'Not tied to an offer',list:function(n){return 'Show all '+n+' building blocks as a list';},
     area:function(m,a,b,f){return 'Area by '+m.toLowerCase()+': '+fmt(a)+' → '+fmt(b);},
     factor:function(f,m){return '× '+f+' '+m.toLowerCase();},
     hint:'<b>Tip:</b> every tile opens a window with details. Striped tiles are commissioned but still open. Tile size roughly follows the block’s tests.',
     hintM:' Areas too small to tap open the list of their offer; the “+N” in the header shows how many there are.',
     kpiFrom:'before',kpiNone:'none'}
};

/* ───────────── Hilfsfunktionen ───────────── */
var lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'de';
var measure = 'prod';
function L(o){ return o ? (o[lang] !== undefined ? o[lang] : o.de) : ''; }
function fmt(n){ return n.toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE'); }
function fnum(n,d){ return n.toLocaleString(lang === 'en' ? 'en-GB' : 'de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}); }
function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function el(tag,cls,html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; }
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

var DEFAULT_W = 80, OPEN_W = 50, SMALL_W = 60, MIN_W = 30, CAP_W = 3100;
function weight(t){
  var w = t.w;
  if (w === undefined) w = t.st === 'open' || t.st === 'unk' ? OPEN_W : (t.small ? SMALL_W : DEFAULT_W);
  if (w > CAP_W) w = CAP_W;
  return Math.max(w, MIN_W);
}
function tileClass(t){
  if (t.cat === 'o') return 't-o';
  if (t.cat === 'p') return 't-p';
  if (t.cat === 'x') return 't-x';
  return (t.st === 'open' || t.st === 'unk') ? 't-bo' : 't-b';
}
function swClass(t){ return {'t-o':'o','t-p':'p','t-x':'x','t-b':'b','t-bo':'bo'}[tileClass(t)]; }
function statusPill(t){
  var tt = T[lang];
  if (t.cat === 'o') return '<span class="status old">'+tt.old+'</span>';
  if (t.cat === 'p') return '<span class="status plan">'+tt.plan+'</span>';
  if (t.cat === 'x') return '<span class="status extra">'+tt.extra+'</span>';
  if (t.st === 'unk') return '<span class="status unk">'+tt.unk+'</span>';
  if (t.st === 'open') return '<span class="status open">'+tt.offen+'</span>';
  return '<span class="status ok">'+tt.steht+'</span>';
}
function statusText(t){
  var tt = T[lang];
  if (t.cat === 'o') return tt.old; if (t.cat === 'p') return tt.plan; if (t.cat === 'x') return tt.extra;
  return t.st === 'unk' ? tt.unk : t.st === 'open' ? tt.offen : tt.steht;
}
function umList(t){
  if (t.cat === 'o') return T[lang].oldUm(t.a, t.b);
  if (t.cat === 'p') return T[lang].planUm;
  return t.um ? L(t.um) : [T[lang].noCount];
}

/* Alle Kacheln einsammeln */
var ALL = [];
GROUPS.forEach(function(g){ g.tiles.forEach(function(t){ t.g = g; ALL.push(t); }); });
var OLD_T = OLD.map(function(r){ return {cat:'o', w:(r[0]===null?30:r[0]), a:r[0], b:r[1], t:{de:r[2],en:r[3]}, was:{de:r[4],en:r[5]}, today:{de:r[6],en:r[7]}}; });
var PLAN_T = PLAN.map(function(p){ p.cat='p'; return p; });

/* ───────────── Squarified Treemap ───────────── */
function worst(row, side){
  var s=0,mx=0,mn=Infinity; row.forEach(function(r){ s+=r.a; if(r.a>mx)mx=r.a; if(r.a<mn)mn=r.a; });
  var s2=s*s, w2=side*side; return Math.max(w2*mx/s2, s2/(w2*mn));
}
function squarify(items, x, y, w, h){
  var total=0; items.forEach(function(i){ total+=i.v; });
  var scale = (w*h)/total;
  var rest = items.slice().sort(function(a,b){return b.v-a.v;}).map(function(i){ return {it:i, a:i.v*scale}; });
  var out=[], r={x:x,y:y,w:w,h:h};
  while(rest.length){
    var side=Math.min(r.w,r.h), row=[rest[0]], i=1;
    while(i<rest.length && worst(row.concat([rest[i]]),side) <= worst(row,side)){ row.push(rest[i]); i++; }
    var s=0; row.forEach(function(q){ s+=q.a; });
    if (r.w >= r.h){
      var cw = r.h>0 ? s/r.h : 0, yy=r.y;
      row.forEach(function(q){ var hh = cw>0 ? q.a/cw : 0; out.push({it:q.it,x:r.x,y:yy,w:cw,h:hh}); yy+=hh; });
      r.x+=cw; r.w-=cw;
    } else {
      var rh = r.w>0 ? s/r.w : 0, xx=r.x;
      row.forEach(function(q){ var ww = rh>0 ? q.a/rh : 0; out.push({it:q.it,x:xx,y:r.y,w:ww,h:rh}); xx+=ww; });
      r.y+=rh; r.h-=rh;
    }
    rest = rest.slice(i);
  }
  return out;
}

/* ───────────── Kachel-Element ───────────── */
function makeTile(t, passive){
  if (passive){
    /* zu klein zum Antippen: nur Fläche; der Tipp auf die Gruppe öffnet die Liste */
    var d = el('div','tile nt '+tileClass(t)); d.setAttribute('aria-hidden','true'); return d;
  }
  var b = el('button','tile '+tileClass(t));
  b.type='button';
  var um = (t.um ? L(t.um)[0] : (t.cat==='o' && t.a!==null ? fmt(t.a)+(lang==='en'?' tests':' Tests') : ''));
  b.innerHTML = '<span class="tt">'+esc(L(t.t))+'</span>'+(um?'<span class="tu">'+esc(um)+'</span>':'');
  b.setAttribute('aria-label', L(t.t)+' – '+statusText(t));
  b.setAttribute('aria-haspopup','dialog');
  b.addEventListener('click', function(){ openDialog(t, b); });
  return b;
}
function sizeClass(b, w, h){
  b.classList.remove('sm','xs');
  if (w < 46 || h < 26) b.classList.add('xs');
  else if (w < 96 || h < 50) b.classList.add('sm');
  var tt = b.querySelector('.tt'), tu = b.querySelector('.tu');
  if (!tt) return;
  var lh = b.classList.contains('sm') ? 13.5 : 15;
  var showU = tu && !b.classList.contains('sm') && h >= 10 + lh*2 + 14;
  if (tu) tu.style.display = showU ? '' : 'none';
  var lines = Math.max(1, Math.min(3, Math.floor((h - 10 - (showU ? 14 : 0)) / lh)));
  tt.style.webkitLineClamp = lines; tt.style.lineClamp = lines;
}

/* ───────────── Quadrate zeichnen ───────────── */
document.getElementById('sqOld').addEventListener('click', function(e){ if (MOBILE && !e.target.closest('button')) showInList('old'); });
var sqOld = document.getElementById('sqOld'), sqNew = document.getElementById('sqNew'),
    squares = document.getElementById('squares'), growWrap = document.getElementById('growWrap');
var S = 0, firstPaint = true;

function curMeasure(){ for (var i=0;i<MEASURES.length;i++) if (MEASURES[i].id===measure) return MEASURES[i]; return MEASURES[0]; }
function kOf(m){ return Math.sqrt(m.a/m.b); }

function computeSize(){
  var stage = squares.parentNode;
  var cs = getComputedStyle(stage);
  var W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  var kMax = kOf(MEASURES[0]);
  var stack = W < 700;
  squares.classList.toggle('stack', stack);
  MOBILE = W < 560; ASPECT = MOBILE ? 1.5 : 1;
  if (stack) S = Math.floor(W);
  else S = Math.floor(Math.min(640, (W - 28) / (1 + kMax)));
}

var MOBILE = false, MIN_TAP = 44, ASPECT = 1; /* Höhe = Breite × ASPECT; auf dem Handy höher, Flächen bleiben im selben Verhältnis */
function showInList(id){
  var d = document.getElementById('allList'); d.open = true;
  var blk = document.getElementById('lg-'+id) || d;
  blk.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block:'start'});
  var first = blk.querySelector('button'); if (first) setTimeout(function(){ first.focus({preventScroll:true}); }, reduce?0:400);
}

function drawNew(){
  sqNew.innerHTML='';
  var H = Math.round(S*ASPECT);
  sqNew.style.width = S+'px'; sqNew.style.height = H+'px';
  var groups = GROUPS.map(function(g){ var v=0; g.tiles.forEach(function(t){ v+=weight(t); }); return {g:g, v:v}; });
  var HEAD = 18;
  squarify(groups, 0, 0, S, H).forEach(function(r){
    var g = r.it.g;
    var gd = el('div','grp');
    gd.style.left=r.x+'px'; gd.style.top=r.y+'px'; gd.style.width=r.w+'px'; gd.style.height=r.h+'px';
    var code = g.code ? L(g.code) : g.id;
    var hd = el('div','grp-h', '<span class="gc">'+esc(code)+'</span><span class="gn">'+esc(L(g.name))+'</span>');
    hd.setAttribute('aria-hidden','true');
    var showHead = r.h >= (MOBILE ? 18 + MIN_TAP : 60) && r.w > 60;
    if (!showHead) hd.style.display='none';
    var body = el('div','grp-b');
    gd.appendChild(hd); gd.appendChild(body);
    gd.setAttribute('role','group'); gd.setAttribute('aria-label', code+' '+L(g.name));
    sqNew.appendChild(gd);
    var bw = r.w, bh = r.h - (showHead ? HEAD : 0);
    var items = g.tiles.map(function(t){ return {t:t, v:weight(t)}; });
    var hidden = 0;
    squarify(items, 0, 0, bw, bh).forEach(function(q, i){
      var passive = MOBILE && (q.w < MIN_TAP || q.h < MIN_TAP);
      if (passive) hidden++;
      var b = makeTile(q.it.t, passive);
      b.style.left=q.x+'px'; b.style.top=q.y+'px'; b.style.width=q.w+'px'; b.style.height=q.h+'px';
      b.style.transitionDelay = (firstPaint && !reduce) ? (900 + i*35 + Math.round(r.x/S*250))+'ms' : '0ms';
      sizeClass(b, q.w, q.h);
      body.appendChild(b);
    });
    if (hidden){
      var gid = g.id;
      gd.classList.add('has-nt');
      gd.addEventListener('click', function(e){ if (!e.target.closest('button')) showInList(gid); });
      var sr = el('button','sr-btn'); sr.type='button';
      sr.textContent = lang==='en' ? 'Show all '+g.tiles.length+' blocks of '+code+' in the list' : 'Alle '+g.tiles.length+' Bausteine von '+code+' in der Liste zeigen';
      sr.addEventListener('click', function(){ showInList(gid); });
      gd.insertBefore(sr, gd.firstChild);
      if (showHead) hd.insertAdjacentHTML('beforeend','<span class="gm">+'+hidden+'</span>');
    }
  });
}

function drawOld(){
  sqOld.innerHTML='';
  var m = curMeasure(), s = Math.round(S*kOf(m)), sh = Math.round(S*ASPECT*kOf(m));
  sqOld.style.width = s+'px'; sqOld.style.height = sh+'px';
  var items = OLD_T.map(function(t){ return {t:t, v:weight(t)}; });
  var hiddenOld = 0;
  squarify(items, 0, 0, s, sh).forEach(function(q){
    var passive = MOBILE && (q.w < MIN_TAP || q.h < MIN_TAP);
    if (passive) hiddenOld++;
    var b = makeTile(q.it.t, passive);
    var px=q.x/s*100, py=q.y/sh*100, pw=q.w/s*100, ph=q.h/sh*100;
    b.style.left=px+'%'; b.style.top=py+'%'; b.style.width=pw+'%'; b.style.height=ph+'%';
    b.dataset.pw = pw; b.dataset.ph = ph;
    sqOld.appendChild(b);
  });
  sizeOld(s, sh);
  if (hiddenOld){
    var sr = el('button','sr-btn'); sr.type='button';
    sr.textContent = lang==='en' ? 'Show all starting-code blocks in the list' : 'Alle Bausteine des Ausgangscodes in der Liste zeigen';
    sr.addEventListener('click', function(){ showInList('old'); });
    sqOld.insertBefore(sr, sqOld.firstChild);
  }
}
function sizeOld(s, sh){
  Array.prototype.forEach.call(sqOld.querySelectorAll('.tile:not(.nt)'), function(b){
    sizeClass(b, s*b.dataset.pw/100, sh*b.dataset.ph/100);
  });
}
function resizeOld(){
  var m = curMeasure(), s = Math.round(S*kOf(m)), sh = Math.round(S*ASPECT*kOf(m));
  sqOld.style.width = s+'px'; sqOld.style.height = sh+'px';
  sizeOld(s, sh);
}

function drawCaptions(){
  var m = curMeasure(), tt=T[lang];
  document.getElementById('capOld').textContent = fmt(m.a)+' '+L(m);
  document.getElementById('capNew').textContent = fmt(m.b)+' '+L(m);
  var f = fnum(m.b/m.a,1);
  document.getElementById('factor').innerHTML = '<span class="mono">× '+f+'</span><span class="factor-note">'+
    esc(tt.area(L(m),m.a,m.b))+'</span>';
}

function drawPlan(){
  var g = document.getElementById('planGrid'); g.innerHTML='';
  PLAN_T.forEach(function(p){ var b = makeTile(p); g.appendChild(b); });
}

function drawLegend(){
  var tt=T[lang];
  var nO=OLD_T.length, nB=0, nBO=0, nX=0, nP=PLAN_T.length;
  ALL.forEach(function(t){ if(t.cat==='x') nX++; else if(t.st==='ok') nB++; else nBO++; });
  document.getElementById('legend').innerHTML =
    '<span><i class="sw o"></i>'+tt.catO+'<span class="n">'+nO+'</span></span>'+
    '<span><i class="sw b"></i>'+tt.catB+'<span class="n">'+nB+'</span></span>'+
    '<span><i class="sw bo"></i>'+tt.catBO+'<span class="n">'+nBO+'</span></span>'+
    '<span><i class="sw x"></i>'+tt.catX+'<span class="n">'+nX+'</span></span>'+
    '<span><i class="sw p"></i>'+tt.catP+'<span class="n">'+nP+'</span></span>';
  document.getElementById('hint').innerHTML = tt.hint + (MOBILE ? tt.hintM : '');
}

function drawMeasureSeg(){
  var seg = document.getElementById('measureSeg'); seg.innerHTML='';
  MEASURES.forEach(function(m){
    var b = el('button'); b.type='button';
    b.textContent = L(m) + ' · ×' + fnum(m.b/m.a,1);
    b.setAttribute('aria-pressed', m.id===measure ? 'true':'false');
    b.addEventListener('click', function(){
      measure = m.id; drawMeasureSeg(); if (MOBILE) drawOld(); else resizeOld(); drawCaptions();
      if (!reduce) { growWrap.style.transition='none'; }
    });
    seg.appendChild(b);
  });
}

function drawKpis(){
  var box = document.getElementById('kpis'); box.innerHTML='';
  var tt=T[lang];
  KPIS.forEach(function(k){
    var d = el('div','kpi');
    var v;
    if (k.single) v = '<div class="v">'+fmt(k.b)+'</div>';
    else {
      var a = k.pct ? fnum(k.a,1)+(lang==='en'?'%':' %') : fmt(k.a);
      var b = k.pct ? fnum(k.b,1)+(lang==='en'?'%':' %') : fmt(k.b);
      v = '<div class="v"><span class="from">'+a+'</span><span class="arr" aria-hidden="true">→</span>'+b+'</div>';
    }
    var bars = '';
    if (!k.single){
      var mx = Math.max(k.a,k.b);
      bars = '<div class="bars" aria-hidden="true"><div class="bar"><i class="b0" data-w="'+(k.a/mx*100).toFixed(1)+'"></i></div>'+
             '<div class="bar"><i class="b1" data-w="'+(k.b/mx*100).toFixed(1)+'"></i></div></div>';
    }
    var link = k.link ? ' <a href="'+k.link.u+'">'+esc(L(k.link))+' →</a>' : '';
    d.innerHTML = '<div class="vlabel">'+esc(lang==='en'?k.en:k.de)+'</div>'+v+bars+'<div class="d">'+esc(lang==='en'?k.de2:k.dd)+link+'</div>';
    box.appendChild(d);
    Array.prototype.forEach.call(d.querySelectorAll('i[data-w]'),function(i){i.style.width=i.getAttribute('data-w')+'%';});
  });
}

function drawList(){
  var tt=T[lang], body=document.getElementById('listBody'); body.innerHTML='';
  var n = ALL.length + OLD_T.length + PLAN_T.length;
  document.getElementById('listSummary').textContent = tt.list(n);
  function block(code, name, meta, tiles, id){
    var g = el('div','lgrp'); g.id = 'lg-'+id; g.tabIndex = -1;
    g.innerHTML = '<h3><span class="code">'+esc(code)+'</span>'+esc(name)+(meta?'<span class="meta">'+esc(meta)+'</span>':'')+'</h3>';
    var ul = el('ul','litems');
    tiles.forEach(function(t){
      var li = el('li'), b = el('button','litem'); b.type='button';
      var um = umList(t)[0];
      b.innerHTML = '<i class="sw '+swClass(t)+'" aria-hidden="true"></i><span class="lt">'+esc(L(t.t))+' <span class="status '+
        ({o:'old',p:'plan',x:'extra'}[t.cat] || (t.st==='ok'?'ok':t.st==='unk'?'unk':'open'))+'">'+esc(statusText(t))+'</span></span><span class="lu">'+esc(um)+'</span>';
      b.setAttribute('aria-haspopup','dialog');
      b.addEventListener('click', function(){ openDialog(t, b); });
      li.appendChild(b); ul.appendChild(li);
    });
    g.appendChild(ul); body.appendChild(g);
  }
  block('', tt.oldOffer, '', OLD_T, 'old');
  GROUPS.forEach(function(g){ block(g.code ? L(g.code) : g.id, L(g.name), L(g.meta), g.tiles, g.id); });
  block('CAR-15', lang==='en'?'Planned add-on modules':'Geplante Zusatzbausteine', '', PLAN_T, 'CAR-15');
}

/* ───────────── Dialog ───────────── */
var dlg = document.getElementById('dlg'), opener = null, current = null;
function catColor(t){
  return {'t-o':'var(--c-old-edge)','t-p':'var(--warn)','t-x':'var(--c-x)','t-b':'var(--c-b)','t-bo':'var(--info)'}[tileClass(t)];
}
function fillDialog(t){
  var tt=T[lang];
  document.getElementById('dlgIn').style.setProperty('--sc', catColor(t));
  var eb;
  if (t.cat==='o') eb = tt.oldOffer;
  else if (t.cat==='p') eb = 'CAR-15';
  else eb = (t.g.code ? L(t.g.code) : t.g.id) + ' · ' + L(t.g.name);
  document.getElementById('dlgEb').textContent = eb;
  document.getElementById('dlgTitle').textContent = L(t.t);
  var st = statusPill(t);
  if (t.nb) st += ' <span class="status unk">'+tt.nb+'</span>';
  document.getElementById('dlgSt').innerHTML = st;
  var kv = '';
  kv += '<div><dt>'+tt.was+'</dt><dd>'+esc(L(t.was))+'</dd></div>';
  if (t.warum) kv += '<div><dt>'+tt.warum+'</dt><dd>'+esc(L(t.warum))+'</dd></div>';
  var um = umList(t).map(function(u){ return '<li class="num">'+esc(u)+'</li>'; }).join('');
  if (t.cap) um += '<li>'+esc(tt.cap)+'</li>';
  kv += '<div><dt>'+tt.um+'</dt><dd><ul>'+um+'</ul></dd></div>';
  var offer;
  if (t.cat==='o') offer = esc(tt.oldOffer)+' · '+esc(tt.today)+': '+esc(L(t.today));
  else if (t.cat==='p') offer = esc(tt.planOffer);
  else offer = esc((t.g.code ? L(t.g.code)+' – ' : t.g.id+' ') + L(t.g.name)) + (t.g.meta ? ' · '+esc(L(t.g.meta)) : '');
  kv += '<div><dt>'+tt.offer+'</dt><dd>'+offer+'</dd></div>';
  if (t.cat==='b' && t.g.b) kv += '<div><dt>'+tt.beauftragt+'</dt><dd><ul>'+L(t.g.b).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul></dd></div>';
  document.getElementById('dlgKv').innerHTML = kv;
  var lk = (t.links||[]).map(function(l){ return '<a href="'+l.u+'" target="_blank" rel="noopener">'+esc(L(l))+' ↗</a>'; }).join('');
  document.getElementById('dlgLinks').innerHTML = lk;
  document.getElementById('dlgLinks').style.display = lk ? '' : 'none';
  document.getElementById('dlgX').setAttribute('aria-label', tt.close);
}
function openDialog(t, btn){
  opener = btn; current = t; fillDialog(t);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open','');
  document.getElementById('dlgX').focus();
}
function closeDialog(){ if (dlg.open) dlg.close(); }
dlg.addEventListener('close', function(){ current = null; if (opener && document.contains(opener)) opener.focus(); });
document.getElementById('dlgX').addEventListener('click', closeDialog);
dlg.addEventListener('click', function(e){ if (e.target === dlg) closeDialog(); });
dlg.addEventListener('keydown', function(e){ if (e.key === 'Escape'){ e.preventDefault(); closeDialog(); } });

/* ───────────── Sprache ───────────── */
function setLang(l, save){
  lang = l;
  document.documentElement.setAttribute('data-lang', l);
  document.documentElement.lang = l;
  Array.prototype.forEach.call(document.querySelectorAll('[data-setlang]'), function(b){ b.setAttribute('aria-pressed', b.getAttribute('data-setlang')===l ? 'true':'false'); });
  document.title = l==='en' ? 'ORISO Growth' : 'ORISO Wachstum';
  if (save) { try { localStorage.setItem('oriso-wachstum-lang', l); } catch(e){} }
  if (save === null) return;
  renderAll(false);
  if (current) fillDialog(current);
}
Array.prototype.forEach.call(document.querySelectorAll('[data-setlang]'), function(b){
  b.addEventListener('click', function(){ setLang(b.getAttribute('data-setlang'), true); });
});

function renderAll(animate){
  computeSize();
  drawMeasureSeg(); drawLegend(); drawCaptions(); drawKpis(); drawList(); drawPlan();
  drawOld(); drawNew();
  if (animate && !reduce){
    var k = kOf(curMeasure());
    sqNew.classList.add('pre');
    growWrap.style.transition='none';
    growWrap.style.transform='scale('+k+')';
    void growWrap.offsetWidth;
    requestAnimationFrame(function(){ setTimeout(function(){
      growWrap.style.transition='';
      growWrap.style.transform='scale(1)';
      sqNew.classList.remove('pre');
      setTimeout(function(){ firstPaint=false; Array.prototype.forEach.call(sqNew.querySelectorAll('.tile'),function(b){b.style.transitionDelay='0ms';}); }, 3200);
    }, 350); });
  } else { growWrap.style.transform='none'; firstPaint=false; }
}

var rt = null, lastW = 0;
window.addEventListener('resize', function(){
  clearTimeout(rt);
  rt = setTimeout(function(){
    var w = squares.parentNode.clientWidth;
    if (w === lastW) return; lastW = w;
    computeSize(); drawLegend(); drawOld(); drawNew();
  }, 120);
});

setLang(lang, null);
renderAll(true);
lastW = squares.parentNode.clientWidth;
})();
