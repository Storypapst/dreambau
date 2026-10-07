# dreambau.com fertig bauen – Übergabe an Codex

Stand: 2026-10-06, abends. Geschrieben von Claude (Cowork) für Codex, nachdem den Claude-Sessions die Tokens ausgingen.
Alles hier ist entweder **geprüft** (mit Datum und Quelle) oder ausdrücklich als **unbekannt** markiert. Wo etwas
unbekannt ist, steht dabei, wo du es findest.

Lies zuerst Abschnitt 0, dann arbeite die Pakete in Abschnitt 7 der Reihe nach ab. Abschnitt 5 (Geschmack) und
`AGENTS-apps.md` (liegt neben dieser Datei) sind verbindlich.

---

## 0. Wie du mit dieser Datei arbeitest

**Das Problem, das diese Datei löst:** Seit dem 2026-10-03 haben mehrere Claude-Sessions an der Website gearbeitet:
Spezifikationen, Mockups, Tickets, zwei angefangene Features. Viele Ergebnisse liegen im privaten Repo
`Storypapst/dreambau-docs`, einige Agenten liefen noch, als die Tokens ausgingen. Wer jetzt einfach weiterbaut, baut
Dinge doppelt, entscheidet Fragen neu, die Frank schon beantwortet hat, und bringt einen eigenen Stil mit, der nicht zu
den Mockups passt.

**Deshalb in dieser Reihenfolge:**

1. Diese Datei ganz lesen, dann `AGENTS-apps.md`.
2. Im Monorepo lesen: `AGENTS.md`, `apps/landing/README.md`, `apps/landing/docs/NEXT-STEPS.md` (der Plan vom 2026-10-03,
   Abschnitte 0, 4, 7, 8, 11), `apps/teamwork/README.md` auf dem Branch `feat/teamwork-area`.
3. **Paket W0 (Inventur) zuerst.** Erst wenn die Inventur steht, wird gebaut.
4. Fragen an Frank: nur, was weder hier noch in `dreambau-docs` steht. Eine Frage pro Nachricht, mit Empfehlung.

**Beispiel, warum die Reihenfolge zählt.**
*Mit Inventur:* Du listest die Issues in `dreambau-docs`, findest die Entscheidung „Referenzen: Aufbau X“ und eine
halbfertige Spec, und baust genau das. Frank sieht nach einem Tag die Seite, die er schon entschieden hat.
*Ohne Inventur:* Du baust Referenzen nach eigenem Gefühl als Kachelwand, Frank sagt „das war doch entschieden“, die
Arbeit eines Tages ist weg, und er muss dieselben Fragen ein drittes Mal beantworten (das ist heute schon einmal
passiert: Frage „Welcher Aufbau für Referenzen?“, Antwort „war das nicht schon alles ausgewählt?“).

---

## 1. Ziel: Was „fertig“ heißt (entschieden am 2026-10-06)

dreambau.com v1 besteht aus diesen Seiten, alle mit Inhalt, alle auf dem Server, alle geprüft:

| Pfad (Vorschlag, Spec gilt) | Seite | Quelle der Gestaltung | Stand heute |
|---|---|---|---|
| `/` | Startseite mit drei Animationen | `apps/landing` | **live** seit 2026-10-03 |
| `/impressum.html`, `/datenschutz.html` | Rechtstexte + Fußzeile „Impressum · Datenschutz · Teamwork“ | NEXT-STEPS 4.1 und 11 | **fehlen** (Startseite läuft ohne) |
| `/teamwork/` | Verzeichnis der internen Programme | Spec `dreambau-docs#23`, Mockup Work C „Konstellation“ | Ticket 01 von n in PR #133 |
| Sprachen auf `/` | Sprachumschalter, 40 Sprachen | Spec in `dreambau-docs` (Ticket 24 = Mockup), Mockup `language-switch-*` | Ticket M1-01 von n in PR #134 |
| Quelltext-Ansicht auf `/` | „Quelltext 24,4 KB“ → Code-Ansicht + Fenster „Wie klein ist das?“ | Mockup `code-view-b` | Spec war in Arbeit |
| `/referenzen/` | 5 aktuelle Projekte + 7 alte Referenzen | Mockups `referenzen-a/b/c`, Entscheidung in `dreambau-docs` | Spec war in Arbeit |
| `/glossar/` | Wegweiser „Ich will …“ + A–Z | Mockup `glossar-wegweiser` (Runde 3) | Mockup fertig, Spec unbekannt |
| `/blog/` | Kurze Beiträge mit „Warum lesenswert“ | Mockup `blog-a` (Logbuch, vorläufig gewählt) | Mockup fertig |
| Kontakt | Kontaktformular (neu) | Spec war in Arbeit | unbekannt |
| `/bildungshaus/` | besteht, eigenes Repo `Storypapst/bildungshaus` | — | live, **nicht anfassen** |

Nicht Teil von v1: Animations-Pipeline (Formbricks → Issue → neue Animation), gemeinsamer Intake, Editor. Sie sind
entschieden bzw. in Spezifikation; gebaut werden sie nach v1 (Abschnitt 7, W11).

---

## 2. Was es schon gibt (geprüft am 2026-10-06)

### 2.1 Live auf dreambau.com

- Startseite = Build aus `apps/landing` (Release `20261003-163112`). Geprüft heute: `GET /` 200, Header
  `content-security-policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'`,
  `cache-control: no-store`, `server: nginx`.
- `/teamwork/` und `/impressum.html` antworten mit **301 auf `www.dreambau.com/…`**: Es gibt noch keine Route. Jede neue
  Seite braucht eine nginx-Route im Startseiten-Container **und** eine Regel im Reverse-Proxy (NEXT-STEPS 4.5).
- `/bildungshaus/` 200.

### 2.2 Monorepo `Storypapst/dreambau` (öffentlich)

- `main` @ `821a9d5`: PRs #128–#132 gemerged (Landing-Import, Apex-Build, GL-Meldung, Docker-Doku, Briefing-Texte).
- **PR #133** `feat/teamwork-area` @ `546f8ea`, nicht in `main`: „Teamwork 01: Show the example Programmliste as
  Kacheln on a page served by the test nginx“. Neuer Ordner `apps/teamwork` (eigenes `package.json`, Prüfungen mit echtem
  nginx in Docker, eigener Workflow `.github/workflows/teamwork.yml`). Code ist in Slices aufgeteilt: Slice 1 fertig;
  Kommentare im Code nennen Slice 7 (Handy-Leiste, Cluster-Layout) und Slice 9 (Konstellation). Spec: `dreambau-docs#23`.
- **PR #134** `feat/multilingual-m1` @ `ec7af8b`, nicht in `main`: „Multilingual M1 01: Serve the German page through the
  language mechanism“. Neu: `site/i18n.js` (Abschnitte state, load fertig; **choice, apply, glyphs, switch, sheet leer**),
  `site/i18n/de.js` (16 Schlüssel inkl. Blinden-Beschreibung je Animation), `site/i18n/index.js` (Manifest, nur `de`),
  Prüfungen `tools/e2e-lang*`, `tools/lang-tests/*` mit Verweisen auf Spec-Zeilen (VER-7 bis VER-28, FIL-, APP-, ERR-).
- Arbeitsweise, an der du dich orientierst: Ticket-Branch `tw/01-kacheln-page` bzw. `ml/01-german-mechanism` → Merge in
  den Feature-Branch mit der Nachricht `<Bereich> <NN>: <Titel>` + `Merge of <branch>; ticket <Bereich> <NN>` → Draft-PR
  des Feature-Branches nach `main`.
- Offene PRs #125, #126, #127 betreffen nicht die Website. Nicht anfassen.

### 2.3 Privates Repo `Storypapst/dreambau-docs` (Claude konnte es heute nicht lesen)

Dort liegen nach den Spuren in Repo, Artifacts und Franks Screenshot: die Wayfinder-Tickets (Entscheidungen zu
Sprachumschalter, Referenzen, Pipeline, gemeinsamer Intake, Blog), Specs (Teamwork `#23`, Mehrsprachigkeit), das Runbook
`docs/runbooks/start-page-publish.md` mit Skripten `tools/start-page-publish/`, ein Hygiene-Ticket, und die
Mockup-Branches:

| Branch | Stand | Inhalt |
|---|---|---|
| `mockups/code-view` | `06f8a6a` | Quelltext-Ansicht, Variante B |
| `mockups/referenzen` | `00e7ab0` | Referenzen A/B/C |
| `mockups/glossary` | `68193ca` | Glossar Runde 2 und 3 |
| `mockups/language-switch` | `5e0d204` | Sprachumschalter A/B/C |
| `mockups/blog` | `cd692ed` | Blog A/B/C (Quellen in `checks/build/src`, nicht die HTML editieren) |

### 2.4 Heute gesichert (Google Drive, `01 - Dreambau CC/70 - Sources & Media/`)

- `Website-Mockups (Stand 2026-10-06)/`: alle Mockups als einzelne HTML-Dateien (laufen offline), dazu Work A/B/C,
  Glossar Runde 1 und ein Übersichtsbild. Grund: Die Claude-Artifacts sind für dich nicht lesbar.
- `Portfolio fgp.webflow.io (gesichert 2026-10-06)/`: Franks alte Portfolio-Seite aus Webflow. 69 Dateien (Projekt-
  Screenshots SF Care, Eeloy, Wespro, Getme, Profilbild, Logo, Video), alle Texte in `portfolio-content.md/.json` mit den
  Bildern je Projekt in Seitenreihenfolge, `quell-urls.json`. Die Screenshots gibt es bei Webflow nur als WebP 1439×900
  (20–80 KB). Das ist die Bildquelle für `/referenzen/`.

### 2.5 Claude-Artifacts (nur Frank kann sie öffnen; Inhalte stecken in 2.4)

Dreambau Mockups `claude.ai/artifact/4jSEnrrdZqPhkvEsNrNd1o` · Work Mockup A/B/C `7YhsH99Td2u1WAPGDeu2gC`,
`NxCsjPF2XUH8ZfeTf9dmp1`, `KkSimNKA8NTtg4HiBJnVKt` · Glossar Runde 1 `BZCeRtcfkiQdcfXSwmtUaw` · spielwiese Nº2
`3WLhmcntRBc6je5LfBoS8J` (älterer Spielplatz, Schwarz-Weiß, gilt nicht mehr als Richtung) · Design-System „Dreambau“
`W6NGQi8aAYimsUnzwmKj7q` (gilt für die **Testmails-App**, nicht für die Website; nicht mischen).

### 2.6 Arbeitskopie vorbereiten

- Prüfe Branch und ungesicherte Änderungen, bevor du arbeitest. Verwende für Website-Arbeit einen isolierten Worktree
  vom vorgesehenen Ausgangsbranch; fremde Änderungen bleiben erhalten.
- Der aktuelle Zustand von Arbeitskopien und Worktrees gehört in den privaten Dreambau Core, nicht in diese öffentliche
  Übergabe. Aufräumen entscheidet Frank.

---

## 3. Rettungs-Inventur: was in der letzten Session lief (aus Franks Screenshot)

Frank hat den letzten Status der Session als Bild geschickt. Für jede Zeile gilt: in `dreambau-docs` (Issues, PRs,
Branches, Kommentare der letzten 72 Stunden) nachsehen, ob das Ergebnis angekommen ist.

| Punkt | Status in der Session | Wo nachsehen | Wenn da | Wenn weg |
|---|---|---|---|---|
| Monorepo-PRs 130, 131, 132 | gemerged, CI grün | — | **geprüft: in `main`** | — |
| Entscheidungen „…lter“ (vermutlich Sprachumschalter), Referenzen, Pipeline, Gemeinsamer Intake, Blog | entschieden | Issues mit diesen Titeln, geschlossene Wayfinder-Tickets | Entscheidung in Abschnitt 4 nachtragen, nicht neu fragen | nur dann Frank fragen, mit dem Mockup als Vorlage |
| Specs Referenzen, Quelltext-Ansicht, Animations-Pipeline, Intake | Schreiber liefen | `docs/specs/`, offene PRs, Issue-Kommentare | fertigstellen, Frank zur Abnahme | neu schreiben im Format von `#23`, aus Entscheidung + Mockup |
| Blog-Mockups, Glossar Runde 3 | lief | `mockups/blog` @ `cd692ed`, `mockups/glossary` @ `68193ca` | **vermutlich fertig** (im Artifact vom 06.10. morgens enthalten) | — |
| Kontaktformular (neu) | Spec wurde geschrieben | Issue „Kontaktformular“ | fertigstellen | neu: Ziel ist die zweite Kontaktmöglichkeit fürs Impressum neben E-Mail |
| Blog-Frage und Impressum | drei Prüf-Agenten, „Antworten in Version 2“ | Kommentare am Blog- und Impressum-Ticket | mit Abschnitt 4 abgleichen; Franks Antworten vom 06.10. gehen vor | Abschnitt 4 gilt |
| Editor | Recherche lief, Empfehlung offen | Issue „Editor“ | Empfehlung Frank vorlegen | Recherche neu, eine Seite, mit Empfehlung |
| Hygiene: Rollback überspringt die alte `nginx.conf` | Agent baute mit Tests | Branch/PR zu `tools/start-page-publish` | prüfen, mergen nach Regel 6.4 | neu bauen; **Pflicht vor jedem weiteren Release** |
| Rahmenvertrag | privat abgelegt | — | nicht Website, nicht anfassen | — |
| Teamwork-Bau, Mehrsprachigkeits-Bau (M1) | Planer, dann Tickets und Implementierer | Tickets „Teamwork NN“, „Multilingual M1 NN“ | Ticket 01 je fertig (PR #133, #134); restliche Tickets der Reihe nach | fehlende Tickets aus der Spec ableiten (Slices bzw. Abschnitte von `i18n.js`) |

**Ergebnis von W0** ist eine Tabelle im selben Format, mit Link je Zeile und „gerettet / neu / entfällt“. Sie kommt als
Kommentar in ein neues Tracking-Issue `Website v1` in `dreambau-docs` und als Datei
`01 - Dreambau CC/02 - Focus/Website v1 – Inventur.md`.

---

## 4. Entscheidungen

### 4.1 Heute von Frank beantwortet (2026-10-06)

| Frage | Antwort |
|---|---|
| Umfang v1 | Startseite, Impressum, Datenschutz, Teamwork **plus** Referenzen, Blog, Glossar/Wegweiser, Sprachen und Quelltext-Ansicht |
| Aufbau der Referenzen | „War das nicht schon alles ausgewählt?“ → Entscheidung steht in `dreambau-docs`. Findest du sie nicht: Variante **A Verzeichnis** (passt zu Blog A und Quelltext-Ansicht) und im PR schreiben „unter Delegation entschieden; ein Wort ändert das“ |
| Die 7 alten Referenzen | **Alle 7, englische Originaltexte**, mit Marke „EN“ wie im Mockup |
| PR-Rechte | Ticket-Branches mergt Codex nach grünen Prüfungen selbst in den Feature-Branch. Feature-Branch → `main` **erst nach Franks „ja“**. Auf den Server erst nach „ja, anwenden“ |
| Anbieter im Impressum | **GS DESIGN GmbH für die ganze Domain.** Greyt.IT UG erscheint nur in den Datenschutzhinweisen der Bildungshaus-Befragung als Verantwortliche für diese Daten |
| Sprachen | **Alle 40 sofort live**, auch ohne Gegenlesen. Das Feld `reviewed` bleibt als Merker im Wörterbuch, sperrt aber keine Sprache mehr (ändert NEXT-STEPS 7 „nur gegengelesene Sprachen“) |
| Text „Was ist Dreambau“ | **Nein.** Die Arbeit spricht: Referenzen, Blog, Bildungshaus. Kein Über-uns, kein Werbetext von Codex |
| Blog-Inhalt | **Frank liefert Themen/Links.** Die 7 Mockup-Beiträge sind erfunden und gehen nie live. Ohne echten Beitrag bleibt `/blog/` unveröffentlicht |

### 4.2 Aus NEXT-STEPS.md (2026-10-03), weiterhin gültig

„Jeht nich…“ bleibt groß · Schrift und Wirkung des Schriftzugs bleiben, **Frank verbessert sie selbst** (nicht anfassen) ·
Tastenhinweise „Esc“/„M“ nur bei Tastatur, Knöpfe als Pillen (1 px Rand, 24 px Radius) · Programme, die mit 5xx,
Zeitüberschreitung oder Verbindungsfehler antworten, verschwinden aus Teamwork dynamisch, ein Erfolg holt sie sofort zurück ·
keine Programmliste mit echten Adressen und keine Server-Skripte im öffentlichen Repo · Rechtstexte deutsch · keine Cookies,
kein Tracking, keine externen Anfragen.

### 4.3 Aus den Mockups abgelesen (gelten, bis `dreambau-docs` etwas anderes sagt)

- Teamwork ist nach **Work-Mockup C „Konstellation“** gebaut (Nabe „Teamwork“, Zonen als Sektoren, Zone „Verwaltung“
  innen); Teamwork ist laut README „das öffentliche Verzeichnis der Programme“.
- Quelltext-Ansicht: **Variante B**. Das Fenster „Wie klein ist das?“ zieht bei jedem Öffnen 3 von 8 Vergleichen und
  rechnet jede Zahl live aus der laufenden Animation.
- Blog: **A Logbuch** vorläufig („unter Delegation entschieden; ein Wort ändert das“).
- Glossar: **Runde 3 Wegweiser** ist die gebaute Richtung; das Glossar ist eine öffentliche Seite.
- Sprachumschalter: „· DE ▾“ am Ende der Kontaktzeile; Aufbau A/B/C laut Entscheidung in `dreambau-docs`. Ohne Fund:
  **C Suche** (bei 40 Sprachen findet „Türk“ sofort Türkçe; am Handy sitzt die Suche unten über dem Schließen-Knopf).

---

## 5. Geschmack: Wie die Seiten aussehen und klingen

Die Regeln stehen als `AGENTS-apps.md` neben dieser Datei und gehören als `apps/AGENTS.md` ins Repo (W0). Dann liest jeder
Codex-Lauf unter `apps/` sie automatisch. Kurzfassung:

1. **Alles sieht aus wie die Mockups**, nicht wie ein Template. Dunkel (`#06080d`), Systemschrift, Monospace für Zahlen,
   Daten, Codes und Listen-Nummern, Pillen mit 1 px Rand und 24 px Radius, farbige Marken mit festen Bedeutungen.
2. **Keine neue Farbe, keine Webfont, kein Framework-Look.** Die Sicherheitsrichtlinie verbietet ohnehin fremde Dateien und
   Inline-Stile.
3. **Fehlt eine Gestaltungsentscheidung:** drei Wegwerf-Mockups im Stil der vorhandenen bauen (Branch
   `mockups/<thema>` in `dreambau-docs`, mit Zustandsleiste), Frank eine Frage stellen, bis dahin am nächsten
   Gestaltungsthema weiterarbeiten.
4. **Texte:** Deutsch, kurz, konkret, ohne Werbewörter. Codex schreibt keine Texte, die für Dreambau sprechen; vorhandene
   Texte werden übernommen, fehlende als sichtbarer Platzhalter markiert.

**Beispiel.**
*Mit diesen Regeln:* Die Blogliste entsteht aus nummerierten Monospace-Zeilen wie in `blog-a.html`, Titel mit
bernsteinfarbenem Block-Cursor wie „Referenzen▌“, Pillen 44 px hoch. Frank erkennt sofort dieselbe Seite wie Quelltext-Ansicht
und Teamwork.
*Ohne sie:* Ein Agent nimmt Tailwind-Standard, Inter als Webfont, blaue Buttons und Karten mit Schatten. Die
Sicherheitsrichtlinie blockiert die Schrift, die Seite sieht aus wie ein SaaS-Template, alles wird neu gemacht.

---

## 6. Technik und Arbeitsweise

### 6.1 Aufbau

- Jede Seite ist eine eigene App unter `apps/<name>` (`landing`, `teamwork`, neu `referenzen`, `blog`, `glossar`,
  `legal` oder wie die Spec sie nennt), mit eigenem `package.json`, eigener Lock-Datei, eigenem Workflow
  `.github/workflows/<name>.yml` mit Pfadfilter (Vorlage: `teamwork.yml`, Actions auf SHA gepinnt,
  `persist-credentials: false`).
- **Statische Dateien, kein Framework, kein Build-Server**, wie `landing` und `teamwork`: HTML + eine CSS-Datei +
  JavaScript-Module, ausgeliefert von nginx. Inhalte (Referenzen, Blogbeiträge, Glossarwörter) als JSON- oder
  Markdown-Dateien im App-Ordner, die ein kleines Node-Skript zur Build-Zeit in HTML schreibt, damit die Seite **ohne
  JavaScript lesbar** bleibt. Steht in der Spec etwas anderes (z. B. Astro/Eleventy für den Blog), gilt die Spec.
- Gemeinsame Teile (Tokens, Pillen, Kopfzeile mit „‹ Startseite“) einmal schreiben und in jede App kopieren lassen
  (wie der „shared core“ der Mockups) oder als `apps/shared/` bauen. Erst fragen, wenn es mehr als ein Stylesheet ist.
- Sicherheitsrichtlinie jeder Seite mindestens so streng wie die der Startseite. Keine Inline-Skripte, keine
  Inline-Stile, keine Handler-Attribute. `connect-src 'self'` nur dort, wo eine Seite eine eigene JSON-Datei lädt (Teamwork).

### 6.2 Prüfen

```sh
# Wurzel (Testmails-App), vor jedem PR nach main:
npm ci && npm run lint && npm test && npm run build
# Startseite:
cd apps/landing && npm ci && npm run build && npm run verify && npm run build:apex && npm run check:apex
# Sprachen (PR #134):
npm run e2e:lang && npm run test:languages
# Teamwork (PR #133), braucht Docker:
cd apps/teamwork && npm ci && npx playwright install chromium && npm run check
# nach jedem Release gegen die echte Seite:
BASE_URL=https://dreambau.com npm run check:apex
```

Jede neue App bekommt dieselbe Art Prüfung wie Teamwork: echtes nginx mit den Live-Headern, Chromium, Konsole sauber,
keine fehlgeschlagene Anfrage, kein Richtlinienverstoß, Handy 390×844, „Bewegung reduzieren“, ohne JavaScript lesbar.

### 6.3 Tickets

- Für jedes Paket in Abschnitt 7 ein Issue in `dreambau-docs`, Format wie `#23`: Problem, Ziel, Akzeptanzzeilen mit IDs,
  Prüfungen, offene Fragen. Die Prüfungen im Code nennen die Zeilen-IDs (so wie `C28`, `VER-26` heute).
- Branches: `<kürzel>/<NN>-<thema>` (z. B. `ref/01-data-and-list`), Merge in `feat/<bereich>`, Draft-PR nach `main`.
- Commit-Nachrichten englisch, ganze Sätze im Imperativ, wie in der Historie („Add the …“, „Fix the …“).
- PR-Beschreibung: das Problem vorher, die Lösung, die Belege (Prüfungen, Screenshots am Handy und am Rechner).

### 6.4 PR-Pflege (Franks feste Regel)

Bei jedem Arbeitsbeginn und vor jedem Ende:

1. Eigene offene PRs prüfen: Review-Hinweise (CodeRabbit, Augment) bearbeiten, Merge-Konflikte selbst lösen, CI grün machen.
2. Ticket-PRs in den Feature-Branch mergen, sobald grün und Hinweise erledigt.
3. Feature-PRs nach `main`, die auf Frank warten: eine kurze Erinnerung mit dem Problem vorher, der Lösung und **wie lange
   der PR schon wartet**.
4. Wenn alle PRs eines Tickets zu sind: Issue schließen, lokale Branches löschen, `git fetch --prune`, damit der nächste
   Lauf vom aktuellen `main` startet.
5. Am Ende eine Zusammenfassung für Frank, auch nicht-technisch, mit Links auf Issue und PRs.

### 6.5 Veröffentlichen

- Nur nach Franks „ja, anwenden“, nur nach dem Runbook in `dreambau-docs`, nur durch Austausch von Dateien mit Sicherung,
  Prüfsummen und getestetem Rückweg. Prompt dafür: NEXT-STEPS.md, Ende Abschnitt 15.
- Neue Routen (`/impressum.html`, `/datenschutz.html`, `/teamwork/`, `/referenzen/`, `/blog/`, `/glossar/`) ändern nginx
  und Reverse-Proxy. Das ist eine eigene Änderung mit eigenem Rückweg, gebündelt in **einem** Release, damit nginx nur
  einmal angefasst wird. Vorlage: `apps/teamwork/ops/nginx-teamwork.additions.conf`.
- Nach dem Release: `check:apex` gegen die echte Seite, `/bildungshaus/` unverändert, Matrix-Discovery Byte für Byte gleich,
  `/testmails`-Login 200, geschützte API 401, fehlende Datei 404.
- Vor dem Release prüft der Operator die nötige Kapazität. Messwerte und eine gegebenenfalls nötige Liste mit
  Löschkandidaten bleiben im privaten Dreambau Core; **selbst nichts löschen**.

---

## 7. Arbeitspakete in Reihenfolge

Jedes Paket: Ziel · Grundlage · fertig, wenn … · wartet auf. Pakete ohne „wartet auf“ laufen ohne Frank durch.

**W0 Inventur und Übergabe ins Repo** (zuerst, etwa 1 Stunde)
- Abschnitt 3 abarbeiten mit `gh issue list -R Storypapst/dreambau-docs --state all --limit 200`,
  `gh pr list -R Storypapst/dreambau-docs --state all`, `gh api repos/Storypapst/dreambau-docs/branches --paginate`,
  `gh issue view <n> --comments`.
- Tracking-Issue „Website v1“ anlegen, Inventur-Tabelle als Kommentar, je Paket W1–W12 ein Unter-Issue (oder an
  vorhandene anhängen, nicht doppelt anlegen).
- Branch `docs/website-handover` von `origin/main`: diese Datei als `docs/website/HANDOVER.md`, `AGENTS-apps.md` als
  `apps/AGENTS.md`. PR nach `main` (das ist Doku, Frank mergt).
- Fertig, wenn: jede Zeile aus Abschnitt 3 einen Link und einen Status hat.

**W1 Rechtstexte und Fußzeile** (höchste Priorität: die Startseite ist seit dem 03.10. ohne Impressum online)
- NEXT-STEPS 4.1 und 11. Anbieter GS DESIGN GmbH (Abschnitt 4.1). Bekannt: Kreuzbergstr. 30d, Berlin; HRB 154085;
  USt-IdNr. DE310952039; Geschäftsführer Frank Gerhardt und Valery Suslov; Hoster Hetzner, Falkenstein.
  **Sichtbare Platzhalter** für Postleitzahl, Registergericht samt Schreibweise, zweite Kontaktmöglichkeit (Telefon oder
  Kontaktformular aus W8). Nichts erfinden, keine Steuernummer.
- Fußzeile „Impressum · Datenschutz · Teamwork“ (Linktext laut Spec `#23`; früher entschieden: „Work“) auf der Startseite,
  12 px, halbe Deckkraft, Tippfläche 44 px, auch in `html.static` und `<noscript>`, kollidiert nicht mit `#skip` und `#cta`.
- Fertig, wenn: Seiten statisch ohne JavaScript, `bundle.mjs` und `build-apex.mjs` legen sie mit ab, e2e prüft Sichtbarkeit,
  Tastatur, keine Netzwerkanfrage. Wartet auf: Frank für die drei Platzhalter (kann parallel laufen).

**W2 Teamwork fertig** (PR #133)
- Restliche Tickets/Slices nach `#23`. Echte `programs.json` nur auf dem Server bzw. privat, nie im öffentlichen Repo.
  Prüfskript auf dem Server (jede Minute, 5xx/Zeitüberschreitung/Verbindungsfehler = nicht erreichbar, zwei Fehlschläge
  zum Ausblenden, ein Erfolg zum Einblenden, `list.json` älter als 15 min → alle zeigen mit „Status unbekannt“).
- Fertig, wenn: `npm run check` grün, Konstellation am Rechner, Cluster-Liste am Handy, Datenschutzseite verlinkt.

**W3 Mehrsprachigkeit fertig** (PR #134)
- Abschnitte `choice`, `apply`, `glyphs`, `switch`, `sheet` in `site/i18n.js` nach der Spec, je ein Ticket.
- 40 Sprachen als Entwürfe, alle live (Abschnitt 4.1). Rechts-nach-links für ar, fa, ur prüfen. Schriftsysteme mit
  Systemschriften, keine eingebetteten Fonts. „Jeht nich… jibs nich…“ sinngemäß übersetzen, nicht wörtlich.
- Umschalter nach Entscheidung (Ohne Fund: C Suche).
- Fertig, wenn: `e2e:lang` und `test:languages` grün, jede Sprache passt im Hochformat in die Breite, Blinden-Beschreibung
  in jeder Sprache vorhanden.

**W4 Quelltext-Ansicht** auf der Startseite
- Mockup `code-view-b.html`, NEXT-STEPS 5. Echter Quelltext der laufenden Animation, Größe der Animation und der ganzen
  Seite ehrlich getrennt, gemessene Ladezeit, Fenster „Wie klein ist das?“ mit 3 von 8 Vergleichen, Werte als „etwa“.
  `Esc` schließt erst die Ansicht. Bei „Bewegung reduzieren“ nur das Schlussbild.
- Fertig, wenn: `verify` und `check:apex` grün, Budgets der Animationen unverändert.

**W5 Referenzen** (`/referenzen/`)
- Aufbau laut Entscheidung (Abschnitt 4.1). Einträge wie im Mockup (Datenstruktur `E` in `referenzen-a.html`):
  aktuell ORISO, WeCareRemote, ORI, Bildungshaus weWeit, trail.ist; alt R1–R7 (We Care Remote 2024, GS Design 2023,
  Sunflower Care 2023, Eeloy 2023, Werbespitze/Wespro 2023, Greyt.IT/Getme 2018, Barkett.berlin 2017).
- Alte Referenzen: englische Originaltexte aus `portfolio-content.md`, Bilder aus dem Portfolio-Backup ins Repo unter
  `apps/referenzen/assets/` (R3–R6 haben Bilder; R1, R2, R7 nicht). Kein Bild erfinden, kein KI-Bild.
- Aktuelle Projekte: Die Kurztexte für ORISO und Bildungshaus sind im Mockup als „Entwurf, von Frank freigeben“ markiert;
  WeCareRemote, ORI und trail.ist haben „Kurztext folgt“. Bis Frank liefert: Eintrag ohne Text (nur Name, Marken, Link).
- Links vor dem Livegang prüfen. Aus der Cloud nicht erreichbar waren `storypapst.com` (DNS), `barkett.berlin`,
  `openresilience.cc`, `trail.ist`; lokal nachprüfen, tote Links weglassen statt verlinken.
- Wartet auf: Frank für die Kurztexte (Liste in Abschnitt 8).

**W6 Glossar/Wegweiser** (`/glossar/`)
- Mockup `glossar-wegweiser.html`: 44 Fragen in 6 Bereichen, 40 Wörter; die 10 als „Vorschlag“ markierten Wörter erst nach
  Franks Freigabe. Suche ohne Treffer nennt das richtige Wort (Beispiel „Deploy“).
- Die Antworten müssen zur echten Arbeitsweise passen; nach W0 mit den Tickets abgleichen, Abweichungen Frank zeigen.

**W7 Blog** (`/blog/`)
- Gerüst nach `blog-a.html` (Logbuch): Liste, Beitragsseite, Feed. Beitrag = Markdown mit Feldern Titel, Datum, Quelle
  (Link), Sprache, „Warum lesenswert“ (zwei Zeilen). Quellen nur verlinken, nichts einbetten.
- Inhalte: nur Franks Themen/Links. Route erst live, wenn mindestens ein echter Beitrag freigegeben ist.
- NEXT-STEPS 10: Ob ein Redaktionsverantwortlicher ins Impressum muss, klärt Frank (IHK/Anwalt) vor dem ersten Beitrag.

**W8 Kontaktformular** (Spec war in Arbeit)
- Spec aus W0 fertigstellen. Zweck: zweite Kontaktmöglichkeit fürs Impressum. Ohne externes Skript, ohne Cookies; Ziel
  der Nachrichten laut Spec (Formbricks auf `umfrage.dreambau.com` ist zeitweise gestoppt, also vorher klären, ob es
  dauerhaft läuft).

**W9 Hygiene der Veröffentlichung** (vor dem ersten Release mit neuen Routen)
- Befund „Rollback überspringt die alte `nginx.conf`“ fertig bauen, mit Test. Skripte für spätere Releases verallgemeinern.

**W10 Server-Platte**
- Kapazität vor dem Release prüfen und nötige Maßnahmen Frank vorlegen. Die Betriebsinventur bleibt im privaten
  Dreambau Core. Nichts löschen.

**W11 Release v1**
- Ein Release mit W1–W7 und den Routen, nach „ja, anwenden“. Abnahme nach 6.5. Danach auf echten Geräten ansehen
  (iPhone/Safari, Android/Chrome, Firefox, älteres Notebook).

**W12 Nach v1** (nicht jetzt bauen)
- Animations-Pipeline, gemeinsamer Intake, Editor: Specs/Empfehlungen aus W0 fertigstellen und Frank vorlegen.

---

## 8. Was nur Frank beantworten kann (gesammelt, damit du nicht einzeln fragst)

1. Impressum: Postleitzahl, Registergericht in der Schreibweise des Auszugs, zweite Kontaktmöglichkeit (Telefon oder
   Kontaktformular).
2. Kurztexte für WeCareRemote, ORI, trail.ist; Freigabe der Entwürfe für ORISO und Bildungshaus.
3. Blog: erste Themen/Links.
4. Glossar: die 10 Wörter mit „Vorschlag“.
5. Server-Platte: was gelöscht werden darf (nach W10).
6. Schärfere Originale der Portfolio-Screenshots (lokal oder Figma), falls die WebP-Fassung nicht reicht.
7. Alles, was W0 als „entschieden, aber Ergebnis verloren“ findet.

---

## 9. Was du nicht tust

- Keine fremden Arbeitskopien oder älteren Worktrees verändern.
- Keine Zugangsdaten, Serverpfade, Programmlisten oder Steuernummer ins öffentliche Repo.
- Keine Schrift, keine Wirkung am Schriftzug, keine neuen Farben, keine Werbetexte, kein „Über uns“.
- Kein Merge nach `main` und kein Release ohne Franks Wort. Kein Löschen auf dem Server.
- `/bildungshaus/`, `/testmails`, Matrix-Discovery nicht verändern.


## 10. W0 readback by Codex (2026-10-06)

This readback corrects assumptions in the handover above. GitHub was reachable through the authenticated CLI.
The full inventory remains in the private Dreambau Core, `02 - Focus/Website v1 – Inventur.md`.
Do not copy private operator documents into this public repository.

| Item | Verified result | Source |
|---|---|---|
| Referenzen layout | C, Zeitstrahl. The fallback A in section 4 is not needed. | [Decision](https://github.com/Storypapst/dreambau-docs/issues/22) |
| Language switch | A, Raster, without search in the first build. The fallback C in section 4 is not needed. | [Decision](https://github.com/Storypapst/dreambau-docs/issues/24) |
| Blog layout | A, Logbuch. | [Decision](https://github.com/Storypapst/dreambau-docs/issues/26) |
| Glossar | C, Wegweiser, from Frank's later instruction. | [Decision history](https://github.com/Storypapst/dreambau-docs/issues/18) |
| Postcode and contact choice | 10965 Berlin and a contact form were already supplied; do not ask again. The form is not built. | [Contact ticket](https://github.com/Storypapst/dreambau-docs/issues/28) |
| Language count | The saved table/spec has 47 languages; this handover and Frank's latest instruction say 40. The latest instruction removes the reader gate. Reconcile the concrete list before changing the language mechanism; do not silently drop seven rows. | [Spec](https://github.com/Storypapst/dreambau-docs/pull/25), [language decision](https://github.com/Storypapst/dreambau-docs/issues/6) |
| Teamwork schedule | The handover's one-minute instruction differs from the saved spec/plan's hourly schedule. Check the exact spec before implementation. | [Spec](https://github.com/Storypapst/dreambau-docs/pull/23), [schedule ticket](https://github.com/Storypapst/dreambau-docs/issues/41) |
| Legal footer | The saved legal draft proposes 14 px, full opacity and a dark backing; section 7 says 12 px, half opacity. Reconcile the legal draft and the mockup before building. | [Legal draft](https://github.com/Storypapst/dreambau-docs/pull/30) |
| Rollback | Skipping the old nginx.conf is intentional. The deny-list change is merged; do not rebuild it as an alleged defect. New routes still require their own tested rollback. | [Merged change](https://github.com/Storypapst/dreambau-docs/pull/29) |
| Draft specs | Code view, contact form and animation pipeline exist on their spec branches, without PRs. Their presence does not establish approval. | [Code view](https://github.com/Storypapst/dreambau-docs/tree/specs/code-view), [contact](https://github.com/Storypapst/dreambau-docs/tree/specs/contact-form), [pipeline](https://github.com/Storypapst/dreambau-docs/tree/specs/animation-pipeline) |
| Missing spec results | No Referenzen, shared intake, blog or public glossary specification file was found across the fetched branches. Decisions and mockups exist. | [Planning map](https://github.com/Storypapst/dreambau-docs/issues/1) |

### Resume here

The scope of this change is the binding apps rules, handover and W0 inventory. No website feature was built.
Read section 10 before section 7. Keep main merges and publication behind Frank's explicit approval.
The private inventory contains the proposed Website v1 delivery tree; it has not been created on GitHub.
Ask Frank to approve that concrete tree before creating the new delivery epic, as his global epic rule requires.
