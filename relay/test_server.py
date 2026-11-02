#!/usr/bin/env python3
"""
Testes unitários para o Vox Relay Desktop (server.py).
Biblioteca padrão Python (unittest).
"""

import json
import hashlib
import os
import shutil
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

from relay import server
from relay import inbox


class TestVoxRelayServer(unittest.TestCase):
    def setUp(self):
        server.CACHE_DIR = Path(self.temp_dir) / self._testMethodName / "cache"
        inbox.INBOX_DIR = Path(self.temp_dir) / self._testMethodName / "inbox"
        server.ensure_cache_dir()

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="vox_test_cache_")
        cls.orig_cache_dir = server.CACHE_DIR
        cls.orig_inbox_dir = inbox.INBOX_DIR
        server.CACHE_DIR = Path(cls.temp_dir) / "cache"
        inbox.INBOX_DIR = Path(cls.temp_dir) / "inbox"

        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        server.CACHE_DIR = cls.orig_cache_dir
        inbox.INBOX_DIR = cls.orig_inbox_dir
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def _url(self, path):
        return f"http://127.0.0.1:{self.port}{path}"

    def test_health_check(self):
        req = urllib.request.Request(self._url("/health"))
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("app"), "vox-relay")
            self.assertIn("cachedCount", data)
            self.assertIn("communityIndexCount", data)
            self.assertEqual(data.get("communityIndexCount"), 0)
            self.assertIn("cacheBytes", data)
            self.assertIn("maxCacheBytes", data)

    def test_health_exposes_max_cache_from_env(self):
        prev = os.environ.get("VOX_RELAY_MAX_CACHE_MB")
        os.environ["VOX_RELAY_MAX_CACHE_MB"] = "128"
        try:
            req = urllib.request.Request(self._url("/health"))
            with urllib.request.urlopen(req, timeout=2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self.assertEqual(data.get("maxCacheBytes"), 128 * 1024 * 1024)
        finally:
            if prev is None:
                os.environ.pop("VOX_RELAY_MAX_CACHE_MB", None)
            else:
                os.environ["VOX_RELAY_MAX_CACHE_MB"] = prev

    def test_mirror_lists_in_health(self):
        body = json.dumps({"communityId": "test-comm", "topics": []}).encode("utf-8")
        req = urllib.request.Request(
            self._url("/vox/mirror"),
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
        req = urllib.request.Request(self._url("/health"))
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("test-comm", data.get("communityIndexes", []))

    def test_options_cors(self):
        req = urllib.request.Request(self._url("/health"), method="OPTIONS")
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 204)
            self.assertEqual(resp.headers.get("Access-Control-Allow-Origin"), "*")

    def test_invalid_tx_id_returns_400(self):
        req = urllib.request.Request(self._url("/tx/invalid_short_id"))
        try:
            urllib.request.urlopen(req, timeout=2)
            self.fail("Deveria retornar HTTP 400")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)

    def test_tx_cache_hit(self):
        server.ensure_cache_dir()
        valid_id = "A" * 43
        payload = json.dumps({"title": "Topico Teste", "body": "Conteudo"}).encode("utf-8")
        file_path = server.CACHE_DIR / valid_id
        server.write_cache_entry(file_path, payload)

        req = urllib.request.Request(self._url(f"/tx/{valid_id}"))
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("X-Vox-Cache"), "HIT")
            body = resp.read()
            self.assertEqual(body, payload)

    def test_tx_cache_rejects_missing_hash_sidecar(self):
        server.ensure_cache_dir()
        valid_id = "B" * 43
        file_path = server.CACHE_DIR / valid_id
        file_path.write_bytes(b"cache entry without digest")
        failures_before = server.INTEGRITY_FAILURES

        self.assertIsNone(server.read_verified_cache_entry(file_path))
        self.assertFalse(file_path.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_invalid_hash_sidecar(self):
        server.ensure_cache_dir()
        valid_id = "C" * 43
        file_path = server.CACHE_DIR / valid_id
        server.write_cache_entry(file_path, b"original content")
        server.cache_hash_path(file_path).write_text("0" * 64, encoding="ascii")
        failures_before = server.INTEGRITY_FAILURES

        self.assertIsNone(server.read_verified_cache_entry(file_path))
        self.assertFalse(file_path.exists())
        self.assertFalse(server.cache_hash_path(file_path).exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def _assert_rejected_cache_entry(self, file_path):
        failures_before = server.INTEGRITY_FAILURES
        self.assertIsNone(server.read_verified_cache_entry(file_path))
        self.assertFalse(file_path.exists())
        self.assertFalse(server.cache_hash_path(file_path).exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_truncated_hash_sidecar(self):
        file_path = server.CACHE_DIR / ("D" * 43)
        server.write_cache_entry(file_path, b"original content")
        server.cache_hash_path(file_path).write_text("abc", encoding="ascii")

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_malformed_hash_sidecar(self):
        file_path = server.CACHE_DIR / ("E" * 43)
        server.write_cache_entry(file_path, b"original content")
        server.cache_hash_path(file_path).write_text("g" * 64, encoding="ascii")

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_oversized_hash_sidecar(self):
        file_path = server.CACHE_DIR / ("F" * 43)
        server.write_cache_entry(file_path, b"original content")
        server.cache_hash_path(file_path).write_text("a" * 65, encoding="ascii")

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_payload_changed_after_write(self):
        file_path = server.CACHE_DIR / ("G" * 43)
        server.write_cache_entry(file_path, b"original content")
        file_path.write_bytes(b"original content, truncated")

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_payload_removed_during_read(self):
        file_path = server.CACHE_DIR / ("H" * 43)
        server.write_cache_entry(file_path, b"payload")
        sidecar = server.cache_hash_path(file_path)
        original_read_cache_file = server._read_stable_cache_file

        def remove_payload_after_sidecar_read(path):
            result = original_read_cache_file(path)
            if path == sidecar:
                file_path.unlink()
            return result

        with patch.object(server, "_read_stable_cache_file", remove_payload_after_sidecar_read):
            self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_traversal_path(self):
        traversal_path = server.CACHE_DIR / ".." / "outside-traversal-entry"
        traversal_path.write_bytes(b"must not be read or deleted")
        failures_before = server.INTEGRITY_FAILURES

        self.assertIsNone(server.read_verified_cache_entry(traversal_path))
        self.assertTrue(traversal_path.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_symlink_to_external_payload(self):
        external_path = Path(self.temp_dir) / "external-payload"
        external_path.write_bytes(b"external payload")
        symlink_path = server.CACHE_DIR / ("K" * 43)
        try:
            symlink_path.symlink_to(external_path)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks unavailable in this Windows environment: {error}")

        failures_before = server.INTEGRITY_FAILURES
        self.assertIsNone(server.read_verified_cache_entry(symlink_path))
        self.assertTrue(external_path.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_reparse_directory_escape(self):
        external_dir = Path(self.temp_dir) / "external-directory"
        external_dir.mkdir()
        external_entry = external_dir / ("N" * 43)
        external_entry.write_bytes(b"external payload")
        reparse_dir = server.CACHE_DIR / "linked-directory"
        try:
            reparse_dir.symlink_to(external_dir, target_is_directory=True)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"directory symlinks unavailable in this Windows environment: {error}")

        escaped_path = reparse_dir / external_entry.name
        failures_before = server.INTEGRITY_FAILURES
        self.assertIsNone(server.read_verified_cache_entry(escaped_path))
        self.assertTrue(external_entry.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_payload_removed_before_open(self):
        file_path = server.CACHE_DIR / ("O" * 43)
        server.write_cache_entry(file_path, b"payload")
        file_path.unlink()

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_external_sidecar_symlink(self):
        file_path = server.CACHE_DIR / ("L" * 43)
        server.write_cache_entry(file_path, b"payload")
        external_sidecar = Path(self.temp_dir) / "external.sha256"
        external_sidecar.write_text("0" * 64, encoding="ascii")
        try:
            server.cache_hash_path(file_path).unlink()
            server.cache_hash_path(file_path).symlink_to(external_sidecar)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks unavailable in this Windows environment: {error}")

        failures_before = server.INTEGRITY_FAILURES
        self.assertIsNone(server.read_verified_cache_entry(file_path))
        self.assertFalse(file_path.exists())
        self.assertTrue(external_sidecar.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_tx_cache_rejects_file_replaced_between_check_and_open(self):
        file_path = server.CACHE_DIR / ("M" * 43)
        replacement_path = server.CACHE_DIR / "replacement.tmp"
        server.write_cache_entry(file_path, b"original")
        replacement_path.write_bytes(b"substituted")
        original_open = os.open
        replaced = False

        def replace_before_open(path, flags, *args, **kwargs):
            nonlocal replaced
            if Path(path) == file_path and not replaced:
                replaced = True
                os.replace(replacement_path, file_path)
            return original_open(path, flags, *args, **kwargs)

        with patch.object(server.os, "open", replace_before_open):
            self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_rejects_path_outside_cache_root(self):
        outside_path = Path(self.temp_dir) / "outside-cache-entry"
        outside_path.write_bytes(b"must not be read or deleted")
        failures_before = server.INTEGRITY_FAILURES

        self.assertIsNone(server.read_verified_cache_entry(outside_path))
        self.assertTrue(outside_path.exists())
        self.assertEqual(server.INTEGRITY_FAILURES, failures_before + 1)

    def test_transaction_route_never_returns_corrupt_cache_body(self):
        for index, (suffix, sidecar_value, mutate_payload) in enumerate((
            ("missing", None, False),
            ("invalid", "not-a-digest", False),
            ("mismatch", "0" * 64, False),
            ("changed", None, True),
        )):
            with self.subTest(case=suffix):
                tx_id = "Z" + chr(ord("A") + index) * 42
                payload = f"private-invalid-tx-{suffix}".encode("ascii")
                cache_file = server.CACHE_DIR / tx_id
                if sidecar_value is None and not mutate_payload and suffix == "missing":
                    cache_file.write_bytes(payload)
                else:
                    server.write_cache_entry(cache_file, payload)
                if sidecar_value is not None:
                    server.cache_hash_path(cache_file).write_text(sidecar_value, encoding="ascii")
                if mutate_payload:
                    cache_file.write_bytes(payload + b"-changed")

                with patch.object(server.VoxRelayHandler, "_fetch_transaction", return_value=None):
                    self._assert_transaction_response_rejects_payload(tx_id, payload)
                self.assertFalse(cache_file.exists())
                self.assertFalse(server.cache_hash_path(cache_file).exists())

    def _assert_transaction_response_rejects_payload(self, tx_id, payload):
        request = urllib.request.Request(self._url(f"/tx/{tx_id}"))
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                body = response.read()
                self.assertNotEqual(response.status, 200)
        except urllib.error.HTTPError as error:
            self.assertNotEqual(error.code, 200)
            self.assertNotEqual(error.headers.get("X-Vox-Cache"), "HIT")
            body = error.read()
        self.assertNotIn(payload, body)

    def test_tx_cache_write_failure_never_produces_hit(self):
        file_path = server.CACHE_DIR / ("I" * 43)
        original_atomic_write = server.atomic_write
        calls = 0

        def fail_hash_write(path, content):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated sidecar write failure")
            original_atomic_write(path, content)

        with patch.object(server, "atomic_write", fail_hash_write):
            with self.assertRaises(OSError):
                server.write_cache_entry(file_path, b"partial entry")

        self._assert_rejected_cache_entry(file_path)

    def test_tx_cache_eviction_racing_read_has_no_false_hit(self):
        file_path = server.CACHE_DIR / ("J" * 43)
        payload = b"race-safe payload"
        server.write_cache_entry(file_path, payload)
        barrier = threading.Barrier(2)
        results = []

        def read_entry():
            barrier.wait()
            results.append(server.read_verified_cache_entry(file_path))

        reader = threading.Thread(target=read_entry)
        reader.start()
        barrier.wait()
        server.remove_cache_entry(file_path)
        reader.join(timeout=2)

        self.assertFalse(reader.is_alive())
        self.assertTrue(all(result in (None, payload) for result in results))
        self.assertEqual(len(results), 1)
        self.assertFalse(file_path.exists())
        self.assertFalse(server.cache_hash_path(file_path).exists())

    def test_mirror_post_and_get_index(self):
        comm_id = "comunidade_livre"
        mirror_payload = {
            "communityId": comm_id,
            "title": "Comunidade Livre",
            "topics": [{"id": "t1", "title": "Topico 1"}],
        }
        raw_bytes = json.dumps(mirror_payload).encode("utf-8")

        # POST /vox/mirror
        req = urllib.request.Request(
            self._url("/vox/mirror"),
            data=raw_bytes,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            res_data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(res_data.get("status"), "mirrored")
            self.assertEqual(res_data.get("communityId"), comm_id)

        # GET /vox/index/<comm_id>.json
        get_req = urllib.request.Request(self._url(f"/vox/index/{comm_id}.json"))
        with urllib.request.urlopen(get_req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("X-Vox-Cache"), "HIT")
            ret_data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(ret_data.get("title"), "Comunidade Livre")
        self.assertTrue((server.CACHE_DIR / f"index_{comm_id}.json.sha256").is_file())

    def test_community_index_without_valid_sidecar_is_never_hit(self):
        comm_id = "missing_digest"
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        payload = b'{"communityId":"missing_digest"}'
        index_file.write_bytes(payload)

        self._assert_index_response_rejects_payload(comm_id, payload)
        self.assertFalse(index_file.exists())

    def _assert_index_response_rejects_payload(self, comm_id, payload):
        request = urllib.request.Request(self._url(f"/vox/index/{comm_id}.json"))
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                body = response.read()
                self.assertNotEqual(response.status, 200)
        except urllib.error.HTTPError as error:
            self.assertNotEqual(error.code, 200)
            self.assertNotEqual(error.headers.get("X-Vox-Cache"), "HIT")
            body = error.read()
        self.assertNotIn(payload, body)

    def test_community_index_rejects_bad_hash_sidecars_before_response(self):
        for suffix, sidecar_value, mutate_payload in (
            ("empty", "", False),
            ("malformed", "z" * 64, False),
            ("wrong", "0" * 64, False),
            ("altered", None, True),
        ):
            with self.subTest(case=suffix):
                comm_id = f"bad_{suffix}"
                payload = f"private-invalid-{suffix}".encode("ascii")
                index_file = server.CACHE_DIR / f"index_{comm_id}.json"
                server.write_cache_entry(index_file, payload)
                if sidecar_value is not None:
                    server.cache_hash_path(index_file).write_text(sidecar_value, encoding="ascii")
                if mutate_payload:
                    index_file.write_bytes(payload + b"-changed")

                self._assert_index_response_rejects_payload(comm_id, payload)
                self.assertFalse(index_file.exists())
                self.assertFalse(server.cache_hash_path(index_file).exists())

    def test_community_index_rejects_file_removed_during_read(self):
        comm_id = "removed_during_read"
        payload = b"must-not-leak-on-race"
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        sidecar = server.cache_hash_path(index_file)
        server.write_cache_entry(index_file, payload)
        original_read = server._read_stable_cache_file

        def remove_after_sidecar_read(path):
            result = original_read(path)
            if path == sidecar:
                index_file.unlink()
            return result

        with patch.object(server, "_read_stable_cache_file", remove_after_sidecar_read):
            self._assert_index_response_rejects_payload(comm_id, payload)

    def test_community_index_rejects_unreadable_sidecar_before_response(self):
        comm_id = "unreadable_sidecar"
        payload = b"must-not-leak-on-read-error"
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        sidecar = server.cache_hash_path(index_file)
        server.write_cache_entry(index_file, payload)
        original_read = server._read_stable_cache_file

        def fail_sidecar_read(path):
            if path == sidecar:
                raise PermissionError("simulated unreadable sidecar")
            return original_read(path)

        with patch.object(server, "_read_stable_cache_file", fail_sidecar_read):
            self._assert_index_response_rejects_payload(comm_id, payload)

        self.assertFalse(index_file.exists())
        self.assertFalse(sidecar.exists())

    def test_community_index_rejects_external_symlink_before_response(self):
        comm_id = "external_index"
        payload = b"external-private-index"
        external_file = Path(self.temp_dir) / "external-index.json"
        external_file.write_bytes(payload)
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        try:
            index_file.symlink_to(external_file)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks unavailable in this Windows environment: {error}")

        self._assert_index_response_rejects_payload(comm_id, payload)
        self.assertTrue(external_file.exists())

    def test_community_index_rejects_external_sidecar_symlink_before_response(self):
        comm_id = "external_sidecar"
        payload = b"must-not-leak-with-external-hash"
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        server.write_cache_entry(index_file, payload)
        sidecar = server.cache_hash_path(index_file)
        external_sidecar = Path(self.temp_dir) / "external-index.sha256"
        external_sidecar.write_text(hashlib.sha256(payload).hexdigest(), encoding="ascii")
        try:
            sidecar.unlink()
            sidecar.symlink_to(external_sidecar)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"symlinks unavailable in this Windows environment: {error}")

        self._assert_index_response_rejects_payload(comm_id, payload)
        self.assertTrue(external_sidecar.exists())
        self.assertFalse(index_file.exists())

    def test_community_index_remains_verified_after_server_restart(self):
        comm_id = "restart_integrity"
        payload = json.dumps({"communityId": comm_id, "title": "Persistente"}).encode("utf-8")
        index_file = server.CACHE_DIR / f"index_{comm_id}.json"
        server.write_cache_entry(index_file, payload)
        restarted_server = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        restarted_thread = threading.Thread(target=restarted_server.serve_forever, daemon=True)
        restarted_thread.start()
        request = urllib.request.Request(
            f"http://127.0.0.1:{restarted_server.server_address[1]}/vox/index/{comm_id}.json"
        )
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.headers.get("X-Vox-Cache"), "HIT")
                self.assertEqual(response.read(), payload)
        finally:
            restarted_server.shutdown()
            restarted_server.server_close()
            restarted_thread.join(timeout=2)

    def test_cache_quota_counts_content_and_sidecar(self):
        prev_limit = os.environ.get("VOX_RELAY_MAX_CACHE_MB")
        original_cache = server.CACHE_DIR
        isolated_cache = Path(self.temp_dir) / "quota-cache"
        server.CACHE_DIR = isolated_cache
        os.environ["VOX_RELAY_MAX_CACHE_MB"] = "1"
        payload = b"quota-accounting" * 32
        cache_file = isolated_cache / ("P" * 43)
        try:
            self.assertTrue(server.store_cache_entry_with_quota(cache_file, payload))
            expected_size = len(payload) + len(hashlib.sha256(payload).hexdigest())
            self.assertEqual(server.cache_dir_bytes(), expected_size)
        finally:
            server.CACHE_DIR = original_cache
            self._restore_cache_limit(prev_limit)

    def test_orphaned_sidecar_is_removed_from_cache(self):
        orphan = server.CACHE_DIR / ("Q" * 43 + server.CACHE_HASH_SUFFIX)
        orphan.write_text("a" * 64, encoding="ascii")

        server.ensure_cache_dir()

        self.assertFalse(orphan.exists())

    def test_concurrent_cache_writes_stay_within_quota(self):
        prev_limit = os.environ.get("VOX_RELAY_MAX_CACHE_MB")
        original_cache = server.CACHE_DIR
        isolated_cache = Path(self.temp_dir) / "concurrent-quota-cache"
        server.CACHE_DIR = isolated_cache
        os.environ["VOX_RELAY_MAX_CACHE_MB"] = "1"
        payload = b"x" * (600 * 1024)
        barrier = threading.Barrier(3)
        outcomes = []

        def store(name):
            barrier.wait()
            target = isolated_cache / name
            outcomes.append((target, server.store_cache_entry_with_quota(target, payload)))

        writers = [
            threading.Thread(target=store, args=("R" * 43,)),
            threading.Thread(target=store, args=("S" * 43,)),
        ]
        try:
            for writer in writers:
                writer.start()
            barrier.wait()
            for writer in writers:
                writer.join(timeout=3)

            self.assertTrue(all(not writer.is_alive() for writer in writers))
            self.assertLessEqual(server.cache_dir_bytes(), 1024 * 1024)
            self.assertEqual(len(outcomes), 2)
            for target, _ in outcomes:
                if target.exists():
                    self.assertEqual(server.read_verified_cache_entry(target), payload)
                    self.assertTrue(server.cache_hash_path(target).exists())
        finally:
            server.CACHE_DIR = original_cache
            self._restore_cache_limit(prev_limit)

    def _restore_cache_limit(self, previous):
        if previous is None:
            os.environ.pop("VOX_RELAY_MAX_CACHE_MB", None)
        else:
            os.environ["VOX_RELAY_MAX_CACHE_MB"] = previous

    def test_get_nonexistent_index_returns_404(self):
        req = urllib.request.Request(self._url("/vox/index/inexistente.json"))
        try:
            urllib.request.urlopen(req, timeout=2)
            self.fail("Deveria retornar HTTP 404")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 404)

    def test_inbox_lifecycle(self):
        to_addr = "addr_bob_test_123"
        envelope = {
            "v": 1,
            "id": "dm_msg_999",
            "from": "addr_alice",
            "to": to_addr,
            "ts": int(time.time()),
            "ephPub": {"kty": "EC", "crv": "P-256", "x": "1", "y": "2"},
            "iv": "iv_test",
            "ct": "ct_ciphertext_test",
        }
        body = json.dumps(envelope).encode("utf-8")

        # 1. POST /inbox/:to_addr
        post_req = urllib.request.Request(
            self._url(f"/inbox/{to_addr}"),
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(post_req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("status"), "queued")
            self.assertEqual(data.get("id"), "dm_msg_999")

        # 2. GET /inbox/:to_addr
        get_req = urllib.request.Request(self._url(f"/inbox/{to_addr}"))
        with urllib.request.urlopen(get_req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("envelopes", data)
            self.assertEqual(len(data["envelopes"]), 1)
            self.assertEqual(data["envelopes"][0]["id"], "dm_msg_999")

        # 3. DELETE /inbox/:to_addr/:id
        del_req = urllib.request.Request(self._url(f"/inbox/{to_addr}/dm_msg_999"), method="DELETE")
        with urllib.request.urlopen(del_req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)

        # 4. GET /inbox/:to_addr novamente (vazio)
        with urllib.request.urlopen(get_req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(len(data["envelopes"]), 0)

    def test_default_port_and_env(self):
        self.assertEqual(server.DEFAULT_PORT, 3920)
        self.assertEqual(server.DEFAULT_HOST, "127.0.0.1")
        self.assertEqual(server.resolve_listen_port({}), 3920)
        self.assertEqual(server.resolve_listen_port({"VOX_RELAY_PORT": "8787"}), 8787)
        self.assertEqual(server.resolve_listen_port({"VOX_RELAY_PORT": "abc"}), 3920)
        self.assertEqual(server.resolve_listen_port({"VOX_RELAY_PORT": ""}), 3920)

    def test_get_content_length_robustness(self):
        class DummyHandler:
            headers = {}
            _get_content_length = server.VoxRelayHandler._get_content_length

        h = DummyHandler()
        self.assertEqual(h._get_content_length(), 0)

        h.headers = {"Content-Length": "42"}
        self.assertEqual(h._get_content_length(), 42)

        h.headers = {"Content-Length": "-10"}
        self.assertEqual(h._get_content_length(), 0)

        h.headers = {"Content-Length": "invalid"}
        self.assertEqual(h._get_content_length(), 0)

        h.headers = {"Content-Length": None}
        self.assertEqual(h._get_content_length(), 0)


    def test_cache_dir_resolution_and_custom_env(self):
        default_dir = server.resolve_cache_dir({})
        self.assertTrue(str(default_dir).endswith(".cache"))

        custom_path = "/var/lib/vox-populi/cache"
        resolved = server.resolve_cache_dir({"VOX_RELAY_CACHE_DIR": custom_path})
        self.assertEqual(str(resolved), str(Path(custom_path).resolve()))

    def test_inbox_dir_resolution_and_custom_env(self):
        default_dir = inbox.resolve_inbox_dir({})
        self.assertTrue(str(default_dir).endswith(".inbox"))

        custom_inbox = "/var/lib/vox-populi/inbox"
        resolved_inbox = inbox.resolve_inbox_dir({"VOX_RELAY_INBOX_DIR": custom_inbox})
        self.assertEqual(str(resolved_inbox), str(Path(custom_inbox).resolve()))

        # Fallback to VOX_RELAY_CACHE_DIR / "inbox"
        from_cache = inbox.resolve_inbox_dir({"VOX_RELAY_CACHE_DIR": "/tmp/custom_cache"})
        self.assertEqual(str(from_cache), str(Path("/tmp/custom_cache/inbox").resolve()))

    def test_lru_cache_eviction_under_quota(self):
        prev = os.environ.get("VOX_RELAY_MAX_CACHE_MB")
        test_cache = Path(self.temp_dir) / "evict_test"
        test_cache.mkdir(parents=True, exist_ok=True)
        orig = server.CACHE_DIR
        server.CACHE_DIR = test_cache

        try:
            # Configura teto de 1 MB
            os.environ["VOX_RELAY_MAX_CACHE_MB"] = "1"

            # Cria entrada 1 antiga (conteúdo + sidecar SHA-256, 500 KB)
            f1 = test_cache / ("1" * 43)
            server.write_cache_entry(f1, b"X" * (500 * 1024))
            os.utime(f1, (time.time() - 200, time.time() - 200))

            # Cria entrada 2 recente (conteúdo + sidecar SHA-256, 400 KB)
            f2 = test_cache / ("2" * 43)
            server.write_cache_entry(f2, b"Y" * (400 * 1024))
            os.utime(f2, (time.time() - 100, time.time() - 100))

            # Os sidecars também contam: ao adicionar 300 KB, remove a entrada LRU inteira.
            incoming_bytes = (300 * 1024) + 64
            server.evict_cache_if_needed(incoming_bytes)

            self.assertFalse(f1.exists(), "Arquivo f1 mais antigo deve ter sido expurgado")
            self.assertFalse(server.cache_hash_path(f1).exists(), "Sidecar da entrada expurgada deve sair junto")
            self.assertTrue(f2.exists(), "Arquivo f2 mais recente deve ter sido preservado")
            self.assertTrue(server.cache_hash_path(f2).exists(), "Sidecar da entrada recente deve permanecer")
        finally:
            server.CACHE_DIR = orig
            if prev is None:
                os.environ.pop("VOX_RELAY_MAX_CACHE_MB", None)
            else:
                os.environ["VOX_RELAY_MAX_CACHE_MB"] = prev


if __name__ == "__main__":
    unittest.main()

