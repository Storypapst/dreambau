# Dreambau Testmails Registry

Passwordgeschützte Verwaltung der 180 Simpsons-Testpostfächer. Zugangsdaten kommen ausschließlich aus einem gemounteten Kubernetes Secret; editierbare Testmetadaten liegen in SQLite auf einem PVC.

## Betrieb

Die Anwendung läuft als Einzelreplica `wcr/testmails`. Releases liegen getrennt unter `/root/releases/testmails`; das aktuelle Image heißt `dreambau-testmails:0.4.5-passkey-onboarding` und verwendet Infisical als Registry-Provider.

```bash
ssh m4dreambau 'kubectl get pod,svc,ingress,pvc -n wcr -l app.kubernetes.io/name=testmails'
ssh m4dreambau 'kubectl logs deployment/testmails -n wcr --tail=100'
```

Secrets werden ausschließlich aus stdin erzeugt. Das Account-JSON kommt aus Keychain-Service `dreambau-test-mailbox`; der gemeinsame Login aus `dreambau-testmails-auth`. Private S/MIME-Identitäten bleiben im Service `dreambau-test-smime` und werden nie in die Anwendung kopiert.

## Test Access API v1

Maschinen greifen mit einzeln widerrufbaren Bearer-Tokens auf die read-only API
unter `/testmails/api/v1` zu. Die Datei
`/run/secrets/test-access/machine-identities.json` enthält ausschließlich
SHA-256-Token-Hashes, Projekt-/Umgebungs-Scopes, Ablaufzeit und Widerrufszeit;
nie die Tokenwerte selbst.

## Menschlicher Passkey-Zugang

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
- Passwort-Bootstrap- und Recovery-Sessions dürfen keine Account-, Taxonomie-,
  Usage- oder Exportdaten lesen. Sie dürfen ausschließlich einen Passkey für
  die fest zugeordnete Person registrieren.
- Nach der Registrierung werden zehn zufällige Recovery-Codes genau einmal im
  Browser angezeigt. Serverseitig liegen ausschließlich SHA-256-Hashes; jeder
  Code ist einmalig und wird nach Verwendung atomar verbraucht. Recovery führt
  zwingend wieder zur Passkey-Registrierung.

Die Server-Endpunkte liegen unter
`/testmails/api/auth/passkeys/{registration,authentication}/{options,verify}`.

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
```

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

`ops/test-access-recovery-export.sh` liest `wcr/testmails-accounts` direkt über
eine Pipe und schreibt ausschließlich die verschlüsselte Datei
`/var/backups/test-access/test-access.enc.json`. Es wird keine temporäre
Klartextdatei angelegt. Die systemd Unit und der persistente tägliche Timer
liegen ebenfalls unter `ops/`.

Vor der Aktivierung müssen auf dem Server in
`/etc/dreambau/test-access-age-recipients` genau zwei unterschiedliche
öffentliche `age1...`-Empfänger stehen, je einer pro Zeile. Private Schlüssel
gehören ausschließlich in die jeweiligen macOS Keychains. Danach werden
Script und Units als root installiert und erst nach einem erfolgreichen
manuellen Probelauf aktiviert:

```bash
install -D -m 0700 ops/test-access-recovery-export.sh /usr/local/lib/dreambau/test-access-recovery-export.sh
install -m 0644 ops/test-access-recovery-export.service ops/test-access-recovery-export.timer /etc/systemd/system/
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
