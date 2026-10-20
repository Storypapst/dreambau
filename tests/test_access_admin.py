"""Behavior tests for the privileged registry renewal helper (temporary fixtures only)."""
import copy
import contextlib
import fcntl
import io
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HELPER = Path(__file__).resolve().parents[1] / 'ops/test-access-admin.py'
NOW = datetime(2026, 10, 20, 17, 0, tzinfo=timezone.utc)


def identity(name='codex-m4-oriso', expiry='2026-10-20T16:00:00.000Z'):
    return {'id': name, 'tokenHash': 'a' * 64, 'projects': ['oriso'],
            'environments': ['dev'], 'actions': ['accounts:read', 'sessions:open'],
            'expiresAt': expiry, 'revokedAt': None}


class RenewalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name).resolve()
        self.registry = self.directory / 'registry.json'
        self.backups = self.directory / 'backups'
        self.rows = [identity(), identity('another-identity')]
        self.save(self.rows)
        self.registry.chmod(0o400)
        self.request = {'identity': 'codex-m4-oriso', 'days': 90, 'dryRun': False}

    def save(self, rows):
        if self.registry.exists():
            self.registry.chmod(0o600)
        self.registry.write_text(json.dumps(rows, indent=2) + '\n')
        self.registry.chmod(0o400)

    def module(self):
        spec = importlib.util.spec_from_file_location('test_access_admin', HELPER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def renew(self, **updates):
        return self.module().renew_identity(self.registry, self.backups,
                                           self.request | updates, now=NOW)

    def assert_rejected(self, request, code):
        original = self.registry.read_bytes()
        helper = self.module()
        with self.assertRaises(helper.RenewalError) as caught:
            helper.renew_identity(self.registry, self.backups, request, now=NOW)
        self.assertEqual(caught.exception.code, code)
        self.assertEqual(self.registry.read_bytes(), original)

    def test_expired_identity_receives_finite_expiry_with_every_other_value_preserved(self):
        # Run the real callable in a subprocess so missing implementation is a failing
        # renewal result, rather than a test collection/import error.
        harness = '''import importlib.util,json,sys
from pathlib import Path
from datetime import datetime,timezone
spec=importlib.util.spec_from_file_location("renew",sys.argv[1])
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
r=m.renew_identity(Path(sys.argv[2]),Path(sys.argv[3]),{"identity":"codex-m4-oriso","days":90,"dryRun":False},now=datetime(2026,10,20,17,0,tzinfo=timezone.utc))
print(json.dumps(r))'''
        result = subprocess.run([sys.executable, '-c', harness, str(HELPER),
                                 str(self.registry), str(self.backups)],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, 'Expired identity renewal did not succeed')
        receipt = json.loads(result.stdout)
        expected = copy.deepcopy(self.rows)
        expected[0]['expiresAt'] = '2027-01-18T17:00:00.000Z'
        self.assertEqual(json.loads(self.registry.read_text()), expected)
        self.assertTrue(receipt['changed'])
        self.assertEqual(receipt['newExpiry'], '2027-01-18T17:00:00.000Z')
        self.assertEqual(stat.S_IMODE(self.registry.stat().st_mode), 0o400)
        self.assertNotIn('a' * 64, result.stdout + result.stderr)

    def test_dry_run_writes_no_registry_lock_backup_or_receipt(self):
        before = self.registry.read_bytes()
        files = sorted(self.directory.iterdir())
        receipt = self.renew(dryRun=True)
        self.assertEqual(receipt['newExpiry'], '2027-01-18T17:00:00.000Z')
        self.assertFalse(receipt['changed'])
        self.assertTrue(receipt['dryRun'])
        self.assertIsNone(receipt['receiptPath'])
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertEqual(sorted(self.directory.iterdir()), files)

    def test_longer_existing_validity_is_not_shortened(self):
        self.rows[0]['expiresAt'] = '2028-01-01T00:00:00.000Z'
        self.save(self.rows)
        before = self.registry.read_bytes()
        receipt = self.renew()
        self.assertFalse(receipt['changed'])
        self.assertEqual(receipt['newExpiry'], '2028-01-01T00:00:00.000Z')
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertFalse(self.backups.exists())

    def test_valid_minutes_only_expiry_on_unrelated_identity_does_not_block_renewal(self):
        self.rows[1]['expiresAt'] = '2027-01-18T17:00Z'
        self.save(self.rows)
        result = self.renew()
        self.assertTrue(result['changed'])
        rows = json.loads(self.registry.read_text())
        self.assertEqual(rows[1], self.rows[1])
        self.assertEqual(rows[0]['expiresAt'], '2027-01-18T17:00:00.000Z')

    def test_millisecond_candidate_cannot_shorten_existing_submillisecond_expiry(self):
        self.rows[0]['expiresAt'] = '2027-01-18T17:00:00.0001Z'
        self.save(self.rows)
        before = self.registry.read_bytes()
        precise_now = datetime(2026, 10, 20, 17, 0, 0, 200, tzinfo=timezone.utc)
        helper = self.module()
        result = helper.renew_identity(self.registry, self.backups, self.request, now=precise_now)
        self.assertFalse(result['changed'])
        self.assertEqual(result['newExpiry'], '2027-01-18T17:00:00.0001Z')
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertFalse(self.backups.exists())

    def test_private_backup_recovers_original_and_receipt_excludes_hash(self):
        before = self.registry.read_bytes()
        owner = (self.registry.stat().st_uid, self.registry.stat().st_gid)
        receipt = self.renew()
        entries = list(self.backups.iterdir())
        backups = [p for p in entries if p.name.endswith('.backup.json')]
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), before)
        for path in entries:
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.backups.stat().st_mode), 0o700)
        self.assertEqual((self.registry.stat().st_uid, self.registry.stat().st_gid), owner)
        audit = json.loads(Path(receipt['receiptPath']).read_text())
        self.assertEqual(audit['identity'], 'codex-m4-oriso')
        self.assertEqual(audit['oldExpiry'], self.rows[0]['expiresAt'])
        self.assertEqual(audit['newExpiry'], '2027-01-18T17:00:00.000Z')
        self.assertNotIn('a' * 64, json.dumps(audit))

    def test_unknown_and_duplicate_identities_cannot_be_changed(self):
        self.assert_rejected(self.request | {'identity': 'unknown'}, 'identity_not_found')
        self.rows.append(copy.deepcopy(self.rows[0])); self.save(self.rows)
        self.assert_rejected(self.request, 'invalid_registry')

    def test_revoked_identity_is_never_reactivated_even_in_preview(self):
        self.rows[0]['revokedAt'] = '2026-10-19T00:00:00.000Z'; self.save(self.rows)
        for preview in [False, True]:
            self.assert_rejected(self.request | {'dryRun': preview}, 'identity_revoked')

    def test_invalid_ttl_and_unknown_request_fields_are_rejected(self):
        for days in [0, -1, 91, 1.2, True, '90', None]:
            with self.subTest(days=days):
                self.assert_rejected(self.request | {'days': days}, 'invalid_request')
        for extra in [{'registryPath': '/tmp/elsewhere'}, {'token': 'do-not-accept'}]:
            self.assert_rejected(self.request | extra, 'invalid_request')
        for request in [[], {}, self.request | {'dryRun': 1}, self.request | {'identity': '../other'}]:
            self.assert_rejected(request, 'invalid_request')

    def test_invalid_registry_schema_is_rejected_without_echoing_values(self):
        for change in [{'tokenHash': 'sensitive-invalid-value'}, {'projects': ['foreign']},
                       {'actions': ['admin:everything']}, {'expiresAt': 'yesterday'},
                       {'revokedAt': False}, {'unexpected': True}]:
            with self.subTest(change=change):
                self.rows[0] = identity() | change; self.save(self.rows)
                self.assert_rejected(self.request, 'invalid_registry')
        self.registry.chmod(0o600)
        self.registry.write_text('{not json: secret-value}')
        self.registry.chmod(0o400)
        self.assert_rejected(self.request, 'invalid_registry')

    def test_legacy_missing_actions_remains_missing_after_renewal(self):
        del self.rows[0]['actions']; self.save(self.rows)
        self.renew()
        self.assertNotIn('actions', json.loads(self.registry.read_text())[0])

    def test_registry_and_backup_symlinks_are_rejected(self):
        original = self.directory / 'original.json'
        self.registry.rename(original); self.registry.symlink_to(original)
        self.assert_rejected(self.request, 'unsafe_path')
        self.registry.unlink(); original.rename(self.registry)
        target = self.directory / 'backup-target'; target.mkdir(); self.backups.symlink_to(target)
        self.assert_rejected(self.request, 'unsafe_path')
        self.assertFalse(list(target.iterdir()))

    def test_symlink_lock_is_never_followed(self):
        target = self.directory / 'target'; target.write_text('preserve')
        (self.directory / '.machine-identities.operator.lock').symlink_to(target)
        self.assert_rejected(self.request, 'unsafe_path')
        self.assertEqual(target.read_text(), 'preserve')

    def test_atomic_replace_failure_keeps_original_registry_and_cleans_temporary_file(self):
        helper = self.module(); before = self.registry.read_bytes()
        with patch.object(helper.os, 'replace', side_effect=OSError('secret-path')):
            with self.assertRaises(helper.RenewalError) as caught:
                helper.renew_identity(self.registry, self.backups, self.request, now=NOW)
        self.assertEqual(caught.exception.code, 'operation_failed')
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertFalse(list(self.directory.glob('.machine-identities-renew-*')))

    def test_receipt_flush_failure_leaves_no_applied_receipt_and_preserves_registry(self):
        helper = self.module(); before = self.registry.read_bytes()
        original_fsync = helper.os.fsync
        calls = 0
        def fail_receipt_flush(fd):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('receipt flush failed')
            return original_fsync(fd)
        with patch.object(helper.os, 'fsync', side_effect=fail_receipt_flush):
            with self.assertRaises(helper.RenewalError) as caught:
                helper.renew_identity(self.registry, self.backups, self.request, now=NOW)
        self.assertEqual(caught.exception.code, 'operation_failed')
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertFalse(list(self.backups.glob('*.receipt.json')))

    def test_backup_directory_flush_failure_prevents_registry_commit(self):
        helper = self.module(); before = self.registry.read_bytes()
        original_fsync = helper.os.fsync
        def fail_backup_directory_flush(fd):
            info = os.fstat(fd)
            if self.backups.exists() and stat.S_ISDIR(info.st_mode) and info.st_ino == self.backups.stat().st_ino:
                raise OSError('backup directory flush failed')
            return original_fsync(fd)
        with patch.object(helper.os, 'fsync', side_effect=fail_backup_directory_flush):
            with self.assertRaises(helper.RenewalError) as caught:
                helper.renew_identity(self.registry, self.backups, self.request, now=NOW)
        self.assertEqual(caught.exception.code, 'operation_failed')
        self.assertEqual(self.registry.read_bytes(), before)
        self.assertFalse(list(self.backups.glob('*.receipt.json')))

    def test_concurrent_registry_write_is_preserved_instead_of_overwritten(self):
        helper = self.module(); original_mkstemp = helper.tempfile.mkstemp
        changed = copy.deepcopy(self.rows); changed[1]['expiresAt'] = '2029-01-01T00:00:00.000Z'
        def concurrent_write(*args, **kwargs):
            self.save(changed)
            return original_mkstemp(*args, **kwargs)
        with patch.object(helper.tempfile, 'mkstemp', side_effect=concurrent_write):
            with self.assertRaises(helper.RenewalError) as caught:
                helper.renew_identity(self.registry, self.backups, self.request, now=NOW)
        self.assertEqual(caught.exception.code, 'registry_changed')
        self.assertEqual(json.loads(self.registry.read_text()), changed)

    def test_main_rejects_non_operator_and_never_accepts_path_arguments(self):
        helper = self.module()
        error = io.StringIO()
        with patch.object(helper.os, 'geteuid', return_value=1234), \
             patch.object(helper.sys, 'argv', [str(HELPER)]), contextlib.redirect_stderr(error):
            self.assertEqual(helper.main(), 1)
        self.assertEqual(json.loads(error.getvalue()), {'error': 'permission_denied'})
        result = subprocess.run([sys.executable, str(HELPER), '--registry', '/tmp/other'],
                                input='{}', text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Traceback', result.stderr)
        self.assertNotIn('/tmp/other', result.stdout + result.stderr)

    def test_other_operator_lock_prevents_concurrent_renewal(self):
        lock = self.directory / '.machine-identities.operator.lock'
        with lock.open('w') as claim:
            fcntl.flock(claim, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_rejected(self.request, 'registry_changed')
        self.assertFalse(self.backups.exists())

    def test_root_entrypoint_reads_request_and_emits_only_safe_preview_contract(self):
        helper = self.module()
        output = io.StringIO()
        stdin = io.TextIOWrapper(io.BytesIO(json.dumps(self.request | {'dryRun': True}).encode()))
        with patch.object(helper.os, 'geteuid', return_value=0), \
             patch.object(helper.sys, 'argv', [str(HELPER)]), \
             patch.object(helper.sys, 'stdin', stdin), \
             patch.object(helper, 'REGISTRY', self.registry), \
             patch.object(helper, 'BACKUPS', self.backups), contextlib.redirect_stdout(output):
            self.assertEqual(helper.main(), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(set(result), {'identity', 'oldExpiry', 'newExpiry', 'dryRun', 'changed', 'receiptPath'})
        self.assertTrue(result['dryRun'])
        self.assertFalse(result['changed'])
        self.assertNotIn('a' * 64, output.getvalue())
        self.assertFalse(self.backups.exists())

    def test_stdin_parser_rejects_duplicate_keys_oversized_and_malformed_json(self):
        helper = self.module()
        for value in ['{"identity":"a","identity":"b","days":90,"dryRun":false}',
                      '{bad', ' ' * 5000, 'null', '{"identity":"a","days":90,"dryRun":false} trailing']:
            with self.subTest(value=value[:30]):
                with self.assertRaises(helper.RenewalError):
                    helper.parse_request(value.encode())


if __name__ == '__main__':
    unittest.main()
