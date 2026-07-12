# Dreambau Testmails Registry

Passwordgeschützte Verwaltung der 180 Simpsons-Testpostfächer. Zugangsdaten kommen ausschließlich aus einem gemounteten Kubernetes Secret; editierbare Testmetadaten liegen in SQLite auf einem PVC.

## Betrieb

Die Anwendung läuft als Einzelreplica `wcr/testmails`. Der Quellstand liegt auf dem Server unter `/root/testmails-app`; das aktuelle Image heißt `dreambau-testmails:0.3.1`.

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

Das dedizierte Kubernetes Secret heißt `wcr/test-access-infisical`. Es wird
direkt aus dem Secret-System beziehungsweise aus stdin erstellt und enthält
nur `client-id` und `client-secret`; sein Wert wird nie in Git, Markdown oder
einem Shell-Literal abgelegt. Die nicht geheimen Projekt-IDs stehen im
Deployment-Manifest.

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

Der Token ist keine CLI-Option und erscheint deshalb nicht in Prozesslisten
oder Shell-History. `get` und `otp` schreiben nur den ausdrücklich angeforderten
Wert nach stdout; `env` sortiert erlaubte Variablennamen und setzt Werte in
single-quoted, Shell-sicheres Dotenv. HTTP-Fehler geben keine Response-Bodies
aus.

## Backup und Wiederherstellung

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
