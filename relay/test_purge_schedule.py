"""Varredura periódica de expirados e limites de `/tx` (docs/specs/relay-api.md §6)."""

from __future__ import annotations

import http.client
import io
import json
import os
import tempfile
import threading
import time
import unittest
from http.server import HTTPServer
from pathlib import Path
from unittest import mock

from relay import blind_relay, inbox, server


def sched():
    """Módulo da varredura como o servidor o enxerga; falha por asserção se o relay não o liga."""
    module = getattr(server, "purge_schedule", None)
    assert module is not None, "server deve ligar a varredura periódica (purge_schedule)"
    return module


TX_ID = "A" * 43


class FakeResponse(io.BytesIO):
    """Resposta de gateway falsa: status 200 e cabeçalhos mínimos."""

    status = 200

    def __init__(self, body: bytes):
        super().__init__(body)
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class TestPurgeOnce(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
        for module, attr, sub in ((inbox, "INBOX_DIR", "i"), (blind_relay, "RELAY_DIR", "b")):
            patcher = mock.patch.object(module, attr, root / sub)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _write(self, path: Path, expires_at: float) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"expiresAt": expires_at, "envelope": {}}), encoding="utf-8")

    def test_expired_items_disappear_and_live_ones_stay(self):
        now = time.time()
        self._write(inbox.INBOX_DIR / "velho" / "a.json", now - 10)
        self._write(inbox.INBOX_DIR / "vivo" / "b.json", now + 3600)
        stored = "env_1_" + "0" * 20 + ".json"
        self._write(blind_relay.RELAY_DIR / "canal1" / stored, now - 10)
        result = sched().purge_expired_once(now)
        self.assertEqual(result, {"inbox": 1, "blind": 1})
        self.assertFalse((inbox.INBOX_DIR / "velho").exists())
        self.assertTrue((inbox.INBOX_DIR / "vivo" / "b.json").exists())
        self.assertFalse((blind_relay.RELAY_DIR / "canal1").exists())

    def test_sweeper_thread_purges_and_stops_cleanly(self):
        self._write(inbox.INBOX_DIR / "velho" / "a.json", time.time() - 10)
        sweeper = sched().PurgeSweeper(0.05)
        self.assertTrue(sweeper.start())
        deadline = time.time() + 5
        while (inbox.INBOX_DIR / "velho").exists() and time.time() < deadline:
            time.sleep(0.02)
        sweeper.stop()
        self.assertFalse((inbox.INBOX_DIR / "velho").exists())
        self.assertFalse(any(t.name == "vox-relay-purge" for t in threading.enumerate()))

    def test_interval_zero_disables_sweeper(self):
        self.assertFalse(sched().PurgeSweeper(0).start())
        with mock.patch.dict(os.environ, {"VOX_RELAY_PURGE_INTERVAL_SECONDS": "0"}):
            self.assertEqual(sched().resolve_purge_interval(), 0.0)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VOX_RELAY_PURGE_INTERVAL_SECONDS", None)
            self.assertEqual(sched().resolve_purge_interval(), 900.0)


class TestCacheDefaults(unittest.TestCase):
    def test_cache_ceiling_has_default_and_zero_means_unlimited(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VOX_RELAY_MAX_CACHE_MB", None)
            self.assertEqual(server.max_cache_bytes(), 512 * 1024 * 1024)
        with mock.patch.dict(os.environ, {"VOX_RELAY_MAX_CACHE_MB": "0"}):
            self.assertIsNone(server.max_cache_bytes())
        with mock.patch.dict(os.environ, {"VOX_RELAY_MAX_CACHE_MB": "lixo"}):
            self.assertEqual(server.max_cache_bytes(), 512 * 1024 * 1024)


class TestTxCap(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(server, "CACHE_DIR", Path(self.tmp.name) / "cache")
        patcher.start()
        self.addCleanup(patcher.stop)
        server.ensure_cache_dir()
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)

    def _get_tx(self, body: bytes, limit_mb: str):
        response = FakeResponse(body)
        with (
            mock.patch.dict(os.environ, {"VOX_RELAY_MAX_TX_MB": limit_mb}),
            mock.patch.object(server.urllib.request, "urlopen", return_value=response),
        ):
            conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
            conn.request("GET", f"/tx/{TX_ID}")
            reply = conn.getresponse()
            reply.read()
            conn.close()
        return reply.status, response

    def test_tx_above_ceiling_returns_413_without_reading_everything(self):
        status, response = self._get_tx(b"x" * (2 * 1024 * 1024), "1")
        self.assertEqual(status, 413)
        self.assertLessEqual(response.tell(), 1024 * 1024 + 1)

    def test_tx_within_ceiling_is_served(self):
        status, _ = self._get_tx(b"x" * 1024, "1")
        self.assertEqual(status, 200)


if __name__ == "__main__":
    unittest.main()
