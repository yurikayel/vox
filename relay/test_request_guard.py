"""PM-94: quem pode escrever no relay — Host, Origin, Content-Type, limite por IP, dono do cofre e chave de
apagar da caixa de DMs."""

import hashlib
import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

from relay import central_memory, inbox, request_guard, server

TOKEN = "0f" * 16
OWNER = "a1" * 32
V2_RECORD = {"v": 2, "kdf": "pbkdf2-sha256", "iter": 600000, "salt": "ab" * 16, "iv": "cd" * 12, "ciphertext": "ef"}


def envelope(msg_id, with_delete=True):
    env = {"v": 1, "id": msg_id, "from": "a", "to": "b", "ephPub": {"kty": "EC"}, "iv": "i", "ct": "c"}
    if with_delete:
        env["del"] = {"iv": "x", "ct": "y", "hash": hashlib.sha256(bytes.fromhex(TOKEN)).hexdigest()}
    return env


class TestGuardRules(unittest.TestCase):
    def test_host_only_checked_when_bound_to_loopback(self):
        self.assertTrue(request_guard.host_allowed("127.0.0.1:3920", "127.0.0.1"))
        self.assertTrue(request_guard.host_allowed("localhost:3920", "127.0.0.1"))
        self.assertTrue(request_guard.host_allowed("[::1]:3920", "::1"))
        self.assertFalse(request_guard.host_allowed("rebind.example:3920", "127.0.0.1"))
        self.assertTrue(request_guard.host_allowed("rebind.example", "0.0.0.0"))
        env = {"VOX_RELAY_ALLOWED_HOSTS": "meu-tunel.example"}
        self.assertTrue(request_guard.host_allowed("meu-tunel.example", "127.0.0.1", env))

    def test_origin_allowlist(self):
        self.assertTrue(request_guard.origin_allowed(""))
        self.assertTrue(request_guard.origin_allowed("https://yurikayel.github.io"))
        self.assertTrue(request_guard.origin_allowed("http://localhost:5175"))
        self.assertTrue(request_guard.origin_allowed("http://127.0.0.1:8080"))
        self.assertFalse(request_guard.origin_allowed("https://site-qualquer.example"))
        self.assertFalse(request_guard.origin_allowed("null"))
        env = {"VOX_RELAY_ALLOWED_ORIGINS": "https://espelho.example/"}
        self.assertTrue(request_guard.origin_allowed("https://espelho.example", env))

    def test_json_content_type(self):
        self.assertTrue(request_guard.is_json_content_type("application/json; charset=utf-8"))
        self.assertFalse(request_guard.is_json_content_type("text/plain"))
        self.assertFalse(request_guard.is_json_content_type(None))

    def test_write_rate_limit_window(self):
        now = [0.0]
        limiter = request_guard.WriteRateLimiter(limit_per_min=2, clock=lambda: now[0])
        self.assertTrue(limiter.allow("1.2.3.4"))
        self.assertTrue(limiter.allow("1.2.3.4"))
        self.assertFalse(limiter.allow("1.2.3.4"))
        self.assertTrue(limiter.allow("5.6.7.8"), "outro IP tem sua própria cota")
        now[0] = 60.0
        self.assertTrue(limiter.allow("1.2.3.4"), "a janela anda")

    def test_reject_reason_order(self):
        limiter = request_guard.WriteRateLimiter(limit_per_min=1)
        json_headers = {"Host": "127.0.0.1:1", "Content-Type": "application/json"}
        self.assertEqual(request_guard.reject_reason("GET", {"Host": "x.example"}, "127.0.0.1", "ip", limiter)[0], 421)
        self.assertIsNone(request_guard.reject_reason("GET", {"Host": "127.0.0.1:1"}, "127.0.0.1", "ip", limiter))
        bad_origin = dict(json_headers, Origin="https://x.example")
        self.assertEqual(request_guard.reject_reason("POST", bad_origin, "127.0.0.1", "ip", limiter)[0], 403)
        text = {"Host": "127.0.0.1:1", "Content-Type": "text/plain"}
        self.assertEqual(request_guard.reject_reason("POST", text, "127.0.0.1", "ip", limiter)[0], 415)
        self.assertIsNone(request_guard.reject_reason("POST", json_headers, "127.0.0.1", "ip", limiter))
        self.assertEqual(request_guard.reject_reason("DELETE", json_headers, "127.0.0.1", "ip", limiter)[0], 429)


class TestRelayWritesOverHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="vox_pm94_")
        cls.previous = (inbox.INBOX_DIR, central_memory.MEMORY_DIR)
        inbox.INBOX_DIR = Path(cls.tmp) / "inbox"
        central_memory.set_memory_dir(Path(cls.tmp) / "mem")
        cls.limiter = patch.object(request_guard, "WRITE_LIMITER", request_guard.WriteRateLimiter(limit_per_min=1000))
        cls.limiter.start()
        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.limiter.stop()
        inbox.INBOX_DIR, memory_dir = cls.previous
        central_memory.set_memory_dir(memory_dir)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def call(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        base = {"Content-Type": "application/json"} if data is not None else {}
        url = f"http://127.0.0.1:{self.httpd.server_address[1]}{path}"
        req = urllib.request.Request(url, data=data, headers={**base, **(headers or {})}, method=method)
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read() or b"{}")

    def test_inbox_delete_needs_the_recipient_token(self):
        self.assertEqual(self.call("POST", "/inbox/bob", envelope("dm_1"))[0], 200)
        self.assertEqual(self.call("DELETE", "/inbox/bob/dm_1")[0], 403)
        self.assertEqual(self.call("DELETE", "/inbox/bob/dm_1", headers={"X-Vox-Delete-Token": "ab" * 16})[0], 403)
        self.assertEqual(len(self.call("GET", "/inbox/bob")[1]["envelopes"]), 1)
        self.assertEqual(self.call("DELETE", "/inbox/bob/dm_1", headers={"X-Vox-Delete-Token": TOKEN})[0], 200)
        self.assertEqual(self.call("GET", "/inbox/bob")[1]["envelopes"], [])

    def test_inbox_legacy_envelope_still_deletes_and_bad_delete_field_is_refused(self):
        self.call("POST", "/inbox/carol", envelope("dm_2", with_delete=False))
        self.assertEqual(self.call("DELETE", "/inbox/carol/dm_2")[0], 200)
        broken = dict(envelope("dm_3"), **{"del": {"hash": "curto", "ct": "y"}})
        self.assertEqual(self.call("POST", "/inbox/carol", broken)[0], 400)

    def test_vault_write_needs_the_owner_proof(self):
        self.assertEqual(self.call("POST", "/memory/vault/cofre1", {"record": V2_RECORD})[0], 403)
        self.assertEqual(self.call("POST", "/memory/vault/cofre1", {"record": V2_RECORD, "ownerToken": OWNER})[0], 200)
        other = {"record": dict(V2_RECORD, ciphertext="99"), "ownerToken": "b2" * 32}
        self.assertEqual(self.call("POST", "/memory/vault/cofre1", other)[0], 403)
        status, served = self.call("GET", "/memory/vault/cofre1")
        self.assertEqual(status, 200)
        self.assertNotIn("ownerHash", json.dumps(served))

    def test_browser_writes_from_other_sites_and_text_plain_are_refused(self):
        evil = {"Origin": "https://site-qualquer.example"}
        self.assertEqual(self.call("POST", "/inbox/dave", envelope("dm_4"), evil)[0], 403)
        self.assertEqual(self.call("POST", "/inbox/dave", envelope("dm_4"), {"Content-Type": "text/plain"})[0], 415)
        app = {"Origin": "https://yurikayel.github.io"}
        self.assertEqual(self.call("POST", "/inbox/dave", envelope("dm_4"), app)[0], 200)

    def test_rebinding_host_is_refused(self):
        self.assertEqual(self.call("GET", "/health", headers={"Host": "rebind.example:3920"})[0], 421)
        self.assertEqual(self.call("GET", "/health")[0], 200)


if __name__ == "__main__":
    unittest.main()
