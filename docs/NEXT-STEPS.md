# Übergabe: dreambau.com Landing Page, nächste Schritte

Stand: 2026-10-03. Diese Datei beschreibt, wo das Projekt steht, womit man lokal weiterarbeitet und was als Nächstes
ansteht. Sie ist so geschrieben, dass man sie auch einem lokalen Claude-Code-Lauf geben kann (Prompt am Ende).

## 1. Wo wir stehen

- **Repo:** https://github.com/Storypapst/morphdemo-benchmark (Fork, öffentlich), **Branch**
  `claude/dreambau-landing-animations-d2r0pj`, **Ordner** `dreambau-landing/`.
- **Pull Request:** https://github.com/Storypapst/morphdemo-benchmark/pull/1 gegen `main`. Offen, keine Konflikte,
  alle 15 Review-Hinweise von Augment und CodeRabbit bearbeitet. Nichts ist gemerged.
- **Inhalt:** die Seite (`site/`) mit drei Animationen, die bei jedem Laden zufällig gewählt werden: Rohbau (4k),
  Traumhaus (16k), Skyline (64k), dazu Laufzeit, Prüfwerkzeuge und Dokumentation. Alle Prüfungen sind bestanden
  (`verification/SUMMARY.md`). Geprüft wurde nur in Headless-Chromium mit Software-Rendering, nicht auf echten Geräten.
- **Noch offen aus der Abstimmung:** PR #1 in `main` mergen? „Jeht nich…" am Anfang groß (jetzt) oder klein schreiben
  (eine Zeile in `site/index.html`, Attribut `data-lines`)?

## 2. Womit lokal weiterarbeiten

**Zum Einstieg: auf dem bestehenden Branch.** Pushes dorthin aktualisieren PR #1.

```sh
git clone https://github.com/Storypapst/morphdemo-benchmark.git
cd morphdemo-benchmark
git checkout claude/dreambau-landing-animations-d2r0pj
cd dreambau-landing
npm ci
npx playwright install chromium     # einmalig, nur für die Prüfungen
npm run build && npm run serve      # http://localhost:8080  (?anim=4k, ?anim=16k oder ?anim=64k erzwingt eine)
```

**Auf Dauer: ein eigenes Repo für die Firmenseite** (gern privat). Der Fork ist öffentlich und gehört zum Benchmark;
Impressum, Deployment und Zugangsdaten sollten dort nicht liegen. Mit Historie, sobald PR #1 entschieden ist:

```sh
cd morphdemo-benchmark
git subtree split -P dreambau-landing -b dreambau-only
git clone --branch dreambau-only --single-branch . ../dreambau-website
cd ../dreambau-website
git branch -m main
git remote set-url origin https://github.com/<konto>/<neues-repo>.git   # Repo vorher auf GitHub anlegen
git push -u origin main
```

## 3. Nächste Schritte

### Schritt 1: Fußzeile mit Impressum, Datenschutz und Intranet-Login

Eine kleine Zeile „Impressum · Datenschutz · Intranet-Login", **ab der ersten Sekunde sichtbar** (das Impressum muss
jederzeit erreichbar sein, nicht erst im Schlussbild).

- `site/index.html`: `<footer id="legal">` mit drei Links: `impressum.html`, `datenschutz.html`, `/testmails`.
  Dezent (etwa 12 px, halbe Deckkraft), Tippfläche mindestens 44 px. Nicht mit `#skip` (unten rechts) und `#cta`
  (unten Mitte) kollidieren; im Hochformat (390 px) in eine eigene Zeile unter die Schlusszeile. Auch in den
  Ersatzansichten (`html.static`, `<noscript>`) sichtbar.
- Neue Dateien `site/impressum.html` und `site/datenschutz.html`: statisches HTML im dunklen Stil der Startseite,
  `lang="de"`, Link zurück zur Startseite, kein JavaScript nötig.
- `tools/bundle.mjs`: die zwei Seiten neben `dist/index.html` legen, sonst führen die Links im Einzeldatei-Bau ins Leere.
- Tests in `tools/e2e.mjs`: Links sind sofort sichtbar und per Tastatur erreichbar, funktionieren ohne JavaScript,
  der Intranet-Link zeigt auf `/testmails`, beim Laden entsteht keine Netzwerkanfrage.
- Inhalte: siehe Abschnitt 4. Texte vor der Veröffentlichung von jemandem mit Rechtskenntnis prüfen lassen.

### Schritt 2: Tastenhinweise „Esc" und „M"

- Heute ist „Esc" am Überspringen-Knopf auf Geräten ohne Hover (Handy, Tablet) ausgeblendet
  (`@media (hover: none) { #skip kbd { display: none; } }` in `site/index.html`) und im Video sehr blass. „M" gibt es
  nur als Tooltip (`title`) und als `aria-keyshortcuts`.
- Umsetzung: neben dem Ton-Symbol ein `<kbd>M</kbd>`, gestaltet wie `#skip kbd`. Offene Entscheidung: nur mit
  Tastatur zeigen (`(hover: hover) and (pointer: fine)`, Empfehlung) oder überall.
- Beachten: `aria-label="Ton"` bleibt konstant, der Zustand läuft über `aria-checked`; die vorhandenen e2e-Prüfungen
  für Name, Rolle und Zustand müssen weiter bestehen.

### Schritt 3: Andere Schrift, ruhigere Wirkung

- Der Schriftzug wird in `site/shell.js` (`buildText()`, Zeile ~78) mit einer Systemschriftliste (`fam`, `wght = 800`)
  in eine Distanzfeld-Textur gezeichnet. Alle drei Animationen lesen diese Textur, eine neue Schrift wirkt also überall.
- Warum eine eigene Schrift: Besucher haben je nach Gerät andere Systemschriften. Im Cloud-Video war es
  Liberation Sans fett (ein Arial-Ersatz), weil dort die üblichen Schriften fehlen.
- Umsetzung:
  1. Kandidaten vergleichen (alle OFL-lizenziert, per npm `@fontsource/jost`, `@fontsource/fraunces`,
     `@fontsource/inter`): ein Vorschaubild mit den drei Zeilen in jeder Schrift auf der Himmelsfarbe der Skyline.
  2. Gewählte Schrift auf die benötigten Zeichen reduzieren (`pip install fonttools brotli`, dann `pyftsubset` mit
     `--unicodes=U+0020-007E,U+00C4,U+00D6,U+00DC,U+00E4,U+00F6,U+00FC,U+00DF,U+2026 --flavor=woff2`) und als Base64
     einbetten (grob 10 bis 20 KB, zählt nicht zu den Größenbudgets der Animationen).
  3. Vor `buildText()` laden (heute läuft `buildText(); uploadText(); layout();` synchron, Zeile ~715, daher in eine
     async-Funktion mit Rückfall auf die alte Liste): `new FontFace('DreamBau', bytes, { weight })`, `await face.load()`,
     `document.fonts.add(face)`, danach `"DreamBau"` an den Anfang von `fam` setzen und `wght` anpassen.
  4. Strenge Sicherheitsrichtlinie prüfen: `CSP=1 npm run serve` (die Seite darf nichts blockiert bekommen). Falls nötig
     `font-src data:` in `CSP` (`tools/serve.mjs`) und im README ergänzen.
  5. Skyline ruhiger machen: in `src/p/64k.js` im Composite-Shader, Block „the tagline: each line condenses out of
     grain", den warmen Schein (`c+=vec3(1.,.6,.28)*.2*...`), den Schatten und den durchlaufenden Glanz (`gx`)
     verringern oder entfernen, Farbe schlichter halten (Weiß oder Creme).
  6. Danach `npm run build`, `npm run verify` (Kontrast, Lesbarkeit, ruhiges unteres Band), neue Vorschau mit
     `node tools/video.mjs <id>` ansehen.

### Schritt 4: Auf dreambau.com veröffentlichen

- Den Inhalt von `site/` (`index.html`, `shell.js`, Ordner `p/`, plus die zwei neuen Seiten) ins Webverzeichnis kopieren,
  per HTTPS ausliefern. Empfohlen: die Sicherheitsrichtlinie `CSP` aus `tools/serve.mjs` als HTTP-Header setzen.
- **Vorsicht: `/testmails` und alles andere, was im Webroot liegt, darf nicht überschrieben oder gelöscht werden.**
  Nicht mit `rsync --delete` ins Webroot synchronisieren, vorher den Ist-Stand sichern, nach dem Upload `/testmails`
  aufrufen.
- Zugang: kein Root nötig. Besser ein eigener Deploy-Benutzer, der nur in das Webverzeichnis schreiben darf, mit einem
  eigenen SSH-Schlüssel dafür. Beispiel mit Platzhaltern:
  `rsync -av --exclude 'testmails' site/ DEPLOYUSER@SERVER:/pfad/zum/webroot/`
- Nach dem Livegang auf echten Geräten ansehen und anhören (iPhone/Safari, Android/Chrome, Firefox, ein älteres
  Notebook): läuft die Animation, setzt der Ton nach dem ersten Tippen ein, funktionieren Ton aus, Esc, M und die Links.

## 4. Impressum und Datenschutz: Angaben und Fakten

**Genannt:** Geschäftsführer Frank Gerhardt und Valery Suslov.

**Noch nötig für das Impressum:** genauer Firmenname mit Rechtsform, Anschrift, eine zweite schnelle Kontaktmöglichkeit
neben info@dreambau.com (zum Beispiel Telefon), Handelsregister mit Gericht und Nummer, USt-IdNr. (falls vorhanden),
Kammer oder Aufsichtsbehörde (falls zutreffend). Steuernummer, zuständiges Finanzamt und Gründungsdatum werden dafür
nicht verlangt und gehören nicht in diese Datei oder das öffentliche Repo.

**Für die Datenschutzerklärung gilt technisch:**

- Keine Cookies, kein Tracking, keine externen Anfragen (die e2e-Prüfung „no network request leaves the page" belegt das).
- Ein Eintrag `dreambau.sound` im `localStorage` merkt sich „Ton aus". Er bleibt im Browser des Besuchers und wird nicht
  übertragen.
- Der Server des Hosters protokolliert in der Regel IP-Adresse, Zeit und aufgerufene Datei. Dazu fehlen noch: Name des
  Hosters, ob ein CDN oder Cloudflare davor sitzt, Speicherdauer der Protokolle.
- Kontakt per E-Mail (`mailto:`): Daten entstehen erst, wenn jemand schreibt.
- Der Intranet-Login unter `/testmails` ist ein eigener Bereich. Die Verarbeitung von Mitarbeiterdaten dort gehört in
  dessen eigene Datenschutzhinweise.

Das ist keine Rechtsberatung. Die Texte vor dem Livegang prüfen lassen.

## 5. Prüfen

```sh
npm run build                              # Größenbudgets
npm run verify                             # alles, rund 10 bis 20 Minuten
node tools/e2e.mjs all                     # Verhalten der echten Seite
PAGE=dist/index.html node tools/e2e.mjs all    # dasselbe gegen die Einzeldatei (nach npm run bundle)
```

## 6. Bekannte Grenzen

- Nur in Headless-Chromium mit Software-Rendering geprüft. Echte Geräte stehen aus.
- Skyline: im Software-Rendering entstehen vereinzelt nicht-endliche Pixel (ein bis drei pro Bild, etwa jedes
  16. Bild). Sie werden vor dem Leuchteffekt auf Schwarz gesetzt. Die genaue Ursache ist offen (`docs/PRODUCTIONS.md`).
- Der Schriftzug erscheint je nach Animation zwischen Sekunde 41 und 51. Ton beginnt in den meisten Browsern erst nach
  dem ersten Tippen oder Klick.

## 7. Prompt für Claude Code lokal

```
Lies dreambau-landing/docs/NEXT-STEPS.md. Arbeite auf dem Branch claude/dreambau-landing-animations-d2r0pj (PR #1)
und setze die Schritte 1 bis 3 um. Halte npm run build und npm run verify ein. Frage mich nach den fehlenden
Impressumsangaben und schreibe keine Steuernummer ins Repo. Veröffentliche nichts auf dem Server ohne meine Freigabe.
```
