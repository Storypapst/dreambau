import concurrent.futures
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from wsgiref.util import setup_testing_defaults

from server import create_app


class ProgressAPITests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.database = self.root / "private" / "progress.sqlite3"
        self.app = create_app(self.database, self.root)

    def request(self, method, path, body=None, token=None, raw=None):
        env = {}
        setup_testing_defaults(env)
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else b""
        env.update(REQUEST_METHOD=method, PATH_INFO=path, CONTENT_TYPE="application/json",
                   CONTENT_LENGTH=str(len(data)))
        env["wsgi.input"] = io.BytesIO(data)
        if token is not None:
            env["HTTP_AUTHORIZATION"] = "Bearer " + token
        result = {}
        def start_response(status, headers):
            result.update(status=int(status.split()[0]), headers=dict(headers))
        data = b"".join(self.app(env, start_response))
        if result["headers"]["Content-Type"].startswith("application/json"):
            data = json.loads(data)
        return result["status"], result["headers"], data

    def create(self):
        status, headers, result = self.request("POST", "/api/v1/profiles", {})
        self.assertEqual(status, 201)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(result["progress"], {})
        self.assertEqual(result["revision"], 0)
        return f"/api/v1/profiles/{result['profileId']}/progress", result["token"]

    def test_health_identifies_backend(self):
        self.assertEqual(self.request("GET", "/api/v1/health")[2],
                         {"status": "ok", "service": "kieselalarm", "apiVersion": 1})

    def test_completed_progress_survives_server_restart(self):
        path, token = self.create()
        progress = {"version": 1, "events": {"e1": {"type": "answer", "taskId": "tür", "correct": True}}}
        updated = self.request("PUT", path, {"revision": 0, "progress": progress}, token=token)
        expected = {"revision": 1, "progress": progress}
        self.assertEqual((updated[0], updated[2]), (200, expected))
        self.app = create_app(self.database, self.root)
        read = self.request("GET", path, token=token)
        self.assertEqual((read[0], read[2]), (200, expected))
        self.assertNotIn(token.encode(), self.database.read_bytes())

    def test_credentials_only_access_their_own_profile(self):
        path_a, token_a = self.create()
        path_b, token_b = self.create()
        self.assertNotEqual(path_a, path_b)
        self.assertNotEqual(token_a, token_b)
        for token in (None, token_a):
            for method, body in (("GET", None), ("PUT", {"revision": 0, "progress": {"private": True}})):
                with self.subTest(method=method, token_present=bool(token)):
                    status, _, result = self.request(method, path_b, body, token)
                    self.assertEqual(status, 401)
                    self.assertNotIn("progress", result)
        self.assertEqual(self.request("GET", path_b, token=token_b)[2],
                         {"revision": 0, "progress": {}})

    def test_simultaneous_writes_only_accept_one_and_return_current_state(self):
        path, token = self.create()
        gate = threading.Barrier(2)
        def write(word):
            gate.wait(timeout=5)
            return self.request("PUT", path, {"revision": 0, "progress": {"word": word}}, token)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, ["Apfel", "Birne"]))
        success, conflict = sorted(results, key=lambda item: item[0])
        self.assertEqual([success[0], conflict[0]], [200, 409])
        self.assertEqual(conflict[2], {**success[2], "error": "revision_conflict"})
        self.assertEqual(self.request("GET", path, token=token)[2], success[2])

    def test_invalid_writes_leave_revision_and_progress_unchanged(self):
        path, token = self.create()
        for value in ({"progress": {}}, {"revision": True, "progress": {}},
                      {"revision": -1, "progress": {}}, {"revision": 0, "progress": []}):
            self.assertEqual(self.request("PUT", path, value, token)[0], 400)
        for data in (b"{", b'{"revision":0,"progress":{"v":NaN}}', b"\xff"):
            self.assertEqual(self.request("PUT", path, token=token, raw=data)[0], 400)
        self.assertEqual(self.request("PUT", path, token=token, raw=b" " * (2 * 1024 * 1024 + 1))[0], 413)
        self.assertEqual(self.request("GET", path, token=token)[2], {"revision": 0, "progress": {}})

    def test_only_game_files_are_served(self):
        (self.root / "index.html").write_text("<title>Game</title>")
        (self.root / "app.mjs").write_text("export const ready = true")
        (self.root / "style.css").write_text("body { color: white }")
        for asset in ("prototype.html", "speech-clips.mjs", "review.mjs", "vocabulary.mjs"):
            (self.root / asset).write_text("game asset")
            self.assertEqual(self.request("GET", "/" + asset)[0], 200)
        (self.root / "profiles.mjs").symlink_to(self.database)
        for path, mime in (("/", "text/html"), ("/app.mjs", "text/javascript"), ("/style.css", "text/css")):
            status, headers, data = self.request("GET", path)
            self.assertEqual(status, 200)
            self.assertTrue(headers["Content-Type"].startswith(mime))
            self.assertTrue(data)
        for path in ("/private/progress.sqlite3", "/profiles.mjs", "/.git/config",
                     "/backend/server.py", "/../index.html", "/pack.mjs"):
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path)[0], 404)


if __name__ == "__main__":
    unittest.main()
