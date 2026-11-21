#!/usr/bin/env python3
"""PM-114 — Teste de contrato bidirecional da API do Relay Vox.

Valida a correspondência entre a especificação canônica (docs/specs/relay-api.md)
e as rotas reais atendidas por relay/server.py e seus submódulos (inbox,
vault_store, central_memory, blind_relay, p2p_seeder, oauth_exchange).
Exercita códigos de status HTTP reais em servidor efêmero 127.0.0.1.
"""

import hashlib
import json
import pathlib
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer

from relay import blind_relay, central_memory, inbox, server
from relay.genesis_data import GENESIS_MS

T_VALID = GENESIS_MS + 1000
SPEC_PATH = pathlib.Path(__file__).resolve().parent.parent / "docs" / "specs" / "relay-api.md"

DOCUMENTED_ROUTES = {
    ("GET", "/health"), ("GET", "/tx/<txId>"), ("GET", "/vox/index/<commId>.json"),
    ("POST", "/vox/mirror"), ("GET", "/inbox/<addr>"), ("POST", "/inbox/<addr>"),
    ("DELETE", "/inbox/<addr>/<msgId>"), ("GET", "/relay/envelope/<canal>"),
    ("POST", "/relay/envelope/<canal>"), ("GET", "/relay/snapshot/<canal>"),
    ("POST", "/relay/snapshot/<canal>"), ("GET", "/memory"), ("GET", "/memory/status"),
    ("GET", "/memory/state"), ("GET", "/memory/blob/<sha256>"), ("POST", "/memory/ingest"),
    ("POST", "/memory/sync"), ("GET", "/memory/vault/<chave>"), ("POST", "/memory/vault/<chave>"),
    ("GET", "/p2p/status"), ("GET", "/p2p/blobs"), ("GET", "/p2p/seed/<hash>"),
    ("DELETE", "/p2p/seed/<hash>"), ("POST", "/p2p/seed"), ("GET", "/peer/beacon"),
    ("GET", "/p2p/peers"), ("POST", "/peer/beacon"), ("POST", "/oauth/exchange"),
}


class TestContractSpecCrossCheck(unittest.TestCase):
    """Conferência bidirecional entre docs/specs/relay-api.md e o relay."""

    def test_spec_covers_all_contract_routes(self):
        self.assertTrue(SPEC_PATH.is_file(), f"Arquivo de spec ausente: {SPEC_PATH}")
        spec_text = SPEC_PATH.read_text(encoding="utf-8")
        for method, route in DOCUMENTED_ROUTES:
            self.assertIn(route, spec_text, f"Rota {route} ausente na spec relay-api.md")

    def test_server_handlers_correspond_to_spec(self):
        server_src = pathlib.Path(server.__file__).read_text(encoding="utf-8")
        for _method, route in DOCUMENTED_ROUTES:
            prefix = route.split("<")[0].rstrip("/")
            self.assertIn(prefix, server_src, f"Handler para {prefix} ausente em server.py")


class TestContractHttpApi(unittest.TestCase):
    """Execução das rotas e status da API em servidor efêmero 127.0.0.1."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(cls.tmp.name)
        cls.orig_dirs = (server.CACHE_DIR, inbox.INBOX_DIR, blind_relay.RELAY_DIR, central_memory.MEMORY_DIR)
        server.set_cache_dir(root / "cache")
        server.ensure_cache_dir()
        inbox.set_inbox_dir(root / "inbox")
        blind_relay.set_relay_dir(root / "blind")
        central_memory.set_memory_dir(root / "memory")

        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        c_dir, i_dir, b_dir, m_dir = cls.orig_dirs
        server.set_cache_dir(c_dir)
        inbox.set_inbox_dir(i_dir)
        blind_relay.set_relay_dir(b_dir)
        central_memory.set_memory_dir(m_dir)
        cls.tmp.cleanup()

    def _req(self, method, path, body=None, headers=None):
        base_h = {"Host": f"127.0.0.1:{self.port}", "Origin": f"http://127.0.0.1:{self.port}"}
        if headers:
            base_h.update(headers)
        data = body if isinstance(body, bytes) else (json.dumps(body).encode("utf-8") if body is not None else None)
        if method == "POST" and "Content-Type" not in base_h and body is not None:
            base_h["Content-Type"] = "application/json"
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}", data=data, method=method, headers=base_h)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                raw = resp.read()
                return resp.status, raw, resp.headers
        except urllib.error.HTTPError as err:
            return err.code, err.read(), err.headers

    def test_cors_options_contract(self):
        status, _, headers = self._req("OPTIONS", "/health")
        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), f"http://127.0.0.1:{self.port}")
        self.assertIn("GET", headers.get("Access-Control-Allow-Methods", ""))

    def test_request_guard_contract(self):
        st421, _, _ = self._req("GET", "/health", headers={"Host": "evil-domain.com"})
        self.assertEqual(st421, 421)
        st403, _, _ = self._req("POST", "/memory/sync", body={}, headers={"Origin": "https://malicious.org"})
        self.assertEqual(st403, 403)
        st415, _, _ = self._req("POST", "/memory/sync", body=b"raw", headers={"Content-Type": "text/plain"})
        self.assertEqual(st415, 415)

    def test_health_and_tx_contract(self):
        status, body, _ = self._req("GET", "/health")
        self.assertEqual(status, 200)
        data = json.loads(body.decode("utf-8"))
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("app"), "vox-relay")

        st_bad_tx, _, _ = self._req("GET", "/tx/short_bad_id")
        self.assertEqual(st_bad_tx, 400)
        st_missing_tx, _, _ = self._req("GET", f"/tx/{'A'*43}")
        self.assertEqual(st_missing_tx, 404)

    def test_community_and_mirror_contract(self):
        st404, _, _ = self._req("GET", "/vox/index/missing.json")
        self.assertEqual(st404, 404)

        bad_payload = {"topics": "not-a-list"}
        st400, _, _ = self._req("POST", "/vox/mirror", body=bad_payload)
        self.assertEqual(st400, 400)

        valid_mirror = {"communityId": "comm_c1", "topics": []}
        st200, res_body, _ = self._req("POST", "/vox/mirror", body=valid_mirror)
        self.assertEqual(st200, 200)
        self.assertEqual(json.loads(res_body.decode("utf-8")).get("status"), "mirrored")

        st_hit, hit_body, headers = self._req("GET", "/vox/index/comm_c1.json")
        self.assertEqual(st_hit, 200)
        self.assertEqual(headers.get("X-Vox-Cache"), "HIT")
        self.assertIn(b"comm_c1", hit_body)

        oversized = b'{"communityId":"c2","topics":[]}' + (b" " * (256 * 1024))
        st413, _, _ = self._req("POST", "/vox/mirror", body=oversized)
        self.assertEqual(st413, 413)

    def test_inbox_contract(self):
        st_get, body, _ = self._req("GET", "/inbox/vx_alice")
        self.assertEqual(st_get, 200)
        self.assertEqual(json.loads(body.decode("utf-8")), {"envelopes": []})

        st_bad_del, _, _ = self._req("POST", "/inbox/vx_alice", body={"v": 1, "del": "bad"})
        self.assertEqual(st_bad_del, 400)

        oversized = b'{"v":1,"payload":"' + (b"a" * 33000) + b'"}'
        st413, _, _ = self._req("POST", "/inbox/vx_alice", body=oversized)
        self.assertEqual(st413, 413)

        del_token = "0102030405060708090a0b0c0d0e0f10"
        del_hash = hashlib.sha256(bytes.fromhex(del_token)).hexdigest()
        env = {
            "v": 1,
            "id": "m1",
            "ephPub": {"kty": "EC"},
            "ct": "encrypted_content",
            "del": {"hash": del_hash, "ct": "dummy_ct", "iv": "dummy_iv"},
        }
        st_post, p_body, _ = self._req("POST", "/inbox/vx_alice", body=env)
        self.assertEqual(st_post, 200)
        msg_id = json.loads(p_body.decode("utf-8")).get("id")

        st_del_403, _, _ = self._req("DELETE", f"/inbox/vx_alice/{msg_id}", headers={"X-Vox-Delete-Token": "bad"})
        self.assertEqual(st_del_403, 403)
        st_del_200, _, _ = self._req("DELETE", f"/inbox/vx_alice/{msg_id}", headers={"X-Vox-Delete-Token": del_token})
        self.assertEqual(st_del_200, 200)
        st_del_404, _, _ = self._req("DELETE", f"/inbox/vx_alice/{msg_id}")
        self.assertEqual(st_del_404, 404)

    def test_blind_relay_envelope_contract(self):
        st_list, body, _ = self._req("GET", "/relay/envelope/ch_test?since=0&since_serial=0")
        self.assertEqual(st_list, 200)
        self.assertIsInstance(json.loads(body.decode("utf-8")), list)

        st400, _, _ = self._req("POST", "/relay/envelope/ch_test", body={"serial": -1})
        self.assertEqual(st400, 400)

        oversized = b'{"msg":"' + (b"x" * 66000) + b'"}'
        st413, _, _ = self._req("POST", "/relay/envelope/ch_test", body=oversized)
        self.assertEqual(st413, 413)

        env = {"sender": "vx_author", "sig": "sig_hex", "serial": 1, "timestamp": 1000}
        st201, b201, _ = self._req("POST", "/relay/envelope/ch_test", body=env)
        self.assertEqual(st201, 201)
        self.assertIn("id", json.loads(b201.decode("utf-8")))

    def test_blind_relay_snapshot_contract(self):
        st404, _, _ = self._req("GET", "/relay/snapshot/ch_snap_missing")
        self.assertEqual(st404, 404)

        oversized = b'{"snapshot":"' + (b"x" * 530000) + b'"}'
        st413, _, _ = self._req("POST", "/relay/snapshot/ch_snap", body=oversized)
        self.assertEqual(st413, 413)

        proof = "01" * 32
        snap = {"snapshot": {"items": [1]}, "epoch": 1, "coveredSerial": 5}
        st201, _, _ = self._req("POST", "/relay/snapshot/ch_snap", body=snap, headers={"X-Vox-Snapshot-Proof": proof})
        self.assertEqual(st201, 201)

        st200_idem, b_idem, _ = self._req(
            "POST", "/relay/snapshot/ch_snap", body=snap, headers={"X-Vox-Snapshot-Proof": proof}
        )
        self.assertEqual(st200_idem, 200)
        self.assertTrue(json.loads(b_idem.decode("utf-8")).get("idempotent"))

        st403, _, _ = self._req("POST", "/relay/snapshot/ch_snap", body={"snapshot": {"k": 1}, "epoch": 2})
        self.assertEqual(st403, 403)

        diff_snap = {"snapshot": {"items": [2]}, "epoch": 1, "coveredSerial": 5}
        st409, _, _ = self._req("POST", "/relay/snapshot/ch_snap", body=diff_snap, headers={"X-Vox-Snapshot-Proof": proof})
        self.assertEqual(st409, 409)

        jump_snap = {"snapshot": {"items": [3]}, "epoch": 30, "coveredSerial": 5}
        st400, _, _ = self._req("POST", "/relay/snapshot/ch_snap", body=jump_snap, headers={"X-Vox-Snapshot-Proof": proof})
        self.assertEqual(st400, 400)

        st_get, _, _ = self._req("GET", "/relay/snapshot/ch_snap")
        self.assertEqual(st_get, 200)

    def test_central_memory_status_and_blob_contract(self):
        st_mem, b_mem, _ = self._req("GET", "/memory")
        self.assertEqual(st_mem, 200)
        self.assertIn("counts", json.loads(b_mem.decode("utf-8")))

        st_stat, b_stat, _ = self._req("GET", "/memory/status")
        self.assertEqual(st_stat, 200)
        self.assertIn("counts", json.loads(b_stat.decode("utf-8")))

        st_state, b_state, _ = self._req("GET", "/memory/state?since=0")
        self.assertEqual(st_state, 200)
        self.assertIn("revision", json.loads(b_state.decode("utf-8")))

        st_blob404, _, _ = self._req("GET", f"/memory/blob/{'0'*64}")
        self.assertEqual(st_blob404, 404)

    def test_central_memory_ingest_and_sync_contract(self):
        st400_ingest, _, _ = self._req("POST", "/memory/ingest", body=b"invalid_non_json")
        self.assertEqual(st400_ingest, 400)

        ev = {"type": "GOSSIP", "item": {"id": "ev_c1", "author": "vx_author", "ts": T_VALID}}
        st201, _, _ = self._req("POST", "/memory/ingest", body=ev)
        self.assertEqual(st201, 201)
        st200, _, _ = self._req("POST", "/memory/ingest", body=ev)
        self.assertEqual(st200, 200)

        st400_sync, _, _ = self._req("POST", "/memory/sync", body=b"bad_json")
        self.assertEqual(st400_sync, 400)

        sync_bundle = {"since": 0, "items": [{"id": "ev_s1", "author": "vx_author", "ts": T_VALID}]}
        st200_sync, b_sync, _ = self._req("POST", "/memory/sync", body=sync_bundle)
        self.assertEqual(st200_sync, 200)
        self.assertIn("revision", json.loads(b_sync.decode("utf-8")))

    def test_central_memory_vault_contract(self):
        st404, _, _ = self._req("GET", "/memory/vault/vx_missing_key")
        self.assertEqual(st404, 404)

        v_bad_iter = {"record": {"v": 2, "salt": "01"*16, "iter": 500, "ciphertext": "aa"}}
        st400, _, _ = self._req("POST", "/memory/vault/vx_test_key", body=v_bad_iter)
        self.assertEqual(st400, 400)

        v_rec = {"v": 2, "salt": "01"*16, "iter": 100000, "iv": "02"*12, "ciphertext": "03"*32}
        st403_noprf, _, _ = self._req("POST", "/memory/vault/vx_test_key", body={"record": v_rec})
        self.assertEqual(st403_noprf, 403)

        prf = "f0" * 32
        st200, b_saved, _ = self._req("POST", "/memory/vault/vx_test_key", body={"record": v_rec, "ownerToken": prf})
        self.assertEqual(st200, 200)
        self.assertEqual(json.loads(b_saved.decode("utf-8")).get("status"), "saved")

        st_get200, b_got, _ = self._req("GET", "/memory/vault/vx_test_key")
        self.assertEqual(st_get200, 200)
        self.assertEqual(json.loads(b_got.decode("utf-8")).get("vaultKey"), "vx_test_key")

        st403_wrong, _, _ = self._req("POST", "/memory/vault/vx_test_key", body={"record": v_rec, "ownerToken": "bad"*21 + "a"})
        self.assertEqual(st403_wrong, 403)

    def test_p2p_seeder_contract(self):
        st_p2p, _, _ = self._req("GET", "/p2p/status")
        self.assertEqual(st_p2p, 200)

        st_blobs, _, _ = self._req("GET", "/p2p/blobs")
        self.assertEqual(st_blobs, 200)

        st_s404, _, _ = self._req("GET", f"/p2p/seed/{'a'*64}")
        self.assertEqual(st_s404, 404)

        st_del404, _, _ = self._req("DELETE", f"/p2p/seed/{'a'*64}")
        self.assertEqual(st_del404, 404)

        st_s400, _, _ = self._req("POST", "/p2p/seed", body={})
        self.assertEqual(st_s400, 400)

        st_peers, _, _ = self._req("GET", "/peer/beacon")
        self.assertEqual(st_peers, 200)

        st_peers2, _, _ = self._req("GET", "/p2p/peers")
        self.assertEqual(st_peers2, 200)

        beacon_payload = {"nodeId": "node_contract_01", "protocol": "VOX-PEER-v1", "httpPort": 3920}
        st_bc201, _, _ = self._req("POST", "/peer/beacon", body=beacon_payload)
        self.assertEqual(st_bc201, 201)

        st_bc400, _, _ = self._req("POST", "/peer/beacon", body={"nodeId": "bad_protocol"})
        self.assertEqual(st_bc400, 400)

    def test_oauth_and_unknown_routes_contract(self):
        st_oa400, _, _ = self._req("POST", "/oauth/exchange", body={})
        self.assertEqual(st_oa400, 400)

        oversized_oa = b'{"code":"' + (b"x" * 9000) + b'"}'
        st_oa413, _, _ = self._req("POST", "/oauth/exchange", body=oversized_oa)
        self.assertEqual(st_oa413, 413)

        st_get404, _, _ = self._req("GET", "/rota/inexistente")
        self.assertEqual(st_get404, 404)

        st_post404, _, _ = self._req("POST", "/rota/inexistente", body={})
        self.assertEqual(st_post404, 404)

        st_del404, _, _ = self._req("DELETE", "/rota/inexistente")
        self.assertEqual(st_del404, 404)


if __name__ == "__main__":
    unittest.main()
