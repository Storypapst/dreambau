# ORISO Ideas preview on Dreambau

This is the standalone deployment of the ORISO feature-intake prototype. It
reuses the active Testmails identity at /testmails/ideas/ and limits access to
active users with the ORISO project grant. Testmails admins get the review
controls. The service validates the existing session through Testmails and
stores idea data in its own persistent SQLite volume.

The Dreambau service reads the OpenRouter credential from
`OPENROUTER_API_KEY_FILE` for each model request. Configure the provider model
with `OPENROUTER_MODEL`. Neither the credential nor user contact records are
sent to the browser or included in model input. Do not put the key in Git.

Run the app tests with `node --test apps/oriso-ideas/*.test.mjs`. Build from the
repository root with `docker build -f apps/oriso-ideas/Dockerfile .`. Production
needs the Testmails identity endpoint, a persistent `INTAKE_DATABASE` path,
and the mounted OpenRouter secret.

For the Dreambau preview, keep `OPENROUTER_API_KEY` in Infisical under
ORISO Infrastructure → Development → `/oriso-ideas`. Run
`apps/oriso-ideas/sync-openrouter-secret.sh` from the operator Mac after
creating or rotating the secret. The running app reads the updated file on
its next model request.
