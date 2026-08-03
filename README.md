# Dreambau Testmails Registry

Passwordgeschützte Verwaltung der 180 Simpsons-Testpostfächer. Zugangsdaten kommen ausschließlich aus einem gemounteten Kubernetes Secret; editierbare Testmetadaten liegen in SQLite auf einem PVC.

## Betrieb

Die Anwendung läuft als Einzelreplica `wcr/testmails`. Releases liegen getrennt unter `/root/releases/testmails`; das aktuelle Manifest verwendet `dreambau-testmails:0.10.4-fixed-creds-6fc95bf` und Infisical als Registry-Provider.

```bash
ssh m4dreambau 'kubectl get pod,svc,ingress,pvc -n wcr -l app.kubernetes.io/name=testmails'
ssh m4dreambau 'kubectl logs deployment/testmails -n wcr --tail=100'
```

Secrets werden ausschließlich aus stdin erzeugt. Das Account-JSON kommt aus Keychain-Service `dreambau-test-mailbox`; der gemeinsame Login aus `dreambau-testmails-auth`. Private S/MIME-Identitäten bleiben im Service `dreambau-test-smime` und werden nie in die Anwendung kopiert.

## Verifikation

Die unterstützte Node-Version steht in `.nvmrc` und entspricht dem Basis-Image
des Dockerfiles (`node:20-bookworm-slim`). Auf neueren Node-Versionen schlägt
die Testsuite fehl: Node 26 belegt `localStorage` global, wodurch die
jsdom-Umgebung von vitest ihre eigene Implementierung nicht mehr einsetzt.

Lokal:

```bash
npm ci
npm run lint
npm test
npm run build
```

Vollständig im Container — dieselbe Laufzeit, die auch ausgeliefert wird, damit
ein grünes Ergebnis weder von der Node-Version der Workstation noch von lokal
installierten Playwright-Browsern abhängt:

```bash
docker build --target verify -t dreambau-testmails:verify .
```

Die `verify`-Stage führt Lint, Tests und Build aus und schlägt fehl, sobald ein
Gate rot ist. Das ausgelieferte `runtime`-Image enthält sie nicht.

## Test Access API v1

Maschinen greifen mit einzeln widerrufbaren Bearer-Tokens auf die projekt- und
aktionsgescopte API
unter `/testmails/api/v1` zu. Die Datei
`/run/secrets/test-access/machine-identities.json` enthält ausschließlich
SHA-256-Token-Hashes, Projekt-/Umgebungs-Scopes, Ablaufzeit und Widerrufszeit;
nie die Tokenwerte selbst.

## PR Evidence Gateway

Zweiter, eigenständig deploybarer Dienst im selben Repository: er nimmt
Screenshots, Videos, Playwright-Reports, Traces und Logs entgegen, prüft sie und
verknüpft sie mit dem zugehörigen GitHub-PR. Die Testmails-Anwendung bleibt davon
unberührt — eigener Entrypoint (`src/evidence/server/index.ts`), eigenes
`Dockerfile.evidence`, eigene SQLite-Datei.

```bash
npm run evidence:dev        # Gateway lokal starten
npm run evidence:test       # nur die Evidence-Tests
npm run evidence:build      # nach dist/evidence bauen
npm run evidence:install    # portables dreambau-evidence CLI installieren
```

Das Gateway hält als einziger Prozess MinIO-Zugangsdaten und gibt niemals eine
Bucket-Adresse an einen Client. Uploads laufen über projektgebundene Machine
Identities (`evidence:upload`, `evidence:publish`, `evidence:read`,
`evidence:archive`) aus derselben Datei wie die Test-Access-Identitäten.

Jeder Upload durchläuft einen Preflight (Dateiname, Magic Bytes gegen
Content-Type, Größenlimits) und danach eine Verarbeitung, die Bildmetadaten
entfernt, Videos nach MP4/H.264/AAC normalisiert und Logs, Reports und
Archivinhalte auf Secret-Muster prüft. Was auffällt, landet in `quarantine` und
bekommt keine öffentliche URL — es gibt keine automatische Schwärzung.

Veröffentlicht wird zweistufig: `stage: "prepare"` reserviert die öffentliche ID
und liefert die Adressen, die eine Veröffentlichung erzeugen würde, ohne den Lauf
erreichbar zu machen; `stage: "commit"` schaltet frei und speichert die
Kommentar-URL im selben Schritt. So existiert nie eine öffentliche Adresse,
bevor der Pull Request sie festhält.

### dreambau-evidence CLI

`npm run evidence:install` legt das CLI unter `~/.local/bin/dreambau-evidence`
ab und ändert die eigene Shell nicht. Liegt `~/.local/bin` nicht im `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Das CLI ermittelt Repository, Commit und offenen PR selbst:

```bash
dreambau-evidence upload redirect.png \
  --project oriso --environment pre-dev --result PASS \
  --title "Invitation redirect verified" \
  --caption "Redirect and landing page validated" \
  --publish
```

Ohne offenen PR bricht es ab; `--draft` erlaubt einen privaten Lauf ohne
öffentliche Adresse. Hat ein Branch mehrere offene PRs, ist `--pr` Pflicht, und
ein Upload gegen einen PR mit weitergewandertem Head verlangt ausdrücklich
`--allow-older-commit`.

Das Token kommt aus dem Keychain-Service `dreambau-evidence`, der GitHub-Zugriff
aus der vorhandenen `gh`-Anmeldung — das Gateway besitzt keinen eigenen
GitHub-Token. Weder Token noch Kommentartext stehen je in einer Argumentliste;
der Kommentar wird über stdin übergeben.

Der Kommentar ist pro Run idempotent: derselbe Lauf aktualisiert seinen eigenen
Kommentar, ein anderer Lauf am selben PR bekommt einen eigenen. Dateien werden in
64-MiB-Fenstern gelesen, damit auch eine 2-GiB-Aufnahme nicht in den Speicher
muss; ein abgebrochener Upload nimmt die fehlenden Teile wieder auf.

### OBS- und Cap-Aufnahmen

```bash
dreambau-evidence watch ~/Movies/OBS \
  --project oriso --environment pre-dev --pr 553
```

Der Watcher wartet, bis eine Datei nicht mehr wächst, und lädt sie dann hoch;
jede Aufnahme wird ein eigener Lauf mit eigenem PR-Kommentar. Vor dem ersten
Upload nennt er Repository, Commit, Umgebung und PR. Fehlgeschlagene Uploads
bleiben liegen und werden erneut versucht — nur eine Datei in Quarantäne nicht,
denn daran ändert sich nichts mehr. `--once` macht einen einzelnen Durchlauf.

Eine Cap-Aufnahme zählt erst dann als dauerhafte PR-Evidence, wenn sie über das
CLI gespiegelt wurde. Ein blosser Cap-Link ist kein Nachweis: er hängt an einem
Dienst, der die Datei jederzeit anders ausliefern oder entfernen kann.

## Menschlicher Passkey- und E-Mail-OTP-Zugang

Der gemeinsame Argon2id-Passwortlogin ist nur noch als Bootstrap-Pfad für den
konfigurierten ersten Administrator vorgesehen. Eine Bootstrap-Session kann
nur für diesen festen Benutzer ein WebAuthn-Credential registrieren; sie kann
keine beliebige Mitarbeiteridentität übernehmen.

- Registrierungs- und Authentication-Challenges laufen nach fünf Minuten ab
  und werden vor der Verifikation atomar einmalig konsumiert.
- RP-ID ist `dreambau.com`, erwarteter Origin `https://dreambau.com`.
- User Verification ist zwingend; Attestation wird nicht verlangt.
- ES256 und RS256 sind zugelassen.
- Credentials, Public Key, Backup-/Device-Status und Signaturzähler liegen in
  SQLite; ein nicht-null Signaturzähler muss monoton steigen.
- Nach erfolgreicher Registrierung oder Anmeldung ersetzt eine
  benutzergebundene Passkey-Session die Bootstrap-Session.
- Mitarbeiter können alternativ einen sechsstelligen Code per E-Mail anfordern.
  Diese E-Mail-OTP-Session ist ein vollständiger, projektbegrenzter Lesezugang
  und funktioniert auch auf Compliance-Geräten, die keine Passkeys speichern.
- E-Mail-Codes laufen nach zehn Minuten ab, sind einmalig, haben höchstens fünf
  Versuche und können pro Benutzer frühestens nach 60 Sekunden neu angefordert
  werden. SQLite enthält ausschließlich den HMAC, niemals den Klartext-Code.
- Administrative Benutzer dürfen mit E-Mail-OTP lesen; Benutzerverwaltung und
  andere Admin-Endpunkte verlangen weiterhin ausdrücklich eine Passkey-Session.
- Passwort-Bootstrap- und Recovery-Sessions dürfen keine Account-, Taxonomie-,
  Usage- oder Exportdaten lesen. Sie dürfen ausschließlich einen Passkey für
  die fest zugeordnete Person registrieren.
- Nach der Registrierung werden zehn zufällige Recovery-Codes genau einmal im
  Browser angezeigt. Serverseitig liegen ausschließlich SHA-256-Hashes; jeder
  Code ist einmalig und wird nach Verwendung atomar verbraucht. Recovery führt
  zwingend wieder zur Passkey-Registrierung.

Die Server-Endpunkte liegen unter
`/testmails/api/auth/passkeys/{registration,authentication}/{options,verify}`.
Der alternative Login verwendet `POST /testmails/api/auth/email-otp/request`
und `POST /testmails/api/auth/email-otp/verify`. Die Request-Antwort ist auch
für unbekannte oder unberechtigte Adressen immer identisch, damit keine Konten
ermittelt werden können.

Passkey-Administratoren verwalten individuelle Mitarbeiter unter
`/testmails/api/auth/users`. Beim Anlegen werden Name, E-Mail und mindestens
ein Projekt (`oriso`, `orimo`, `dreambau`) festgelegt. Die Antwort zeigt genau
einmal einen zufälligen Enrollment-Code; der Mitarbeiter verwendet ihn wie
einen Recovery-Code und registriert danach den eigenen Passkey. Das Deaktivieren
eines Users wirkt bei der nächsten Anfrage auch auf bereits bestehende Sessions.
Menschliche Accountlisten, Mutationen und Markdown-Exporte werden auf die dem
User zugeordneten Projekte begrenzt.
Die Weboberfläche zeigt den Bereich **Mitarbeiter** nur Administratoren, zeigt
den Enrollment-Code nur im unmittelbar folgenden Dialogzustand und hält ihn
nicht in einer dauerhaften Browserablage.

### Infisical-Mitgliedschaften für menschliche Projektzuordnungen

Für nicht-administrative Testmails-Benutzer ist Infisical die führende Quelle
der Projektzuordnung. Eine Mitgliedschaft im jeweiligen Infisical-Projekt mit
der eingebauten Rolle `no-access` dient als reiner Zuordnungsmarker und gewährt
keinen Zugriff auf Secrets. Eine bereits bestehende Infisical-`admin`-
Mitgliedschaft gilt ebenfalls als Projektzuordnung; sie besitzt ohnehin die
höheren Rechte im führenden System. Andere oder gemischte Rollen werden nicht
automatisch übernommen.

Die Anwendung liest Projektmitgliedschaften über die bereits gemountete
Universal-Auth-Identität, cached das Ergebnis höchstens 60 Sekunden und
aktualisiert `human_users.projects`. Schlägt die Synchronisierung fehl, werden
Anfragen nicht-administrativer Benutzer mit `503 human_access_unavailable`
abgewiesen. Der Bootstrap-Administrator behält seine lokalen Projektzuordnungen.

- `GET /testmails/api/v1/accounts` liefert nur Metadaten im Token-Scope.
- Filter: `project`, `environment`, `role`.
- `GET /testmails/api/v1/accounts/:id/secret` liefert gezielt genau ein Secret
  und setzt `Cache-Control: no-store`.
- `GET /testmails/api/v1/accounts/:id/mail/latest?query=…` liest genau die
  neueste passende Test-Mail über die von JMAP entdeckte Live-API.
- `GET /testmails/api/v1/accounts/:id/otp?query=…` liefert nur einen passenden
  sechsstelligen OTP-Code samt Message-ID und Empfangszeit.
- `GET /testmails/api/v1/accounts/:id/env` liefert nur für einen gezielt
  angeforderten `seed-profile` eine begrenzte Map von Umgebungsvariablen.
- `POST /testmails/api/v1/accounts/:id/catalog` erfordert die zusätzliche
  Machine-Aktion `accounts:sync`. Der Record muss dieselbe synthetische
  Simpson-Mailadresse wie eines der 180 Konten verwenden. Projekt, Rolle,
  Version, Status und Notiz werden dann ohne Secret in den Katalog übernommen.
- `GET /testmails/api/accounts/:email/application-secret?accountId=…` liefert
  einer aktiven, projektspezifisch berechtigten Human-Session gezielt das
  Anwendungspasswort eines verknüpften `app-user`- oder `admin`-Records und
  antwortet mit `Cache-Control: no-store`.
- `GET /testmails/api/accounts/:email/otp?accountId=…` steht einer aktiven
  Passkey- oder E-Mail-OTP-Session im zugeordneten Projekt zur Verfügung.
  Reine `mailbox`-Records sind kein App-Login und werden hier nicht akzeptiert.
  Der Endpunkt bevorzugt App-TOTP und sucht andernfalls für den verknüpften
  App-Record nach der neuesten passenden Mail-OTP.
- Production ist kein gültiger Machine-Identity-Scope.
- Unangemeldete, abgelaufene oder widerrufene Tokens erhalten keine Metadaten.
- Die geschützte Human-Session sieht unter
  `GET /testmails/api/machine-identities/usage` ausschließlich Identity-ID und
  letzten Nutzungszeitpunkt, niemals Token oder Token-Hash.

Das Kubernetes Secret `wcr/test-access-identities` wird aus dem zentralen
Secret-System erzeugt. Tokenwerte werden einmalig im jeweiligen macOS Keychain
oder CI-Secret gespeichert und nie in Repository, Markdown oder Shell-Literalen
geschrieben.

Die Registry selbst kann mit `TEST_ACCESS_PROVIDER=infisical` aus der
self-hosted Instanz `https://secrets.dreambau.com` gelesen werden. Der Hub
tauscht die gemounteten Universal-Auth-Dateien `client-id` und `client-secret`
gegen ein kurzlebiges Access Token und liest ausschließlich `/records` aus den
drei konfigurierten Projekt-IDs und den vier Umgebungen `local`, `pre-dev`,
`dev` und `production-test`. Ungültige, doppelte oder zum Infisical-Pfad
widersprüchliche Records stoppen den Import. Upstream-Antworten und
Credentials erscheinen nicht in Fehlern.

### Mailbox und Anwendungslogin

Ein Springfield-Konto ist immer zunächst eine Mailbox. Das in der Kontokarte
angezeigte **Mail-Passwort** gehört ausschließlich zu Roundcube, IMAP, SMTP,
JMAP, CalDAV und CardDAV. Es ist kein ORISO- oder ORIMO-Anwendungspasswort.

Ein App-Login erscheint erst, wenn ein `app-user`- oder `admin`-Record mit
derselben Simpsons-E-Mail in der Registry existiert. Reine `mailbox`-Records
werden nicht als Anwendungskonto behandelt und bieten deshalb kein OTP an.
Technische Rollen eines echten App-Records werden in der Kontokarte angezeigt
und zusätzlich auf die verständlichen Dashboard-Rollen abgebildet. Das
Anwendungspasswort wird erst nach einer gezielten Anfrage geladen.

### Verbindlicher Account-Workflow für KI-Tests

1. Zuerst ein freies Konto aus dem festen Springfield-Pool auswählen; keine
   persönliche oder neue technische E-Mailadresse erfinden.
2. Den Produktnutzer mit exakt dieser Simpson-Mailadresse in der Zielumgebung
   anlegen und den Infisical-Record unter einer stabilen technischen ID führen.
3. Danach `test-access sync <record-id> --version <version> --status active`
   aufrufen. Die berechtigte Machine Identity aktualisiert dadurch dieselbe
   sichtbare Zeile und protokolliert Account-ID, Akteur und Zeitpunkt, jedoch
   weder Passwort noch OTP.
4. In E2E-Bericht und Screenshots immer Simpson-Name, Nutzername und E-Mail
   nennen. Passwörter, OTPs und TOTP-Seeds bleiben aus Artefakten heraus.
5. Menschen öffnen dieselbe Zeile in Springfield und verwenden **OTP abrufen**.
   Der Code lebt nur im aktuellen UI-Zustand und wird automatisch wieder
   entfernt.

`/testmails/health/live` prüft nur den Prozess. Der Readiness-Endpunkt
`/testmails/health/ready` authentifiziert den Provider und prüft einen
konfigurierten `/records`-Pfad mit `viewSecretValue=false`; bei einem Fehler
antwortet er ausschließlich mit `503 {"status":"unavailable"}` und gibt keine
Upstream- oder Secret-Details aus.

Nach einem Deployment prüft `npm run smoke:live` die echten öffentlichen
Grenzen: JSON-Liveness, JSON-Readiness, die geschützte v1-API und den
Stalwart-JMAP-Endpunkt. Ein SPA-Fallback mit HTTP 200 gilt ausdrücklich als
Fehler. Der Smoke-Test liest weder Accounts noch Mails und benötigt kein
Secret.

Das dedizierte Kubernetes Secret heißt `wcr/test-access-infisical`. Es wird
direkt aus dem Secret-System beziehungsweise aus stdin erstellt und enthält
nur `client-id` und `client-secret`; sein Wert wird nie in Git, Markdown oder
einem Shell-Literal abgelegt. Die nicht geheimen Projekt-IDs stehen im
Deployment-Manifest.

### Kontrollierter Record-Import

Der Import liest ein Array vollständiger Test-Access-Records ausschließlich
von stdin. Ein kurzlebiges Admin-Access-Token wird separat aus dem macOS
Keychain-Service `dreambau-infisical-import`, Account `admin-session`, gelesen.
Der Import schreibt keine Klartextdatei und gibt nur Record-/Batch-Anzahlen aus.

```bash
export TEST_ACCESS_INFISICAL_ORISO_PROJECT_ID=2808af88-2c60-4023-8754-98665192cfdf
export TEST_ACCESS_INFISICAL_ORIMO_PROJECT_ID=cacf81e9-4d84-4352-99b8-4e3eb40bf338
export TEST_ACCESS_INFISICAL_DREAMBAU_PROJECT_ID=a7620a55-2f67-4bc1-9526-4efda230b247
sops --decrypt accepted-test-access-records.enc.json | npm run infisical-import
```

Vor jedem Write werden alle betroffenen Projekt-/Umgebungspfade mit
`viewSecretValue=false` geprüft. Bereits vorhandene, doppelte, ungültige oder
scope-fremde Records stoppen den gesamten Lauf vor dem ersten Write. Secret-
Namen sind stabile, nicht sprechende SHA-256-Ableitungen; importiert wird nur
unter `/records`. Ein Update/Overwrite ist in diesem Kommando absichtlich nicht
implementiert.

Der portable Operator-Client liest den Token aus Keychain-Service
`dreambau-test-access` und Account `TEST_ACCESS_IDENTITY`:

```bash
export TEST_ACCESS_IDENTITY=codex-m4-oriso
npm run test-access -- list --project oriso --environment production-test
npm run test-access -- get 'mailbox:spider.pig@oriso.org'
npm run test-access -- otp 'mailbox:spider.pig@oriso.org' verification
npm run test-access -- mail 'mailbox:spider.pig@oriso.org' verification
npm run test-access -- env 'oriso/pre-dev/e2e-default'
npm run test-access -- session open 'oriso/pre-dev/test-tenantadmin-001'
npm run test-access -- run create --project oriso --target pre-dev --pool production-test --version 4.9 --commit abcdef1 --scenario three-way-chat --role consultant=2 --role user=1
npm run test-access -- run list --project oriso --target pre-dev
npm run test-access -- run show '<run-id>'
npm run test-access -- run start '<run-id>'
npm run test-access -- run finish '<run-id>' --result passed
npm run test-access -- run release '<run-id>'
```

### Dauerhafte App-TOTP-Zuordnung

Testmails persistiert die nicht geheimen Verknüpfungen zwischen Springfield-
Mailkonto und App-/Admin-Record in SQLite. Die Erstzuordnung ist idempotent und
verwendet ausschließlich exakte E-Mail-Treffer aus dem bekannten
Testmail-Katalog. `test-access doctor --repair` führt denselben Abgleich für
Projekt und Umgebungen der aktuellen Machine Identity aus. Nicht zuordenbare
Records werden nur als Diagnose gemeldet; es wird nie geraten.

Infisical bleibt der einzige Speicherort für App-Passwort und TOTP-Seed.
Lesen und Schreiben verwenden getrennte Universal-Auth-Identitäten:

- `test-access-infisical` darf die Registry unter `/records` lesen;
- `test-access-infisical-writer` darf Secrets unter `/records` lesen, anlegen
  und aktualisieren, aber keine Secrets löschen;
- beide Rollen werden in Infisical auf die drei Test-Access-Projekte und die
  Testumgebungen `local`, `pre-dev`, `dev` und `production-test` begrenzt;
- `production` ist weder ein gültiger API-Scope noch ein gültiger
  Machine-Identity-Scope.

Das Kubernetes Secret `wcr/test-access-infisical-writer` enthält nur
`client-id` und `client-secret`. Es wird aus stdin oder dem zentralen
Secret-System erzeugt, nie aus einer Klartextdatei im Repository. Fehlt die
Writer-Konfiguration, bleiben Registry und OTP-Abruf lesbar, während TOTP-
Hinterlegung fail-closed mit `totp_enrollment_unavailable` abgewiesen wird.

Menschen benötigen eine starke Testmails-Session und Projektzugriff. In der
Oberfläche erscheint bei einem verknüpften App-Login ohne TOTP der Dialog
**2FA hinterlegen**. Der Base32-Seed wird einmalig übertragen, nicht im Browser
gespeichert und nie von der API zurückgegeben. Anschließend liefert der
bestehende Button **OTP abrufen** nur den aktuellen Code.

Agenten verwenden dieselbe fachliche API mit getrennten Actions:

- `accounts:read` für `lookup`, `otp` und `doctor`;
- `accounts:sync` zusätzlich für `doctor --repair`;
- `accounts:totp:write` für `enroll-totp`.

Der portable Client liest weiterhin das Bearer-Token aus dem Keychain. Der
TOTP-Seed ist kein Kommandozeilenargument: interaktiv wird er verdeckt gelesen,
in Automationen kommt genau eine Zeile über stdin.

```bash
export TEST_ACCESS_IDENTITY=codex-m4-oriso
test-access lookup --email abe.simpson@dreambau.de --project oriso --environment pre-dev
test-access doctor --repair --json
test-access enroll-totp oriso/pre-dev/e2e-platform-admin-predev
test-access otp oriso/pre-dev/e2e-platform-admin-predev
test-access otp oriso/pre-dev/e2e-platform-admin-predev --json
```

Audit-Ereignisse enthalten Actor-ID, Record-ID, E-Mail, Aktion, Projekt,
Umgebung und Zeitpunkt. Passwort, Bearer-Token, TOTP-Seed und generierter OTP-
Code werden nicht in SQLite-Auditdaten geschrieben.

Der Live-Playwright-Happy-Path benötigt zusätzlich ein ausdrücklich dafür
bestimmtes Non-Production-Konto. `TESTMAILS_E2E_PASSWORD`,
`TESTMAILS_E2E_TOTP_EMAIL` und `TESTMAILS_E2E_TOTP_SECRET` werden ausschließlich
zur Laufzeit aus der Operator-Umgebung gesetzt; der Test wird ohne diese
Voraussetzungen übersprungen.

### Versionierte Test-Runs

Ein Test-Run reserviert eine vollständige Rollenbelegung atomar aus den
stabilen Mailbox-Records. SQLite speichert nur Account-ID, E-Mail,
Rollen-Snapshot, Zielumgebung, Version, Commit, Status und Audit-Ereignisse;
Passwörter, OTPs, Tokens, Browser-State und Nachrichteninhalte bleiben
außerhalb des Run-Ledgers.

Machine Identities erhalten Run-Rechte explizit über `actions`:
`runs:read`, `runs:create`, `runs:execute` und – erst für den späteren
produktseitigen Cleanup-Adapter – `runs:cleanup`. Bestehende Identities ohne
`actions` behalten ausschließlich `accounts:read` und `sessions:open`.

`run release` gibt nur die Lease frei. Die stabile Mailbox und ihr Infisical-
Secret bleiben unverändert. Das Löschen versionierter ORISO-Testnutzer, Räume
und Artefakte folgt in einem separaten, preview-pflichtigen Adapter.

`session open` ist die bevorzugte Agent-Schnittstelle für Browser-Logins. Der
Broker lädt Passwort und optionales OTP intern, erzeugt einen privaten
Playwright-`storageState` mit 15 Minuten TTL und gibt ausschließlich dessen
Pfad, Account-ID und Ablaufzeit zurück. Ein Agent soll deshalb niemals ein
Testpasswort lesen, kopieren, in ein Formular tippen oder den Menschen zur
Eingabe auffordern. Für `local` und `pre-dev` darf der Broker lokal nicht
vertrauenswürdige TLS-Zertifikate akzeptieren; `dev` und `production-test`
bleiben strikt.

Auf macOS versucht der Client zuerst den Login-Keychain. Wenn ein headless
Prozess dort zunächst Status 36 erhält, öffnet er den Login-Keychain
nicht-interaktiv und wiederholt den Abruf. Als Reserve kann ausschließlich
`~/.config/dreambau-test-access/identities/<identity>.token` verwendet werden;
die Datei muss dem aktuellen Benutzer gehören und darf keine Gruppen- oder
Weltrechte besitzen. Dieser lokale Wert ist nur das eingeschränkte
Maschinen-Bootstrap-Credential. Testkonto-Passwörter verbleiben in Infisical.

### ORISO PreDev self-service provisioning

Administrators can provision a real ORISO PreDev account for a free
Springfield mailbox directly from the Testmails UI (issues #49 and #57). The
server authenticates with the managed platform-admin record and supports
`platform-admin`, `tenant-admin`, `agency-admin`, `counsellor` and
`advice-seeker`. It stores a stable Test Access record
(`oriso/pre-dev/<mailbox-local-part>`) with a generated application password,
creates or reconciles the ORISO identity by API, assigns agency admins and
counsellors to the configured test agency, stores a generated TOTP seed only
in Infisical, activates app-TOTP and proves a second login.

Credentials and server-generated TOTP seeds never reach the browser or audit
log. The legacy manual enrollment flow accepts a TOTP seed pasted by the user
in the browser and sends it once to the protected `/totp` endpoint. One-time
response codes reach the browser only after an explicit generation request and
must never be persisted or logged. The linked record has an explicit
`pending`, `ready` or `failed` provisioning state so a locally stored seed
alone can never claim a successful ORISO setup. Repeating the same request
reconciles the existing account; every environment except `pre-dev` is
rejected.

Configuration (feature is disabled until `ORISO_PREDEV_ADMIN_RECORD_ID` is
set): `ORISO_PREDEV_ADMIN_RECORD_ID` (e.g.
`oriso/pre-dev/e2e-platform-admin-predev`), optional overrides
`ORISO_PREDEV_API_BASE_URL`, `ORISO_PREDEV_TOKEN_URL`,
`ORISO_PREDEV_CLIENT_ID`, `ORISO_PREDEV_ADMIN_URL`, `ORISO_PREDEV_APP_URL`,
`ORISO_PREDEV_DEFAULT_TENANT_ID`, `ORISO_PREDEV_DEFAULT_AGENCY_ID`,
`ORISO_PREDEV_DEFAULT_CONSULTING_TYPE`, `ORISO_PREDEV_DEFAULT_POSTCODE` and
`ORISO_PREDEV_DEFAULT_MAIN_TOPIC_ID`.
Because the public DNS of `oriso-dev.site` still points at the retired host
and PreDev serves a certificate from the internal "ORISO Dev Local CA", set
`ORISO_PREDEV_RESOLVE_IP=46.224.170.69` and mount the CA via
`ORISO_PREDEV_CA_FILE`. Record creation and provisioning-state transitions
require the Infisical writer identity to have create and update permission on
the `/records` path.

### ORISO PreDev seed import

`npm run oriso-seed-import` accepts the decrypted Keycloak seed-store shape
only on stdin and converts it into scoped `app-user` and optional
`seed-profile` records. The target must be `local`, `pre-dev` or `dev`;
`production`, source/target environment mismatches and malformed seed profiles
are rejected before the Infisical write boundary. Output contains record counts
only. The short-lived Infisical write token is read from Keychain service
`dreambau-infisical-import`, account `admin-session`.

The live ORISO PreDev baseline consists of the stable account IDs
`oriso/pre-dev/test-consultant-001`, `oriso/pre-dev/test-user-001` and
`oriso/pre-dev/test-tenantadmin-001`, plus the reference-only seed profile
`oriso/pre-dev/e2e-default`. The seed profile contains URLs and stable account
or mailbox IDs, never passwords. Its current M4 machine identity is
`codex-m4-oriso`, scoped only to ORISO `pre-dev` and `production-test`; `dev`
and foreign projects return `403`.

The companion M4 identity `codex-m4-orimo` is restricted to
`orimo/production-test`. It sees the 30 ORIMO test mailboxes and receives `403`
for ORISO and for `dev`.

Der Token ist keine CLI-Option und erscheint deshalb nicht in Prozesslisten
oder Shell-History. `get` und `otp` schreiben nur den ausdrücklich angeforderten
Wert nach stdout; `env` sortiert erlaubte Variablennamen und setzt Werte in
single-quoted, Shell-sicheres Dotenv. HTTP-Fehler geben keine Response-Bodies
aus.

## Backup und Wiederherstellung

### Täglicher SOPS-Recovery-Export

`ops/test-access-recovery-export.sh` liest die vollständige, schema-validierte
Infisical-Registry über einen explizit freigeschalteten Read-only-Stream aus dem
laufenden Hub-Pod und piped sie direkt in SOPS. Der Host schreibt ausschließlich
die verschlüsselte Datei `/var/backups/test-access/test-access.enc.json`; es
entsteht keine temporäre Klartextdatei. Duplikate und Production-Records stoppen
den Export vor SOPS. Die systemd Unit und der persistente tägliche Timer liegen
ebenfalls unter `ops/`.

Vor der Aktivierung müssen auf dem Server in
`/etc/dreambau/test-access-age-recipients` genau zwei unterschiedliche
öffentliche `age1...`-Empfänger stehen, je einer pro Zeile. Private Schlüssel
gehören ausschließlich in die jeweiligen macOS Keychains. Danach werden
Script und Units als root installiert und erst nach einem erfolgreichen
manuellen Probelauf aktiviert:

```bash
install -D -m 0700 ops/test-access-recovery-export.sh /usr/local/lib/dreambau/test-access-recovery-export.sh
install -m 0644 ops/test-access-recovery-export.service ops/test-access-recovery-export.timer /etc/systemd/system/
install -m 0644 ops/test-access-recovery-export.tmpfiles /etc/tmpfiles.d/dreambau-test-access-recovery.conf
systemd-tmpfiles --create /etc/tmpfiles.d/dreambau-test-access-recovery.conf
systemctl daemon-reload
systemctl start test-access-recovery-export.service
systemctl enable --now test-access-recovery-export.timer
```

Die Aktivierung ist absichtlich unzulässig, solange der zweite öffentliche
Empfänger fehlt. Ein Restore wird auf dem Ziel-Mac mit dessen lokalem
Keychain-gesicherten privaten `age`-Schlüssel durchgeführt.

### Kubernetes-Secrets at rest

Der aktuelle Dreambau-K3s-Server muss vor dem Hub-Livegang noch von
`Encryption Status: Disabled` auf verschlüsselte Secrets umgestellt werden.
`ops/enable-k3s-secrets-encryption.sh` ist ohne Argument ausschließlich ein
Status-/Dry-Run. `--apply` darf nur in einem freigegebenen Wartungsfenster
ausgeführt werden: Das Script verlangt embedded etcd, erzeugt zuerst einen
K3s-Snapshot, aktiviert die Encryption Configuration, startet K3s neu,
verschlüsselt vorhandene Daten erneut und prüft den Endstatus. Bei unbekanntem
Datastore verweigert es die Mutation.

```bash
sudo ops/enable-k3s-secrets-encryption.sh
# nach Backup-/Wartungsfreigabe:
sudo ops/enable-k3s-secrets-encryption.sh --apply
```

Vor Schemaänderungen die SQLite-Datei aus dem laufenden Pod sichern, ohne Account-Secrets zu exportieren:

```bash
pod=$(ssh m4dreambau 'kubectl get pod -n wcr -l app.kubernetes.io/name=testmails -o jsonpath="{.items[0].metadata.name}"')
ssh m4dreambau "kubectl exec -n wcr $pod -- sh -c 'cat /data/testmails.sqlite'" > testmails.sqlite.backup
```

Backup geschützt ablegen und nach der Wiederherstellung auf Besitzer `1000:1000` sowie Modus `0600` achten.

## Rollback

```bash
ssh m4dreambau 'kubectl rollout undo deployment/testmails -n wcr'
ssh m4dreambau 'kubectl rollout status deployment/testmails -n wcr --timeout=180s'
```

Falls nur die öffentliche Route entfernt werden soll, ausschließlich `wcr/ingress/testmails` löschen. PVC, Secrets und `matrix/matrix-well-known-root` bleiben bestehen.

## Secret-Rotation

1. Gemeinsamen Login im lokalen Keychain aktualisieren.
2. Argon2id-Hash mit `scripts/hash-login-password.mjs` direkt in Secret `wcr/testmails-auth` streamen.
3. Session-Secret gleichzeitig zufällig neu erzeugen.
4. `kubectl rollout restart deployment/testmails -n wcr` und Login/E2E erneut prüfen.

Siehe `PLAN.md` für Architektur und vollständige Abnahmekriterien.
