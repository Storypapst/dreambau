#!/usr/bin/env python3
"""Validate and publish Teamwork data. Python 3.8+, standard library only.

All installation paths and the real list are supplied by the private operator
configuration; this module contains no production inventory or credentials.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED
from datetime import datetime, timezone
import hashlib
import heapq
import http.client
import json
import multiprocessing
import os
import re
import socket
import ssl
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit

PALETTE = ("cyan", "amber", "pink", "violet", "lime", "slate")
IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")

# multiprocessing.start() polls the shared child registry. Keep it from reaping
# another probe's child concurrently with that probe's join()/close(). Network
# waits stay outside this lock, so the configured probe parallelism is unchanged.
PROCESS_LIFECYCLE = threading.Lock()


def compact_json(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def public_catalogue(value):
    return {
        "format": 1,
        "zones": [{k: z[k] for k in ("id", "name", "color", "ring") if k in z} for z in value["zones"]],
        "programs": [{k: p[k] for k in ("id", "name", "purpose", "url", "zone", "color", "newTab") if k in p}
                     for p in value["programs"]],
    }


def valid_address(value, schemes, limit=None):
    if not isinstance(value, str) or (limit is not None and len(value) > limit):
        return False
    try:
        value.encode("utf-8")
        parsed = urlsplit(value)
        return (parsed.scheme in schemes and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and parsed.port != 0 and not any(c.isspace() for c in value))
    except (ValueError, UnicodeError):
        return False


def validation_errors(value):
    errors = []
    if not isinstance(value, dict):
        return ["root must be an object"]
    if type(value.get("format")) is not int or value["format"] != 1:
        errors.append("format must be 1")
    zones, programs = value.get("zones"), value.get("programs")
    if not isinstance(zones, list) or not 1 <= len(zones) <= 7:
        errors.append("zones must contain 1 to 7 entries")
        zones = []
    if not isinstance(programs, list) or len(programs) > 60:
        errors.append("programs must be an array of at most 60 entries")
        programs = []

    def text(item, key, maximum, where):
        raw = item.get(key)
        if not isinstance(raw, str) or not 1 <= len(raw) <= maximum or "\n" in raw or "\r" in raw:
            errors.append(where + "." + key + " has invalid type, length or line breaks")
        else:
            try:
                raw.encode("utf-8")
            except UnicodeError:
                errors.append(where + "." + key + " is not Unicode text")

    def identifier(item, seen, where):
        raw = item.get("id")
        if not isinstance(raw, str) or not IDENTIFIER.fullmatch(raw):
            errors.append(where + ".id has invalid pattern")
        elif raw in seen:
            errors.append(where + ".id is duplicated")
        else:
            seen.add(raw)

    zone_ids, program_ids = set(), set()
    outer, inner = 0, 0
    for index, zone in enumerate(zones):
        where = "zone[" + str(index) + "]"
        if not isinstance(zone, dict):
            errors.append(where + " must be an object")
            continue
        identifier(zone, zone_ids, where)
        text(zone, "name", 24, where)
        if zone.get("color") not in PALETTE:
            errors.append(where + ".color is not a palette key")
        if "ring" in zone and zone["ring"] != "inner":
            errors.append(where + ".ring must be inner or absent")
        if zone.get("ring") == "inner":
            inner += 1
        else:
            outer += 1
    if outer > 6 or inner > 1:
        errors.append("at most 6 outer zones and 1 inner zone are allowed")
    for index, program in enumerate(programs):
        where = "program[" + str(index) + "]"
        if not isinstance(program, dict):
            errors.append(where + " must be an object")
            continue
        identifier(program, program_ids, where)
        text(program, "name", 24, where)
        text(program, "purpose", 60, where)
        if not valid_address(program.get("url"), ("https",), 200):
            errors.append(where + ".url must be a credential-free HTTPS address")
        if not isinstance(program.get("zone"), str) or program["zone"] not in zone_ids:
            errors.append(where + ".zone is unknown")
        if "probe" in program and not valid_address(program["probe"], ("http", "https")):
            errors.append(where + ".probe must be a credential-free HTTP(S) address")
        if "color" in program and program["color"] not in PALETTE:
            errors.append(where + ".color is not a palette key")
        if "newTab" in program and type(program["newTab"]) is not bool:
            errors.append(where + ".newTab must be boolean")
    if not errors and len(compact_json(public_catalogue(value))) > 32768:
        errors.append("public catalogue exceeds 32 KB")
    return errors


def read_list(filename):
    try:
        with open(filename, "rb") as stream:
            raw = stream.read()
        value = json.loads(raw.decode("utf-8"))
    except (OSError, ValueError, UnicodeError):
        raise ValueError("file is missing, unreadable or not UTF-8 JSON")
    errors = validation_errors(value)
    if errors:
        raise ValueError("; ".join(errors))
    return value, raw


class RunLimit(Exception):
    """The run deadline was reached before publication."""


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def probe_child(address, connect_timeout, total_timeout, pipe):
    """Blocking network work runs in a killable child, including DNS/header reads."""
    connection = None
    try:
        parsed = urlsplit(address)
        cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = cls(parsed.hostname, parsed.port, timeout=connect_timeout)
        connection.connect()
        pipe.send(("connected", None))
        target = parsed.path or "/"
        if parsed.query:
            target += "?" + parsed.query
        connection.request("GET", target, headers={"User-Agent": "dreambau-teamwork-status/1"})
        # Reachability is the status line, not completion of the header block.
        # Unbuffered reading avoids consuming a response body; the parent also
        # enforces a hard wall-clock cap against trickling bytes and DNS stalls.
        connection.sock.settimeout(total_timeout)
        with connection.sock.makefile("rb", buffering=0) as stream:
            line = stream.readline(65537)
        match = re.fullmatch(br"HTTP/1\.[0-9] ([1-9][0-9]{2})(?:[ \t][^\r\n]*)?\r?\n", line)
        if not match:
            raise http.client.BadStatusLine("invalid status line")
        code = int(match.group(1))
        pipe.send(("result", {"code": code, "reason": "ok" if code < 500 else "status"}))
    except ssl.SSLError:
        pipe.send(("result", {"code": None, "reason": "tls"}))
    except socket.gaierror:
        pipe.send(("result", {"code": None, "reason": "dns"}))
    except (TimeoutError, socket.timeout):
        pipe.send(("result", {"code": None, "reason": "timeout"}))
    except (ConnectionError, OSError):
        pipe.send(("result", {"code": None, "reason": "refused"}))
    except (ValueError, http.client.HTTPException):
        pipe.send(("result", {"code": None, "reason": "protocol"}))
    finally:
        if connection is not None:
            connection.close()
        pipe.close()


def probe(program, args, deadline, attempt):
    started = time.monotonic()
    remaining = deadline - started
    if remaining <= 0:
        raise RunLimit()
    cap = min(args.timeout, remaining)
    context = multiprocessing.get_context("spawn")
    reader, writer = context.Pipe(duplex=False)
    child = context.Process(target=probe_child, args=(program.get("probe", program["url"]), args.connect_timeout, args.timeout, writer))
    result = {"code": None, "reason": "timeout"}
    try:
        with PROCESS_LIFECYCLE:
            child.start()
        writer.close()
        connect_limit = min(args.connect_timeout, cap) - (time.monotonic() - started)
        if reader.poll(max(0, connect_limit)):
            phase, value = reader.recv()
            if phase == "result":
                result = value
            elif reader.poll(max(0, cap - (time.monotonic() - started))):
                _, result = reader.recv()
    except (EOFError, OSError):
        result = {"code": None, "reason": "protocol"}
    finally:
        reader.close()
        writer.close()
        with PROCESS_LIFECYCLE:
            if child.pid is not None:
                if child.is_alive():
                    child.terminate()
                child.join()
                child.close()
    finished = time.monotonic()
    if finished >= deadline:
        raise RunLimit()
    result.update({"id": program["id"], "ms": round((finished - started) * 1000), "attempt": attempt, "finished": finished})
    return result


def run_checks(programs, args, deadline):
    results = {}

    def report(result):
        print("id={id} code={code} reason={reason} ms={ms} attempt={attempt}".format(
            **dict(result, code=result["code"] if result["code"] is not None else "none")), flush=True)
        results[result["id"]] = result

    first = iter(programs)
    first_done = False
    retries = []
    active = {}
    sequence = 0
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        while not first_done or active or retries:
            if time.monotonic() >= deadline:
                raise RunLimit()
            while len(active) < args.parallel:
                now = time.monotonic()
                if retries and retries[0][0] <= now:
                    _, _, program = heapq.heappop(retries)
                    attempt = 2
                elif not first_done:
                    try:
                        program = next(first)
                        attempt = 1
                    except StopIteration:
                        first_done = True
                        continue
                else:
                    break
                active[pool.submit(probe, program, args, deadline, attempt)] = (program, attempt)
            if not active:
                if retries:
                    time.sleep(min(max(0, retries[0][0] - time.monotonic()), max(0, deadline - time.monotonic())))
                continue
            timeout = max(0, deadline - time.monotonic())
            if retries and len(active) < args.parallel:
                timeout = min(timeout, max(0, retries[0][0] - time.monotonic()))
            finished, _ = wait(active, timeout=timeout, return_when=FIRST_COMPLETED)
            for job in finished:
                program, attempt = active.pop(job)
                result = job.result()
                report(result)
                if attempt == 1 and result["reason"] != "ok":
                    sequence += 1
                    heapq.heappush(retries, (result["finished"] + args.retry_delay, sequence, program))
    return [program["id"] for program in programs if results[program["id"]]["reason"] == "ok"]


def archive_list(raw, directory):
    if not os.path.isdir(directory):
        raise OSError("history directory does not exist")
    copies = sorted(name for name in os.listdir(directory) if re.fullmatch(r"programs-\d{8}T\d{6}Z\.json", name))
    if copies:
        with open(os.path.join(directory, copies[-1]), "rb") as stream:
            if hashlib.sha256(stream.read()).digest() == hashlib.sha256(raw).digest():
                return
    # The required name has second precision; never overwrite a different list
    # archived during that same second. Wait for the next timestamp, bounded.
    end = time.monotonic() + 2
    while True:
        name = "programs-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json"
        filename = os.path.join(directory, name)
        try:
            descriptor = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            break
        except FileExistsError:
            with open(filename, "rb") as stream:
                if stream.read() == raw:
                    return
            if time.monotonic() >= end:
                raise OSError("history clock did not advance")
            time.sleep(0.02)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(filename, 0o600)
    except BaseException:
        # A failed new copy is not history; never remove any older copy.
        os.unlink(filename)
        raise


def stage_file(directory, name, content):
    descriptor, filename = tempfile.mkstemp(prefix="." + name + ".", dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(filename, 0o644)
        return filename
    except BaseException:
        os.unlink(filename)
        raise


def publish(directory, catalogue, status):
    staged = []
    previous = []
    replaced = []
    try:
        for name, value in (("programs.json", catalogue), ("status.json", status)):
            target = os.path.join(directory, name)
            old = None
            if os.path.exists(target):
                with open(target, "rb") as stream:
                    old = (stream.read(), os.stat(target))
            previous.append((name, old))
            staged.append((name, stage_file(directory, name, compact_json(value))))
        for name, temporary in staged:
            os.replace(temporary, os.path.join(directory, name))
            replaced.append(name)
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    except OSError:
        for name, old in previous:
            if name not in replaced:
                continue
            target = os.path.join(directory, name)
            if old is None:
                os.unlink(target)
            else:
                temporary = stage_file(directory, name, old[0])
                os.chmod(temporary, old[1].st_mode & 0o777)
                os.utime(temporary, ns=(old[1].st_atime_ns, old[1].st_mtime_ns))
                os.replace(temporary, target)
        raise
    finally:
        for _, temporary in staged:
            if os.path.exists(temporary):
                os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", required=True)
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--out")
    parser.add_argument("--history")
    parser.add_argument("--connect-timeout", type=float, default=5)
    parser.add_argument("--timeout", type=float, default=10)
    parser.add_argument("--retry-delay", type=float, default=30)
    parser.add_argument("--parallel", type=int, choices=range(1, 9), default=8)
    parser.add_argument("--max-run", type=float, default=300)
    args = parser.parse_args()
    try:
        value, raw = read_list(args.list)
    except ValueError as error:
        print("invalid list: " + str(error), file=sys.stderr)
        return 2
    if args.validate:
        return 0
    if min(args.connect_timeout, args.timeout, args.max_run) <= 0 or args.retry_delay < 0:
        parser.error("timeouts must be positive and retry-delay nonnegative")
    if not args.check_only and (not args.out or not args.history):
        parser.error("--out and --history are required for publication")
    started = time.monotonic()
    deadline = started + args.max_run
    try:
        if not args.check_only:
            archive_list(raw, args.history)
        reachable = run_checks(value["programs"], args, deadline)
        if time.monotonic() >= deadline:
            raise RunLimit()
        if not args.check_only:
            publish(args.out, public_catalogue(value), {"format": 1, "checkedAt": utc_now(), "reachable": reachable})
        print("checked={} reachable={} hidden={} seconds={}".format(
            len(value["programs"]), len(reachable), len(value["programs"]) - len(reachable),
            round(time.monotonic() - started, 3)), flush=True)
        return 0
    except RunLimit:
        print("run time cap reached; public outputs unchanged", file=sys.stderr)
        return 4
    except OSError:
        print("cannot write data or private history; public outputs unchanged", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
