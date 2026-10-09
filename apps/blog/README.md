# Blog

Das Blog (Logbuch) von dreambau.com unter `/blog/`: kurze Beiträge als Dateien, gebaut mit einem kleinen Generator in reinem Node, ohne Laufzeit-Abhängigkeit. Dieser Stand zeigt einen erfundenen Beispiel-Beitrag als Liste und als Beitragsseite und prüft Beitragsdateien nach den Regeln der Spezifikation (Abschnitt 5.2): jeder Fehler mit genauer Zeile, die Nummer eines Beitrags aus (Datum, Adresse). Es wird nichts veröffentlicht.

Voraussetzungen: Node 20 (siehe `.nvmrc` im Wurzelordner) und Docker.

Für Entwickler — diese Befehle im Ordner `apps/blog` ausführen:

```sh
npm ci
npm run serve
npm run check
```

- `npm run serve` baut die Vorschau aus dem erfundenen Beispiel, startet einen nginx-Container und gibt die Adresse von `/blog/` aus. Strg-C stoppt und entfernt den Container.
- `npm run check` führt alle Prüfungen aus (`npm run check -- <Filter>` nur die passenden).
- `npm run build` und `npm run build:demo` bauen nach `dist/` bzw. `dist-demo/`; beide Ordner sind nicht im Git.

Beitragsdateien prüfen (alle Fehler in einem Lauf, Ausgabe `FAIL <Regel> <Datei>:<Zeile>: <was>`, Ausgabe leer und Exit 0 bei einer guten Datei, Exit 1 bei einem Fehler, Exit 2 bei falschem Aufruf):

```sh
node tools/check-post.mjs tests/fixtures/2026/ein-film-der-in-eine-mail-passt.md
node tools/slug.mjs "Größe & Maß"                      # groesse-mass
node tools/slug.mjs "Größe & Maß" --year 2026          # mit -2, -3 gegen origin/main und posts/removed.txt
node tools/check-post-pr.mjs                           # Dateiname, Reihenfolge, Adressschutz gegen origin/main
```

`check-post-pr` und `slug --year` lesen `refs/remotes/origin/main`; vorher `git fetch origin main` ausführen. Statt des Git-Standes nimmt `--base <Ordner>` eine Kopie von `posts/`. `--publish` und `--now <Zeitpunkt>` schalten die Regeln eines Veröffentlichungs-Builds dazu (kein Datum nach heute in Berlin, keine erfundenen Quell-Hosts, kein `example: true`).
