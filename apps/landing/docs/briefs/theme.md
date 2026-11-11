# Auftrag: eine neue Fassung zu einem Thema

Vorlage für jeden Lauf mit einem Modell (Fable, Opus, Codex, Kio …). Vor dem Lauf nur die drei Felder ausfüllen:

- **Thema:** `<THEMA, z. B. „Jagged Intelligence: KI hat Kanten, wir bauen Brücken“>`
- **Größenklasse:** `<4k | 16k | 64k>` (Obergrenze 4.096 / 16.384 / 65.536 Byte für `site/p/<id>.js`)
- **id:** `<nur Buchstaben und Ziffern, z. B. kante4k>`

## Was du baust

Genau **eine Produktion** für den Zufallspool der Startseite, nach `docs/CONTRACT.md` und `docs/briefs/common.md`:
eine Datei `src/p/<id>.js`, die `Dream.add({ … })` aufruft (Bild als Shader `frag` oder `init`/`draw`, Musik über
`music(K, D)`, dazu `dur`, `fin` und `cta`). Wer die Startseite lädt, bekommt zufällig eine der Fassungen im Pool zu sehen.
Deine ist dann eine davon.

Das Thema ersetzt nur die Geschichte („vom Rauschen zur Ordnung“ wird zu deinem Thema). Alles andere aus
`common.md` gilt unverändert: 60 Sekunden, Aufbau in drei Phasen, `fin` 53 s, `cta` 54,5 s, ruhiges unteres Band, Ton
und Stil.

## Was du nicht baust

Die Seite stellt das alles schon. Ein Nachbau macht sie kaputt, auch wenn er gut aussieht:

- **Keine Webseite.** Kein HTML, kein CSS, keine eigene Unterseite, kein eigener Ordner unter `site/`.
- **Keine Bedienelemente.** Keine Menüs, Knöpfe, Pillen, Fortschrittsbalken, Zeitanzeigen, Kapitelmarken, Logos und keinen
  „Andere Fassung“-Knopf (eine neue Fassung bringt das Neuladen).
- **Kein Text außer dem Schriftzug.** Keine Überschriften, Slogans, Zahlen, Zitate, Quellen, Erklärtexte oder Kapitelnamen,
  weder im HTML noch im Bild. Das Thema wird nur durch Bild und Musik erzählt. Am Ende erscheinen die drei Zeilen der
  Laufzeit („Jeht nich…“, „jibs nich…“, „dreambau.com“) über `tdist`/`tpt`, wie in `CONTRACT.md` beschrieben.
- **Keine Box.** Das Bild füllt den ganzen Bildschirm in jedem Seitenverhältnis (Querformat, Hochformat, 21:9). Keine
  Rahmen, kein Kasten, kein Raster als Bühne, keine eingebettete Kachel.
- **Keine Änderung an der Laufzeit.** `site/shell.js`, `navigation.*`, `source-view.*`, `i18n*` und `index.html` bleiben,
  wie sie sind. Ausnahme: deine id in `D.ids` eintragen. Keine Kampagnen-Schalter, keine eigenen Build-Modi.

## Was du einträgst

1. `src/p/<id>.js`: die Produktion
2. `tools/budget.mjs`: `'<id>': <Obergrenze>` in `BUDGET`
3. `site/shell.js`: `'<id>'` in `D.ids`
4. `site/p/<id>.js`: entsteht mit `npm run build`
5. `docs/PRODUCTIONS.md`: eine Zeile mit Name, id, Größe und zwei Sätzen zu Bild und Musik
6. `verification/<id>/`: entsteht mit `npm run verify -- <id>`
7. `site/i18n/de.js`: `blind.<id>`, die Beschreibung für blinde Menschen, also was man sieht und hört, nach dem Muster
   von `blind.4k` mit den Platzhaltern `{tag1}`, `{tag2}` und `{brand}`. Dazu dieselbe Beschreibung als Entwurf in jeder
   anderen angebotenen Sprachdatei unter `site/i18n/` und danach `npm run sync:languages -- --pin` (aktualisiert
   `src/i18n/languages.json` und `site/i18n/index.js`). Ohne diesen Eintrag bricht `npm run build:apex` mit „animation
   lacks a complete description“ ab. Das ist kein sichtbarer Text, sondern nur für Screenreader; Ablauf in
   `docs/LANGUAGES.md`.

Die Quelltextansicht der Seite zeigt deine Fassung automatisch, denn `npm run build:apex` packt das ausgelieferte
`p/<id>.js` als `p/<id>.src.js` dazu.

## Abnahme

```sh
cd apps/landing
npm ci
npm run build                 # Größenbudget eingehalten
npm run check:languages -- --complete --release
npm run verify -- <id>        # Dauer, Phasen, Blitzsicherheit, Schriftzug, ruhiges unteres Band, Musik
npm run build:apex && npm run check:apex
node tools/e2e.mjs <id>       # Ton, Esc, reduzierte Bewegung, kein WebGL, keine Netzanfragen
```

Sieh dir außerdem den Kontaktbogen (`verification/<id>/frames/sheet.png`) mit eigenen Augen an und hör die Musik an.
Liefere einen Pull Request, der **nur** die sieben Punkte oben ändert, und nenne darin das Modell, das tatsächlich
gearbeitet hat.
