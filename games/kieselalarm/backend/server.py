"""Kieselalarm's versioned JSON progress API and same-origin development server."""

import argparse
from contextlib import closing
from hashlib import sha256
from http import HTTPStatus
import json
import os
from pathlib import Path
import re
import secrets
from socketserver import ThreadingMixIn
import sqlite3
import sys
import uuid
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "backend" / "data" / "progress.sqlite3"
MAX_BODY = 2 * 1024 * 1024
PROFILES = "/api/v1/profiles"
PROGRESS_PATH = re.compile(r"/api/v1/profiles/([0-9a-f-]{36})/progress")
TOKEN_HEADER = re.compile(r"Bearer ([A-Za-z0-9_-]{43})", re.IGNORECASE | re.ASCII)
PUBLIC_MODULES = {
    "app.mjs", "learning.mjs", "profiles.mjs", "review.mjs", "run.mjs",
    "scene.mjs", "speech-clips.mjs", "vocabulary.mjs", "words.mjs",
}
PUBLIC_FILES = {"index.html": "text/html", "prototype.html": "text/html", "style.css": "text/css",
                **dict.fromkeys(PUBLIC_MODULES, "text/javascript")}


def compact_json(value):
    return json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":"))


class ApiError(Exception):
    def __init__(self, status, code, **details):
        super().__init__(code)
        self.status = status
        self.body = {"error": code, **details}


def read_json(env):
    if env.get("CONTENT_TYPE", "").split(";", 1)[0].strip().lower() != "application/json":
        raise ApiError(415, "expected_application_json")
    content_length = env.get("CONTENT_LENGTH", "")
    if not content_length:
        raise ApiError(411, "length_required")
    if not re.fullmatch(r"[0-9]{1,12}", content_length):
        raise ApiError(400, "invalid_length")
    size = int(content_length)
    if size > MAX_BODY:
        raise ApiError(413, "body_too_large")

    def invalid_constant(value):
        raise ValueError(value)

    try:
        raw = env["wsgi.input"].read(size)
        if len(raw) != size:
            raise ValueError("incomplete body")
        body = json.loads(raw.decode("utf-8"), parse_constant=invalid_constant)
        if not isinstance(body, dict):
            raise ValueError("object required")
        # Includes overflows such as 1e999, which json.loads otherwise accepts.
        compact_json(body)
    except (ValueError, RecursionError) as exc:
        raise ApiError(400, "invalid_json") from exc
    return body


def initialize(database):
    database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(database, os.O_CREAT | os.O_WRONLY, 0o600)
    os.close(descriptor)
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(Path(__file__).with_name("profiles.sql").read_text(encoding="utf-8"))


class ProgressApp:
    def __init__(self, database, web_root):
        self.database = Path(database)
        self.web_root = Path(web_root).resolve()
        initialize(self.database)

    def profile(self, env, method, profile_id):
        match = TOKEN_HEADER.fullmatch(env.get("HTTP_AUTHORIZATION", ""))
        if not match:
            raise ApiError(401, "unauthorized")
        token_hash = sha256(match[1].encode("ascii")).digest()
        key = (profile_id, token_hash)
        with closing(sqlite3.connect(self.database)) as db, db:
            if method == "PUT":
                body = read_json(env)
                revision = body.get("revision")
                progress = body.get("progress")
                if (set(body) != {"revision", "progress"} or type(revision) is not int
                        or not 0 <= revision <= 2**53 - 1 or not isinstance(progress, dict)):
                    raise ApiError(400, "invalid_progress")
                # The compare-and-swap and the subsequent read share one transaction.
                written = db.execute(
                    "UPDATE profiles SET revision = revision + 1, progress = ? "
                    "WHERE id = ? AND token_hash = ? AND revision = ?",
                    (compact_json(progress), *key, revision),
                ).rowcount
                if written:
                    return 200, {"revision": revision + 1, "progress": progress}

            row = db.execute(
                "SELECT revision, progress FROM profiles WHERE id = ? AND token_hash = ?", key
            ).fetchone()
            if row is None:
                raise ApiError(401, "unauthorized")
            snapshot = {"revision": row[0], "progress": json.loads(row[1])}
            if method == "PUT":
                raise ApiError(409, "revision_conflict", **snapshot)
            return 200, snapshot

    def api(self, env, path, method):
        if path == "/api/v1/health" and method == "GET":
            return 200, {"status": "ok", "service": "kieselalarm", "apiVersion": 1}
        if path == PROFILES and method == "POST":
            if read_json(env):
                raise ApiError(400, "empty_object_required")
            profile_id = str(uuid.uuid4())
            token = secrets.token_urlsafe(32)
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute("INSERT INTO profiles (id, token_hash) VALUES (?, ?)",
                           (profile_id, sha256(token.encode("ascii")).digest()))
            return 201, {"profileId": profile_id, "token": token, "revision": 0, "progress": {}}
        match = PROGRESS_PATH.fullmatch(path)
        if match and method in {"GET", "PUT"}:
            return self.profile(env, method, match[1])
        if match or path in {PROFILES, "/api/v1/health"}:
            raise ApiError(405, "method_not_allowed")
        raise ApiError(404, "not_found")

    def game_file(self, path, method):
        name = "index.html" if path == "/" else path.removeprefix("/")
        mime = PUBLIC_FILES.get(name)
        if mime is None:
            raise ApiError(404, "not_found")
        if method not in {"GET", "HEAD"}:
            raise ApiError(405, "method_not_allowed")
        file = self.web_root / name
        if file.is_symlink() or not file.is_file():
            raise ApiError(404, "not_found")
        return mime + "; charset=utf-8", file.read_bytes()

    def __call__(self, env, start_response):
        path = env["PATH_INFO"]
        method = env["REQUEST_METHOD"]
        mime = "application/json; charset=utf-8"
        headers = [("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff")]
        try:
            if path.startswith("/api/"):
                status, payload = self.api(env, path, method)
                data = compact_json(payload).encode("ascii")
            else:
                status = 200
                mime, data = self.game_file(path, method)
        except ApiError as exc:
            status = exc.status
            data = compact_json(exc.body).encode("ascii")
            if status == 401:
                headers.append(("WWW-Authenticate", 'Bearer realm="Kieselalarm"'))
        except sqlite3.OperationalError:
            status = 503
            data = b'{"error":"storage_unavailable"}'
            headers.append(("Retry-After", "2"))
        headers += [("Content-Type", mime), ("Content-Length", str(len(data)))]
        start_response(f"{status} {HTTPStatus(status).phrase}", headers)
        return [] if method == "HEAD" else [data]


def create_app(database=None, web_root=ROOT):
    return ProgressApp(database or os.environ.get("KIESELALARM_DB", DEFAULT_DB), web_root)


class LocalServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class QuietHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        # Keep profile identifiers and URLs out of routine access logs.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--database", type=Path, help="SQLite file (default: KIESELALARM_DB or backend/data/progress.sqlite3)")
    args = parser.parse_args()
    app = create_app(args.database)
    with make_server(args.host, args.port, app, LocalServer, QuietHandler) as server:
        url = f"http://{args.host}:{server.server_port}/"
        print(f"Kieselalarm läuft unter {url}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            return 0


if __name__ == "__main__":
    sys.exit(main())
