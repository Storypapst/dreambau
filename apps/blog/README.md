# Blog

Das Blog (Logbuch) von dreambau.com unter `/blog/`: kurze Beiträge als Dateien, gebaut mit einem kleinen Generator in reinem Node, ohne Laufzeit-Abhängigkeit. Dieser Stand zeichnet die Liste und die Beitragsseite im Look "Logbuch" (Desktop und Handy, nur Deutsch) und zeigt sieben erfundene Beispiel-Beiträge. Er prüft Beitragsdateien nach den Regeln der Spezifikation (Abschnitt 5.2): jeder Fehler mit genauer Zeile, die Nummer eines Beitrags aus (Datum, Adresse). Der Bau schreibt außerdem den Atom-Feed `feed.xml` (die 50 neuesten Beiträge mit dem vollen Text von "Warum lesenswert") und prüft ihn und den Ausgabebaum, bevor er etwas schreibt. Es wird nichts veröffentlicht.

Voraussetzungen: Node 20 (siehe `.nvmrc` im Wurzelordner) und Docker. Die Browser-Prüfungen brauchen Chromium: `npx playwright install chromium` (oder `CHROMIUM_EXECUTABLE=/Pfad/zu/chromium`, wie bei `apps/landing`).

Für Entwickler — diese Befehle im Ordner `apps/blog` ausführen:

```sh
npm ci
npm run serve
npm run check
```

- `npm run serve` baut die Vorschau aus dem erfundenen Beispiel, startet einen nginx-Container mit den Regeln aus Abschnitt 7.4 der Spezifikation (`ops/nginx-blog-test.conf`) und gibt die Adresse von `/blog/` aus: `/blog` leitet mit 308 auf `/blog/` um, eine fehlende Adresse und ein Jahresordner ohne Startseite (`/blog/2026/`) zeigen die echte 404-Seite mit Status 404. Das Verzeichnis ist schreibgeschützt als Ordner unter `/blog` eingehängt (Ordner 0755, Dateien 0644). Strg-C stoppt und entfernt den Container.
- `npm run check` führt alle Prüfungen aus (`npm run check -- <Filter>` nur die passenden, `npm run check:browser` nur die im echten Chromium).
- `npm run check:server` startet den nginx-Container (Image `nginx:1.27-alpine`, ersetzbar durch `BLOG_NGINX_IMAGE`) und prüft die Antworten von `/blog/` (V19 bis V25): Umleitungen, Typen, die echte 404-Seite, versteckte Pfade, Header und den Fall eines leeren Verzeichnisses (404 statt 403). Jeder Container heißt `blog-test-…` und wird am Ende entfernt (`docker ps --filter name=blog-test-` zeigt danach keinen).
- `npm run check:tokens` vergleicht die Farb-Tokens in `src/tokens.css` mit denen von `/referenzen/` (`FAIL AC-1 ...`) und sucht von Hand getippte Farben in `src/blog.css`.
- `npm run build` und `npm run build:demo` bauen nach `dist/` bzw. `dist-demo/`; beide Ordner sind nicht im Git.

Für den Betreiber: `ops/nginx-blog.additions.conf` ist der Text aus Abschnitt 7.4 für den echten nginx (eine Zeile in der `map`, dazu die Regeln im Server-Block); `ops/nginx-blog-test.conf` ist der Test-Text von Teamwork plus genau diese Zeilen und dient nur den Tests und `npm run serve`. Die Prüfung `static/nginx-text` (Teil von `npm run check`) stellt sicher, dass beide Blöcke Zeichen für Zeichen gleich sind.

Wo was liegt: `labels.de.json` (die 29 Texte `blog.*`, die einzige Quelle der Beschriftungen), `footer.json` (Impressum und Datenschutz, `null` solange die Seite fehlt), `src/tokens.css`, `src/blog.css` (ausgeliefert als eine Datei `blog.css`: Tokens zuerst), `src/blog.js` (nur der Titel-Effekt auf Beitragsseiten), `src/lib/pages.mjs` (die Markup-Bausteine).

Beitragsdateien prüfen (alle Fehler in einem Lauf, Ausgabe `FAIL <Regel> <Datei>:<Zeile>: <was>`, Ausgabe leer und Exit 0 bei einer guten Datei, Exit 1 bei einem Fehler, Exit 2 bei falschem Aufruf):

```sh
node tools/check-post.mjs tests/fixtures/2026/ein-film-der-in-eine-mail-passt.md
node tools/slug.mjs "Größe & Maß"                      # groesse-mass
node tools/slug.mjs "Größe & Maß" --year 2026          # mit -2, -3 gegen origin/main und posts/removed.txt
node tools/check-post-pr.mjs                           # Dateiname, Reihenfolge, Adressschutz gegen origin/main
```

`check-post-pr` und `slug --year` lesen `refs/remotes/origin/main`; vorher `git fetch origin main` ausführen. Statt des Git-Standes nimmt `--base <Ordner>` eine Kopie von `posts/`. `--publish` und `--now <Zeitpunkt>` schalten die Regeln eines Veröffentlichungs-Builds dazu (kein Datum nach heute in Berlin, keine erfundenen Quell-Hosts, kein `example: true`).

Feed und Ausgabe prüfen (ohne Netz, ohne Abhängigkeit; Ausgabe wie oben `FAIL <Regel> <Datei>:<Zeile>: <was>`, Exit 0 / 1 / 2):

```sh
npm run build:demo
node tools/check-feed.mjs dist-demo/public/feed.xml    # strenges XML 1.0, dann Atom 1.0 nach FD-1 bis FD-5 und AD-3
node tools/check-output.mjs dist-demo/public           # nur die Dateiformen aus 7.2, kein Punkt-Name, Adressen nur auf dreambau.com
```

Der Feed-Prüfer ist der Fallback aus der Spezifikation (Anhang D): ein eigener strenger XML-Leser (`src/lib/xml.mjs`) plus die Regeln FD-1 bis FD-5, weil ein fertiger Feed-Prüfer ohne Netz und ohne Abhängigkeit (BD-1) nicht zu haben ist. Im Browser liest `tests/browser/feed.check.mjs` den Feed zusätzlich mit dem XML-Parser von Chromium.
