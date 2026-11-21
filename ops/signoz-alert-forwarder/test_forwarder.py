"""Exercise the operator entry point against loopback-only synthetic destinations."""

from copy import deepcopy
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time
import unittest


FORWARDER = Path(__file__).with_name("forwarder.py")
INCOMING_TOKEN = "synthetic-incoming-" + "a" * 32
HOOK_TOKEN = "synthetic-hook-" + "b" * 32
BUZZ_KEY = "synthetic-buzz-" + "c" * 32
CHANNEL_ID = "6816a31a-1536-44d8-a12e-2095ca38226b"
MARKER = "synthetic-private-counselling-and-address"
RULE = "collector-staleness"
TEXT = f"ORISO SigNoz rule={RULE} service=collector value=0.125"
ALERT = {
    "status": "firing",
    "labels": {
        "environment": "dev",
        "managed_by": "oriso_helm",
        "oriso_forward_rule": RULE,
        "alertname": MARKER,
        "instance": "192.0.2.17",
        "testalert": "true",
    },
    "annotations": {
        "oriso_forward_value": "1.25e-1",
        "summary": MARKER,
        "description": MARKER,
    },
    "startsAt": "2026-11-08T02:30:00.123456789Z",
    "endsAt": "2026-11-08T02:40:00Z",
    "fingerprint": "0837fb617a5dcc80",
    "generatorURL": "https://example.invalid/" + MARKER,
}


def envelope(*alerts):
    """Match the v0.135.1 Alertmanager version 4 envelope."""
    return {
        "version": "4",
        "receiver": "oriso-alerts-agents",
        "status": "firing",
        "alerts": list(alerts),
        "truncatedAlerts": 0,
        "groupKey": MARKER,
        "groupLabels": {"environment": "dev"},
        "externalURL": "https://example.invalid/" + MARKER,
    }


class HookCapture(BaseHTTPRequestHandler):
    """Capture the actual loopback HTTP request emitted by the forwarder."""

    def log_message(self, *_args):
        pass

    def do_POST(self):
        length = int(self.headers["Content-Length"])
        self.server.received.append((
            self.path, self.headers.get("Authorization"), self.headers.get("Idempotency-Key"),
            json.loads(self.rfile.read(length)),
        ))
        status, response = self.server.replies.pop(0) if self.server.replies else (200, {"ok": True, "runId": "synthetic"})
        self.send_response(status)
        self.end_headers()
        self.wfile.write(json.dumps(response).encode("ascii"))


class ForwarderTest(unittest.TestCase):
    """Verify the source boundary, both destination contracts and retry receipts."""

    def setUp(self):
        self.scratch = TemporaryDirectory(prefix="signoz-forwarder-test-")
        self.addCleanup(self.scratch.cleanup)
        self.directory = Path(self.scratch.name)
        self.hook = HTTPServer(("127.0.0.1", 0), HookCapture)
        self.hook.received = []
        self.hook.replies = []
        self.addCleanup(self.hook.server_close)
        self.thread = Thread(target=self.hook.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.hook.shutdown)

        self.buzz_log = self.directory / "buzz.jsonl"
        self.buzz_fail = self.directory / "buzz-fail"
        buzz = self.directory / "buzz"
        buzz.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\n"
            "from pathlib import Path\n"
            f"if Path({str(self.buzz_fail)!r}).is_file():\n"
            f"    print({MARKER!r}, file=sys.stderr)\n"
            "    sys.exit(2)\n"
            f"with open({str(self.buzz_log)!r}, 'a') as stream:\n"
            "    stream.write(json.dumps({\n"
            "        'argv': sys.argv[1:], 'text': sys.stdin.read(),\n"
            "        'url': os.environ.get('BUZZ_RELAY_URL'),\n"
            f"        'signed': os.environ.get('BUZZ_PRIVATE_KEY') == {BUZZ_KEY!r},\n"
            "        'environment': sorted(os.environ),\n"
            "    }) + '\\n')\n",
            encoding="utf-8",
        )
        buzz.chmod(0o700)
        for name, value in (("incoming_token", INCOMING_TOKEN), ("buzz_private_key", BUZZ_KEY),
                            ("openclaw_hook_token", HOOK_TOKEN)):
            (self.directory / name).write_text(value + "\n", encoding="ascii")
        with socket.socket() as reserve:
            reserve.bind(("127.0.0.1", 0))
            self.port = reserve.getsockname()[1]
        self.settings = {
            "listen_host": "127.0.0.1",
            "listen_port": self.port,
            "dev_peer": "127.0.0.1",
            "buzz_executable": str(buzz),
            "buzz_port": 3100,
            "buzz_channel": CHANNEL_ID,
            "openclaw_port": self.hook.server_port,
            "openclaw_agent": "synthetic-alerts",
            "rule_services": {RULE: "collector", "clickhouse-capacity": "clickhouse"},
        }
        self.addCleanup(self.stop)
        self.process = None
        self.diagnostics = b""

    def start(self):
        config = self.directory / "settings.json"
        config.write_text(json.dumps(self.settings), encoding="ascii")
        self.process = subprocess.Popen(
            [sys.executable, "-B", str(FORWARDER), str(config)],
            env={**os.environ, "CREDENTIALS_DIRECTORY": str(self.directory), "STATE_DIRECTORY": str(self.directory)},
            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and self.process.poll() is None:
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.25):
                    return
            except OSError:
                time.sleep(0.02)
        self.stop()
        self.fail(f"Forwarder did not start: {self.diagnostics.decode(errors='replace')}")

    def stop(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
            _, diagnostics = self.process.communicate(timeout=6)
            self.diagnostics += diagnostics
            self.process = None

    def send(self, payload, token=INCOMING_TOKEN, path="/signoz/alerts", headers=None):
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("ascii")
        request_headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=6)
        try:
            connection.request("POST", path, body=body, headers={**request_headers, **(headers or {})})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def buzz_messages(self):
        if not self.buzz_log.exists():
            return []
        return [json.loads(line) for line in self.buzz_log.read_text(encoding="utf-8").splitlines()]

    def test_only_approved_rule_service_and_number_reach_each_destination(self):
        self.start()
        self.assertEqual(self.send(envelope(ALERT)), (204, b""))
        buzz, = self.buzz_messages()
        self.assertEqual(buzz["argv"], ["messages", "send", "--channel", CHANNEL_ID, "--content", "-"])
        self.assertEqual(buzz["text"], TEXT)
        self.assertEqual(buzz["url"], "http://127.0.0.1:3100")
        self.assertTrue(buzz["signed"])
        self.assertNotIn("CREDENTIALS_DIRECTORY", buzz["environment"])
        hook, = self.hook.received
        path, authorization, key, message = hook
        self.assertEqual((path, authorization), ("/hooks/agent", f"Bearer {HOOK_TOKEN}"))
        self.assertRegex(key, r"^[0-9a-f]{64}$")
        self.assertEqual(message,
                         {"name": "ORISO SigNoz", "message": TEXT, "agentId": "synthetic-alerts", "deliver": False})
        self.stop()
        self.assertNotIn(MARKER.encode(), self.diagnostics)
        database = (self.directory / "receipts.sqlite3").read_bytes()
        for raw in (MARKER, ALERT["fingerprint"], ALERT["startsAt"], TEXT):
            self.assertNotIn(raw.encode(), database)

    def test_replay_after_restart_only_retries_the_failed_destination(self):
        self.start()
        self.hook.replies[:] = [(503, {"error": MARKER})]
        self.assertEqual(self.send(envelope(ALERT)), (503, b""))
        self.assertEqual(len(self.buzz_messages()), 1)
        self.stop()
        self.start()
        self.assertEqual(self.send(envelope(ALERT)), (204, b""))
        self.assertEqual(self.send(envelope(ALERT)), (204, b""))
        self.assertEqual(len(self.buzz_messages()), 1)
        self.assertEqual(len(self.hook.received), 2)
        self.assertEqual(self.hook.received[0][2], self.hook.received[1][2])

    def test_buzz_failure_keeps_the_confirmed_openclaw_admission(self):
        self.start()
        self.buzz_fail.touch()
        self.assertEqual(self.send(envelope(ALERT)), (503, b""))
        self.assertEqual(len(self.hook.received), 1)
        self.buzz_fail.unlink()
        self.assertEqual(self.send(envelope(ALERT)), (204, b""))
        self.assertEqual(len(self.buzz_messages()), 1)
        self.assertEqual(len(self.hook.received), 1)
        self.stop()
        self.assertNotIn(MARKER.encode(), self.diagnostics)

    def test_invalid_batch_never_delivers_an_earlier_valid_alert(self):
        self.start()
        for key, value in (("oriso_forward_value", MARKER), ("oriso_forward_value", "NaN"),
                           ("oriso_forward_value", "1e999"), ("oriso_forward_value", None)):
            with self.subTest(value=value):
                invalid = deepcopy(ALERT)
                invalid["annotations"][key] = value
                self.assertEqual(self.send(envelope(ALERT, invalid)), (422, b""))
        unknown = deepcopy(ALERT)
        unknown["labels"]["oriso_forward_rule"] = MARKER
        self.assertEqual(self.send(envelope(unknown)), (422, b""))
        self.assertEqual(self.buzz_messages(), [])
        self.assertEqual(self.hook.received, [])

    def test_unauthenticated_and_malformed_requests_are_rejected(self):
        self.start()
        self.assertEqual(self.send(envelope(ALERT), token=MARKER), (401, b""))
        self.assertEqual(self.send(envelope(ALERT), path="/signoz/alerts?input=" + MARKER), (404, b""))
        self.assertEqual(self.send(envelope(ALERT), path="//signoz/alerts"), (404, b""))
        self.assertEqual(self.send(envelope(ALERT), headers={"Content-Type": "text/plain"}), (415, b""))
        self.assertEqual(self.send(b"x" * 65537), (413, b""))
        self.assertEqual(self.send(b'{"' + MARKER.encode()), (400, b""))
        self.assertEqual(self.buzz_messages(), [])
        self.assertEqual(self.hook.received, [])

    def test_non_measured_notifications_do_not_invent_numeric_values(self):
        self.start()
        missing = deepcopy(ALERT)
        missing["labels"]["nodata"] = "true"
        del missing["annotations"]["oriso_forward_value"]
        resolved = deepcopy(missing)
        del resolved["labels"]["nodata"]
        resolved["status"] = "resolved"
        self.assertEqual(self.send(envelope(missing, resolved)), (204, b""))
        self.assertEqual(self.buzz_messages(), [])
        self.assertEqual(self.hook.received, [])

    def test_success_status_without_hook_admission_is_retryable(self):
        self.start()
        self.hook.replies[:] = [(200, {"error": MARKER})]
        self.assertEqual(self.send(envelope(ALERT)), (503, b""))
        self.assertEqual(self.send(envelope(ALERT)), (204, b""))
        self.assertEqual(len(self.buzz_messages()), 1)
        self.assertEqual(len(self.hook.received), 2)

    def test_unapproved_peer_cannot_spoof_the_source_header(self):
        self.settings["dev_peer"] = "127.0.0.2"
        self.start()
        self.assertEqual(self.send(envelope(ALERT), headers={"X-Forwarded-For": "127.0.0.2"}), (403, b""))
        self.assertEqual(self.buzz_messages(), [])
        self.assertEqual(self.hook.received, [])


if __name__ == "__main__":
    unittest.main()
