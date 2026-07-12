# Dreambau Testmails Registry

Passwordgeschützte Verwaltung der 180 Simpsons-Testpostfächer. Zugangsdaten kommen ausschließlich aus einem gemounteten Kubernetes Secret; editierbare Testmetadaten liegen in SQLite auf einem PVC.

## Betrieb

Die Anwendung läuft als Einzelreplica `wcr/testmails`. Der Quellstand liegt auf dem Server unter `/root/testmails-app`; das aktuelle Image heißt `dreambau-testmails:0.3.0`.

```bash
ssh m4dreambau 'kubectl get pod,svc,ingress,pvc -n wcr -l app.kubernetes.io/name=testmails'
ssh m4dreambau 'kubectl logs deployment/testmails -n wcr --tail=100'
```

Secrets werden ausschließlich aus stdin erzeugt. Das Account-JSON kommt aus Keychain-Service `dreambau-test-mailbox`; der gemeinsame Login aus `dreambau-testmails-auth`. Private S/MIME-Identitäten bleiben im Service `dreambau-test-smime` und werden nie in die Anwendung kopiert.

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
