#!/usr/bin/env python3
"""Red-on-base: 500 genérico sem vazar path; falha de utime ≠ integrity failure."""

import hashlib
import http.client
import json
import pathlib
import tempfile
import threading
import unittest
from http.server import HTTPServer
from unittest import mock

from relay import central_memory, inbox, server


class TestRelayErrorSanitization(unittest.TestCase):
    """Garante que erros internos não vazam detalhe no JSON de resposta."""

    def test_send_internal_error_payload_is_generic(self):
        captured = {}

        class _Stub(server.VoxRelayHandler):
            def __init__(self):
                pass

            def _send_json(self, payload, status=200, extra_headers=None):
                captured["payload"] = payload
                captured["status"] = status

        stub = _Stub()
        sensitive = OSError(2, "No such file", r"C:\Users\secret\.vox\cache\tx.bin")
        with mock.patch.object(server._LOG, "exception") as log_exc:
            stub._send_internal_error(sensitive)
        self.assertEqual(captured["status"], 500)
        self.assertEqual(captured["payload"], {"error": "internal_error"})
        body = json.dumps(captured["payload"])
        self.assertNotIn("secret", body)
        self.assertNotIn("Users", body)
        self.assertNotIn(str(sensitive), body)
        log_exc.assert_called_once()

    def _write_verified_entry(self, root, name, raw):
        cache_file = root / name
        cache_file.write_bytes(raw)
        digest = hashlib.sha256(raw).hexdigest()
        pathlib.Path(str(cache_file) + server.CACHE_HASH_SUFFIX).write_text(digest, encoding="ascii")
        return cache_file

    def test_utime_oserror_does_not_count_integrity_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prev = server.CACHE_DIR
            server.set_cache_dir(root)
            self.addCleanup(server.set_cache_dir, prev)
            cache_file = self._write_verified_entry(root, "entry.bin", b"payload-ok")
            before = server.INTEGRITY_FAILURES
            with mock.patch.object(server.os, "utime", side_effect=OSError("utime denied")):
                data = server.read_verified_cache_entry(cache_file)
            self.assertEqual(data, b"payload-ok")
            self.assertEqual(server.INTEGRITY_FAILURES, before)

    def test_utime_file_not_found_counts_integrity_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prev = server.CACHE_DIR
            server.set_cache_dir(root)
            self.addCleanup(server.set_cache_dir, prev)
            cache_file = self._write_verified_entry(root, "gone.bin", b"payload-gone")
            before = server.INTEGRITY_FAILURES
            with mock.patch.object(server.os, "utime", side_effect=FileNotFoundError("gone")):
                data = server.read_verified_cache_entry(cache_file)
            self.assertIsNone(data)
            self.assertEqual(server.INTEGRITY_FAILURES, before + 1)


class _RelaySanitizationHttp(unittest.TestCase):
    """HTTP mínimo para exercitar `_send_internal_error` via rota real."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self._tmp.name)
        self._orig = (server.CACHE_DIR, inbox.INBOX_DIR, central_memory.MEMORY_DIR)
        server.set_cache_dir(root / "cache")
        inbox.set_inbox_dir(root / "inbox")
        central_memory.set_memory_dir(root / "memory")
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._cleanup)

    def _cleanup(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        cache_dir, inbox_dir, mem_dir = self._orig
        server.set_cache_dir(cache_dir)
        inbox.set_inbox_dir(inbox_dir)
        central_memory.set_memory_dir(mem_dir)
        self._tmp.cleanup()

    def _raw_request(self, method, path, body=b""):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            headers = {"Origin": f"http://127.0.0.1:{self.port}", "Content-Type": "application/json"}
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()


class TestRelayHttpInternalError(_RelaySanitizationHttp):
    """POST /memory/sync com falha inesperada devolve 500 genérico."""

    def test_memory_sync_unexpected_error_is_sanitized(self):
        boom = RuntimeError(r"C:\Users\secret\leak.path")
        with mock.patch.object(central_memory, "sync_bundle", side_effect=boom):
            status, raw = self._raw_request("POST", "/memory/sync", body=b"{}")
        self.assertEqual(status, 500)
        payload = json.loads(raw)
        self.assertEqual(payload, {"error": "internal_error"})
        self.assertNotIn("secret", raw.decode("utf-8", errors="replace"))


if __name__ == "__main__":
    unittest.main()
