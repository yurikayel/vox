#!/usr/bin/env python3
"""
Testes unitários para o Vox Relay Desktop (server.py).
Biblioteca padrão Python (unittest).
"""

import json
import os
import shutil
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import HTTPServer
from pathlib import Path

from relay import server
from relay import inbox


class TestVoxRelayServer(unittest.TestCase):
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
        valid_id = "A" * 43
        payload = json.dumps({"title": "Topico Teste", "body": "Conteudo"}).encode("utf-8")
        file_path = server.CACHE_DIR / valid_id
        file_path.write_bytes(payload)

        req = urllib.request.Request(self._url(f"/tx/{valid_id}"))
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.headers.get("X-Vox-Cache"), "HIT")
            body = resp.read()
            self.assertEqual(body, payload)

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


if __name__ == "__main__":
    unittest.main()
