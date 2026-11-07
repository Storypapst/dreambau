#!/usr/bin/env python3
"""Explicit application backups to encrypted restic/SFTP; no mounts, stop, prune or secret logging."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import shlex
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone


class Failure(Exception):
    pass


def require(ok, code="invalid_configuration"):
    if not ok:
        raise Failure(code)


def absolute(value):
    require(isinstance(value, str) and value.startswith("/") and not any(c in value for c in "\r\n\0"))
    p = Path(value)
    require(".." not in p.parts)
    return p


def private_file(value):
    p = absolute(value)
    try:
        s = p.lstat()
    except OSError:
        raise Failure("private_file_required")
    require(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid() and not s.st_mode & 0o077
            and s.st_size > 0, "private_file_required")
    return p


def secure_directory(p):
    if not p.exists():
        p.mkdir(parents=True, mode=0o700)
    s = p.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid() and not s.st_mode & 0o077,
            "private_directory_required")


def contained(path, root):
    return path == root or root in path.parents


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(value, f, sort_keys=True)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def validate(c):
    require(c.get("version") == 1)
    require(re.fullmatch(r"[A-Za-z0-9_.-]+", c.get("hostLabel", "")) is not None)
    state = absolute(c["stateDirectory"])
    box = c["storageBox"]
    require(re.fullmatch(r"u[0-9]+(?:-sub[0-9]+)?", box.get("user", "")) is not None)
    require(re.fullmatch(r"[a-z0-9-]+\.your-storagebox\.de", box.get("host", "")) is not None)
    remote = box.get("repositoryPath", "")
    require(remote and not remote.startswith("/") and all(re.fullmatch(r"[A-Za-z0-9_.-]+", x)
            and x not in (".", "..") for x in remote.split("/")))
    for key in ["identityFile", "knownHostsFile", "passwordFile"]:
        absolute(box[key])
    for key in ["restic", "ssh"]:
        absolute(c["binaries"][key])
    for key in ["fileSources", "excludedPaths", "liveDatabasePaths", "sqlite", "databaseDumps", "objectMirrors"]:
        require(isinstance(c.get(key), list))
    for p in c["fileSources"]:
        source = absolute(p)
        # Reject broad sources containing this job's own state, caches or staged plaintext.
        require(not contained(state, source) and not contained(source, state), "recursive_source")
        require(source != Path("/"), "recursive_source")
    for p in c["excludedPaths"] + c["liveDatabasePaths"]:
        absolute(p)
    require(len(c["fileSources"]) + len(c["sqlite"]) + len(c["databaseDumps"]) + len(c["objectMirrors"]) > 0)
    for p in c.get("coordinationLocks", []):
        absolute(p)
    require(isinstance(c.get("maxStagingBytes"), int) and c["maxStagingBytes"] > 0)
    require(isinstance(c.get("minFreeBytes"), int) and c["minFreeBytes"] >= 0)
    require(isinstance(c.get("verificationPercent"), int) and 1 <= c["verificationPercent"] <= 100)
    require(isinstance(c.get("coverage", {}).get("included"), list)
            and isinstance(c.get("coverage", {}).get("omitted"), list))
    names = set()
    for item in c["sqlite"] + c["databaseDumps"] + c["objectMirrors"]:
        name = item.get("name", "")
        require(re.fullmatch(r"[A-Za-z0-9_-]+", name) is not None and name not in names)
        names.add(name)
    for item in c["sqlite"]:
        absolute(item["path"])
    for item in c["databaseDumps"]:
        require(item.get("engine") in ("postgres", "mariadb"))
        require(item.get("transactionalOnly") is True)
        for k in ["container", "user", "database"]:
            require(re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", item.get(k, "")) is not None)
        absolute(item["passwordFile"])
        require(absolute(item["dataPath"]) in [absolute(p) for p in c["liveDatabasePaths"]])
    for item in c["objectMirrors"]:
        absolute(item["mcConfigDirectory"])
        require(re.fullmatch(r"[A-Za-z0-9_-]+", item.get("alias", "")) is not None)
        require(re.fullmatch(r"[a-z0-9][a-z0-9.-]+", item.get("bucket", "")) is not None)
    return state


class Backup:
    def __init__(self, config):
        self.c = config
        self.state = validate(config)
        self.attempt = uuid.uuid4().hex
        self.stage = self.state / "staging"
        self.snapshot_ids = []
        self.manifest = []
        self.sqlite_files = []
        self.object_manifests = []
        self.object_samples = []
        self.started = datetime.now(timezone.utc).isoformat()
        self.env = {"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "C.UTF-8", "HOME": str(self.state)}
        box = self.c["storageBox"]
        ssh = [self.c["binaries"]["ssh"], "-F", "/dev/null", "-p", "22", "-i", box["identityFile"],
               "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "PasswordAuthentication=no",
               "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + box["knownHostsFile"],
               "-o", "GlobalKnownHostsFile=/dev/null",
               "-o", "ForwardAgent=no", "-o", "ClearAllForwardings=yes", "-o", "ConnectTimeout=15",
               "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
               box["user"] + "@" + box["host"], "-s", "sftp"]
        self.restic_base = [self.c["binaries"]["restic"], "--no-cache", "-o", "sftp.command=" + shlex.join(ssh)]
        self.env.update(RESTIC_REPOSITORY="sftp:" + box["user"] + "@" + box["host"] + ":" + box["repositoryPath"],
                        RESTIC_PASSWORD_FILE=box["passwordFile"])

    def preflight(self):
        for key in ["identityFile", "knownHostsFile", "passwordFile"]:
            private_file(self.c["storageBox"][key])
        for name in ["restic", "ssh"] + (["docker"] if self.c["databaseDumps"] else []) + (["mc"] if self.c["objectMirrors"] else []):
            p = absolute(self.c["binaries"][name])
            require(p.is_file() and os.access(p, os.X_OK) and p.stat().st_uid in (0, os.getuid())
                    and not p.stat().st_mode & 0o022, "binary_unavailable")
        for item in self.c["databaseDumps"]:
            private_file(item["passwordFile"])
        for item in self.c["objectMirrors"]:
            private_file(str(absolute(item["mcConfigDirectory"]) / "config.json"))
        secure_directory(self.state)
        self.reserve()

    def reserve(self, additional=0):
        require(shutil.disk_usage(self.state).free - additional >= self.c["minFreeBytes"], "disk_reserve")

    def staged_size(self):
        return sum(p.stat().st_size for p in self.stage.rglob("*") if p.is_file())

    def bounded(self, additional):
        require(self.staged_size() + additional <= self.c["maxStagingBytes"], "staging_limit")
        self.reserve(additional)

    def command(self, args, failure="command_failed", data=None):
        try:
            r = subprocess.run(args, env=self.env, input=data, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, timeout=3600, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise Failure(failure)
        require(r.returncode == 0, failure)  # restic exit 3 (live-file warning) is a failed backup.
        return r.stdout

    def restic(self, args, data=None):
        return self.command(self.restic_base + args, "restic_failed", data)

    def snapshot(self, args, data=None):
        output = self.restic(["backup", "--json", "--host", self.c["hostLabel"],
                              "--tag", "storage-box-set:" + self.attempt] + args, data)
        summary = None
        try:
            for line in output.splitlines():
                obj = json.loads(line)
                if obj.get("message_type") == "summary":
                    summary = obj
        except (ValueError, AttributeError):
            raise Failure("invalid_restic_receipt")
        sid = summary.get("snapshot_id", "") if summary else ""
        require(re.fullmatch(r"[0-9a-f]{8,64}", sid) is not None, "invalid_restic_receipt")
        self.snapshot_ids.append(sid)
        return sid

    def digest(self, path):
        h = hashlib.sha256()
        with path.open("rb") as f:
            for b in iter(lambda: f.read(1024 * 1024), b""):
                h.update(b)
        return h.hexdigest()

    def restored_digest(self, sid, name, destination=None):
        """Hash remote restored bytes incrementally; database streams never land in RAM whole."""
        p = subprocess.Popen(self.restic_base + ["dump", sid, name], env=self.env,
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        h = hashlib.sha256()
        output = destination.open("xb") if destination else None
        selector = selectors.DefaultSelector()
        selector.register(p.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + 3600
        try:
            while True:
                require(time.monotonic() < deadline, "restore_failed")
                if not selector.select(timeout=1):
                    continue
                chunk = os.read(p.stdout.fileno(), 1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
                if output:
                    self.bounded(len(chunk))
                    output.write(chunk)
            require(p.wait(timeout=30) == 0, "restore_failed")
            return h.hexdigest()
        finally:
            selector.close()
            if output:
                output.close()
            if p.poll() is None:
                p.kill()
            p.wait()

    def chunks(self, process, failure):
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + 3600
        try:
            while True:
                require(time.monotonic() < deadline, failure)
                if not selector.select(timeout=1):
                    continue
                chunk = os.read(process.stdout.fileno(), 1024 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            selector.close()

    def sqlite(self, item):
        source = absolute(item["path"])
        require(source.is_file() and not source.is_symlink(), "sqlite_source_unavailable")
        # The SQLite backup API includes committed WAL pages; never copy the live file/WAL separately.
        self.bounded(source.stat().st_size * 2)
        dest = self.stage / "sqlite" / (item["name"] + ".snapshot")
        dest.parent.mkdir(mode=0o700, exist_ok=True)
        try:
            with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=15) as src:
                with sqlite3.connect(dest) as dst:
                    deadline = time.monotonic() + 120
                    def progress(_status, _remaining, _total):
                        require(time.monotonic() < deadline, "sqlite_backup_timeout")
                        self.bounded(0)
                    src.backup(dst, pages=256, sleep=0.01, progress=progress)
                    require(dst.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "sqlite_integrity_failed")
        except sqlite3.Error:
            raise Failure("sqlite_backup_failed")
        os.chmod(dest, 0o600)
        self.sqlite_files.append(dest)
        self.manifest.append({"kind": "sqlite", "name": item["name"], "bytes": dest.stat().st_size,
                              "sha256": self.digest(dest)})
        self.bounded(0)
        return dest

    def mc(self, item, args):
        return self.command([self.c["binaries"]["mc"], "--config-dir", item["mcConfigDirectory"]] + args, "object_copy_failed")

    def object_inventory(self, item):
        remote = item["alias"] + "/" + item["bucket"]
        try:
            rows = [json.loads(line) for line in self.mc(item, ["ls", "--recursive", "--json", remote]).splitlines() if line]
        except ValueError:
            raise Failure("invalid_object_inventory")
        result = []
        for row in rows:
            require(row.get("status") == "success", "object_copy_failed")
            if row.get("type") == "folder":
                continue
            key = row.get("key", "")
            path = PurePosixPath(key)
            require(key and not path.is_absolute() and all(x not in ("", ".", "..") for x in key.split("/"))
                    and not any(x in key for x in "\0\r\n"), "unsafe_object_key")
            require(isinstance(row.get("size"), int) and row["size"] >= 0, "invalid_object_inventory")
            result.append({"key": key, "size": row["size"], "etag": row.get("etag")})
        require(len({x["key"] for x in result}) == len(result), "invalid_object_inventory")
        return sorted(result, key=lambda x: x["key"])

    def object_info(self, item, remote):
        try:
            info = json.loads(self.mc(item, ["stat", "--json", remote]))
            require(info.get("status") == "success" and isinstance(info.get("size"), int), "object_copy_failed")
            metadata = info.get("metadata") or info.get("metaData") or {}
            require(isinstance(metadata, dict), "invalid_object_inventory")
            content_type = info.get("contentType") or metadata.get("Content-Type") or "application/octet-stream"
            etag = info.get("etag")
            require(isinstance(etag, str) and etag, "invalid_object_inventory")
            return {"size": info["size"], "etag": etag.strip('"'), "contentType": content_type, "metadata": metadata}
        except ValueError:
            raise Failure("invalid_object_inventory")

    def mirror(self, item):
        before = self.object_inventory(item)
        require(len(before) >= item.get("minObjects", 1), "object_inventory_empty")
        self.bounded(sum(x["size"] for x in before))
        directory = self.stage / "objects" / item["name"]
        directory.mkdir(parents=True, mode=0o700)
        entries = []
        for obj in before:
            remote = item["alias"] + "/" + item["bucket"] + "/" + obj["key"]
            info = self.object_info(item, remote)
            require(info["size"] == obj["size"], "object_changed")
            # S3 permits both "key" and "key/child". Flat hashed names avoid filesystem aliasing.
            dest = directory / "blobs" / hashlib.sha256(obj["key"].encode()).hexdigest()
            dest.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            # Stream each logical S3 object; never read MinIO's internal data directory.
            p = subprocess.Popen([self.c["binaries"]["mc"], "--config-dir", item["mcConfigDirectory"], "cat", remote],
                                 env=self.env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            size = 0
            try:
                with dest.open("xb") as f:
                    for chunk in self.chunks(p, "object_copy_failed"):
                        size += len(chunk)
                        require(size <= obj["size"], "object_changed")
                        self.bounded(len(chunk))
                        f.write(chunk)
                require(p.wait(timeout=60) == 0 and size == obj["size"], "object_copy_failed")
            finally:
                if p.poll() is None:
                    p.kill()
                p.wait()
            require(self.object_info(item, remote) == info, "object_changed")
            entries.append({**obj, **info, "replicaPath": str(dest.relative_to(directory)), "sha256": self.digest(dest)})
            if not any(x[0] == item["name"] for x in self.object_samples):
                self.object_samples.append((item["name"], dest))
        # The snapshot predates future uploads; only its baseline objects must stay unchanged.
        after = {obj["key"]: obj for obj in self.object_inventory(item)}
        require(all(after.get(obj["key"]) == obj for obj in before), "object_inventory_changed")
        manifest = self.stage / "object-metadata" / (item["name"] + ".json")
        manifest.parent.mkdir(mode=0o700, exist_ok=True)
        atomic_json(manifest, {"objects": entries})
        self.object_manifests.append(manifest)
        self.manifest.append({"kind": "s3-logical-replica", "name": item["name"], "objects": len(entries),
                              "bytes": sum(x["size"] for x in entries)})
        self.bounded(0)
        return directory

    def dump(self, item):
        env = dict(self.env)
        password = private_file(item["passwordFile"]).read_text().strip()
        require(password and "\0" not in password, "private_file_required")
        variable = "PGPASSWORD" if item["engine"] == "postgres" else "MYSQL_PWD"
        env[variable] = password
        command = [self.c["binaries"]["docker"], "exec", "-e", variable, item["container"]]
        if item["engine"] == "postgres":
            command += ["pg_dump", "--format=custom", "--no-password", "--username", item["user"], "--dbname", item["database"]]
        else:
            command += ["mariadb-dump", "--single-transaction", "--quick", "--routines", "--events", "--triggers",
                        "--hex-blob", "--skip-lock-tables", "--user=" + item["user"], "--", item["database"]]
        filename = "database-" + item["name"] + (".pgdump" if item["engine"] == "postgres" else ".sql")
        producer = subprocess.Popen(command, env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        # Drain restic progress into an unlinked owner-only temporary file. A stdout pipe
        # left unread while feeding a large dump can deadlock after its pipe buffer fills.
        progress = tempfile.TemporaryFile(dir=self.state)
        consumer = subprocess.Popen(self.restic_base + ["backup", "--json", "--host", self.c["hostLabel"],
            "--tag", "storage-box-set:" + self.attempt, "--stdin", "--stdin-filename", filename],
            env=self.env, stdin=subprocess.PIPE, stdout=progress, stderr=subprocess.DEVNULL)
        digest = hashlib.sha256(); size = 0
        try:
            for chunk in self.chunks(producer, "database_dump_failed"):
                digest.update(chunk); size += len(chunk); consumer.stdin.write(chunk)
            consumer.stdin.close(); consumer.stdin = None
            consumer.wait(timeout=3600)
            require(progress.tell() <= 16 * 1024 * 1024, "invalid_restic_receipt")
            progress.seek(0)
            output = progress.read()
            require(producer.wait(timeout=60) == 0 and size > 0, "database_dump_failed")
            require(consumer.returncode == 0, "restic_failed")
            summaries = [json.loads(x) for x in output.splitlines() if x]
            sid = next(x["snapshot_id"] for x in summaries if x.get("message_type") == "summary")
            require(re.fullmatch(r"[0-9a-f]{8,64}", sid) is not None, "invalid_restic_receipt")
            self.snapshot_ids.append(sid)
            require(self.restored_digest(sid, filename) == digest.hexdigest(), "restore_failed")
            self.manifest.append({"kind": item["engine"] + "-logical-dump", "name": item["name"],
                                  "bytes": size, "sha256": digest.hexdigest(), "snapshotId": sid})
        finally:
            for p in [producer, consumer]:
                if p.poll() is None:
                    p.kill()
                p.wait()
            progress.close()

    def run(self):
        self.restic(["cat", "config"])  # Wrong target or missing repository must never auto-initialize.
        if self.stage.exists():
            require(not self.stage.is_symlink() and (self.stage / ".owned-by-storage-box-backup").is_file(), "unknown_staging_directory")
            shutil.rmtree(self.stage)
        self.stage.mkdir(mode=0o700)
        (self.stage / ".owned-by-storage-box-backup").write_text("owned scratch\n")
        try:
            staged = [self.sqlite(x) for x in self.c["sqlite"]]
            staged += [self.mirror(x) for x in self.c["objectMirrors"]]
            staged += self.object_manifests
            canary = self.stage / "restore-canary.bin"
            canary.write_bytes(os.urandom(64))
            staged.append(canary)
            atomic_json(self.stage / "source-manifest.json", {"datasets": self.manifest, "coverage": self.c["coverage"]})
            staged.append(self.stage / "source-manifest.json")
            excludes = self.c["excludedPaths"] + self.c["liveDatabasePaths"]
            excludes += [item["path"] + suffix for item in self.c["sqlite"] for suffix in ("", "-wal", "-shm", "-journal")]
            args = []
            for excluded in excludes + ["**/*.db", "**/*.db-*", "**/*.sqlite", "**/*.sqlite-*", "**/PG_VERSION", "**/pg_wal/**", "**/ibdata*", "**/*.ibd"]:
                args += ["--exclude", excluded]
            require(all(absolute(x) not in [absolute(p) for p in self.c["liveDatabasePaths"]] for x in self.c["fileSources"]), "live_database_source")
            sid = self.snapshot(args + ["--"] + self.c["fileSources"] + [str(p) for p in staged])
            require(self.restic(["dump", sid, str(canary)]) == canary.read_bytes(), "restore_failed")
            for path in self.sqlite_files:
                check = self.stage / "restore-check.sqlite"
                restored_hash = self.restored_digest(sid, str(path), check)
                with sqlite3.connect(check) as db:
                    require(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "restore_failed")
                require(restored_hash == self.digest(path), "restore_failed")
                check.unlink()
            for _name, path in self.object_samples:
                require(self.restored_digest(sid, str(path)) == self.digest(path), "restore_failed")
            for item in self.c["databaseDumps"]:
                self.dump(item)
            check = ["check", "--read-data"] if self.c["verificationPercent"] == 100 else ["check", "--read-data-subset=" + str(self.c["verificationPercent"]) + "%"]
            self.restic(check)
            acceptance = {"version": 1, "attempt": self.attempt, "snapshotIds": self.snapshot_ids[:],
                          "datasets": self.manifest, "coverage": self.c["coverage"], "restoreVerified": True,
                          "fullSystemBackup": False, "finishedAt": datetime.now(timezone.utc).isoformat()}
            body = (json.dumps(acceptance, sort_keys=True) + "\n").encode()
            accepted = self.snapshot(["--tag", "storage-box-accepted", "--stdin", "--stdin-filename", "verification.json"], body)
            require(self.restic(["dump", accepted, "verification.json"]) == body, "restore_failed")
            return {"status": "healthy", "restoreVerified": True, "sqliteValidated": len(self.sqlite_files),
                    "snapshotIds": self.snapshot_ids, "acceptanceSnapshotId": accepted,
                    "coverage": self.c["coverage"], "fullSystemBackup": False}
        finally:
            if self.stage.exists() and not self.stage.is_symlink() and (self.stage / ".owned-by-storage-box-backup").is_file():
                shutil.rmtree(self.stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["plan", "init", "backup", "check-health"])
    parser.add_argument("--config", required=True)
    parser.add_argument("--max-age-hours", type=int, default=30)
    args = parser.parse_args()
    result = {"status": "failed", "fullSystemBackup": False}
    job = None; locks = []; owns_lock = False
    try:
        config = json.loads(private_file(args.config).read_text())
        job = Backup(config)
        if args.command == "plan":
            result.update(status="planned", coverage=config["coverage"], fileSourceCount=len(config["fileSources"]),
                          sqliteCount=len(config["sqlite"]), databaseDumpCount=len(config["databaseDumps"]),
                          objectMirrorCount=len(config["objectMirrors"]))
        elif args.command == "check-health":
            receipt = json.loads(private_file(str(job.state / "health.json")).read_text())
            age = time.time() - datetime.fromisoformat(receipt["finishedAt"]).timestamp()
            require(receipt.get("status") == "healthy" and 0 <= age <= args.max_age_hours * 3600, "backup_stale_or_failed")
            result.update(status="healthy", ageSeconds=int(age))
        else:
            secure_directory(job.state)
            paths = sorted({str(job.state / "backup.lock")} | set(config.get("coordinationLocks", [])))
            for path in paths:
                fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
                lock = os.fdopen(fd, "r+")
                locks.append(lock)
                require(stat.S_ISREG(os.fstat(fd).st_mode) and os.fstat(fd).st_uid == os.getuid(), "private_file_required")
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise Failure("backup_locked")
            owns_lock = True
            job.preflight()
            if args.command == "init":
                job.restic(["init"])
                result.update(status="initialized")
            else:
                result.update(job.run())
        code = 0
    except Failure as e:
        result["errorCode"] = str(e)
        code = 1
    except Exception:
        result["errorCode"] = "operation_failed"
        code = 1
    finally:
        result["finishedAt"] = datetime.now(timezone.utc).isoformat()
        if job and args.command == "backup" and owns_lock:
            try:
                atomic_json(job.state / "health.json", result)
            except Exception:
                result.update(status="failed", errorCode="receipt_write_failed")
                code = 1
        for lock in reversed(locks):
            lock.close()
    print(json.dumps(result, sort_keys=True))
    return code


if __name__ == "__main__":
    os.umask(0o077)
    sys.exit(main())
