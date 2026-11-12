# Auftrag: eine neue Fassung zu einem Thema

Vorlage für jeden Lauf mit einem Modell (Fable, Opus, Codex, Kio …). Vor dem Lauf nur die drei Felder ausfüllen:

- **Thema:** `<THEMA, z. B. „Jagged Intelligence: KI hat Kanten, wir bauen Brücken“>`
- **Größenklasse:** `<4k | 16k | 64k>` (Obergrenze 4.096 / 16.384 / 65.536 Byte für `site/p/<id>.js`)
- **id:** `<1–34 Kleinbuchstaben a–z oder Ziffern, z. B. kante4k>`. Nicht erlaubt: eine id, die es schon gibt, und die
  Wörter `all`, `clock`, `random`, `test`, denn die Prüfwerkzeuge verstehen sie als Modus und prüfen dann nicht deine
  Fassung. Großbuchstaben oder längere ids scheitern an der Sprachprüfung (`blind.<id>` darf höchstens 40 Zeichen haben).

## Was du baust

Genau **eine Produktion** für den Zufallspool der Startseite, nach `docs/CONTRACT.md` und `docs/briefs/common.md`:
eine Datei `src/p/<id>.js`, die `Dream.add({ … })` aufruft (Bild als Shader `frag` oder `init`/`draw`, Musik über
`music(K, D)`, dazu `dur`, `fin` und `cta`). Wer die Startseite lädt, bekommt zufällig eine der Fassungen im Pool zu sehen.
Deine ist dann eine davon.

Das Thema ersetzt nur die Geschichte („vom Rauschen zur Ordnung“ wird zu deinem Thema). Alles andere aus
`common.md` gilt unverändert: 60 Sekunden, Aufbau in drei Phasen, `fin` 53 s, `cta` 54,5 s, ruhiges unteres Band, Ton,
Stil und die Definition of Done.

**Was diese Vorlage an `common.md` ändert, und nur das:** `common.md` erlaubt nur `src/p/<id>.js` und `verification/<id>/`,
weil die drei ersten Fassungen schon eingebunden waren. Eine neue Fassung muss sich selbst in den Pool eintragen. Deshalb
darfst du zusätzlich genau die Stellen 2, 3, 5, 7, 8 und 9 aus „Was du einträgst“ ändern und `site/p/<id>.js` mit dem Build
erzeugen. Die Regel „`node tools/build.mjs` nie ohne id“ bleibt bestehen: Baue mit `npm run build -- <id>`.

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
- **Keine Änderung an der Laufzeit.** `site/shell.js`, `site/navigation.*`, `site/source-view.*`, `site/i18n.js` und
  `site/index.html` bleiben, wie sie sind. Ausnahmen: deine id in `D.ids` (Punkt 3) und die `blind.<id>`-Einträge in den
  Sprachdateien (Punkt 7). Keine Kampagnen-Schalter, keine eigenen Build-Modi.

## Was du einträgst

1. `src/p/<id>.js`: die Produktion
2. `tools/budget.mjs`: `'<id>': <Obergrenze>` in `BUDGET`
3. `site/shell.js`: `'<id>'` in `D.ids`
4. `site/p/<id>.js`: entsteht mit `npm run build -- <id>`
5. `docs/PRODUCTIONS.md`: eine Zeile mit Name, id, Größe und zwei Sätzen zu Bild und Musik
6. `verification/<id>/`: entsteht mit `npm run verify -- <id>`
7. `site/i18n/de.js`: `blind.<id>`, die Beschreibung für blinde Menschen, also was man sieht und hört, nach dem Muster
   von `blind.4k` mit den Platzhaltern `{tag1}`, `{tag2}` und `{brand}`. Dazu dieselbe Beschreibung als Entwurf in jeder
   anderen angebotenen Sprachdatei unter `site/i18n/` und danach `npm run sync:languages -- --pin` (aktualisiert
   `src/i18n/languages.json` und `site/i18n/index.js`). Ohne diesen Eintrag bricht `npm run build:apex` mit „animation
   lacks a complete description“ ab. Das ist kein sichtbarer Text, sondern nur für Screenreader; Ablauf in
   `docs/LANGUAGES.md`.
8. `site/credits.js`: ein Eintrag für deine id mit `name` (der Name der Fassung), `model` (das Modell, das tatsächlich
   gearbeitet hat, mit Version und Stufe, z. B. „Claude Opus 5.5“), `built` (Datum der bestandenen Abnahme, `JJJJ-MM-TT`),
   `brief` (Thema und Bildidee in ein bis zwei deutschen Sätzen) und `prompt` (Link auf deine Datei aus Punkt 9 unter
   `https://github.com/Storypapst/dreambau/blob/main/apps/landing/docs/briefs/<id>.md`). Die Quelltextansicht zeigt das
   unter „Wie es entstand“. Das ist die einzige Stelle, an der ein Modell genannt wird.
9. `docs/briefs/<id>.md`: der Auftrag, wie du ihn bekommen hast, wörtlich: die drei Felder und jede Bild- oder Stilidee,
   die dir dazu gegeben wurde. Nichts weglassen und nichts dazuerfinden.

Die Quelltextansicht der Seite zeigt deine Fassung automatisch: Sie liest die Fassungen aus `D.ids`, und
`npm run build:apex` packt das ausgelieferte `p/<id>.js` als `p/<id>.src.js` dazu. Der Name aus Punkt 8 steht in der Ansicht.

## Abnahme

```sh
cd apps/landing
npm ci
npm run build -- <id>         # Größenbudget eingehalten
npm run check:languages -- --complete --release
npm run verify -- <id>        # Dauer, Phasen, Blitzsicherheit, Schriftzug, ruhiges unteres Band, Musik
npm run build:apex && npm run check:apex
node tools/e2e.mjs <id>       # Ton, Esc, reduzierte Bewegung, kein WebGL, keine Netzanfragen
```

Sieh dir außerdem den Kontaktbogen (`verification/<id>/frames/sheet.png`) mit eigenen Augen an und hör die Musik an.
Liefere einen Pull Request, der **nur** die neun Punkte oben ändert, und nenne darin das Modell, das tatsächlich
gearbeitet hat.
