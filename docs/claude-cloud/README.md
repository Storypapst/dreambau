# ORISO in Claude Code Cloud einrichten

Dieses Template installiert die Dreambau-Werkzeuge, einen festen Node20.20.2 und das Chromium aus derselben gesperrten Playwright-Version. Die Installation liest keine Gateway-Zugangsdaten und führt keine Anmeldung durch. Die tatsächliche Claude-Proxy-Anmeldung und der Zugriff des Browsers werden erst nach dem Speichern der Netzwerk-Secrets im ersten Chat geprüft.

## 1. Umgebung auf dem anderen Computer anlegen

Öffne Claude Code im Browser und bearbeite die Cloud-Umgebung. Wenn du zunächst ein öffentliches Repository auswählen musst, verwende **Storypapst/dreambau**. Der Setup-Code wird unabhängig davon aus genau diesem öffentlichen Repository und einem unveränderlichen Commit geladen. Für spätere Produktaufgaben zusätzlich das tatsächliche ORISO-Repository anschließen. **Storypapst/dreambau muss auch später angeschlossen bleiben**, weil Claude selbst öffentliche `codeload.github.com`-Archivabrufe nur für angeschlossene Repositories zulässt. Sonst kann ein erneuter Cache-Aufbau scheitern. Der Dreambau-Werkzeugcache ist kein Produkt-Checkout. Siehe [Claude-Dokumentation: Cloud environments, GitHub proxy](https://code.claude.com/docs/en/cloud-environments).

| Feld | Eintrag |
| --- | --- |
| **Name** | `oriso` (bestehenden Entwurf dieses Namens weiterverwenden) |
| **Network access** | **Full** |
| **Variables** | Für die unten genannten Werte nicht erforderlich: Die installierten Starter laden sie auch ohne interaktive Shell. Keine Tokens als Variables eintragen. |
| **Setup script** | Den vollständigen, geprüften Loader aus Schritt2 einfügen. |
| **Network secrets** | Nach dem ersten Speichern der Umgebung die zwei Einträge aus Schritt3 hinzufügen. Sie sind während Setup nicht verfügbar. |

`Full` wird für öffentliche npm-/Node-/Chromium-Downloads, GitHub, das Produkt und die aktuellen Graphen benötigt. Die Zugangsdaten werden trotzdem jeweils auf genau einen Gateway-Host begrenzt.

Die Starter setzen automatisch diese nicht geheimen Werte:

```text
TEST_ACCESS_IDENTITY=claude-cloud-oriso-dev
EVIDENCE_IDENTITY=claude-cloud-oriso-evidence-dev
TEST_ACCESS_AUTH_MODE=network-proxy
EVIDENCE_AUTH_MODE=network-proxy
TEST_ACCESS_URL=https://dreambau.com/testmails/api/v1
EVIDENCE_URL=https://evidence.dreambau.com/api/v1
EVIDENCE_PUBLIC_URL=https://evidence.dreambau.com
DREAMBAU_BROWSER_PROXY=network-proxy
```

`HTTPS_PROXY` muss von der Claude-Laufzeit bereitgestellt werden. Hier keinen erfundenen Proxy eintragen. Die Starter funktionieren mit absolutem Pfad auch in einer nicht interaktiven Shell. Wenn ein Chat die Programme nicht über den Namen findet, steht der vollständige Aufruf in `CLAUDE.md`.

## 2. Den Loader für einen veröffentlichten Commit übernehmen

Der abschließende Liefer-Chat enthält den fertigen Copy-paste-Loader sowie einen öffentlichen Link auf genau die passende Version dieser Anleitung. Verwende den vollständigen Block; ersetze den Commit nicht durch `main` oder einen Branch.

Ein Entwickler kann den Block für einen bereits geprüften und öffentlich erreichbaren Commit erneut erzeugen:

```sh
bash scripts/print-cloud-loader.sh <40-stelliger-veröffentlichter-Commit>
```

Der erzeugte Loader lädt `scripts/bootstrap-agent-environment.sh` von `raw.githubusercontent.com/Storypapst/dreambau/<COMMIT>/…`, prüft dessen fest eingebettete SHA256-Prüfsumme **vor** der Ausführung und reicht denselben Commit an die Installation weiter. Er benötigt weder einen GitHub-Token noch einen privaten Drive-Pfad. Ein Commit, der nur lokal vorliegt, ist noch keine öffentlich installierbare Lieferung.

Claude cached den vorbereiteten Zustand; die reale Setup-/Cache-Zeit muss innerhalb der Plattformgrenze liegen (die offizielle Anleitung nennt ungefähr fünf Minuten). Ein kalter Ubuntu-Test unter x86_64-Emulation misst den Installer, ersetzt diese tatsächliche Claude-Cache-Abnahme aber nicht. Die Installation verwendet Ubuntu24.04 x86_64. Sie installiert Systembibliotheken, Git/gh, exakt Node20.20.2, `npm ci` aus dem Commit, `test-access`, `dreambau-evidence`, `dreambau-cloud-doctor` und das gesperrte Chromium. Ein zweiter Aufruf gleicht dieselben gesperrten Abhängigkeiten erneut ab. Die bestehenden Teile von `~/.claude/CLAUDE.md` und der Projekt-`CLAUDE.md` bleiben erhalten; die globale Datei trägt die Regeln auch in spätere Produkt-Checkouts weiter; nur ein klar markierter Dreambau-Block wird gepflegt. Es werden keine Zugangsdaten-Dateien geschrieben.

## 3. Zwei vorhandene Werte aus Infisical kopieren

Öffne [Infisical](https://secrets.dreambau.com). Der vorbereitete Pfad lautet:

**ORISO Test Access → Development → `/automation/claude-cloud/oriso-dev`**

Dort liegen die zwei technischen Secret-Werte. **Kopiere die bestehenden Werte; erzeuge keine neuen.** Schreibe sie nicht in einen Chat, eine Variable, das Setup-Script oder eine Datei. Die serverseitige Freigabe ist an die zugehörigen Werte gebunden. Die initial registrierten Cloud-Identitäten sind bis **18.Januar2027** gültig und müssen vor Ablauf erneuert werden. Der Doctor prüft bei jedem Lauf, ob die aktuelle Anmeldung noch funktioniert.

Speichere die Umgebung zunächst und gehe dann auf **Edit environment → Add secret**. Lege diese zwei Einträge an:

| Feld | Test-Access-Eintrag | Evidence-Eintrag |
| --- | --- | --- |
| **Name** | `CLAUDE_CLOUD_TEST_ACCESS_TOKEN` | `CLAUDE_CLOUD_EVIDENCE_TOKEN` |
| **Allowed websites** | `dreambau.com` | `evidence.dreambau.com` |
| Header-Typ | **Authorization** | **Authorization** |
| **Prefix** | **Bearer** | **Bearer** |
| **Value** | Wert des gleichnamigen Infisical-Secrets | Wert des gleichnamigen Infisical-Secrets |

Bei **Value** nur den nackten Wert einfügen, ohne `Bearer ` davor. Keine Wildcards, URL-Pfade oder zusätzlichen Websites eintragen. Claude ergänzt den Authorization-Header im Netzwerk-Proxy. Der Agent in der VM liest keinen Token und sendet selbst keinen Authorization-Header. Ein drittes Infisical-Netzwerk-Secret ist nicht nötig: Der Hub ist der kontrollierte Zugang zu Infisical.

Die Hub-Identität braucht Projekt `oriso`, die Umgebungen `dev` und `production-test` sowie die für die jeweilige Aufgabe genehmigten Aktionen. `production-test` ist ausschließlich der synthetische Mailbox-Pool; das Produktziel bleibt **Dev**, niemals Produktion. Die Evidence-Identität ist für `oriso/dev` vorgesehen. Das Evidence-Leseprobeverfahren kann diese Evidence-Projekt-/Umgebungsscope selbst nicht auslesen; deshalb wird diese Grenze ausdrücklich ausgegeben.

## 4. Ersten Chat starten

Starte nach dem Speichern der Secrets einen frischen Cloud-Chat mit dieser Anweisung:

```text
Lies die installierten Dreambau-Betriebsregeln aus CLAUDE.md und die routing.json.
Führe dreambau-cloud-doctor --browser aus; nutze den absoluten Aufruf aus CLAUDE.md,
falls die Shell den Namen nicht findet. Berichte getrennt: öffentliche Gesundheit,
Hub-Metadatenberechtigung für oriso/dev, Berechtigung für den production-test-
Mailbox-Pool, authentifiziertes Evidence-Lesen, dessen Scope-Grenze,
GitHub-Anmeldung und Chromium-Verbindung zu Dev. Gib keine Datensätze, Tokens,
Passwörter, OTPs oder Browser-Zustandsdateien aus. Erstelle oder lösche keine
Accounts und aktiviere keinen Zeitplan. Produkt-Login, Factory/Träger-Cleanup
und eine zweistündige Abnahme sind mit diesem Check noch nicht nachgewiesen.
```

Dasselbe steht in der installierten Datei `instructions/FIRST_RUN.md`. Der Doctor liefert eigene Zeilen für alle Prüfpunkte und beendet sich bei einem fehlgeschlagenen Prüfpunkt mit Exit1. Ein grüner API-Test ist kein Browser- oder Produkt-Login-Test. Ein Browser-Test ohne `--browser` wird als **SKIP** ausgegeben.

| Ausgabe | Bedeutung und nächste Handlung |
| --- | --- |
| `PASS public evidence health` | Die öffentliche Evidence-Gesundheitsprüfung antwortet; das beweist keine Anmeldung. |
| `PASS Hub dev metadata` und `PASS Hub production-test metadata` | Beide angefragten Hub-Scopes sind lesbar. Nur Anzahl, keine Accounts werden ausgegeben. |
| `PASS Evidence authenticated read` | Die Evidence-Leseberechtigung funktioniert. Projekt-/Umgebungsscope ist weiterhin nicht introspektiert. |
| `PASS Chromium connectivity` | Der ausgewählte Browser-Transport erreicht die Dev-Seite. Produkt-Login wurde noch nicht geprüft. |
| `FAIL …` | Den genannten Prüfpunkt und die fehlende Konfiguration prüfen. Bei Gateway-Problemen zuerst Host, Bearer-Präfix, vorhandenen Secret-Wert und Gültigkeit kontrollieren; keine Passwortänderung versuchen. |

Der GitHub-Check liest genau den REST-Pfad `repos/<owner>/<repo>` aus dem Origin des aktuellen Produkt-Checkouts; er verlangt keine kontoweite `/user`-Freigabe. Bei einem nicht standardmäßigen Origin kann `DREAMBAU_GITHUB_REPOSITORY=owner/repo` für ein tatsächlich angeschlossenes Repository gesetzt werden. Ein grüner Check beweist nur dessen Lesbarkeit, keine Schreibrechte und keine weiteren Repositories.

Ein leeres Metadaten-Ergebnis kann eine gültige Berechtigung haben, ohne einen verfügbaren Testaccount zu beweisen. Der Doctor greift keine Geheimnisse oder OTPs ab und legt keinen Testlauf an.

## 5. Wiederverwendung und Grenzen

Die installierte Datei `instructions/REVIEWER_PROMPT.md` enthält den wiederkehrenden Auftrag: offene PRs in den angeschlossenen/ausdrücklich konfigurierten Repositories finden, geänderte Heads prüfen, verifizierte kleine Korrekturen auf erlaubten Branches/Korrektur-PRs ausführen und den exakt getesteten Head dokumentieren. Unveränderte, bereits nachgewiesene Heads werden übersprungen. Vor einem Schreibzugriff wird der Autoren-Head erneut gelesen; fremde Änderungen werden niemals überschrieben oder per Force-Push ersetzt. Sie fordert Live-Graphen über `https://understand.oriso.org/ua/current/manifest.json`, passende ADRs und bei UI-Arbeit Storybook. Branches und PRs gehen von/gegen `dev`; ORISO-E2E behält seine `pre-dev`-Integrationsausnahme. Der Laufzeit-Test findet trotzdem auf Dev statt. Es gibt keinen lokalen Graph-Fallback und keinen Zugriff auf einen privaten Drive/Core, dessen Inhalte nicht geliefert wurden.

Eine vorhandene Factory zum beliebigen Erzeugen von Trägern, deren vollständige Bereinigung, ein nachgewiesener Produkt-Login und ein stabiler zweistündiger Betrieb sind separate Folgearbeiten. Dieses Template behauptet diese Funktionen nicht. Den bereits angeforderten wiederkehrenden Auftrag erst nach tatsächlicher erfolgreicher Cloud-Abnahme aktivieren. Dafür ist keine neue pauschale Freigabe nötig; fehlende Benutzerkonfiguration oder echte Infrastruktur bleibt trotzdem ein Blocker. Vorhandene Run-Leases und begrenzter Katalog-Sync dürfen im Rahmen echter Berechtigungen verwendet werden. Wiederverwendbare Pool-Accounts bleiben bestehen; sie sind keine wegwerfbaren Fixtures. Der Agent merged niemals seine eigenen PRs. Nachweise benennen die tatsächlichen synthetischen Akteure mit Anzeigename/E-Mail und zeigen Produktscreenshots, aber niemals Zugangsdaten oder Browser-Zustandsdateien.

Auf macOS unterstützt derselbe Installer `--auth-mode machine-token`; er erhält den bestehenden Keychain-/geschützten Credential-Datei-Pfad. Vorhandene persönliche Identitäten werden über `TEST_ACCESS_IDENTITY` und `EVIDENCE_IDENTITY` gewählt. Node20.20.2 für macOS arm64/x86_64 wird genauso per Prüfsumme installiert. Ohne diese Voraussetzungen/Identitäten ist keine lokale Anmeldung behauptet. `--node-dir` erlaubt bewusst einen bereits vertrauenswürdig installierten exakten Node20.20.2; `--skip-system-deps` ist nur für bereits vorbereitete Rechner gedacht.

Für reproduzierbare Offline-Installationsnachweise kann ein Entwickler zusätzlich `--source-dir <sauberer-Commit-Checkout>` mit dessen vollständigem `--revision` verwenden. Es wird ausschließlich `git archive` des Commits verwendet; private/ungetrackte Dateien werden nicht übernommen. Das ist ein lokaler Nachweis und keine öffentliche Download-Abnahme.
