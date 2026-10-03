# Übergabe und Plan: dreambau.com (Landing, Work-Bereich, Blog)

Stand: 2026-10-03. Diese Datei sagt, wo das Projekt steht, womit man lokal weiterarbeitet und was geplant ist. Sie ist so
geschrieben, dass man sie auch einem lokalen Claude-Code-Lauf geben kann (Prompt am Ende). Es wurde nichts davon gebaut,
außer was in Abschnitt 1 steht: der Rest ist Planung.

## 0. Entscheidungsstand (zum Abhaken)

Stand nach dem Chat vom 2026-10-03. ✔ entschieden, ◐ teilweise, ○ offen. Es hat keine „grilling"-Fragerunde und keine
Wayfinder-Runde stattgefunden. Die Rückfragen aus dem Chat stehen unten mit den Antworten, damit die erste Runde sie nicht
wiederholt. Nichts ist veröffentlicht und nichts gemerged.

1. ○ PR #1 in `main` des Forks mergen? Keine Antwort. („Den Fork lassen wir da" betrifft nur die Rolle des Forks.)
2. ○ „Jeht nich…" am Anfang groß (jetzt) oder klein schreiben (eine Zeile in `site/index.html`, Attribut `data-lines`)?
   Keine Antwort.
3. ◐ Schrift (Abschnitt 4.3): Entschieden ist, dass die heutige Schrift samt Wirkung nicht gefällt („Cheesy") und eine
   andere kommt; der Stil soll sich als Fallback (ähnliche Systemschrift) herunterbrechen lassen. Screenshots von Jost,
   Fraunces und Inter (heutige und ruhigere Wirkung) wurden gewünscht und gezeigt, neue Videos sind nicht nötig. Offen:
   welche Schrift, und ob die Wirkung ruhiger wird. Empfehlung: Jost mit ruhiger Wirkung.
4. ◐ „Esc" und „M" (Abschnitt 4.2): gewünscht ist, beide dezent zu beschriften (Überspringen-Knopf, Ton-Knopf). Offen: nur
   mit Tastatur zeigen (Empfehlung) oder überall.
5. ✔ Beschriftung des Login-Links: „Work" (Wunsch des Nutzers); im Work-Bereich gibt es kein Esc. Der Hinweis, dass „Work"
   als „Referenzen" gelesen werden kann (Abschnitt 8), ist unbeantwortet.
6. ◐ Sprachen (Abschnitt 7): Mechanismus entschieden: sinngemäße Übersetzung der Redewendung für die häufigsten Sprachen,
   Auswahl nach Browsersprache, Rückfall Deutsch wie jetzt. Welche Sprachen genau: offen.
7. ◐ Impressum (Abschnitt 11): genannt sind die Geschäftsführer Frank Gerhardt und Valery Suslov. Steuernummer, Finanzamt
   und Gründungsdatum werden nicht verlangt und stehen nicht im Repo. Es fehlen: Firmenname mit Rechtsform, Anschrift, zweite
   Kontaktmöglichkeit, Handelsregister mit Nummer, USt-IdNr., gegebenenfalls Kammer oder Aufsicht, Hoster. Sichtbarkeit offen:
   Der Nutzer tendiert dazu, das Impressum nur in der Zeichen-Ansicht zu zeigen; die Empfehlung ist zusätzlich eine winzige,
   sichtbare Zeile.
8. ○ Liste der Programme und Domains für den Work-Bereich (Abschnitt 8): keine Liste. Bekannt: ein Invoice-Bereich und
   viele weitere Programme auf dem Server, mehrere Domains, jedes mit eigenem Login.
9. ◐ Monorepo (Abschnitt 2): heißt „Dreambau" und enthält alle anderen Sachen; der Fork bleibt bestehen. Offen: genauer
   GitHub-Pfad und Ordnernamen (Vorschlag `apps/landing`, `apps/work`, `apps/blog`).

### Weitere Entscheidungen und Wünsche aus dem Chat

- **Grundanforderung (ursprünglich):** Bei jedem Laden startet zufällig eine von drei Animationen, mit dem Text „Jeht
  nich… jibs nich… dreambau.com", am Ende klein „info@dreambau.com (nich warten, quatschen)", Start mit Ton und mit
  Ton-aus-Knopf.
- **Weiterarbeit lokal:** Die SSH-Schlüssel liegen lokal; die Cloud-Sitzung hat keinen Zugriff darauf (geprüft: kein
  Schlüssel, kein Agent). Veröffentlicht wurde noch nichts.
- **Drei große Vorhaben:** Blog, Pipeline für die Landing-Animationen, Work-Bereich mit Impressum. Zuerst eine
  Spezifikation, geplant mit dem Skill „Wayfinder" von Matt Pocock (lokal).
- **Pipeline:** Idee kurz einsprechen oder eintippen, Claude baut, Freigabe mit „ja, mach", danach automatisch im Pool.
  Das Eingabeformular ist das selbst gehostete Formbricks. Claim und visuelle Geschichten sollen sich über das Briefing
  ändern lassen; eine kurze Rückfragerunde zum Schärfen vor dem Bauen ist erwünscht.
- **Blog:** kurze Beiträge, Abschnitt „Warum lesenswert" über ein Formbricks-Formular.
- **Zeichen-Ansicht (Abschnitt 5):** gewünscht, mit Größe, gemessener Ladezeit, Vergleichen als Quadrate (zum Beispiel
  „1 Sekunde Video", „durchschnittliches iPhone-Foto"), ruhigem Ende und als Fallback ohne WebGL2. Einzelheiten offen.
- **Work-Bereich (Abschnitt 8):** Matrix-artiger, mutierender Zeichenstil, aber bunt statt grün, jede Zone mit eigener
  Farbe; zuerst Mockups.
- **Barrierefreiheit (Abschnitt 12):** Beschreibung für blinde Menschen, mehrsprachig, als Zusatz im Briefing.
- **Beantwortet, ohne Entscheidung:** Verhalten auf älteren Geräten (Abschnitt 4.4), Hochformat und Drehen
  (Abschnitt 6; ein „fest verankertes Bild" wird nicht empfohlen).

### Bisherige Fragen und Antworten

| Frage der Cloud-Sitzung | Antwort des Nutzers |
|---|---|
| PR #1 in `main` mergen? | keine Antwort |
| „Jeht nich…" groß oder klein? | keine Antwort |
| „Esc" und „M" auch auf dem Handy oder nur mit Tastatur? | keine Antwort |
| Ist der Login-Link „Intranet-Login" gemeint? | Er soll „Work" heißen |
| Soll vorab ein Bild der drei Schriften gezeigt werden? | Ja, Screenshots genügen, keine neuen Videos |
| Angaben für das Impressum? | teilweise (siehe Punkt 7) |
| Wer hostet dreambau.com? | keine Antwort |
| Liste der Programme und Domains für „Work"? | keine Antwort |
| Soll Abschnitt 0 in „grilling"-Fragerunden durchgegangen werden? | keine Antwort; geplant ist Wayfinder lokal |
| Angebot: einen Problem-Issue nachträglich anlegen, wenn Issues im Fork eingeschaltet werden | keine Antwort |

## 1. Wo wir stehen

- **Repo:** https://github.com/Storypapst/morphdemo-benchmark (Fork, öffentlich), **Branch**
  `claude/dreambau-landing-animations-d2r0pj`, **Ordner** `dreambau-landing/`.
- **Pull Request:** https://github.com/Storypapst/morphdemo-benchmark/pull/1 gegen `main`. Offen, keine Konflikte, alle
  Review-Hinweise von Augment und CodeRabbit bearbeitet. Nichts ist gemerged.
- **Inhalt:** die Seite (`site/`) mit drei Animationen, die bei jedem Laden zufällig gewählt werden: Rohbau (4k),
  Traumhaus (16k), Skyline (64k), dazu Laufzeit, Prüfwerkzeuge und Dokumentation. Alle Prüfungen sind bestanden
  (`verification/SUMMARY.md`). Geprüft wurde nur in Headless-Chromium mit Software-Rendering, nicht auf echten Geräten.
- **Zuletzt behoben:** In der Skyline blieb nach etwa 37 s ein Zwischenbild des Sonnen-Effekts stehen (Schleier am oberen
  Rand). Dazu gibt es jetzt eine Prüfung „order independence" in `tools/verify.mjs`.

## 2. Repo-Plan: Monorepo `dreambau`

Der Fork bleibt, wie er ist (PR #1, Branch). Gearbeitet wird künftig im Monorepo; der Landing-Ordner wird dort als
Unterordner eingehängt, mit Historie. Vorschlag für die Ordner: `apps/landing`, später `apps/work`, `apps/blog`.

```sh
# 1) im Klon des Forks: nur den Landing-Ordner mit seiner Historie herauslösen
cd morphdemo-benchmark
git checkout claude/dreambau-landing-animations-d2r0pj
git subtree split -P dreambau-landing -b dreambau-only
# 2) im Monorepo: als Unterordner einhängen (--squash, wenn die Einzelcommits nicht mit hinein sollen)
cd ../dreambau
git checkout -b feat/landing-import
git subtree add --prefix=apps/landing ../morphdemo-benchmark dreambau-only
cd apps/landing && npm ci && npx playwright install chromium && npm run build
```

Danach ändern sich nur die Pfade in dieser Datei (`dreambau-landing/…` wird `apps/landing/…`). Wenn das Monorepo
Workspaces (npm, pnpm) nutzt, den Landing-Ordner dort eintragen. Neue Änderungen aus dem Fork lassen sich später mit
`git subtree pull` nachziehen.

## 3. Drei große Vorhaben

- **A. Landing mit zufälligen Animationen** und eine Pipeline für weitere Animationen (Abschnitte 4, 5, 6, 7, 9).
- **B. Work-Bereich:** Einstieg zu den internen Programmen, dazu Impressum und Datenschutz (Abschnitte 8, 11).
- **C. Blog:** kurze Beiträge mit einem Formular „Warum lesenswert" (Abschnitt 10).

Empfehlung: für jedes Vorhaben zuerst eine Spezifikation, dann bauen. Als Planungswerkzeug nennst du den Skill
„Wayfinder" von Matt Pocock; nach den Beschreibungen, die ich gefunden habe, zerlegt er große Vorhaben in
Entscheidungs-Tickets im Issue-Tracker, bevor Code entsteht (nicht selbst installiert oder geprüft, Beschreibung:
https://pasqualepillitteri.it/en/news/12137/wayfinder-claude-code-skill-plan-big-projects). Das passt zu diesen drei
Vorhaben. In der Cloud-Sitzung hier gibt es stattdessen den Skill „grilling" (Fragerunden mit Empfehlungen).
Reihenfolge-Empfehlung: A bis zum Livegang (Abschnitt 4), dann B, dann die Pipeline, dann C.

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
- Umsetzung: neben dem Ton-Symbol ein `<kbd>M</kbd>`, gestaltet wie `#skip kbd`. Entscheidung offen: nur mit Tastatur
  zeigen (`(hover: hover) and (pointer: fine)`, Empfehlung) oder überall.
- `aria-label="Ton"` bleibt konstant, der Zustand läuft über `aria-checked`; die vorhandenen e2e-Prüfungen für Name,
  Rolle und Zustand müssen weiter bestehen. Im Work-Bereich gibt es kein Esc und keinen Überspringen-Knopf.

### 4.3 Schrift und ruhigere Wirkung

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
  Füllung fast weiß. Meine Empfehlung: **Jost mit ruhiger Wirkung**.
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

- Den Inhalt von `site/` (`index.html`, `shell.js`, Ordner `p/`, plus die neuen Seiten) ins Webverzeichnis kopieren, per
  HTTPS ausliefern. Empfohlen: die Sicherheitsrichtlinie `CSP` aus `tools/serve.mjs` als HTTP-Header setzen.
- **Vorsicht: `/testmails` und alles andere im Webroot darf nicht überschrieben oder gelöscht werden.** Nicht mit
  `rsync --delete` ins Webroot synchronisieren, vorher den Ist-Stand sichern, nach dem Upload `/testmails` aufrufen.
- Zugang: kein Root nötig. Besser ein eigener Deploy-Benutzer, der nur in das Webverzeichnis schreiben darf, mit einem
  eigenen SSH-Schlüssel dafür. Beispiel mit Platzhaltern:
  `rsync -av --exclude 'testmails' site/ DEPLOYUSER@SERVER:/pfad/zum/webroot/`
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
- **Welche zuerst:** Vorschlag Englisch plus die Sprachen deiner Zielgruppe (zum Beispiel Türkisch, Russisch,
  Ukrainisch, Polnisch). Arabisch braucht zusätzlich ein Rechts-nach-links-Layout.
- **Schrift:** Die eingebettete Teilmenge muss die Zeichen der Sprache enthalten (Latein mit Umlauten klein, Kyrillisch und
  Griechisch größer, Arabisch und Chinesisch nur über Systemschriften).
- **Rechtstexte** bleiben deutsch, eine englische Fassung ist optional.
- **Prüfung:** neue Prüfung in `verify.mjs`: jede Sprache hat alle Texte und passt in die Breite (Kontrast und Zeilenbruch).
- Aufwand: Deutsch und Englisch etwa ein bis zwei Stunden, jede weitere Sprache in lateinischer Schrift danach nur noch
  die Texte.

## 8. Work-Bereich

- **Zweck:** Einstieg zu den internen Programmen (Invoice-Bereich und viele weitere auf dem Server), über mehrere Domains,
  jeder Bereich mit eigenem Login. Der Link auf der Landing heißt „Work". Hinweis: „Work" kann in der Baubranche als
  „unsere Arbeiten" (Referenzen) gelesen werden. Alternativen: „Team-Login" oder „Work · Login".
- **Verhalten:** kein Esc und kein Überspringen, weil es keine Intro-Animation ist; man klickt hinein und sieht die
  Bereiche.
- **Stil:** futuristisch, mutierende Zeichen (Matrix-artig), aber bunt statt grün, jede Zone mit eigener Farbe.
  Erst Mockups (statische Bilder), dann ein Prototyp mit Testdaten; die Zeichenwelt aus Abschnitt 5 lässt sich
  wiederverwenden.
- **Daten:** Die Liste der Bereiche (Name, Domain, Farbe) liegt in einer Konfigurationsdatei, nicht im Code. Test: jede
  Kachel zeigt auf eine erreichbare Adresse.
- **Sicherheit:** Eine öffentlich sichtbare Liste verrät die Namen der internen Programme und ihre Domains. Entscheidung:
  nur Namen und Links (ausreichend, wenn jedes Programm sein eigenes Login hat) oder die Liste erst nach einem gemeinsamen
  Login zeigen (später möglich).
- **Offen:** Liste der Programme und Domains, Farbwünsche.

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
  Formular. Quellen: https://formbricks.com/docs/surveys/best-practices/headless-surveys und
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

## 11. Impressum und Datenschutz

**Genannt:** Geschäftsführer Frank Gerhardt und Valery Suslov.

**Noch nötig für das Impressum:** genauer Firmenname mit Rechtsform, Anschrift, eine zweite schnelle Kontaktmöglichkeit
neben info@dreambau.com (zum Beispiel Telefon), Handelsregister mit Gericht und Nummer, USt-IdNr. (falls vorhanden),
Kammer oder Aufsichtsbehörde (falls zutreffend). Steuernummer, zuständiges Finanzamt und Gründungsdatum werden dafür
nicht verlangt und gehören nicht in diese Datei oder das öffentliche Repo.

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
- Der Server des Hosters protokolliert in der Regel IP-Adresse, Zeit und aufgerufene Datei. Dazu fehlen noch: Name des
  Hosters, ob ein CDN oder Cloudflare davor sitzt, Speicherdauer der Protokolle.
- Kontakt per E-Mail (`mailto:`): Daten entstehen erst, wenn jemand schreibt.
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
- Skyline: im Software-Rendering entstehen vereinzelt nicht-endliche Pixel (ein bis drei pro Bild, etwa jedes
  16. Bild). Sie werden vor dem Leuchteffekt auf Schwarz gesetzt. Die genaue Ursache ist offen (`docs/PRODUCTIONS.md`).
- Der Schriftzug erscheint je nach Animation zwischen Sekunde 41 und 51. Ton beginnt in den meisten Browsern erst nach
  dem ersten Tippen oder Klick.

## 15. Prompt für Claude Code lokal

```
Lies dreambau-landing/docs/NEXT-STEPS.md (im Monorepo: apps/landing/docs/NEXT-STEPS.md). Fange mit Abschnitt 0 an und
frage mich die offenen Entscheidungen ab. Setze dann Abschnitt 4 um (Fußzeile, Tastenhinweise, Schrift, Absicherung für
ältere Geräte) auf dem Branch claude/dreambau-landing-animations-d2r0pj. Halte npm run build und npm run verify ein. Schreibe
keine Steuernummer ins Repo. Veröffentliche nichts auf dem Server ohne meine Freigabe. Für die Abschnitte 5 bis 10 zuerst
eine Spezifikation und Mockups, noch kein Code.
```
