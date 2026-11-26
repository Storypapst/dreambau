"""Forward approved Dev SigNoz alert samples to private operator destinations."""

from dataclasses import dataclass
import hmac
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
from ipaddress import IPv4Address, IPv4Network
import json
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from uuid import UUID


WEBHOOK_PATH = "/signoz/alerts"
MAX_BYTES = 65_536
MAX_ALERTS = 8
RETRY_WINDOW = 600
IO_TIMEOUT = 4
HOOK_TIMEOUT = 16
PRIVATE_NETWORKS = tuple(IPv4Network(value) for value in (
    "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
))
SLUG = re.compile(r"[a-z][a-z0-9-]{0,62}")
NUMERIC = re.compile(r"[+-]?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")
STAMP = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
                   r"(?:\.[0-9]{1,9})?(?:Z|[+-][0-9]{2}:[0-9]{2})")


@dataclass(frozen=True)
class Settings:
    """Reviewed network, receiver and rule settings. Credentials are separate."""

    listen_host: str
    listen_port: int
    dev_peer: str
    buzz_executable: str
    buzz_port: int
    buzz_channel: str
    openclaw_port: int
    openclaw_agent: str
    rule_services: dict[str, str]

    @classmethod
    def load(cls, path):
        """Require an explicit private peer, local destinations and named rules."""
        settings = cls(**json.loads(Path(path).read_text(encoding="utf-8")))
        for host in (settings.listen_host, settings.dev_peer):
            if not isinstance(host, str):
                raise ValueError("a literal private IPv4 address is required")
            address = IPv4Address(host)
            if not any(address in network for network in PRIVATE_NETWORKS):
                raise ValueError("a literal private IPv4 address is required")
        for port in (settings.listen_port, settings.buzz_port, settings.openclaw_port):
            if type(port) is not int or not 1 <= port <= 65535:
                raise ValueError("a valid TCP port is required")
        buzz = Path(settings.buzz_executable)
        if not buzz.is_absolute() or not buzz.is_file() or not os.access(buzz, os.X_OK):
            raise ValueError("the Buzz executable must be available at an absolute path")
        channel = UUID(settings.buzz_channel)
        if not channel.int or str(channel) != settings.buzz_channel:
            raise ValueError("a canonical Buzz channel UUID is required")
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,62}", settings.openclaw_agent):
            raise ValueError("a named OpenClaw agent is required")
        rules = settings.rule_services
        if not isinstance(rules, dict) or not rules or any(
            not SLUG.fullmatch(rule) or not isinstance(service, str) or not SLUG.fullmatch(service)
            for rule, service in rules.items()
        ):
            raise ValueError("explicit rule and service slugs are required")
        return settings


@dataclass(frozen=True)
class Sample:
    """The three permitted values and a local retry identifier."""

    key: str
    text: str


def samples(payload, rules, receipt_key):
    """Validate the full pinned webhook batch before constructing any delivery."""
    if (not isinstance(payload, dict) or payload.get("version") != "4"
            or payload.get("truncatedAlerts") != 0):
        raise ValueError("invalid Alertmanager envelope")
    alerts = payload.get("alerts")
    if not isinstance(alerts, list) or not 1 <= len(alerts) <= MAX_ALERTS:
        raise ValueError("invalid alert batch")

    accepted = []
    for alert in alerts:
        if not isinstance(alert, dict) or not isinstance(alert.get("labels"), dict):
            raise ValueError("invalid alert labels")
        labels = alert["labels"]
        rule = labels.get("oriso_forward_rule")
        if (labels.get("environment") != "dev" or labels.get("managed_by") != "oriso_helm"
                or not isinstance(rule, str) or rule not in rules):
            raise ValueError("rule is outside the forwarding catalog")
        status = alert.get("status")
        if status not in ("firing", "resolved"):
            raise ValueError("invalid alert status")
        if status == "resolved" or labels.get("nodata") == "true":
            continue
        annotations = alert.get("annotations")
        value = annotations.get("oriso_forward_value") if isinstance(annotations, dict) else None
        if not isinstance(value, str) or len(value) > 40 or not NUMERIC.fullmatch(value):
            raise ValueError("a machine-readable numeric sample is required")
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("a finite numeric sample is required")
        normalized = str(number or 0.0)
        fingerprint, starts_at = alert.get("fingerprint"), alert.get("startsAt")
        if (not isinstance(fingerprint, str) or not re.fullmatch(r"[0-9a-f]{16}", fingerprint)
                or not isinstance(starts_at, str) or not STAMP.fullmatch(starts_at)):
            raise ValueError("a pinned webhook occurrence identifier is required")
        identity = f"oriso-signoz-forwarder:v1 {rule} {fingerprint} {starts_at} {normalized}".encode("ascii")
        accepted.append(Sample(
            hmac.digest(receipt_key, identity, "sha256").hex(),
            f"ORISO SigNoz rule={rule} service={rules[rule]} value={normalized}",
        ))
    return accepted


def credential(name):
    """Read one systemd-provided credential without placing it in argv."""
    value = (Path(os.environ["CREDENTIALS_DIRECTORY"]) / name).read_text(encoding="ascii").rstrip("\r\n")
    if not re.fullmatch(r"[!-~]{32,256}", value):
        raise ValueError("invalid service credential")
    return value


class Forwarder:
    """Send to each destination and persist confirmed receipts for retries."""

    def __init__(self, settings, database):
        self.settings = settings
        self.incoming = f"Bearer {credential('incoming_token')}".encode("ascii")
        self.buzz_key = credential("buzz_private_key")
        self.hook_token = credential("openclaw_hook_token")
        self.database = database
        self.database.execute(
            "CREATE TABLE IF NOT EXISTS receipts (event TEXT, destination TEXT, confirmed INTEGER,"
            " PRIMARY KEY (event, destination))"
        )

    def buzz(self, sample):
        """Run the pinned Buzz sender with a body on stdin and a dedicated identity."""
        result = subprocess.run(
            [self.settings.buzz_executable, "messages", "send", "--channel", self.settings.buzz_channel,
             "--content", "-"],
            input=sample.text, text=True, timeout=IO_TIMEOUT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env={"BUZZ_PRIVATE_KEY": self.buzz_key, "BUZZ_RELAY_URL": f"http://127.0.0.1:{self.settings.buzz_port}"},
        )
        return result.returncode == 0

    def openclaw(self, sample):
        """Send only the normalized event to the dedicated loopback hook."""
        connection = http.client.HTTPConnection("127.0.0.1", self.settings.openclaw_port, timeout=HOOK_TIMEOUT)
        body = json.dumps({
            "name": "ORISO SigNoz", "message": sample.text, "agentId": self.settings.openclaw_agent, "deliver": False,
        }).encode("ascii")
        try:
            connection.request("POST", "/hooks/agent", body, {
                "Authorization": f"Bearer {self.hook_token}", "Content-Type": "application/json",
                "Idempotency-Key": sample.key,
            })
            response = connection.getresponse()
            if response.status != 200:
                return False
            reply_body = response.read(4097)
            if len(reply_body) > 4096:
                return False
            reply = json.loads(reply_body)
            return (isinstance(reply, dict) and reply.get("ok") is True
                    and isinstance(reply.get("runId"), str) and bool(reply["runId"]))
        finally:
            connection.close()

    def deliver(self, batch):
        """Return success after both destinations confirm or have recent receipts."""
        with self.database:
            self.database.execute("DELETE FROM receipts WHERE confirmed <= ?", (int(time.time()) - RETRY_WINDOW,))
        succeeded = True
        for sample in batch:
            for destination, send in (("buzz", self.buzz), ("openclaw", self.openclaw)):
                key = (sample.key, destination)
                if self.database.execute(
                    "SELECT 1 FROM receipts WHERE event = ? AND destination = ?", key,
                ).fetchone():
                    continue
                try:
                    confirmed = send(sample)
                except (OSError, subprocess.SubprocessError, http.client.HTTPException, ValueError):
                    confirmed = False
                if confirmed:
                    with self.database:
                        self.database.execute("INSERT INTO receipts VALUES (?, ?, ?)", (*key, int(time.time())))
                else:
                    logging.warning("destination unavailable: %s", destination)
                    succeeded = False
        return succeeded


class Handler(BaseHTTPRequestHandler):
    """Accept only an exact authenticated request from the configured TCP peer."""

    def setup(self):
        self.request.settimeout(IO_TIMEOUT)
        super().setup()

    def log_message(self, *_args):
        pass

    def send_error(self, code, message=None, explain=None):
        self.respond(code)

    def respond(self, status):
        """Respond without request data or destination diagnostics."""
        self.send_response_only(status)
        if status == 401:
            self.send_header("WWW-Authenticate", "Bearer")
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_POST(self):
        forwarder = self.server.forwarder
        if self.requestline.split()[1] != WEBHOOK_PATH:
            return self.respond(404)
        if self.client_address[0] != forwarder.settings.dev_peer:
            return self.respond(403)
        authorization = self.headers.get_all("Authorization", [])
        if len(authorization) != 1 or not hmac.compare_digest(
            authorization[0].encode("latin-1"), forwarder.incoming,
        ):
            return self.respond(401)
        if self.headers.get_content_type() != "application/json" or self.headers.get("Content-Encoding"):
            return self.respond(415)
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get("Transfer-Encoding") or len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,9}", lengths[0]):
            return self.respond(400)
        length = int(lengths[0])
        if length > MAX_BYTES:
            return self.respond(413)
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                return self.respond(400)
            payload = json.loads(body.decode("utf-8"))
        except (ValueError, RecursionError, TimeoutError):
            return self.respond(400)
        try:
            batch = samples(payload, forwarder.settings.rule_services, forwarder.incoming)
        except ValueError:
            return self.respond(422)
        try:
            complete = forwarder.deliver(batch)
        except sqlite3.Error:
            logging.error("delivery receipt store unavailable")
            complete = False
        self.respond(204 if complete else 503)


class Server(HTTPServer):
    """Serve one bounded batch at a time and keep failures free of request data."""

    def handle_error(self, request, client_address):
        logging.warning("request connection ended")


def main():
    """Run the standalone host service with systemd's credential and state paths."""
    if len(sys.argv) != 2:
        print("Usage: forwarder.py SETTINGS.json", file=sys.stderr)
        return 2
    try:
        settings = Settings.load(sys.argv[1])
        database = sqlite3.connect(Path(os.environ["STATE_DIRECTORY"]) / "receipts.sqlite3")
        try:
            forwarder = Forwarder(settings, database)
            with Server((settings.listen_host, settings.listen_port), Handler) as server:
                server.forwarder = forwarder
                server.serve_forever()
        finally:
            database.close()
    except (KeyError, TypeError, ValueError, OSError, sqlite3.Error) as error:
        logging.error("forwarder startup failed: %s", type(error).__name__)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
