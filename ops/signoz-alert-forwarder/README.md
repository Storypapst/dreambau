# Private Dev SigNoz alert forwarding

The standalone host service accepts measured firing alerts from Dev SigNoz
and sends a short message to Buzz and a dedicated OpenClaw agent. The
existing Slack receiver keeps its own route in SigNoz. The service runs with
Python 3.10 and the pinned Buzz CLI.

## SigNoz contract

Use a version 4 webhook named `oriso-alerts-agents`. Send a bearer
credential over the approved private encrypted route to
`POST /signoz/alerts`. The pinned SigNoz webhook sends an Alertmanager
envelope. It carries labels and annotations for each alert. The agent route
requires the ORISO rule catalog to emit the fields below.

| Field | Required value |
|---|---|
| `labels.environment` | `dev` |
| `labels.managed_by` | `oriso_helm` |
| `labels.oriso_forward_rule` | A stable catalog slug |
| `annotations.oriso_forward_value` | The evaluated number formatted without a unit |
| `fingerprint` and `startsAt` | The original Alertmanager occurrence identity |

SigNoz v0.135.1 evaluates annotations using the rule's formatted `$value`.
Use `{{$value}}` with a unitless output and verify the actual value on the
intended rule. A fixed rule-to-service mapping supplies the service name.
The agent route forwards measured firing alerts. Resolved and no-data
notifications stay with the existing route and have no numeric sample
here. Send at most eight alerts per complete batch and at most 64 KiB.

Both destinations receive a fixed text format, for example
`ORISO SigNoz rule=collector-staleness service=collector value=0.125`.
The service validates the whole batch before delivery. URLs, arbitrary
labels, and annotations outside the numeric field stay outside messages,
the receipt store and diagnostics.

## Host setup

1. Confirm the first Slack delivery and approve the Dev peer, private
   encrypted path, dedicated Buzz identity and channel, and dedicated
   OpenClaw agent. The OpenClaw agent needs an explicit hook allowlist and
   a tool policy appropriate to receiving an alert. The hook disables
   announcements.
2. Install the reviewed service and the Buzz CLI from the pinned source.
   Copy the settings example to `/etc/dreambau/signoz-alert-forwarder.json`
   and supply the approved private bind address, immediate TCP peer,
   loopback destination ports, channel UUID, agent ID and rule mapping.
   The example addresses and IDs are for a local rehearsal.
3. Supply the three dedicated credentials through the service manager.
   The unit names the credential sources and keeps them separate from the
   settings file. The service passes only the Buzz credential to the Buzz
   child process and only the hook credential to OpenClaw.
4. Restrict the private listener to the Dev peer in the host firewall.
   The service example allows loopback. For an approved non-loopback
   peer, add only its address to the systemd IP allowlist. Verify denial
   from a different peer and from the public internet. The service uses
   the TCP peer for this check and ignores forwarding headers.
5. Keep the existing Slack channel in the rule's routes. Add the agent
   channel only after the host and both destination checks pass. Test
   once with an approved synthetic rule and verify its actual Buzz room
   entry and the dedicated OpenClaw run. Hook admission is only the
   first step of that check.

## Retry and verification

For a measured alert, HTTP 204 means both destinations have confirmed the
sample. The service returns 503 for a retryable delivery failure and
attempts both destinations independently. The SQLite receipt store holds
only keyed hashes, destination names and confirmation timestamps. Confirmed
deliveries are skipped for ten minutes across retries and process restarts.
The OpenClaw request includes a stable idempotency key for admission retries.
An ambiguous Buzz send can be retried. Intentional alerts beyond the
receipt window can be delivered again.

Run the loopback integration tests from the repository checkout.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ops/signoz-alert-forwarder -p 'test_*.py'
```

The tests use a real HTTP listener, a synthetic Buzz executable and a
synthetic OpenClaw hook. They cover both delivery contracts, receipt
recovery, invalid input and data minimization. In the approved deployed
check, confirm that disabling the agent route leaves the existing Slack
delivery intact.

[Helm delivery ticket](https://github.com/OpenResilienceInitiative/ORISO-Helm/issues/469)
· [Pinned SigNoz webhook](https://github.com/SigNoz/signoz/blob/v0.135.1/pkg/alertmanager/alertmanagernotify/webhook/webhook.go#L58-L98)
· [Pinned SigNoz rule values](https://github.com/SigNoz/signoz/blob/v0.135.1/pkg/query-service/rules/manager.go#L771-L824)
· [Pinned Buzz sender](https://github.com/block/buzz/blob/6e5c462ac524de60d7edb46c66130fd779cc9006/crates/buzz-cli/src/commands/messages.rs#L564-L590)
· [OpenClaw v2026.9.6 hook replay](https://github.com/openclaw/openclaw/blob/v2026.9.6/src/gateway/server/hooks-request-handler.ts#L449-L472)
