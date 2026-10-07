# Übergabe und Plan: dreambau.com (Landing, Work-Bereich, Blog)

Stand: 2026-10-03. Diese Datei sagt, wo das Projekt steht, womit man lokal weiterarbeitet und was geplant ist. Sie ist so
geschrieben, dass man sie auch einem lokalen Claude-Code-Lauf geben kann (Prompt am Ende). Es wurde nichts davon gebaut,
außer was in Abschnitt 1 steht: der Rest ist Planung. Seit dem Import liegt die Datei im Monorepo `Storypapst/dreambau`
unter `apps/landing/docs/`; geschrieben wurde sie im Fork `Storypapst/morphdemo-benchmark` (Ordner `dreambau-landing/`).

## 0. Entscheidungsstand (zum Abhaken)

Stand nach dem Chat vom 2026-10-03 (zweite Runde, Antworten des Nutzers eingearbeitet). ✔ entschieden, ◐ teilweise,
○ offen. In diesem Chat hat keine „grilling"-Fragerunde und keine Wayfinder-Runde stattgefunden; die Wayfinder-Runde läuft
seitdem im privaten Repo `Storypapst/dreambau-docs`, dort werden die Entscheidungen zu den Abschnitten 5 bis 10 als Tickets
geführt. Die Rückfragen aus dem Chat stehen unten mit den Antworten, damit die erste lokale Runde sie nicht wiederholt.
PR #1 ist gemerged (Punkt 1); die neue Startseite ist seit 2026-10-03 live (Punkt 14, Abschnitt 4.5).

1. ✔ PR #1 wird in `main` des Forks gemerged („ja mergen", 2026-10-03). Zusammengeführt wird mit einem Merge-Commit, damit
   die Einzelcommits bestehen bleiben, die `git subtree split` (Abschnitt 2) später mitnimmt.
2. ✔ „Jeht nich…" bleibt am Anfang groß („passt wie es ist").
3. ✔ Schrift und Wirkung (Abschnitt 4.3) bleiben vorerst, wie sie sind: keine der gezeigten Alternativen gefiel besser. Der
   Nutzer verbessert sie später in der lokalen Sitzung; Abschnitt 4.3 bleibt dafür als Material stehen.
4. ✔ „Esc" und „M" (Abschnitt 4.2): Die Tastenbeschriftung erscheint nur, wo es eine Tastatur gibt, nicht auf Smartphones.
   Die Knöpfe selbst (Überspringen, Ton) sind dezente Pillen: Rand 1 px, Radius 24 px. Das ist meine Lesart der Antwort;
   sollte die Pille nur die Tastenhinweise meinen, ändert sich nur das Stylesheet.
5. ✔ Login-Link „Work"; im Work-Bereich gibt es kein Esc, dort stehen alle Programme (Abschnitt 8). Der Hinweis, dass „Work"
   als „Referenzen" gelesen werden kann, ist unbeantwortet.
6. ✔ Sprachen (Abschnitt 7): sinngemäße Übersetzung, Auswahl nach Browsersprache, Rückfall Deutsch, Umfang: die 40
   meistgenutzten Sprachen. Offen: nach welcher Liste gezählt wird und wer die Übersetzungen gegenliest.
7. ◐ Impressum (Abschnitt 11): genannt sind GS DESIGN GmbH, Kreuzbergstr. 30d in Berlin, Handelsregister HRB 154085,
   USt-IdNr. DE310952039, die Geschäftsführer Frank Gerhardt und Valery Suslov sowie Hetzner (Falkenstein) als Hoster. Den
   Rest („kannst du online finden") konnte die Cloud-Sitzung nicht prüfen: dreambau.com und northdata.de sind dort gesperrt,
   die Suche fand die Firma nicht. Zu prüfen bleiben Postleitzahl, Registergericht samt Nummer mit Zusatz und eine zweite
   Kontaktmöglichkeit. Steuernummer, Finanzamt und Gründungsdatum wurden ebenfalls genannt, stehen aber bewusst nicht im
   Repo (keine Pflichtangabe, öffentliches Repo). Sichtbarkeit offen: Der Nutzer tendiert dazu, das Impressum nur in der
   Zeichen-Ansicht zu zeigen; die Empfehlung ist zusätzlich eine winzige, sichtbare Zeile.
8. ◐ Work-Bereich (Abschnitt 8): Die Programmliste wurde geliefert (21 Programme, 22 Adressen, jeweils mit Stand).
   Entschieden: Programme, die gerade mit 503 antworten, werden nicht angezeigt, und zwar dynamisch, sie kehren also von
   selbst zurück. Ich behandle 502, Zeitüberschreitung und „Verbindung abgelehnt" genauso, weil ein Link auf eine tote
   Adresse niemandem hilft; bitte bestätigen. Die Liste selbst steht bewusst nicht in diesem öffentlichen Repo (Abschnitt 8).
   Offen: ob die Liste öffentlich oder erst nach einem Login erscheint.
9. ✔ Monorepo (Abschnitt 2): heißt „Dreambau" und enthält alle anderen Sachen; der Fork bleibt als Archiv bestehen. Der
   Pfad ist `Storypapst/dreambau` (vom Nutzer bestätigt, siehe Punkt 13). Die Landing liegt als `apps/landing`; offen
   sind die Ordnernamen für später (Vorschlag `apps/work`, `apps/blog`).

**Nachtrag (später am 2026-10-03, nach dem Merge):** Der Nutzer wies auf das Projekt `dreambau.com/bildungshaus` hin, in dem
„das Formbricks-Ding" online ist. Die Cloud-Sitzung hat dazu das öffentliche Repo `Storypapst/bildungshaus` gelesen.
dreambau.com selbst ist aus der Cloud nicht erreichbar, deshalb ist nichts davon live geprüft. Daraus folgen vier offene
Punkte (und die Korrektur von Abschnitt 4.5):

10. ○ Bildungshaus (Abschnitt 3, D): Das Projekt kam in der bisherigen Planung nicht vor. Soll die Landing (Fußzeile) oder
    der Work-Bereich auf `/bildungshaus/` verweisen?
11. ◐ Formbricks (Abschnitt 9): Die Formulare im Fußbereich von Bildungshaus liegen auf `umfrage.dreambau.com`. In der
    Programmliste vom 2026-10-03 stand diese Adresse mit 502 („Container gestoppt"). Wenn beides stimmt, zeigt der Rahmen
    im Bildungshaus-Fußbereich gerade einen Fehler. Ob das so ist, wurde nicht geprüft.
12. ○ Wer ist Anbieter? (Abschnitt 11): Die Bildungshaus-Doku nennt für die Datenverwaltung der Befragung „Greyt.IT UG
    (haftungsbeschränkt)", die Landing nennt die GS DESIGN GmbH. Vor Impressum und Datenschutz klären, welche Firma für
    welchen Teil der Domain Diensteanbieter ist.
13. ✔ Monorepo (Abschnitt 2): Der Nutzer bestätigt: `Storypapst/dreambau` ist das Monorepo. Es ist öffentlich und enthält
    die Testmails-Registry (`/testmails`) im Wurzelordner. Der Trockenlauf zeigte keine Hürde; die Landing ist als
    `apps/landing` importiert (siehe Abschnitt 2). Weil das Repo öffentlich ist, gilt Abschnitt 8 (keine Programmliste,
    keine Server-Skripte mit Zugangsdaten) dort ebenso.
14. ✔ Livegang auf dreambau.com („merge und deploy", 2026-10-03): Der Import ist gemerged (PR #128). Veröffentlicht wurde
    am selben Tag in einem lokalen Lauf mit SSH-Zugang, nur durch Austausch von Dateien (Abschnitt 4.5, Prompt für spätere
    Releases am Ende von Abschnitt 15). Die Startseite ist seitdem live, ohne Impressum und Datenschutz; die Texte fehlen
    noch und würden als zweiter Release folgen (Abschnitt 11).

### Weitere Entscheidungen und Wünsche aus dem Chat

- **Grundanforderung (ursprünglich):** Bei jedem Laden startet zufällig eine von drei Animationen, mit dem Text „Jeht
  nich… jibs nich… dreambau.com", am Ende klein „info@dreambau.com (nich warten, quatschen)", Start mit Ton und mit
  Ton-aus-Knopf.
- **Weiterarbeit lokal:** Die SSH-Schlüssel liegen lokal; die Cloud-Sitzung hat keinen Zugriff darauf (geprüft: kein
  Schlüssel, kein Agent). Veröffentlicht wurde deshalb erst in einem lokalen Lauf am 2026-10-03 (Abschnitt 4.5).
- **Drei große Vorhaben:** Blog, Pipeline für die Landing-Animationen, Work-Bereich mit Impressum. Zuerst eine
  Spezifikation, geplant mit dem Skill „Wayfinder" von Matt Pocock (lokal).
- **Pipeline:** Idee kurz einsprechen oder eintippen, Claude baut, Freigabe mit „ja, mach", danach automatisch im Pool.
  Das Eingabeformular ist das selbst gehostete Formbricks. Claim und visuelle Geschichten sollen sich über das Briefing
  ändern lassen; eine kurze Rückfragerunde zum Schärfen vor dem Bauen ist erwünscht.
- **Blog:** kurze Beiträge, Abschnitt „Warum lesenswert" über ein Formbricks-Formular.
- **Zeichen-Ansicht (Abschnitt 5):** gewünscht, mit Größe, gemessener Ladezeit, Vergleichen als Quadrate (zum Beispiel
  „1 Sekunde Video", „durchschnittliches iPhone-Foto"), ruhigem Ende und als Fallback ohne WebGL2. Einzelheiten offen.
- **Work-Bereich (Abschnitt 8):** Matrix-artiger, mutierender Zeichenstil, aber bunt statt grün, jede Zone mit eigener
  Farbe; zuerst Mockups. Programme, die nicht antworten (503), werden dynamisch ausgeblendet.
- **Barrierefreiheit (Abschnitt 12):** Beschreibung für blinde Menschen, mehrsprachig, als Zusatz im Briefing.
- **Beantwortet, ohne Entscheidung:** Verhalten auf älteren Geräten (Abschnitt 4.4), Hochformat und Drehen
  (Abschnitt 6; ein „fest verankertes Bild" wird nicht empfohlen).

### Bisherige Fragen und Antworten

| Frage der Cloud-Sitzung | Antwort des Nutzers |
|---|---|
| PR #1 in `main` mergen? | Ja, mergen |
| „Jeht nich…" groß oder klein? | „Passt wie es ist", also groß |
| „Esc" und „M" auch auf dem Handy oder nur mit Tastatur? | Nur mit Tastatur; Knöpfe als dezente Pille (1 px Rand, 24 px Radius) |
| Ist der Login-Link „Intranet-Login" gemeint? | Er soll „Work" heißen; dort kein Esc, alle Programme |
| Soll vorab ein Bild der drei Schriften gezeigt werden? | Ja, Screenshots genügen, keine neuen Videos; danach: Schrift bleibt, der Nutzer verbessert sie lokal |
| Angaben für das Impressum? | Firma, Anschrift ohne Postleitzahl, Handelsregisternummer, USt-IdNr.; „den Rest online finden" (siehe Punkt 7) |
| Wer hostet dreambau.com? | Hetzner, Falkenstein |
| Liste der Programme und Domains für „Work"? | Geliefert (21 Programme); die mit 503 nicht anzeigen |
| Welche Sprachen? | Die 40 meistgenutzten |
| Soll Abschnitt 0 in „grilling"-Fragerunden durchgegangen werden? | keine Antwort; geplant ist Wayfinder lokal |
| Angebot: einen Problem-Issue nachträglich anlegen, wenn Issues im Fork eingeschaltet werden | keine Antwort |
| (Hinweis des Nutzers, keine Frage) Das Projekt `dreambau.com/bildungshaus` mit dem Formbricks-Formular ist wichtig | aufgenommen: Abschnitt 3 (D), Punkte 10 bis 13 offen |
| PR #2 mergen? Ist `Storypapst/dreambau` das Monorepo? | Ja, mergen. Ja, das ist das Monorepo. Die Landing dort hineinlegen, wenn es nicht schwer ist, sonst alles im Fork lassen („auch cool mit mir") |

## 1. Wo wir stehen

- **Repo:** `Storypapst/dreambau` (Monorepo, öffentlich), **Ordner** `apps/landing/`. Herkunft: der Fork
  https://github.com/Storypapst/morphdemo-benchmark (Ordner `dreambau-landing/`, Stand `2cff8f6`); dort bleiben die
  vollständige Historie und die Besprechung der Pull Requests.
- **Pull Requests im Fork:** https://github.com/Storypapst/morphdemo-benchmark/pull/1 (die Landing) und
  https://github.com/Storypapst/morphdemo-benchmark/pull/2 (Korrektur der Übergabe), beide am 2026-10-03 freigegeben und
  mit einem Merge-Commit gemerged. Alle Review-Hinweise von Augment und CodeRabbit bearbeitet.
- **Inhalt:** die Seite (`site/`) mit drei Animationen, die bei jedem Laden zufällig gewählt werden: Rohbau (4k),
  Traumhaus (16k), Skyline (64k), dazu Laufzeit, Prüfwerkzeuge und Dokumentation. Alle Prüfungen sind bestanden
  (`verification/SUMMARY.md`). Geprüft wurde nur in Headless-Chromium mit Software-Rendering, nicht auf echten Geräten.
- **Zuletzt behoben:** In der Skyline blieb nach etwa 37 s ein Zwischenbild des Sonnen-Effekts stehen (Schleier am oberen
  Rand). Dazu gibt es jetzt eine Prüfung „order independence" in `tools/verify.mjs`.

## 2. Monorepo `dreambau`

Gearbeitet wird künftig im Monorepo **`Storypapst/dreambau`** (vom Nutzer bestätigt, öffentlich); der Fork bleibt als
Archiv. Die Landing liegt als `apps/landing`, später kämen `apps/work` und `apps/blog` dazu. Im Wurzelordner liegt die
„Dreambau Testmails Registry" (`/testmails`), dazu `k8s/` (Kubernetes-Manifeste der Testmails-App; der Server läuft
inzwischen mit Docker Compose, siehe Abschnitt 4.5) und `ops/`. Das Repo ist öffentlich: Die Programmliste des
Work-Bereichs und Server-Skripte mit Zugangsdaten (Abschnitt 8) gehören nicht hinein; die Alternative wäre, das Repo privat
zu stellen.

**Was der Trockenlauf gezeigt hat** (Kopie des Monorepos, Node 20 wie in `.nvmrc`):

- `npm run lint` (drei `tsc`-Läufe mit festen `include`-Listen) und `npm run build` laufen mit dem neuen Ordner unverändert.
  `vitest` findet dieselben 102 Testdateien, keine aus `apps/landing` (auch nicht nach `npm ci` im Ordner).
- Das Dockerfile kopiert nur benannte Ordner (`src`, `tests`, `k8s`, `ops`, …); `apps/landing` gelangt nicht ins Abbild, nur
  der Build-Kontext wächst. `.dockerignore` ignoriert jetzt `**/node_modules`, damit auch ein lokales `npm ci` in
  `apps/landing` nicht in den Kontext geht.
- Die Landing baut an der neuen Stelle mit denselben Größen (4k 3791, 16k 10191, 64k 24415 Byte, alle im Budget), unter
  Node 20 und 22.
- Gewicht: Die drei Kontaktbögen (`verification/<id>/frames/sheet.png`, je rund 4 MB) sind im Monorepo weggelassen; sie
  liegen im Fork. Mit ihnen wüchse das öffentliche Repo um rund 18 MB statt um rund 6 MB, und Git behält sie für immer. Die
  Verweise darauf (`verification/SUMMARY.md`, `report.json`, README) sind Ausgabe der Prüfläufe und bleiben unverändert; ein
  neuer `npm run verify` erzeugt die Bilder wieder.
- Die CI des Monorepos läuft für jeden Pull Request vollständig (Lint, Tests, Build); der Import ändert daran nichts. Eine
  eigene Prüfung für `apps/landing` (zum Beispiel `npm run build` für die Größenbudgets, nur bei Änderungen dort) wäre ein
  kleiner nächster Schritt.

**So wurde importiert** (zur Wiederholung):

```sh
# 1) im Klon des Forks: nur den Landing-Ordner mit seiner Historie herauslösen, die Kontaktbögen aus der Historie nehmen
cd morphdemo-benchmark && git checkout main && git pull
git subtree split -P dreambau-landing -b dreambau-only
git branch dreambau-import dreambau-only
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
  'git rm -q --cached --ignore-unmatch verification/4k/frames/sheet.png verification/16k/frames/sheet.png verification/64k/frames/sheet.png' \
  -- dreambau-import
# 2) im Monorepo: als Unterordner einhängen
cd ../dreambau && git checkout -b <branch> origin/main
git subtree add --prefix=apps/landing ../morphdemo-benchmark dreambau-import
cd apps/landing && npm ci && npm run build
```

Die Hashes der Einzelcommits im Monorepo weichen von denen im Fork ab (die Historie wurde dabei neu geschrieben); der Hash
`2cff8f6` in Abschnitt 1 bezieht sich auf den Fork. Neue Änderungen aus dem Fork lassen sich nicht mehr mit
`git subtree pull` nachziehen; gearbeitet wird im Monorepo.

## 3. Vier große Vorhaben

- **A. Landing mit zufälligen Animationen** und eine Pipeline für weitere Animationen (Abschnitte 4, 5, 6, 7, 9).
- **B. Work-Bereich:** Einstieg zu den internen Programmen, dazu Impressum und Datenschutz (Abschnitte 8, 11).
- **C. Blog:** kurze Beiträge mit einem Formular „Warum lesenswert" (Abschnitt 10).
- **D. Bildungshaus (besteht schon, öffentlich unter https://dreambau.com/bildungshaus/):** interaktive Präsentation
  „Bildungshaus weWeit" mit Fragebögen für fünf Rollen (Eltern, Fachkräfte, Geschäftsführung, Elternvorstand,
  Kinder-Perspektive), bisher nur Pretests mit Testdaten. Eigenes Repo `Storypapst/bildungshaus` (öffentlich; React,
  TypeScript, Vite; Auslieferung bisher mit `ops/deploy.py`, das `kubectl` aufruft, obwohl Kubernetes auf dem Server
  abgeschaltet ist; seine `ops/nginx.conf` ist dagegen byte-gleich mit der laufenden Konfiguration, SHA-256 verglichen am
  2026-10-03). Für diesen Plan zählen drei Berührungspunkte: Die Auslieferung der neuen Startseite darf `/bildungshaus/` nicht
  beschädigen (Abschnitt 4.5), die Rechtstexte müssen zusammenpassen (Abschnitt 11), und die Formulare hängen am selben
  Formbricks wie die geplante Pipeline (Abschnitt 9).

Empfehlung: für jedes neue Vorhaben (A bis C) zuerst eine Spezifikation, dann bauen. Als Planungswerkzeug nennst du den Skill
„Wayfinder" von Matt Pocock; nach den Beschreibungen, die ich gefunden habe, zerlegt er große Vorhaben in
Entscheidungs-Tickets im Issue-Tracker, bevor Code entsteht (nicht selbst installiert oder geprüft, Beschreibung:
https://pasqualepillitteri.it/en/news/12137/wayfinder-claude-code-skill-plan-big-projects). Das passt zu diesen
Vorhaben. In der Cloud-Sitzung hier gibt es stattdessen den Skill „grilling" (Fragerunden mit Empfehlungen).
Reihenfolge-Empfehlung: A bis zum Livegang (Abschnitt 4), dann B, dann die Pipeline, dann C. D läuft bereits und wird nur
berührt.

## 4. Landing bis zum Livegang

### 4.1 Fußzeile: Impressum · Datenschutz · Work

- `site/index.html`: `<footer id="legal">` mit drei Links: `impressum.html`, `datenschutz.html` und der Link in den
  Work-Bereich. Winzig und blass (etwa 12 px, halbe Deckkraft), Tippfläche mindestens 44 px, sichtbar ab der ersten
  Sekunde und auch in den Ersatzansichten (`html.static`, `<noscript>`). Nicht mit `#skip` (unten rechts) und `#cta`
  (unten Mitte) kollidieren, im Hochformat eine eigene Zeile unter der Schlusszeile.
- Neue Dateien `site/impressum.html` und `site/datenschutz.html`: statisches HTML im dunklen Stil der Startseite,
  `lang="de"`, Link zurück zur Startseite, kein JavaScript nötig.
- `tools/bundle.mjs`: die zwei Seiten neben `dist/index.html` legen, sonst führen die Links im Einzeldatei-Bau ins Leere.
- Tests in `tools/e2e.mjs`: Links sofort sichtbar und per Tastatur erreichbar, funktionieren ohne JavaScript, beim Laden
  keine Netzwerkanfrage.
- Warum die Links sichtbar bleiben sollen und nicht nur in der Code-Ansicht (Abschnitt 5) stehen: siehe Abschnitt 11.

### 4.2 Tastenhinweise „Esc" und „M"

- Heute ist „Esc" am Überspringen-Knopf auf Geräten ohne Hover (Handy, Tablet) ausgeblendet
  (`@media (hover: none) { #skip kbd { display: none; } }` in `site/index.html`). „M" gibt es nur als Tooltip (`title`)
  und als `aria-keyshortcuts`.
- **Entschieden (2026-10-03):** Die Tastenbeschriftung („Esc", „M") erscheint nur, wo es eine Tastatur gibt, nicht auf
  Smartphones. Die Knöpfe selbst sind dezente Pillen: Rand 1 px, Radius 24 px (heute hat `#snd` keinen Rand und 22 px
  Radius, `#skip` ist ein reiner Text ohne Rand).
- Umsetzung: neben dem Ton-Symbol ein `<kbd>M</kbd>`, gestaltet wie `#skip kbd`. Ein Stylesheet kann eine Tastatur nicht
  erkennen; ein guter Ersatz ist `@media (any-hover: hover) and (any-pointer: fine)` (Maus oder Trackpad vorhanden),
  zusätzlich die Hinweise einblenden, sobald zum ersten Mal eine Taste gedrückt wird (`keydown`), damit auch ein Tablet mit
  Tastatur sie bekommt. Ausgangswerte für die Pille: `height: 44px; padding: 0 16px; border: 1px solid rgba(var(--fg), .28);
  border-radius: 24px;`. Das Aussehen entscheidest du lokal.
- `aria-label="Ton"` bleibt konstant, der Zustand läuft über `aria-checked`; die vorhandenen e2e-Prüfungen für Name,
  Rolle und Zustand müssen weiter bestehen. Im Work-Bereich gibt es kein Esc und keinen Überspringen-Knopf.

### 4.3 Schrift und ruhigere Wirkung

**Entschieden (2026-10-03):** Schrift und Wirkung bleiben vorerst, wie sie sind. Keine der gezeigten Alternativen gefiel
besser; der Nutzer verbessert sie später in der lokalen Sitzung. Der Rest dieses Abschnitts ist Material dafür, kein
Auftrag.

- **Was „Systemschrift" heißt:** Die Seite lädt heute keine Schriftdatei, sondern zeichnet den Schriftzug mit der Schrift,
  die das Gerät des Besuchers schon mitbringt (iPhone: Helvetica Neue oder San Francisco, Windows: Segoe UI, Android:
  Roboto). Dadurch sieht der Schriftzug je Gerät etwas anders aus. Im Cloud-Video war es eine Ersatzschrift (Liberation
  Sans, ein Arial-Ersatz), weil dem Render-Rechner die üblichen Schriften fehlen. Die Liste steht in `site/shell.js`
  (`buildText()`, Variable `fam`, Gewicht `wght = 800`). Alle drei Animationen lesen dieselbe Textur, eine neue Schrift
  wirkt also überall.
- **Eingebettete Schrift:** Eine freie Schrift (OFL) wird in die Seite eingebettet, dann sieht es überall gleich aus.
  Gemessene Größen der fertigen Latein-Teilmengen (woff2): Jost 600 12 KB, Fraunces 600 20 KB, Inter 600 24 KB. Auf die
  nötigen Zeichen reduziert deutlich weniger. Die Größe zählt nicht zu den Budgets der Animationen (Laufzeit).
- **Screenshots der Kandidaten** (Skyline, Schlussbild, 960x540) wurden im Chat gezeigt: Jost (geometrisch, Bauhaus-Gefühl),
  Fraunces (warme Serifenschrift), Inter (neutral), jeweils mit der heutigen Wirkung und mit ruhigerer Wirkung. Die
  heutige Wirkung (cremefarbene Füllung, dunkler Schatten und Hof um die Buchstaben, warmer Schein, durchlaufender Glanz)
  trägt viel zum „Cheesy"-Eindruck bei. Ruhiger heißt: Schatten stark verringern, warmen Schein und Glanz weglassen,
  Füllung fast weiß. Meine Empfehlung war **Jost mit ruhiger Wirkung**; sie wurde nicht übernommen.
- **Fallback-Kette:** Die eingebettete Schrift steht vorn, danach eine ähnlich wirkende Systemschrift, damit es bei einem
  Ladefehler nicht auffällt. Für Jost (Futura-artig): `"DreamBau", "Futura", "Avenir Next", "Century Gothic", "Trebuchet MS",
  sans-serif`. Für Fraunces: `"DreamBau", "Georgia", serif`. Für Inter: `"DreamBau", system-ui, sans-serif`.
- **Umsetzung:**
  1. Gewählte Schrift auf die benötigten Zeichen reduzieren (`pip install fonttools brotli`, dann `pyftsubset` mit
     `--unicodes=U+0020-007E,U+00C4,U+00D6,U+00DC,U+00E4,U+00F6,U+00FC,U+00DF,U+2026 --flavor=woff2`; bei mehreren
     Sprachen die Zeichen ergänzen, Abschnitt 7) und als Base64 einbetten.
  2. Vor `buildText()` laden. Heute läuft `buildText(); uploadText(); layout();` synchron (Zeile ~715 in `boot()`, das
     schon `async` ist), also davor `await` auf das Laden setzen, mit Rückfall auf die alte Liste bei einem Fehler:
     `const face = new FontFace('DreamBau', bytes.buffer, { weight: '600' }); await face.load(); document.fonts.add(face);`
     danach `"DreamBau"` an den Anfang von `fam` und `wght` anpassen.
  3. **Geprüft im Versuch:** Das Laden aus Bytes funktioniert unter der strengen Sicherheitsrichtlinie von
     `tools/serve.mjs` (ohne `font-src`): kein Verstoß, identisches Bild. Es braucht also keine Änderung der Richtlinie.
  4. Skyline ruhiger machen: `src/p/64k.js`, Composite-Shader, Block „the tagline: each line condenses out of grain".
     Im Versuch geändert: Schatten `.5`/`.3` auf `.14`/`.1`, warmer Schein `.2` auf `0`, Glanz `.35` auf `0`, Füllung
     konstant `vec3(.97,.965,.95)`.
  5. Danach `npm run build`, `npm run verify` (Kontrast, Lesbarkeit, ruhiges unteres Band) und neue Screenshots ansehen.

### 4.4 Ältere Geräte

- **Stand:** Die Auflösung sinkt automatisch (unter 40 Bildern pro Sekunde in Schritten von 20 %, bis auf die Hälfte je
  Achse). Ohne WebGL2 (zum Beispiel iPhones vor iOS 15) erscheint die statische Seite, im Hintergrund-Tab pausiert alles.
  Gemessen wurde nur im Software-Rendering ohne Grafikchip (640x360, Mittelwert pro Bild): Rohbau 55 bis 66 ms,
  Traumhaus 127 bis 129 ms, Skyline 78 bis 98 ms.
- **Lücke:** Bleibt es auch bei halber Auflösung ruckelig, passiert nichts weiter. Idee: nach einigen Sekunden unter
  24 Bildern bei Minimalauflösung zu Rohbau wechseln oder auf die Zeichen-Ansicht (Abschnitt 5); wird ein
  Software-Renderer erkannt (`WEBGL_debug_renderer_info`: SwiftShader, llvmpipe), gleich nur Rohbau oder Zeichen-Ansicht.
- Vor dem Livegang auf einem alten Laptop und einem alten Handy ansehen.

### 4.5 Veröffentlichen auf dreambau.com

**Stand (2026-10-03): veröffentlicht.** Die neue Startseite läuft seit dem 2026-10-03 auf dreambau.com (Release
`20261003-163112`, noch ohne Impressum und Datenschutz, siehe Abschnitt 11). Veröffentlicht wurde in einem lokalen Lauf mit
SSH-Zugang, nur durch Austausch von Dateien: nginx wurde weder neu gestartet noch umgestellt. Abnahme: 15 von 15
Nachprüfungen des Veröffentlichungs-Skripts, danach `BASE_URL=https://dreambau.com npm run check:apex` mit 18 von 18
Prüfungen. Die erste Fassung dieses Abschnitts ging von einem Kubernetes-Pod mit ConfigMap und geänderter nginx.conf aus;
diesen Weg gibt es nicht mehr, denn der Server läuft mit Docker Compose und Kubernetes ist abgeschaltet.

- **Wie die Startseite ausgeliefert wird** (gemessen am 2026-10-03): Ein nginx-Container (Docker Compose, hinter einem
  Reverse-Proxy) liefert die Startseite aus einem nur lesbar eingehängten Verzeichnis. Er beantwortet nur `/` (die
  `index.html`), `/homepage-assets/` (dasselbe Verzeichnis), `/health` und `/bildungshaus/…`; im Container ergibt alles
  andere 404. Von außen bekommt ein Pfad, den kein Dienst beansprucht, ein 301 auf denselben Pfad unter `www.dreambau.com`
  (gemessen für `/health`, `/impressum.html` und `/work`). Matrix-Discovery und `/testmails` laufen über andere Routen und
  Dienste. nginx sendet `Cache-Control: no-store`, die Seite wird also bei jedem Besuch neu geladen (bei 20 bis 28 KB
  komprimiert vertretbar). Die `ops/nginx.conf` im Repo `Storypapst/bildungshaus` ist byte-gleich mit der laufenden
  Konfiguration (SHA-256 verglichen am 2026-10-03).
- **Strengere Sicherheitsrichtlinie als in `tools/serve.mjs`:**
  `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'`,
  also **keine Inline-Stile**. Die Landing wie in `site/` läuft damit nicht: `/shell.js` ergibt 404, der Inline-Stil wird
  verweigert, es erscheint ungestalteter Text ohne Animation. Der Einzeldatei-Bau (`dist/index.html`, Inline-Skript und
  -Stil) ist für die Startseite nicht geeignet.

**Was dafür gebaut ist** (in `apps/landing`, Node 20 oder neuer):

- `npm run build:apex` erzeugt `dist/apex/` (`index.html`, `style.css`, `noscript.css`, `shell.js`, `p/4k.js`, `p/16k.js`,
  `p/64k.js`, zusammen 89 KB) und `dist/apex.json` (Präfix, Größe und sha256 jeder Datei). `site/` bleibt unverändert, das
  Skript macht nur drei Dinge: die beiden Stilblöcke in Dateien auslagern, Stilblätter und Skript unter den Asset-Pfad
  `/homepage-assets/` stellen (`--assets` ändert ihn; es ist der Pfad, den der Server ausliefert) und die Animationen
  relativ zum eigenen Skript laden statt relativ zur Seite (sonst sucht die Seite `/p/4k.js` und bekommt 404). Gleicher
  Quelltext, gleiche Bytes. Es bricht ab, statt zu raten, wenn `index.html` oder `shell.js` nicht mehr so aussehen, wie es
  erwartet.
- `npm run check:apex` lädt den Build mit den Routen und der Richtlinie der Startseite in Chromium: jede Datei kommt
  byte-gleich zurück, eine fehlende Datei ergibt 404, jede der drei Animationen erreicht „ready" ohne Konsolenfehler, ohne
  fehlgeschlagene Anfrage, ohne Richtlinienverstoß und ohne statischen Notbehelf. Mit `BASE_URL=https://dreambau.com` läuft
  dieselbe Prüfung gegen die echte Seite, das ist die **Abnahme nach dem Livegang**.
- **Geprüft vor dem Livegang** (Cloud-Sitzung, Node 20, Headless-Chromium): `check:apex` gegen den Nachbau im Skript und
  gegen **echtes nginx** (1.24, mit einer Testkonfiguration nach dem Bildungshaus-Repo); `node tools/e2e.mjs`
  (Zufallswahl, Ton erlaubt und gesperrt, Stumm, Esc, reduzierte Bewegung, kein WebGL, keine Netzwerkzugriffe nach außen)
  mit `BASE_URL` gegen dasselbe nginx. Gegenprobe: Ein Build mit wieder eingebettetem Stil fällt in `check:apex` durch
  (Stil nicht angewendet, Richtlinienverstoß).
- **Geprüft nach dem Livegang** (lokaler Lauf, 2026-10-03): `BASE_URL=https://dreambau.com npm run check:apex` bestand 18 von
  18 Prüfungen (jede Datei byte-gleich, eine fehlende Datei ergibt 404, jede der drei Animationen erreicht „ready").
- **Beispiel mit dieser Prüfung:** `check:apex` meldet vor dem Livegang in 30 Sekunden „404" oder „Inline-Stil verweigert",
  man behebt es am Schreibtisch. **Ohne sie:** Die Seite geht live, Besucher sehen auf dreambau.com ungestalteten Text ohne
  Animation, und man sucht unter Zeitdruck den Grund und rollt zurück.

**Ablauf (lokal, mit SSH-Zugang; Befehle, Pfade und Rückweg stehen im privaten Runbook, siehe unten):**

1. `git pull`, dann `cd apps/landing && npm ci && npm run build && npm run build:apex && npm run check:apex`.
2. Den Stand des Websiteverzeichnisses auf dem Server sichern (eigener Release-Ordner mit Prüfsummen) und die neuen Dateien
   dort gegen die Prüfsummen aus `dist/apex.json` prüfen, bevor etwas ausgetauscht wird.
3. Die neuen Dateien zuerst einspielen und die `index.html` zuletzt, mit einem atomaren Umbenennen; danach die öffentlichen
   Adressen prüfen. Fällt eine Prüfung durch, stellt das Skript den gesicherten Stand selbst wieder her. nginx, Routen und
   Container bleiben unberührt, es wird nichts neu gestartet.
4. **Rückweg vorher festlegen** und trocken prüfen: die `index.html` aus der Sicherung zurück, die neu hinzugekommenen Dateien
   löschen. Ein Trockenlauf des Rückgängig-Skripts listet auf, was es zurückstellen würde, und ändert nichts.
5. Abnahme: `BASE_URL=https://dreambau.com npm run check:apex`; `/bildungshaus/` unverändert; Matrix-Discovery Byte für Byte
   unverändert; `/testmails`-Login 200 und die geschützte API 401; eine fehlende Datei ergibt 404 (kein HTML mit 200);
   `/bildungshaus` leitet mit 308 auf `https://dreambau.com/bildungshaus/` weiter, ohne Port 8080. Die Startseite im Browser
   ansehen und anhören.

- **Runbook und Skripte** liegen im privaten Repo `Storypapst/dreambau-docs` (`docs/runbooks/start-page-publish.md` und
  `tools/start-page-publish/`), weil sie Serverpfade enthalten; in dieses öffentliche Repo gehören sie nicht (Abschnitt 8).
  Die Skripte tragen den Zustand der alten Seite bisher fest in sich und taugen nur für die erste Veröffentlichung; sie für
  spätere Releases zu verallgemeinern ist offen (Hygiene-Ticket im selben privaten Repo).
- **Neue Pfade** (`/impressum.html` und `/datenschutz.html` wie in Abschnitt 4.1, dazu `/work`) brauchen je eine Route in der
  nginx-Konfiguration, die auf die Dateien in `site/` abbildet, und eine Regel im Reverse-Proxy; heute bekommt jeder Pfad, den
  kein Dienst beansprucht, den 301 auf `www.dreambau.com` (gemessen für `/impressum.html` und `/work`). Ohne neue Route ginge
  es nur über `/homepage-assets/impressum.html` (dieses Verzeichnis liefert nginx aus), aber für Rechtstexte ist eine eigene
  Adresse besser. Die Fußzeilen-Links und die Routen müssen zusammenpassen, sonst führen die Links auf die andere Domain. Das
  gehört in dieselbe Änderung; anders als der Austausch von Dateien berührt sie nginx und Reverse-Proxy und braucht einen
  eigenen Rückweg.
- **Rechtstexte:** Impressum und Datenschutzerklärung fehlen noch (Abschnitt 11); die Startseite ging ohne sie live. Ein
  geschäftlicher Auftritt braucht sie (keine Rechtsberatung). Ein zweiter Release, der sie nachliefert, ist nach diesem Ablauf
  möglich, sobald die Skripte spätere Releases können.
- Zugang: Die Cloud-Sitzung hat keinen Zugriff, die Schlüssel liegen lokal. Veröffentlicht wird erst nach deiner Freigabe.
- Nach dem Livegang auf echten Geräten ansehen und anhören (iPhone/Safari, Android/Chrome, Firefox, ein älteres
  Notebook).

## 5. Zeichen-Ansicht („Code-Ansicht", ASCII-Art)

Idee aus dem Gespräch: Ein Klick auf „Wie klein ist das?" öffnet eine Ansicht, die den echten Code zeigt, der läuft,
als Zeichenfeld. Zum Code: Das ist kein Assembler, sondern JavaScript für den Ablauf und GLSL für die Grafikkarte, also
normaler Text. Eine 24-KB-Animation sind rund 24.000 Zeichen, die man wirklich anzeigen kann.

- **Inhalt:** der echte Quelltext der laufenden Animation als Zeichenstrom oder Zeichenfeld; die Größe der Animation und
  der ganzen Seite (heute 54 bis 74 KB, komprimiert 20 bis 28 KB; mit minimiertem `shell.js` 36 bis 57 KB); die
  gemessene Ladezeit (Performance-API: `performance.getEntriesByType('resource')`, `responseEnd`); Vergleiche als
  Quadrate im gleichen Maßstab, Fläche gleich Größe: die Animation als kleines Quadrat, daneben „1 Sekunde Video" (etwa
  1 MB bei guter Qualität), „durchschnittliches Handyfoto" (etwa 3 MB), „übliche Webseite" (etwa 2 MB). Beispiel: 24 KB
  gegen 3 MB ist 125-mal, die Kantenlänge des Fotos ist dann rund 11-mal so lang wie die des Animations-Quadrats.
  Richtwerte als „etwa" kennzeichnen. Ehrlich bleiben: die Zahlen 4, 16 und 64 KB gelten für die Animation allein, die
  gemeinsame Laufzeit kommt dazu, und die Ansicht nennt beides.
- **Ende:** Wenn die Animation vorbei ist, kommt die Ansicht ruhig zum Stehen (Schlusszustand, kein Dauerzeichnen), wie
  die Animation selbst (Leerlauf-Stopp nach dem Ende ist schon vorhanden).
- **Als Fallback ohne WebGL2:** Dieselbe Zeichenwelt läuft auf einer normalen 2D-Zeichenfläche (kein WebGL nötig) als
  Textversion der Show: Zeichenrauschen wird zu Ordnung, der Schriftzug verdichtet sich, die Musik läuft mit. Passt zum
  Thema „Von Rauschen zu Ordnung" und ersetzt die jetzige statische Ersatzseite. Gleicher Weg für „Software-Renderer
  erkannt" (Abschnitt 4.4).
- **Handy:** Spaltenzahl aus der Breite berechnen, beim Drehen neu rechnen; Hochformat einfach weniger Spalten.
- **Barrierefreiheit:** das Zeichenfeld ist `aria-hidden`, dafür gibt es die Beschreibung für Blinde (Abschnitt 12) als
  echten Text. Bei „Bewegung reduzieren" nur das Schlussbild.
- **Links:** Impressum, Datenschutz und Work stehen dort zusätzlich, ersetzen aber nicht die sichtbare Fußzeile
  (Abschnitt 11).
- **Esc:** schließt zuerst die Ansicht und überspringt nicht die Animation.
- Aufwand: klein bis mittel (etwa ein Tag), die Textversion der Show als Fallback eher mittel.

## 6. Telefon, Hochformat, Drehen

- **Heute:** Es wird nichts abgeschnitten und es gibt keine festen Balken. Jede Animation wird live für die tatsächliche
  Bildschirmform gerechnet und eingerichtet (die Skyline passt ihre Kamera an, der Schriftzug passt in die Breite). Zu
  sehen im Chat (Hochformat-Screenshots, 390x844). Geprüft sind Hochformat, Querformat 16:9, 21:9 und 4:3 (Lesbarkeit,
  ruhiger unterer Rand).
- **Drehen:** Im Versuch (Handy-Fenster 390x844, Show läuft; gedreht auf 844x390 und zurück) lief die Zeit ohne Neustart
  weiter (Sekunde 5, 7, 9), die Zeichenfläche passte sich an, keine Fehler (geprüft mit Traumhaus und Skyline). Als feste
  Prüfung in `tools/e2e.mjs` fehlt es noch: Fenster mitten in der Show drehen, Zeit läuft weiter.
- **„Das Bild bleibt fest verankert, während man das Gerät dreht":** technisch möglich über die Lagesensoren
  (`DeviceOrientationEvent`; iOS verlangt eine ausdrückliche Erlaubnis nach einer Berührung), aber als Standard nicht
  empfehlenswert: das Betriebssystem dreht die Oberfläche ohnehin mit, ein gegengedrehtes Bild kann irritieren und ist auf
  vielen Geräten unzuverlässig. Als freiwillige Spielerei denkbar: eine leichte Kameraverschiebung beim Neigen (Parallaxe)
  für die 3D-Skyline. Aufwand mittel, braucht Tests auf echten Geräten.

## 7. Mehrsprachigkeit

- **Prinzip:** Der Schriftzug wird zur Laufzeit gezeichnet, die Musik hat keinen Text. Keine Videos pro Sprache.
  Auswahl über `navigator.languages` (erste passende), `?lang=` zum Überschreiben, **Rückfall ist Deutsch** (wie jetzt),
  wenn die Sprache fehlt. Wörterbuch für `data-lines` (die drei Zeilen), Schlusszeile, Beschriftungen („Ton", „überspringen"),
  Zeichen-Ansicht und Beschreibung für Blinde; `<html lang>` setzen; Hinweis auf Sprachvarianten für Suchmaschinen.
- **Übersetzen:** sinngemäß, nicht wörtlich: „Jeht nich… jibs nich…" ist Berliner Dialekt. Entweder den Sinn übersetzen
  („Can't be done? Doesn't exist.") oder das Original behalten und eine kleine Übersetzung darunter setzen. Entwürfe kann
  Claude schreiben, Muttersprachler sollten sie ansehen.
- **Umfang (entschieden 2026-10-03):** die 40 meistgenutzten Sprachen. Offen ist, wonach gezählt wird. Vorschlag: nach der
  weltweiten Sprecherzahl (Mutter- und Zweitsprache), zusammengefasst auf Schriftsprachen mit eigenem Browser-Sprachcode
  (zum Beispiel zählt „Ägyptisches Arabisch" zu `ar`), sonst stünden Dialekte ohne eigene Schreibweise in der Liste. Welche
  Sprachen die Besucher von dreambau.com tatsächlich sprechen, lässt sich ohne Tracking nicht messen; Türkisch, Russisch,
  Ukrainisch und Polnisch kamen im Gespräch vor und sollten dabei sein, auch wenn eine davon nicht unter den ersten 40
  steht.
- **Ladezeit:** Jede Sprache liegt in einer eigenen kleinen Datei (`i18n/<code>.js`, geschätzt 1 bis 4 KB), als Skript
  geladen wie `p/<id>.js`; dann bleibt die Sicherheitsrichtlinie (`connect-src 'none'`) unverändert. Geladen wird nur die
  gewählte Sprache plus der deutsche Rückfall, die Seite wächst also nicht mit der Zahl der Sprachen.
- **Schriftsysteme:** Die eingebettete Schrift (Abschnitt 4.3) deckt nur Latein mit Umlauten ab. Bei 40 Sprachen kommen
  kyrillisch, griechisch, arabisch, Devanagari, bengalisch, tamilisch, Telugu, Kannada, Malayalam, Thai, koreanisch,
  japanisch, chinesisch, äthiopisch und weitere dazu. Für jedes eine Teilmenge einzubetten ließe die Seite um Hunderte KB
  wachsen. Stattdessen zeichnet die Zeichenfläche diese Sprachen mit den Systemschriften des Geräts (der Browser wählt je
  Zeichen eine passende Schrift, die Liste `fam` bleibt unverändert). Folge: Der Schriftzug sieht dort je Gerät etwas
  anders aus; `dreambau.com` bleibt in allen Sprachen lateinisch.
- **Rechts-nach-links:** Arabisch, Urdu und Persisch brauchen `dir="rtl"` am `<html>`-Element; zu prüfen ist, ob die Zeile
  mit dem lateinischen `dreambau.com` richtig steht (gemischte Schreibrichtung). Die Knöpfe dürfen an ihrem Platz
  bleiben. Weil der Text als Ganzes in eine Textur gezeichnet wird, bleiben verbundene Schriften beim Zeichnen heil; zu
  prüfen ist, dass kein Effekt Buchstaben einzeln auftauchen lässt.
- **Gegenlesen:** Entwürfe schreibt Claude, aber eine Redewendung wie „Jeht nich… jibs nich…" kann in einer anderen Sprache
  ungewollt anders klingen (zu förmlich, zu derb, unfreiwillig komisch). Deshalb pro Sprache ein Feld `reviewed` im
  Wörterbuch; die Auswahl nach Browsersprache nimmt nur Sprachen, die ein Muttersprachler gelesen hat, alle anderen fallen
  auf Deutsch zurück. So kann man alle 40 Entwürfe bereithalten und eine Sprache nach der anderen freischalten.
- **Rechtstexte** bleiben deutsch, eine englische Fassung ist optional.
- **Prüfung:** neue Prüfung in `verify.mjs`: jede Sprache hat alle Texte und passt in die Breite (Kontrast und Zeilenbruch,
  auch im schmalen Hochformat). Im Render-Rechner der Cloud-Sitzung sind nur wenige Schriften installiert, die Schriftsysteme
  lassen sich dort nicht beurteilen; lokal mit installierten Noto-Schriften oder auf echten Geräten ansehen.
- Aufwand (geschätzt): der Mechanismus mit Deutsch und Englisch etwa ein bis zwei Stunden. Für 40 Sprachen kommen die
  Entwürfe (in einem Durchgang), rechts-nach-links und die Schriftsysteme (etwa ein halber Tag) und das Gegenlesen hinzu;
  Letzteres hängt an den Muttersprachlern, nicht an der Technik.

## 8. Work-Bereich

- **Zweck:** Einstieg zu den internen Programmen (Liste vom 2026-10-03: 21 Programme unter 22 Adressen auf mehreren
  Domains, jedes mit eigenem Login). Der Link auf der Landing heißt „Work" (entschieden). Hinweis: „Work" kann in der
  Baubranche als „unsere Arbeiten" (Referenzen) gelesen werden. Alternativen: „Team-Login" oder „Work · Login".
- **Verhalten (entschieden):** kein Esc und kein Überspringen, weil es keine Intro-Animation ist; man klickt hinein und
  sieht die Programme.
- **Stil:** futuristisch, mutierende Zeichen (Matrix-artig), aber bunt statt grün, jede Zone mit eigener Farbe.
  Erst Mockups (statische Bilder), dann ein Prototyp mit Testdaten; die Zeichenwelt aus Abschnitt 5 lässt sich
  wiederverwenden.
- **Nicht erreichbare Programme ausblenden (entschieden: 503 nicht anzeigen, dynamisch).**
  *Problem:* Als die Liste geliefert wurde, antworteten mehrere der 21 Programme nicht (503, 502, Verbindung abgelehnt).
  Eine feste Kachel pro Programm führt dann auf eine Fehlerseite, und wer sie anklickt, hält es für einen Fehler der
  Work-Seite.
  *Warum nicht im Browser:* Eine Seite kann den Statuscode einer fremden Adresse nicht lesen (Browser-Regel CORS), und die
  Sicherheitsrichtlinie der Startseite (`connect-src 'none'`) verbietet Abfragen ohnehin. Deshalb prüft der Server:
  1. Ein kleines Skript auf dem Server (Shell oder Node, bewusst ohne n8n, damit es nicht von den Programmen abhängt, die es
     prüft) liest die private Liste `programs.json`, ruft jede Adresse mit Zeitlimit ab
     (`curl -s -o /dev/null -m 5 -w '%{http_code}' URL`) und läuft jede Minute (systemd-Timer oder Cron).
  2. „Erreichbar" heißt: irgendeine HTTP-Antwort unter 500, also auch 301, 302, 401 und 403. Viele Programme antworten ohne
     Login mit einer Weiterleitung oder 401; wer nur 200 gelten ließe, blendete fast alle aus. Als „nicht erreichbar"
     gelten 5xx (503 wie gewünscht, ebenso 502 und 504), Zeitüberschreitung und Verbindungsfehler (die beiden letzten und
     502 nach Bestätigung).
  3. Das Skript schreibt `work/list.json` ins Webverzeichnis, **nur mit den erreichbaren Programmen** (Name, Adresse, Farbe).
     Ausgefallene Programme stehen gar nicht in der öffentlichen Datei, sie verrät also auch nicht, was gerade ausgefallen
     ist.
  4. Die Work-Seite lädt `list.json` (gleiche Herkunft; `connect-src 'self'` nur für diese Seite) und zeichnet die Kacheln.
  5. Gegen Flackern: erst nach zwei Fehlschlägen hintereinander ausblenden, ein Erfolg blendet sofort wieder ein.
  6. Fehlt `list.json` oder ist sie älter als etwa 15 Minuten (das Skript ist ausgefallen): lieber alle Programme ohne
     Status zeigen als eine leere Seite, mit kleinem Hinweis „Status unbekannt".

  *Beispiel mit diesem Ansatz:* Montag 9:02 öffnet jemand „Work"; die Datei ist 40 Sekunden alt und enthält nur die
  Programme, die gerade antworten. Um 9:10 startet jemand einen gestoppten Container neu, ab der nächsten Minute steht
  dessen Kachel wieder da, ohne dass jemand die Work-Seite anfasst. *Ohne ihn:* Die Kacheln stehen fest im Code oder in
  einer Konfiguration. Bei jedem Ausfall und jeder Rückkehr müsste jemand die Liste von Hand ändern und neu
  veröffentlichen, sonst führen Kacheln ins Leere oder fehlen, obwohl das Programm längst läuft.
- **Test:** `list.json` aus einer Testliste mit einer Adresse erzeugen, die 503 liefert, und prüfen, dass genau diese fehlt
  und nach der Reparatur wieder da ist; die Work-Seite ohne `list.json` zeigt den Hinweis statt einer leeren Seite.
- **Die Programmliste steht nicht in diesem öffentlichen Repo.** `programs.json` (Felder: `id`, `name`, `url`, `color`,
  `zone`, optional `probe` für eine andere Prüfadresse und `admin: true` für Verwaltungsoberflächen) liegt im privaten
  Monorepo oder nur auf dem Server; hier gehört nur eine `programs.example.json` mit erfundenen Einträgen hin. Grund: Eine
  vollständige Liste mit Adressen und Zweck (darunter Oberflächen für Passwörter und Secrets, Container, Mailserver und
  Speicher) ist für einen Angreifer eine fertige Zielliste, und in einem öffentlichen Repo bleibt sie in der
  Git-Historie, auch wenn man sie später löscht. Die Tabelle vom 2026-10-03 hat der Nutzer; sie wird lokal in die private
  Datei übernommen.
- **Öffentlich oder nach Login (offen):** Eine öffentlich sichtbare Liste verrät die Namen der internen Programme und ihre
  Domains. „Nur Namen und Links" genügt, wenn jedes Programm sein eigenes Login hat; die Domains lassen sich oft ohnehin
  über öffentliche Zertifikatsverzeichnisse finden. Empfehlung: Verwaltungsoberflächen (Passwort- und Secret-Tresor,
  Container-, Mail- und Speicherverwaltung, Server-Panel) mit `admin: true` markieren und nicht öffentlich verlinken, sondern
  erst nach einem gemeinsamen Login zeigen (später möglich). Im Alltag ändert das wenig, weil Kollegen diese Adressen ohnehin
  als Lesezeichen haben.
- **Warum die dynamische Anzeige zur Lage passt:** Die Bildungshaus-Doku (2026-09-07) hält fest, dass Cap und Novu bewusst
  gestoppt sind und die Speichergrenzen des Servers bestehen bleiben. Programme werden also zeitweise absichtlich
  abgeschaltet; ein gestopptes Programm soll dann verschwinden, statt als Fehler zu erscheinen. Dieselbe Prüfdatei kann
  auch den Fragebogen-Rahmen im Bildungshaus ersetzen, wenn Formbricks aus ist (Abschnitt 9): statt eines Rahmens mit „502"
  ein Satz wie „Die Fragebögen sind gerade nicht erreichbar, bitte später noch einmal versuchen".
- **Bildungshaus in der Liste?** `/bildungshaus/` steht nicht in der gelieferten Liste. Ob es als eigener Eintrag oder in
  einer Gruppe „Projekte" erscheinen soll, ist offen (Punkt 10).
- **Offen:** Farbwünsche; öffentliche Liste oder nach Login; ob 502, Zeitüberschreitung und „Verbindung abgelehnt" wie 503
  ausgeblendet werden (Empfehlung: ja).

## 9. Pipeline für weitere Animationen

- **Heute:** Eine neue Animation bedeutet vier Stellen von Hand: `src/p/<id>.js`, `tools/budget.mjs`, `D.ids` in
  `site/shell.js`, README und Dokumentation.
- **Ziel:** Eine Animation ist eine Datei plus Kurzbeschreibung. Der Build liest `src/p/*.js` (mit `id`, Titel,
  Größenklasse, `enabled`, Gewicht, Beschreibung je Sprache), erzeugt daraus die Liste für die Zufallswahl, das
  Größenbudget und die README-Tabelle. Abschalten ohne Löschen über `enabled: false`.
- **Ablauf:**
  1. **Idee** in einem Formular (Abschnitt 10 und unten), kurz gesprochen oder getippt.
  2. **Schärfen:** Claude stellt eine kurze Rückfragerunde (zwei bis fünf Fragen) als Kommentar im Issue; du antwortest in
     Stichworten. Erst dann wird gebaut. Das ist die Stelle, die bei dieser Arbeit gefehlt hat: Claim, Geschichte und
     Gestaltung gemeinsam kurz festzurren, bevor die zwei Stunden Bauzeit laufen.
  3. **Bauen:** Claude baut `src/p/<id>.js` nach `docs/briefs/common.md` und `docs/CONTRACT.md` und öffnet einen PR.
  4. **Prüfen und zeigen:** CI führt `npm run verify` für diese Animation aus und hängt Vorschauvideo, Kontaktbogen und
     bei Schriftzug- oder Stilfragen **drei Varianten als Screenshots** an (nicht erst am Ende).
  5. **Freigabe:** ein Wort („ja, mach": Kommentar oder Merge).
  6. **Veröffentlichen:** ein Workflow deployt automatisch, die neue Animation ist im Pool.
- **Briefing-Felder:** Claim je Sprache, Geschichte in drei Phasen (Rauschen, Verwandlung, Ordnung), Stimmung und Farben,
  Musikstil und Tempo, Größenklasse (4k/16k/64k), Referenzen (Links, Bilder), No-Gos, **Beschreibung für Blinde je Sprache
  (Pflichtfeld, Abschnitt 12)**, gewünschte Sprachen.
- **Formular:** Du betreibst Formbricks selbst. Nach den Beschreibungen, die ich gefunden habe, kann Formbricks bei neuen
  Antworten einen Webhook auslösen (Ereignisse `responseCreated`, `responseUpdated`, `responseFinished`; nicht selbst
  getestet). Ein kleiner Vermittler (n8n, falls vorhanden, oder ein kurzes Skript auf deinem Server) nimmt den Webhook
  entgegen und legt daraus ein GitHub-Issue an, die Antworten werden in den Prompt eingesetzt. Damit entfällt ein eigenes
  Formular. Formbricks läuft nach der Bildungshaus-Doku auf `umfrage.dreambau.com` (am 2026-09-07 mit fünf
  Test-Fragebögen geprüft; die Bildungshaus-Seite bettet die Formulare dort ein). In der Programmliste vom 2026-10-03
  stand es mit 502 („Container gestoppt"), n8n ebenfalls mit 502. Vor der Pipeline-Arbeit klären: Muss Formbricks dauerhaft
  laufen (dann Speicher einplanen) oder reicht es bei Bedarf? Solange n8n nicht stabil läuft, ist ein kurzes Skript als
  Vermittler robuster. Ist Formbricks aus, zeigt der Rahmen im Bildungshaus-Fußbereich einen Fehler; Abschnitt 8 beschreibt,
  wie man dort stattdessen einen Hinweis zeigt. Quellen: https://formbricks.com/docs/surveys/best-practices/headless-surveys und
  https://themenonlab.blog/blog/formbricks-open-source-typeform-qualtrics-alternative
- **Trennung der Rechte:** Der Bau-Agent sieht keine Zugangsdaten. Das Veröffentlichen macht ein GitHub-Workflow mit einem
  eigenen, eingeschränkten Deploy-Schlüssel als Secret, ohne `--delete` und ohne `/testmails` anzufassen. Das ist der
  Grund, warum der Bau-Agent keine Root-Schlüssel braucht.
- **Wie bei so einer Aufgabe vorgegangen wird (Beispiel Skyline):** (1) Anforderung in eine Spezifikation übersetzen
  (`SPEC.md`), (2) gemeinsame Schnittstelle und Prüfwerkzeuge bauen (`CONTRACT.md`, `tools/`), (3) pro Animation ein
  Briefing und ein eigener Bau-Agent, (4) automatische Prüfung, (5) die Bilder und den Ton selbst ansehen und nachbessern,
  (6) PR, Vorschauvideo, Rückfragen. Was fehlte: ein früher Blick auf Geschmacksfragen (Schrift, Wirkung). Dafür der
  Schärfen-Schritt und die drei Screenshot-Varianten oben.
- **Aufwand:** Gerüst etwa ein halber bis ein Tag. Pro Animation in diesem Lauf: Rohbau und Traumhaus je rund eine bis
  anderthalb Stunden, die Skyline gut 75 Minuten Agentenzeit plus Prüfung. Geschmack prüft keine Automatik, die Freigabe
  bleibt bei dir.

## 10. Blog

- Kurze Beiträge. Zum Abschnitt „Warum lesenswert" (zum Beispiel nach einem YouTube-Video) dient dasselbe Prinzip wie in
  Abschnitt 9: Formbricks-Formular, Webhook, GitHub-Issue, Claude formatiert den Beitrag, PR mit Vorschau, Freigabe,
  automatische Veröffentlichung.
- Zu klären in der Spezifikation: Sprachen, Technik (statischer Generator wie Astro oder Eleventy im Monorepo), Aussehen,
  Felder des Formulars, Umgang mit Quellen (Videolinks, Zitate).
- Rechtlich: Bei redaktionellen Beiträgen kann zusätzlich ein „Verantwortlicher" mit Name und Anschrift im Impressum nötig
  werden (§ 18 Abs. 2 Medienstaatsvertrag, gilt für journalistisch-redaktionelle Angebote; ob ein Firmenblog darunter fällt,
  ist Auslegungssache). Keine Rechtsberatung; vor dem ersten Beitrag bei IHK oder Anwalt klären.

## 11. Impressum und Datenschutz

**Genannt (Stand 2026-10-03):** GS DESIGN GmbH, Kreuzbergstr. 30d, Berlin; Handelsregister HRB 154085; USt-IdNr.
DE310952039; Geschäftsführer Frank Gerhardt und Valery Suslov; Hoster Hetzner, Rechenzentrum Falkenstein. Diese Angaben
müssen ohnehin im Impressum stehen (§ 5 DDG), sind also kein Geheimnis.

**Noch zu prüfen und zu ergänzen (aus der Cloud-Sitzung nicht überprüfbar, bitte mit dem Handelsregisterauszug
abgleichen):** Postleitzahl; Registergericht und Nummer in der Schreibweise des Auszugs (für Berlin üblicherweise Amtsgericht
Charlottenburg, die Nummer trägt dort häufig den Zusatz „B", also „HRB 154085 B"); eine zweite schnelle Kontaktmöglichkeit
neben info@dreambau.com (Telefon oder ein Kontaktformular, zum Beispiel über Formbricks); Kammer oder Aufsichtsbehörde
(falls zutreffend). Steuernummer, zuständiges Finanzamt und Gründungsdatum werden für das Impressum nicht verlangt und
gehören nicht in diese Datei oder das öffentliche Repo; sie wurden im Chat genannt und bewusst nicht übernommen. Beim Bau
der Seite fehlende Angaben als sichtbare Platzhalter eintragen, nichts erfinden.

**Zweite Firma im Bildungshaus (Punkt 12):** `docs/SURVEY-FOOTER.md` im Repo `Storypapst/bildungshaus` nennt für die technische
Datenverwaltung und den Datenschutz der Befragung „Greyt.IT UG (haftungsbeschränkt)" mit Ansprechpartner Frank Gerhardt und
der Kontaktadresse fg@greyt.me. Dort steht auch: Geschäftsanschrift, datenschutzrechtliche Rolle und Aufbewahrung seien für
die echte Befragung noch abzugleichen (vorbereitete Fristen: 30 Tage für Teilantworten, 90 Tage für Rohdaten, noch nicht
bestätigt). Die Landing nennt die GS DESIGN GmbH. Zu klären: Wer ist Diensteanbieter von `/bildungshaus/`, wer der
Startseite, und wer ist Verantwortlicher für die Befragungsdaten? Ein gemeinsames Impressum für die ganze Domain geht nur,
wenn es für alle Teile stimmt. In den Quelldateien von `Storypapst/bildungshaus` habe ich weder „Impressum" noch einen Link
darauf gefunden; ob die Live-Seite eines hat, wurde nicht geprüft. Keine Rechtsberatung.

**Sichtbarkeit (meine Einschätzung, keine Rechtsberatung):** § 5 DDG verlangt, dass das Impressum „leicht erkennbar,
unmittelbar erreichbar und ständig verfügbar" ist. Üblich ist die Zwei-Klick-Regel, und der Link muss seiner Bezeichnung
nach als Hinweis auf das Impressum erkennbar sein. Eine Info-Ansicht mit dem Namen „Wie klein ist das?" erfüllt das nicht
von selbst. Dass eine Intro-Seite ausgenommen wäre, ist mir nicht bekannt. Fehlt das Impressum oder ist es schwer zu
finden, kommen in Deutschland häufig kostenpflichtige Abmahnungen von Wettbewerbern, Verbraucherzentralen oder
Abmahnvereinen, nicht zuerst eine freundliche Bitte (Quellen:
https://www.ihk.de/duesseldorf/recht-und-steuern/recht/internetrecht/impressum-5109750 und
https://www.wbs.legal/allgemein/achtung-abmahngefahr-teil-4-das-impressum-587/). Die sichere Lösung kostet optisch
fast nichts: eine winzige, blasse Zeile „Impressum · Datenschutz · Work" (Abschnitt 4.1) zusätzlich zur Zeichen-Ansicht.
Entscheidung bleibt bei dir; im Zweifel eine kurze Auskunft bei der IHK oder einem Anwalt.

**Für die Datenschutzerklärung gilt technisch:**

- Keine Cookies, kein Tracking, keine externen Anfragen (die e2e-Prüfung „no network request leaves the page" belegt das).
- Ein Eintrag `dreambau.sound` im `localStorage` merkt sich „Ton aus". Er bleibt im Browser des Besuchers und wird nicht
  übertragen.
- Hoster ist Hetzner (Rechenzentrum Falkenstein; Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, nach
  https://www.hetzner.com/de/legal/impressum/). Der Webserver protokolliert in der Regel IP-Adresse, Zeit und aufgerufene
  Datei. Hetzner bietet im Kundenkonto einen Auftragsverarbeitungsvertrag an
  (https://www.hetzner.com/de/legal/data-processing); üblicherweise schließt man ihn ab, bitte prüfen, ob das schon
  geschehen ist. Noch offen: ob ein CDN oder Cloudflare davor sitzt, Speicherdauer der Protokolle.
- Kontakt per E-Mail (`mailto:`): Daten entstehen erst, wenn jemand schreibt; die Mails liegen dann auf dem eigenen
  Mailserver bei Hetzner. In der Erklärung Zweck, Speicherdauer und Rechtsgrundlage nennen.
- Der Work-Bereich ist ein eigener Bereich. Die Verarbeitung von Mitarbeiterdaten dort gehört in dessen eigene
  Datenschutzhinweise.

## 12. Beschreibung für blinde Menschen

- Jede Animation bringt eine Textbeschreibung mit, was sie zeigt und hört (zum Beispiel: „Eine Baustelle im Morgengrauen
  wächst Stockwerk für Stockwerk zu einer Skyline, zu Trommeln und Streichern geht die Sonne auf, dann erscheinen die
  Worte …"), **je Sprache**. Sie steht als echter Text (`aria-describedby`) und in der Zeichen-Ansicht.
- Als Pflichtfeld in das Briefing (Abschnitt 9) aufnehmen und in `verify.mjs` prüfen: Feld vorhanden, in jeder
  eingestellten Sprache. Optional zeitgesteuerte Kurzhinweise zu den Phasen über eine höfliche Live-Region
  (`aria-live="polite"`).
- Automatisch erzeugte Beschreibungen immer von einem Menschen gegenlesen lassen.

## 13. Prüfen

```sh
npm run build                              # Größenbudgets
npm run verify                             # alles, rund 10 bis 20 Minuten
node tools/e2e.mjs all                     # Verhalten der echten Seite
PAGE=dist/index.html node tools/e2e.mjs all    # dasselbe gegen die Einzeldatei (nach npm run bundle)
```

## 14. Bekannte Grenzen

- Nur in Headless-Chromium mit Software-Rendering geprüft. Echte Geräte stehen aus.
- Die Startseite von dreambau.com hat eine strengere Sicherheitsrichtlinie und andere Routen (Abschnitt 4.5): ohne die drei
  dort genannten Änderungen läuft die Landing nicht. Vor dem Livegang getestet nur gegen einen Nachbau dieser Regeln
  nach den Dateien im Bildungshaus-Repo und gegen echtes nginx; seit dem Livegang (2026-10-03) zusätzlich mit `check:apex`
  gegen die echte Seite.
- Skyline: im Software-Rendering entstehen vereinzelt nicht-endliche Pixel (ein bis drei pro Bild, etwa jedes
  16. Bild). Sie werden vor dem Leuchteffekt auf Schwarz gesetzt. Die genaue Ursache ist offen (`docs/PRODUCTIONS.md`).
- Der Schriftzug erscheint je nach Animation zwischen Sekunde 41 und 51. Ton beginnt in den meisten Browsern erst nach
  dem ersten Tippen oder Klick.

## 15. Prompt für Claude Code lokal

```
Lies apps/landing/docs/NEXT-STEPS.md. Fange mit Abschnitt 0 an und frage mich nur die offenen Punkte ab. Setze dann
Abschnitt 4 um (Fußzeile mit Impressum, Datenschutz und Work, Tastenhinweise als dezente Pillen, Absicherung für ältere
Geräte); die Schrift verbessere ich selbst. Arbeite im Monorepo Storypapst/dreambau auf einem neuen Branch von main (der
Fork ist Archiv). Fehlende Impressumsangaben (Abschnitt 11) als sichtbare Platzhalter eintragen, nichts erfinden. Halte in
apps/landing npm run build und npm run verify ein, im Wurzelordner npm run lint, npm test und npm run build. Lies vor jeder
Auslieferung Abschnitt 4.5 und das Runbook im privaten Repo Storypapst/dreambau-docs (docs/runbooks/start-page-publish.md):
Die Startseite kommt aus einem nginx-Container (Docker Compose) mit strenger Sicherheitsrichtlinie, nicht aus einem
Webverzeichnis; veröffentlicht wird nur durch Austausch von Dateien nach dem Runbook, nicht per rsync, und /bildungshaus/,
/testmails und die Matrix-Discovery müssen unverändert weiterlaufen. Schreibe keine Steuernummer und keine Programmliste mit
Adressen in ein öffentliches Repo. Veröffentliche nichts auf dem Server ohne meine Freigabe. Für die Abschnitte 5 bis 10
zuerst eine Spezifikation und Mockups, noch kein Code.
```

**Prompt: Startseite veröffentlichen (lokal, mit SSH-Zugang)**

```
Veröffentliche eine neue Fassung der Startseite dreambau.com aus apps/landing. Lies zuerst apps/landing/docs/NEXT-STEPS.md,
Abschnitt 4.5, und im privaten Repo Storypapst/dreambau-docs das Runbook docs/runbooks/start-page-publish.md. Baue und prüfe:
cd apps/landing && npm ci && npm run build && npm run build:apex && npm run check:apex. Sieh dir dann den echten Zustand an (das
Websiteverzeichnis, die live geladene nginx.conf, die heutige Startseite) und zeig mir die Abweichungen zum Runbook, bevor du
etwas änderst. Veröffentliche nur durch Austausch von Dateien (Sicherung, Prüfsummen, neue Dateien zuerst, index.html zuletzt);
ändere nginx.conf und Routen nur, wenn ich es für diesen Release ausdrücklich verlange, und starte nichts neu. Die Skripte im
Runbook sind bisher nur für eine erste Veröffentlichung gebaut: Prüfe, ob sie für diesen Release taugen, und sag mir sonst, was
fehlt, statt sie zu umgehen. Wende erst an, wenn ich „ja, anwenden" sage. Danach Abnahme: BASE_URL=https://dreambau.com npm run
check:apex, /bildungshaus/ unverändert, Matrix-Discovery Byte für Byte unverändert, /testmails-Login 200, geschützte API 401,
fehlende Datei 404. Schreibe keine Zugangsdaten und keine Server-Skripte in das öffentliche Repo.
```
