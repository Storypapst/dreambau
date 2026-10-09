# Blog

Das Blog (Logbuch) von dreambau.com unter `/blog/`: kurze Beiträge als Dateien, gebaut mit einem kleinen Generator in reinem Node, ohne Laufzeit-Abhängigkeit. Dieser Stand zeigt einen erfundenen Beispiel-Beitrag als Liste und als Beitragsseite. Es wird nichts veröffentlicht.

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
