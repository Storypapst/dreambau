# Teamwork

Teamwork ist das öffentliche Verzeichnis der Programme des Teams: eine Seite, die jedes Programm als Kachel zeigt. Dieser Ordner
(`apps/teamwork`) gehört zum Monorepo `Storypapst/dreambau`, hat sein eigenes `package.json` und seine eigene
`package-lock.json`; alle Befehle unten gelten in diesem Ordner, nicht im Wurzelordner. Die Spezifikation steht im privaten
Repository als `Storypapst/dreambau-docs#23`.

Dieses README ist bewusst kurz. Es sagt nur, wie man installiert, die Seite startet und die Prüfungen laufen lässt; die
vollständige Fassung kommt mit dem letzten Ticket.

## Installieren

Voraussetzungen sind Node 20 und Docker: Die Seite wird von einem echten nginx in einem Container ausgeliefert, damit die
Prüfungen dieselben Header sehen wie später der Server.

```sh
cd apps/teamwork
npm ci
npx playwright install chromium   # einmalig, für die Prüfungen
```

## Die Seite ansehen

```sh
npm run serve
```

Der Befehl startet den nginx-Container mit der Beispiel-Programmliste (`programs.example.json`), wartet, bis die Seite
antwortet, und gibt die Adresse von `/teamwork/` aus (`http://127.0.0.1:<Port>/teamwork/`). Mit Strg-C wird der Container
gestoppt und entfernt.

Mit `npm run serve -- --list <Datei>` zeigt die Seite die Programme aus einer eigenen Programmliste, alle als erreichbar
markiert. So lässt sich eine Liste ansehen, die nicht im Repository liegt.

## Prüfungen laufen lassen

```sh
npm run check             # alle Prüfungen: eine PASS- oder FAIL-Zeile je Prüfung und eine Summe
npm run check -- c28-     # nur die Prüfungen, deren Name so beginnt (oder ein Pfad wie tests/e2e)
npm run verify            # wie check, schreibt zusätzlich verification/report.json
```

Eine Prüfung kann nicht übersprungen werden: Findet der Lauf keine Prüfung oder schlägt eine fehl, endet er mit einem
Fehlercode.
