# Blog

Das Blog (Logbuch) von dreambau.com unter `/blog/`: kurze Beiträge als Dateien, gebaut mit einem kleinen Generator in reinem Node, ohne Laufzeit-Abhängigkeit. Dieser Stand zeichnet die Liste und die Beitragsseite im Look "Logbuch" (Desktop und Handy, nur Deutsch) und zeigt sieben erfundene Beispiel-Beiträge. Er prüft Beitragsdateien nach den Regeln der Spezifikation (Abschnitt 5.2): jeder Fehler mit genauer Zeile, die Nummer eines Beitrags aus (Datum, Adresse). Es wird nichts veröffentlicht.

Voraussetzungen: Node 20 (siehe `.nvmrc` im Wurzelordner) und Docker. Die Browser-Prüfungen brauchen Chromium: `npx playwright install chromium` (oder `CHROMIUM_EXECUTABLE=/Pfad/zu/chromium`, wie bei `apps/landing`).

Für Entwickler — diese Befehle im Ordner `apps/blog` ausführen:

```sh
npm ci
npm run serve
npm run check
```

- `npm run serve` baut die Vorschau aus dem erfundenen Beispiel, startet einen nginx-Container und gibt die Adresse von `/blog/` aus. Strg-C stoppt und entfernt den Container.
- `npm run check` führt alle Prüfungen aus (`npm run check -- <Filter>` nur die passenden, `npm run check:browser` nur die im echten Chromium).
- `npm run check:tokens` vergleicht die Farb-Tokens in `src/tokens.css` mit denen von `/referenzen/` (`FAIL AC-1 ...`) und sucht von Hand getippte Farben in `src/blog.css`.
- `npm run build` und `npm run build:demo` bauen nach `dist/` bzw. `dist-demo/`; beide Ordner sind nicht im Git.

Wo was liegt: `labels.de.json` (die 29 Texte `blog.*`, die einzige Quelle der Beschriftungen), `footer.json` (Impressum und Datenschutz, `null` solange die Seite fehlt), `src/tokens.css`, `src/blog.css` (ausgeliefert als eine Datei `blog.css`: Tokens zuerst), `src/blog.js` (nur der Titel-Effekt auf Beitragsseiten), `src/lib/pages.mjs` (die Markup-Bausteine).

Beitragsdateien prüfen (alle Fehler in einem Lauf, Ausgabe `FAIL <Regel> <Datei>:<Zeile>: <was>`, Ausgabe leer und Exit 0 bei einer guten Datei, Exit 1 bei einem Fehler, Exit 2 bei falschem Aufruf):

```sh
node tools/check-post.mjs tests/fixtures/2026/ein-film-der-in-eine-mail-passt.md
node tools/slug.mjs "Größe & Maß"                      # groesse-mass
node tools/slug.mjs "Größe & Maß" --year 2026          # mit -2, -3 gegen origin/main und posts/removed.txt
node tools/check-post-pr.mjs                           # Dateiname, Reihenfolge, Adressschutz gegen origin/main
```

`check-post-pr` und `slug --year` lesen `refs/remotes/origin/main`; vorher `git fetch origin main` ausführen. Statt des Git-Standes nimmt `--base <Ordner>` eine Kopie von `posts/`. `--publish` und `--now <Zeitpunkt>` schalten die Regeln eines Veröffentlichungs-Builds dazu (kein Datum nach heute in Berlin, keine erfundenen Quell-Hosts, kein `example: true`).
