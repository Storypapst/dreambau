# Lernfortschritt speichern

Spiel und Fortschritts-API laufen unter derselben Adresse. Für den lokalen Betrieb reichen Python 3.9 oder neuer und die mitgelieferte SQLite-Bibliothek.

Im Verzeichnis `kieselalarm` starten:

```sh
python3 backend/server.py
```

Das Spiel ist dann unter <http://127.0.0.1:8000/> erreichbar. Die Datenbank liegt standardmäßig in `backend/data/progress.sqlite3`. Bei einem Neustart mit derselben Datei bleiben die Profile erhalten. Mit `--database /pfad/zum/fortschritt.sqlite3` oder der Umgebungsvariable `KIESELALARM_DB` lässt sich der Speicherort wählen. Über `--port` und `--host` können Adresse und Port für einen Gerätetest eingestellt werden. Ein getrennt geöffneter HTML-Download speichert seinen Fortschritt auf dem Gerät.

## Schnittstelle für Web, iOS und Android

Alle Antworten der API verwenden JSON. Anfragen mit einem Rumpf senden `Content-Type: application/json`. Die Zugangsdaten für ein anonymes Profil bestehen aus seiner öffentlichen ID und einem geheimen, zufälligen Token. Der Server gibt dieses Token bei der Erstellung einmal aus und speichert seinen SHA-256-Hash. Die Bezeichnung des Spielers bleibt im Browser.

| Methode | Pfad | Anfrage und Ergebnis |
| --- | --- | --- |
| GET | `/api/v1/health` | Gibt `{"status":"ok","service":"kieselalarm","apiVersion":1}` zurück. |
| POST | `/api/v1/profiles` | Rumpf `{}`. Status 201 mit `profileId`, `token`, `revision: 0` und `progress: {}`. |
| GET | `/api/v1/profiles/{profileId}/progress` | Gibt den aktuellen Stand als `{"revision":1,"progress":{…}}` zurück. |
| PUT | `/api/v1/profiles/{profileId}/progress` | Erwartet `{"revision":1,"progress":{…}}`. Status 200 bestätigt den gespeicherten Stand mit der nächsten Revision. |

Für GET und PUT auf den Fortschritt ist der Header `Authorization: Bearer <token>` erforderlich. Ein fehlendes oder ungültiges Token ergibt 401. Jede Installation braucht das passende Paar aus ID und Token, um ein bestimmtes Profil zu öffnen. Ein neu angelegtes Profil startet leer. Native Clients können das Token im iOS-Schlüsselbund oder mithilfe des Android Keystore ablegen.

Das Feld `progress` enthält ein JSON-Objekt. Version 1 des Spiels verwendet `{"version":1,"events":{…}}`. Jeder Schlüssel in `events` ist die dauerhaft vergebene ID eines einzelnen Ereignisses. Die API speichert das vollständige Objekt und bewahrt weitere Felder, die ein Client darin mitsendet. Für die Interpretation der Aufgaben, Antworten und Übungen ist der Lerncode im Spiel zuständig. Ein vereinfachtes Beispiel für einen Schreibzugriff auf Revision 0 lautet:

```json
{
  "revision": 0,
  "progress": {
    "version": 1,
    "events": {
      "2272203e-88a6-441d-b353-1a1289a2b533": {
        "type": "answer",
        "taskId": "demo",
        "correct": true,
        "at": 1735689600000
      }
    }
  }
}
```

Wurde dieselbe Revision bereits geändert, antwortet die API mit 409 und `{"error":"revision_conflict","revision":2,"progress":{…}}`. Ein Client führt die Ereignisse anhand ihrer IDs zusammen und sendet die vereinigte Menge mit der zurückgegebenen Revision. Dieselbe Ereignis-ID zählt nur einmal. Nach einem Verbindungsabbruch liest der Client zunächst den Serverstand. Lokale Ereignisse können dadurch auch nach einer verlorenen Bestätigung erneut abgeglichen werden.

JSON-Anfragen dürfen bis zu 2 MiB groß sein. Größere Anfragen ergeben 413, fehlerhafte Daten 400 und ein falscher Medientyp 415. Ist SQLite vorübergehend gesperrt oder unerreichbar, antwortet die API mit 503 und einem `Retry-After`-Header. Der Client kann später erneut synchronisieren.

## Betrieb und Tests

Der mitgelieferte Entwicklungsserver lauscht standardmäßig auf der Loopback-Adresse. Für einen gehosteten Betrieb kann ein WSGI-Server die Factory `backend.server:create_app()` aus dem Projektverzeichnis laden. Dabei gehören das Spiel und `/api/v1/` unter dieselbe HTTPS-Domain und die SQLite-Datei auf ein dauerhaftes, schreibbares Volume. Zum Sichern bei laufendem Betrieb kann ein Betreiber die SQLite-Backup-Funktion verwenden. Die Datenbank, ihre Journaldateien sowie Tokens gehören ausschließlich in den privaten Datenbereich.

Die Integrationstests verwenden für jeden Fall eine eigene temporäre Datenbank. Sie prüfen unter anderem Zugriffstrennung, gleichzeitige Änderungen, dauerhafte Speicherung und die Auslieferung der Spieldateien.

```sh
python3 -B -m unittest discover -s backend -v
```
