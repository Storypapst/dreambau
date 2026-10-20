#!/usr/bin/python3
"""Renew an existing machine identity through a privileged SSH operator.

The executable accepts no path arguments or environment overrides. It never
reads or emits a plaintext credential and cannot create or reactivate identities.
"""
import copy
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import uuid

REGISTRY = Path('/srv/dreambau/k3s-exit/testmails/config/test-access/machine-identities.json')
BACKUPS = Path('/var/backups/dreambau/test-access')
MAX_REQUEST_BYTES = 4096
MAX_REGISTRY_BYTES = 16 * 1024 * 1024
PROJECTS = {'oriso', 'orimo', 'dreambau'}
ENVIRONMENTS = {'local', 'pre-dev', 'dev', 'production-test'}
ACTIONS = {'accounts:read', 'accounts:sync', 'accounts:totp:write', 'sessions:open',
           'runs:read', 'fixtures:plan', 'runs:create', 'runs:execute', 'runs:cleanup',
           'evidence:upload', 'evidence:publish', 'evidence:read', 'evidence:archive'}


class RenewalError(Exception):
    """A safe public error code, never an underlying filesystem/JSON message."""
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _json_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('duplicate key')
        value[key] = item
    return value


def _validate_request(request):
    if not isinstance(request, dict) or set(request) != {'identity', 'days', 'dryRun'}:
        raise RenewalError('invalid_request')
    if not isinstance(request['identity'], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,127}', request['identity']):
        raise RenewalError('invalid_request')
    if type(request['days']) is not int or not 1 <= request['days'] <= 90:
        raise RenewalError('invalid_request')
    if type(request['dryRun']) is not bool:
        raise RenewalError('invalid_request')
    return request


def parse_request(data):
    if not isinstance(data, bytes) or len(data) > MAX_REQUEST_BYTES:
        raise RenewalError('invalid_request')
    try:
        value = json.loads(data, object_pairs_hook=_json_object)
    except (ValueError, UnicodeError):
        raise RenewalError('invalid_request') from None
    return _validate_request(value)


def _date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z', value):
        raise RenewalError('invalid_registry')
    try:
        return datetime.fromisoformat(value[:-1] + '+00:00')
    except ValueError:
        raise RenewalError('invalid_registry') from None


def _validate_registry(rows):
    if not isinstance(rows, list):
        raise RenewalError('invalid_registry')
    ids = set()
    for row in rows:
        keys = {'id', 'tokenHash', 'projects', 'environments', 'expiresAt', 'revokedAt'}
        if not isinstance(row, dict) or not keys <= set(row) or set(row) - keys - {'actions'}:
            raise RenewalError('invalid_registry')
        if not isinstance(row['id'], str) or not row['id'] or row['id'] in ids:
            raise RenewalError('invalid_registry')
        ids.add(row['id'])
        if not isinstance(row['tokenHash'], str) or not re.fullmatch(r'[a-f0-9]{64}', row['tokenHash']):
            raise RenewalError('invalid_registry')
        for name, choices in [('projects', PROJECTS), ('environments', ENVIRONMENTS), ('actions', ACTIONS)]:
            if name not in row:
                continue
            values = row[name]
            if not isinstance(values, list) or not values or any(not isinstance(v, str) or v not in choices for v in values):
                raise RenewalError('invalid_registry')
        _date(row['expiresAt'])
        if row['revokedAt'] is not None:
            _date(row['revokedAt'])
    return rows


def _check_path(path, *, allow_missing=False):
    path = Path(path).absolute()
    for part in reversed([path, *path.parents]):
        try:
            info = part.lstat()
        except FileNotFoundError:
            if allow_missing:
                continue
            raise RenewalError('unsafe_path') from None
        if stat.S_ISLNK(info.st_mode):
            raise RenewalError('unsafe_path')
    return path


def _read_registry(path):
    _check_path(path)
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'rb') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise RenewalError('unsafe_path')
            raw = source.read(MAX_REGISTRY_BYTES + 1)
        if len(raw) > MAX_REGISTRY_BYTES:
            raise RenewalError('invalid_registry')
        return raw, info, _validate_registry(json.loads(raw, object_pairs_hook=_json_object))
    except (ValueError, UnicodeError):
        raise RenewalError('invalid_registry') from None


def _proposal(rows, request, now):
    matches = [row for row in rows if row['id'] == request['identity']]
    if not matches:
        raise RenewalError('identity_not_found')
    current = matches[0]
    if current['revokedAt'] is not None:
        raise RenewalError('identity_revoked')
    proposed = now + timedelta(days=request['days'])
    old_expiry = current['expiresAt']
    new_expiry = proposed.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    # Compare at the precision we will actually persist, so truncation can
    # never turn a proposed extension into a sub-millisecond shortening.
    if _date(old_expiry) >= _date(new_expiry):
        new_expiry = old_expiry
    result = {'identity': request['identity'], 'oldExpiry': old_expiry,
              'newExpiry': new_expiry, 'dryRun': request['dryRun'],
              'changed': False, 'receiptPath': None}
    return current, result


def _write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def _assert_unchanged(path, raw, info):
    current_raw, current_info, _ = _read_registry(path)
    original = (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode)
    current = (current_info.st_dev, current_info.st_ino, current_info.st_uid, current_info.st_gid, current_info.st_mode)
    if current != original or current_raw != raw:
        raise RenewalError('registry_changed')


def _commit(path, backups, raw, info, rows, request, now, result):
    _check_path(backups, allow_missing=True)
    if backups.exists() and not backups.is_dir():
        raise RenewalError('unsafe_path')
    backups.mkdir(mode=0o700, parents=True, exist_ok=True)
    backups.chmod(0o700)
    tag = now.strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex
    backup = backups / (tag + '.backup.json')
    receipt = backups / (tag + '.receipt.json')
    audit = {'identity': request['identity'], 'oldExpiry': result['oldExpiry'],
             'newExpiry': result['newExpiry'], 'renewedAt': now.isoformat(),
             'operatorUid': os.geteuid(), 'backupPath': str(backup)}
    updated = copy.deepcopy(rows)
    next(row for row in updated if row['id'] == request['identity'])['expiresAt'] = result['newExpiry']
    restored = copy.deepcopy(updated)
    next(row for row in restored if row['id'] == request['identity'])['expiresAt'] = result['oldExpiry']
    if restored != rows:
        raise RenewalError('operation_failed')
    temporary = None
    committed = False
    try:
        _write_private(backup, raw)
        _write_private(receipt, (json.dumps(audit, indent=2) + '\n').encode())
        # Both recovery files must be durable before replacing the registry.
        backup_directory_fd = os.open(backups, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(backup_directory_fd)
        finally:
            os.close(backup_directory_fd)
        fd, temporary = tempfile.mkstemp(prefix='.machine-identities-renew-', dir=path.parent)
        with os.fdopen(fd, 'wb') as output:
            output.write((json.dumps(updated, ensure_ascii=False, indent=2) + '\n').encode())
            os.fchown(output.fileno(), info.st_uid, info.st_gid)
            os.fchmod(output.fileno(), stat.S_IMODE(info.st_mode))
            output.flush()
            os.fsync(output.fileno())
        _assert_unchanged(path, raw, info)
        os.replace(temporary, path)
        temporary = None
        committed = True
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary is not None:
            os.unlink(temporary)
        if not committed:
            receipt.unlink(missing_ok=True)
    return dict(result, changed=True, receiptPath=str(receipt))


def renew_identity(registry, backups, request, *, now=None):
    """Run the real registry transaction; caller supplies privileged fixed paths."""
    _validate_request(request)
    registry = _check_path(registry)
    backups = _check_path(backups, allow_missing=True)
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None or now.utcoffset() != timedelta(0):
        raise RenewalError('invalid_request')
    try:
        raw, info, rows = _read_registry(registry)
        _, result = _proposal(rows, request, now)
        if request['dryRun'] or result['newExpiry'] == result['oldExpiry']:
            return result
        lock = registry.with_name('.machine-identities.operator.lock')
        _check_path(lock, allow_missing=True)
        fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as claim:
            lock_info = os.fstat(claim.fileno())
            if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_nlink != 1 or lock_info.st_uid != os.geteuid():
                raise RenewalError('unsafe_path')
            os.fchmod(claim.fileno(), 0o600)
            try:
                fcntl.flock(claim, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RenewalError('registry_changed') from None
            raw, info, rows = _read_registry(registry)
            _, result = _proposal(rows, request, now)
            if result['newExpiry'] == result['oldExpiry']:
                return result
            return _commit(registry, backups, raw, info, rows, request, now, result)
    except PermissionError:
        raise RenewalError('permission_denied') from None
    except OSError:
        raise RenewalError('operation_failed') from None


def main():
    try:
        if len(sys.argv) != 1:
            raise RenewalError('invalid_request')
        if os.geteuid() != 0:
            raise RenewalError('permission_denied')
        request = parse_request(sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1))
        result = renew_identity(REGISTRY, BACKUPS, request)
        print(json.dumps(result))
        return 0
    except RenewalError as error:
        print(json.dumps({'error': error.code}), file=sys.stderr)
        return 1
    except Exception:
        print(json.dumps({'error': 'operation_failed'}), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
