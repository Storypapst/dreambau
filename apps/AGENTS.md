# apps/: Regeln für die Website dreambau.com

Gilt für alles unter `apps/` (Startseite, Teamwork, Referenzen, Blog, Glossar, Rechtstexte). Ergänzt die `AGENTS.md` im
Wurzelordner. Plan und Stand: `docs/website/HANDOVER.md`.

## Warum es diese Datei gibt

Die Seiten entstehen in vielen kurzen Läufen verschiedener Agenten. Ohne feste Regeln bringt jeder Lauf seinen eigenen
Geschmack mit: andere Grautöne, eine Webfont, Karten mit Schatten. Nach fünf Läufen sieht dreambau.com aus wie fünf
Websites. Die Vorlage für alles sind die Mockups vom 03. bis 06.10.2026 (Branches `mockups/*` in
`Storypapst/dreambau-docs`, Kopie in Google Drive `01 - Dreambau CC/70 - Sources & Media/Website-Mockups (Stand 2026-10-06)/`)
und die gebauten Seiten `apps/landing` und `apps/teamwork`. **Wenn eine Regel hier und ein Mockup sich widersprechen,
gilt das Mockup; wenn Mockup und Spec sich widersprechen, gilt die Spec.**

## Was du nicht selbst entscheidest

- neue Farben, neue Schriften (auch keine Webfont), neue Komponenten-Arten, ein Layout, das in keinem Mockup vorkommt
- Texte, die für Dreambau sprechen (Claims, Über-uns, Leistungsversprechen), Angaben in Rechtstexten
- Schrift und Wirkung des Schriftzugs der Startseite (macht Frank selbst)
- Merge nach `main`, Veröffentlichen auf dem Server, Löschen auf dem Server

Fehlt eine Gestaltungsentscheidung: drei Wegwerf-Mockups im Stil der vorhandenen (eine HTML-Datei je Variante, offline
lauffähig, Zustandsleiste unten, `?state=1..8`, `?frame=phone`, `?rm=1`), Branch `mockups/<thema>` in `dreambau-docs`,
eine Frage an Frank mit Empfehlung. Hat Frank delegiert, nimm die Empfehlung und schreib in den PR: „unter Delegation
entschieden; ein Wort ändert das“.

## Aussehen

**Grundfläche und Text**

```css
:root{
  color-scheme:dark;
  --bg:#06080d;                 /* Seitenhintergrund, überall */
  --fg:233,237,245;             /* Text als r,g,b; Abstufungen nur über Deckkraft */
  --cream:255,238,210;          /* Seitentitel, Schriftzug */
  --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans Mono CJK JP",monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
body{background:radial-gradient(120% 90% at 50% 0%,#121a2b 0%,rgba(6,8,13,0) 70%) var(--bg);color:rgb(var(--fg));font:400 14px/1.5 var(--sans)}
```

Deckkraft-Stufen für Text: `.9` normal, `.82` Marken, `.78` Unterzeilen, `.62` Zeilennummern. Linien `rgba(var(--fg),.1)`,
Ränder von Pillen `.34`, von Marken `.26`. Kein reines Weiß als Fläche, kein Hellmodus.

**Farben mit fester Bedeutung** (r,g,b; nur für Marken, Punkte, Linien, nie als große Fläche)

| Token | Wert | Bedeutung |
|---|---|---|
| `--cur` | 255,190,100 | aktuell / jetzt, Block-Cursor hinter Titeln |
| `--old` | 56,214,255 | ältere Referenz |
| `--live` | 198,242,58 | online / live |
| `--en` | 169,139,255 | Text auf Englisch |
| `--neu` | 200,208,224 | neutral, „Status folgt“ |
| `--draft` | 255,216,107 | Entwurf / Vorschlag / Status unbekannt (gelbes Schild, dunkle Schrift `#10131a`) |
| `--pink` | 255,94,200 | Zone/Kategorie |
| `--tok-c`, `--tok-s` | 140,190,255 · 255,208,150 | Code-Ansicht: Bezeichner, Zeichenketten |

Teamwork-Zonen: cyan 56,214,255 · amber 255,178,62 · pink 255,94,200 · violet 169,139,255 · lime 198,242,58 · slate
200,208,224. Eine Aussage nie nur über Farbe: immer Text oder Zeichen dazu („● Online“, „EN“).

**Bausteine**

- Kopfzeile: Pille „‹ Startseite“ links, Seitentitel `font:800 30px/1.1 var(--sans)`, Farbe `--cream`, leichter Schein
  `text-shadow:0 0 22px rgba(255,214,150,.4)`, danach der Block-Cursor (`.caret`: `.5em × .95em`, Farbe `--cur`, blinkt
  `1.1s steps(1)`), daneben eine Unterzeile 13 px `rgba(fg,.78)` („Was gebaut wurde und für wen.“).
- Pille (Knöpfe, Filter): `min-height:44px; padding:0 16px; border:1px solid rgba(var(--fg),.34); border-radius:24px;
  background:rgba(6,8,13,.55); color:rgba(var(--fg),.9)`. Gewählter Filter: helle Pille.
- Marke (Tags): `min-height:24px; padding:0 9px; border:1px solid rgba(var(--fg),.26); border-radius:12px;
  font:500 11px/1.2 var(--mono)`.
- Status: wie Marke, mit Punkt davor, `font-weight:600`.
- Entwurfs-Schild: gelb `--draft`, `font:800 10px/1.25 var(--mono)`, Großbuchstaben, `letter-spacing:.07em`.
- Listen: Zeilen statt Karten. Nummer rechtsbündig in Monospace (`12.5px`, `.62`), Datum in Monospace, Titel fett,
  darunter zwei Zeilen Text, Trennlinie `.1`. Keine Karte in einer Karte, keine Schatten.
- Fenster und Blätter: am Rechner mittig, am Handy von unten, Schließen-Knopf als Pille mit „Esc“-Hinweis nur bei Tastatur.
- Zeichenwelt: Hintergründe aus mutierenden Zeichen (Matrix-artig), aber farbig je Zone, ruhig, hält nach dem Ende an.

**Schrift:** nur Systemschriften. Keine Datei laden, keine Google Fonts (die Sicherheitsrichtlinie verbietet es ohnehin).

## Verhalten

- Ohne JavaScript ist jede Seite lesbar (Inhalt steht im HTML, JavaScript verbessert nur).
- „Bewegung reduzieren“: ein ruhiges Standbild, nichts blinkt, Cursor steht.
- Handy zuerst prüfen: 390×844, Ränder 16 px, Tippflächen mindestens 44 px, kein waagerechtes Scrollen.
- Tastatur: alles mit Tab erreichbar, Fokus sichtbar (`outline:3px solid #fff; outline-offset:3px`), `Esc` schließt das
  oberste Fenster.
- Keine Cookies, kein Tracking, keine Anfrage an eine fremde Adresse, kein `localStorage` außer einer begründeten
  Einstellung (wie `dreambau.sound`).
- Keine Inline-Skripte, keine Inline-Stile, keine `on…`-Attribute. Richtlinie mindestens wie die Startseite.

## Texte

- Deutsch, kurz, konkret. Ein Satz sagt, was da ist oder was passiert. Zahlen gemessen; Schätzungen mit „etwa“.
- Berliner Ton nur dort, wo er schon steht („Jeht nich… jibs nich…“, „nich warten, quatschen“). Nicht nachahmen.
- Keine Werbewörter: revolutionär, innovativ, nahtlos, einzigartig, Lösung aus einer Hand, Leidenschaft für … usw.
- Vorhandene Texte wörtlich übernehmen (alte Referenzen: englische Originale mit Marke „EN“). Fehlt ein Text: sichtbarer
  Platzhalter („Kurztext folgt“), nie selbst ausdenken. Erfundene Beispieltexte aus Mockups gehen nie live.
- Sprachen: Übersetzungen sinngemäß, nicht wörtlich.

**Beispiel.** Leerer Kurztext bei „ORI“.
*Richtig:* Zeile mit Name, Marke „Open Source“, Link, kursiv „Kurztext folgt“. Frank sieht die Lücke und füllt sie.
*Falsch:* „ORI ist eine innovative Open-Source-Initiative, die Resilienz nahtlos neu denkt.“ Klingt fertig, ist erfunden,
und niemand merkt, dass es nie freigegeben wurde.

## Arbeitsweise

- Ticket in `Storypapst/dreambau-docs` → Branch `<kürzel>/<NN>-<thema>` → Merge in `feat/<bereich>` (selbst, wenn
  Prüfungen grün und Review-Hinweise erledigt) → Draft-PR nach `main` (Frank mergt).
- Commit-Nachrichten englisch, ganze Sätze im Imperativ. PR-Text: Problem vorher, Lösung, Belege (Prüfungen, Screenshots
  Handy und Rechner).
- Jede App: eigenes `package.json`, eigene Prüfungen mit echtem nginx und Chromium, eigener Workflow mit Pfadfilter.
- Keine Zugangsdaten, Serverpfade oder echten Programmlisten im Repo (es ist öffentlich).
