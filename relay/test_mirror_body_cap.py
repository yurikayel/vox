"""POST /vox/mirror recusa Content-Length acima do teto antes de ler o corpo."""

from __future__ import annotations

import http.client
import json
import shutil
import socket
import tempfile
import threading
import unittest
from http.server import HTTPServer
from pathlib import Path

from relay import blind_relay, inbox, mirror_validate, server


class TestMirrorBodyCap(unittest.TestCase):
    def setUp(self):
        self.conn: http.client.HTTPConnection | None = None
        server.CACHE_DIR = Path(self.temp_dir) / self._testMethodName / "cache"
        inbox.INBOX_DIR = Path(self.temp_dir) / self._testMethodName / "inbox"
        blind_relay.RELAY_DIR = Path(self.temp_dir) / self._testMethodName / "blind_relay"
        server.ensure_cache_dir()
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        if self.conn is not None:
            try:
                self.conn.close()
            except (ConnectionResetError, BrokenPipeError, OSError):
                pass  # conexão já encerrada pelo relay após resposta antecipada
            self.conn = None
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self.assertFalse(self.thread.is_alive(), "thread do servidor não encerrou a tempo")

    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.mkdtemp(prefix="vox_mirror_cap_")
        cls.orig_cache = server.CACHE_DIR
        cls.orig_inbox = inbox.INBOX_DIR
        cls.orig_relay = blind_relay.RELAY_DIR

    @classmethod
    def tearDownClass(cls):
        server.CACHE_DIR = cls.orig_cache
        inbox.INBOX_DIR = cls.orig_inbox
        blind_relay.RELAY_DIR = cls.orig_relay
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def test_mirror_rejects_oversized_content_length_before_read(self):
        declared = 10 * 1024 * 1024
        self.assertGreater(declared, mirror_validate.MAX_MIRROR_BODY_BYTES)
        self.conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        self.conn.putrequest("POST", "/vox/mirror")
        self.conn.putheader("Host", f"127.0.0.1:{self.port}")
        self.conn.putheader("Content-Type", "application/json")
        self.conn.putheader("Content-Length", str(declared))
        self.conn.endheaders()
        self.conn.send(b"x" * 1024)
        try:
            resp = self.conn.getresponse()
        except (TimeoutError, socket.timeout):
            self.fail("servidor esperou o corpo inteiro antes de recusar")
        self.assertEqual(resp.status, 413)
        payload = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(payload.get("code"), "mirror.body_too_large")

    def test_mirror_small_valid_body_still_mirrors(self):
        mirror_payload = {"communityId": "cap_ok", "title": "Ok", "topics": []}
        raw_bytes = json.dumps(mirror_payload).encode("utf-8")
        self.conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        self.conn.request(
            "POST",
            "/vox/mirror",
            body=raw_bytes,
            headers={"Content-Type": "application/json"},
        )
        resp = self.conn.getresponse()
        self.assertEqual(resp.status, 200)
        res = json.loads(resp.read().decode("utf-8"))
        self.assertEqual(res.get("status"), "mirrored")
        self.assertEqual(res.get("communityId"), "cap_ok")


if __name__ == "__main__":
    unittest.main()