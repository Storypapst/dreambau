# Teamwork

Teamwork ist das öffentliche Verzeichnis der Programme des Teams. Jedes Programm behält seine eigene Anmeldung. Dieses öffentliche Repository enthält ein erfundenes Beispiel, die statische Seite und eine Statusprüfung. Die echte Programmliste bleibt in der privaten Konfiguration des Operators.

Die freigegebene Spezifikation und die Betriebsanleitungen stehen in Storypapst/dreambau-docs#23. Die Seite kann als Entwurf mit den sichtbaren Rechtstext-Platzhaltern veröffentlicht werden. Die spätere Freigabe und der Link auf der Startseite benötigen bestätigte Rechtstexte. Eine gültige leere Programmliste zeigt „Noch keine Programme eingetragen.“

## Installieren, prüfen und lokal ansehen

Die Prüfungen benötigen Node 20, Python ab 3.8, Docker und OpenSSL für die Testzertifikate. Sie verwenden die festgelegte Playwright-Version, deren Chromium und einen echten nginx-Container. Jede Prüfung schließt die Browser und Container, die sie selbst gestartet hat.

Die Seite besteht aus vier unveränderten statischen Dateien. Es gibt keinen Compiler und keinen zusätzlichen Build-Befehl. Vor einer Veröffentlichung werden die Dateien geprüft; der private Publisher übernimmt den geprüften Seitenordner.

Für Entwickler — diese Befehle im Teamwork-Ordner ausführen:

```sh
npm ci
npx playwright install chromium
npm run serve
npm run check
npm run verify
```

Die Vorschau verwendet die erfundene Beispielliste. Eine Vorschau mit einer privat zugeordneten Datei bleibt lokal; sie veröffentlicht nichts und bestätigt keine echte Programmliste.

Für Operatoren — den Dateinamen aus der privaten Zuordnung verwenden:

```sh
npm run serve -- --list "${PRIVATE_LIST:?}"
```

## Status und Daten

Die Statusprüfung validiert die Liste, bevor sie ein Programm anspricht. Sie veröffentlicht nur die freigegebenen öffentlichen Felder. Eine HTTP-Antwort unter 500 gilt als erreichbar. Die Prüfung folgt keinen Weiterleitungen, liest keine Antwortinhalte und sendet keine Zugangsdaten oder Cookies. Fehlgeschlagene Anfragen werden nach 30 Sekunden wiederholt. Höchstens acht Anfragen laufen gleichzeitig; nach fünf Minuten endet der gesamte Lauf. Die beiden öffentlichen Dateien werden als kompaktes UTF-8-JSON atomar ersetzt. Geänderte Listen bleiben als datierte Kopien in der privaten Historie erhalten; ältere Kopien werden nicht gelöscht.

Für Operatoren — alle Dateipfade kommen aus der privaten Konfiguration:

```sh
python3 status/teamwork_status.py --list "${PRIVATE_LIST:?}" --validate
python3 status/teamwork_status.py --list "${PRIVATE_LIST:?}" --check-only
python3 status/teamwork_status.py --list "${PRIVATE_LIST:?}" \
  --out "${PUBLIC_DATA_DIRECTORY:?}" --history "${PRIVATE_HISTORY_DIRECTORY:?}"
```

Für Entwickler — Rückgabewerte und Laufvertrag:

```text
0 = erfolgreich
2 = ungültige Eingabe; keine Anfragen oder Veröffentlichung
3 = Datei- oder Historienfehler; öffentliche Ausgabe bleibt erhalten
4 = Laufzeitgrenze erreicht; öffentliche Ausgabe bleibt erhalten
--validate: keine Anfragen und keine Schreibzugriffe
--check-only: Anfragen, aber keine öffentliche Ausgabe oder Historienkopie
Service/Timer: portable Vorlagen; der Operator ordnet @PYTHON@, @SCRIPT@,
@LIST@, @OUT@ und @HISTORY@ privat zu.
Rhythmus: stündlich; Status älter als drei Stunden wird unbekannt.
```

Die Seite lädt beide Dateien ohne Cache vom eigenen Ursprung und begrenzt das Laden auf acht Sekunden. Solange sie sichtbar ist, fragt sie alle zehn Minuten erneut an. Für das Statusalter verwendet sie die Serverzeit. Bei fehlendem oder altem Status zeigt sie alle gültigen Programme und markiert deren Status als unbekannt. Nach einer fehlgeschlagenen Aktualisierung bleibt der letzte nutzbare Zustand stehen. Bei reduzierter Bewegung bleibt der Zeichenhintergrund ruhig; der Namenseffekt und Übergänge entfallen.

## Veröffentlichen und zurücknehmen

Der private Publisher installiert nur die vier Seitendateien. Datendateien und unbekannte Dateien bleiben erhalten. Er legt eine geprüfte Rücknahmekopie an und installiert die Einstiegsseite zuletzt. Schlägt die öffentliche Abnahme fehl, stellt er die bisherigen Dateien wieder her. Routing, Berechtigungen, Timer, private Zuordnung und Wiederherstellung beschreibt die freigegebene private Betriebsanleitung. Serveradressen, Serverpfade und echte Programme gehören nicht in dieses Repository.

Die folgenden Befehle verwenden ausschließlich Variablen aus dieser privaten Zuordnung. Der Seitenordner und das Abnahmeskript müssen aus demselben geprüften Quellstand stammen. Auch die Node-20-Laufzeit wird dort zugeordnet. Der erste Befehl zeigt nur den Veröffentlichungsplan; erst die bereits autorisierte Anwendung schreibt Dateien.

Für Operatoren — Node 20 und Veröffentlichung mit der privaten Zuordnung:

```sh
export PATH="${NODE20_BIN_DIRECTORY:?}:$PATH"

# Plan anzeigen; keine Änderungen auf dem Server.
python3 "${DREAMBAU_DOCS_CHECKOUT:?}/tools/teamwork-publish/teamwork_release.py" \
  --host "${TEAMWORK_OPERATOR_HOST:?}" --site "${TEAMWORK_PUBLIC_DIRECTORY:?}" \
  --releases "${TEAMWORK_RELEASE_DIRECTORY:?}" --public "${PUBLIC_ORIGIN:?}" \
  --dist "${TEAMWORK_PAGE_BUILD:?}"

# Autorisierte Entwurfsveröffentlichung; die öffentliche Abnahme muss bestehen.
python3 "${DREAMBAU_DOCS_CHECKOUT:?}/tools/teamwork-publish/teamwork_release.py" \
  --host "${TEAMWORK_OPERATOR_HOST:?}" --site "${TEAMWORK_PUBLIC_DIRECTORY:?}" \
  --releases "${TEAMWORK_RELEASE_DIRECTORY:?}" --public "${PUBLIC_ORIGIN:?}" \
  --dist "${TEAMWORK_PAGE_BUILD:?}" --apply \
  --acceptance-script "${TEAMWORK_PUBLIC_ACCEPTANCE_SCRIPT:?}"
```

Bei der Rücknahme stammt der Name der geprüften Rücknahmekopie ebenfalls aus der privaten Zuordnung. Zuerst wird der Plan geprüft. Die autorisierte Anwendung stellt nur die Seitendateien wieder her; sie verändert keine Programmliste oder Statusdatei. Der Rücknahmebefehl benötigt kein Abnahmeskript.

Für Operatoren — Rücknahme planen und anschließend autorisiert anwenden:

```sh
python3 "${DREAMBAU_DOCS_CHECKOUT:?}/tools/teamwork-publish/teamwork_release.py" \
  --host "${TEAMWORK_OPERATOR_HOST:?}" --site "${TEAMWORK_PUBLIC_DIRECTORY:?}" \
  --releases "${TEAMWORK_RELEASE_DIRECTORY:?}" --public "${PUBLIC_ORIGIN:?}" \
  --rollback "${TEAMWORK_RELEASE_NAME:?}"

python3 "${DREAMBAU_DOCS_CHECKOUT:?}/tools/teamwork-publish/teamwork_release.py" \
  --host "${TEAMWORK_OPERATOR_HOST:?}" --site "${TEAMWORK_PUBLIC_DIRECTORY:?}" \
  --releases "${TEAMWORK_RELEASE_DIRECTORY:?}" --public "${PUBLIC_ORIGIN:?}" \
  --rollback "${TEAMWORK_RELEASE_NAME:?}" --apply
```

Das öffentliche Abnahmeskript nimmt einen Ursprung entgegen. Es schreibt bereinigtes JSON und liefert bei einem Fehler einen Rückgabewert ungleich null.

Für Operatoren — die öffentliche Abnahme separat und ohne Schreibzugriff ausführen:

```sh
node tests/public-acceptance.mjs "${PUBLIC_ORIGIN:?}"
```

Für Entwickler — Veröffentlichungsvertrag:

```text
Seitendateien: index.html, teamwork.css, teamwork.js, datenschutz.html
Statusausgabe: data/programs.json und data/status.json
Normale Entwurfsveröffentlichung: Rechtstext-Platzhalter bleiben erlaubt.
--go-live: der private Publisher verweigert jede verbliebene [[ Markierung.
Öffentliche Abnahme: kanonische Route, genaue CSP ohne doppelte Direktiven,
Sicherheitsheader, erlaubte öffentliche Felder, Status jünger als zwei Stunden,
Desktop/Handy, Tastatur, Tippflächen, Datenschutz und Rücknavigation,
Konsole, nur Anfragen zum eigenen Ursprung und kein Browserspeicher.
Echte Programme und bestätigte Rechtstexte: Eingaben des Operators.
```

Die Prüfungsbilder enthalten ausschließlich erfundene Programme. Der Bericht hält die tatsächlich ausgeführten Prüfungen fest. Die öffentliche Abnahme und die Navigation eines echten Nutzers durch echte Programme bleiben eigene Nachweise nach der Veröffentlichung.
