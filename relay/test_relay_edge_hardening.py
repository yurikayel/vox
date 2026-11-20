#!/usr/bin/env python3
"""Regressão de bordas HTTP, tipos JSON, disco em GET e ciclo de vida do signaling em `relay/`."""

import base64
import hashlib
import http.client
import json
import pathlib
import tempfile
import threading
import unittest
from http.server import HTTPServer
from unittest import mock

from relay import (
    blind_relay,
    central_memory,
    genesis_guard,
    inbox,
    oauth_exchange,
    p2p_seeder,
    rate_limit,
    server,
    signaling,
)


def _blob_payload(raw: bytes) -> dict:
    b64 = base64.b64encode(raw).decode("ascii")
    return {
        "hash": hashlib.sha256(raw).hexdigest(),
        "mime": "image/png",
        "byteLength": len(raw),
        "data": f"data:image/png;base64,{b64}",
    }


class _RelayHttpCase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self._tmp.name)
        self._orig = (server.CACHE_DIR, inbox.INBOX_DIR, blind_relay.RELAY_DIR, central_memory.MEMORY_DIR)
        server.set_cache_dir(root / "cache")
        inbox.set_inbox_dir(root / "inbox")
        blind_relay.set_relay_dir(root / "blind")
        central_memory.set_memory_dir(root / "memory")
        self.seeder = p2p_seeder.P2PSeederManager()
        self.discovery = p2p_seeder.PeerDiscovery(local_node_id="edge-test")
        fast_policies = {k: rate_limit.Policy(10000, 10000) for k in rate_limit.DEFAULT_POLICIES}
        for patcher in (
            mock.patch.object(p2p_seeder, "SEEDER_MANAGER", self.seeder),
            mock.patch.object(p2p_seeder, "PEER_DISCOVERY", self.discovery),
            mock.patch.object(rate_limit, "LIMITER", rate_limit.RateLimiter(fast_policies)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self._cleanup_http)

    def _cleanup_http(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        cache_dir, inbox_dir, blind_dir, mem_dir = self._orig
        server.set_cache_dir(cache_dir)
        inbox.set_inbox_dir(inbox_dir)
        blind_relay.set_relay_dir(blind_dir)
        central_memory.set_memory_dir(mem_dir)
        self._tmp.cleanup()

    def _raw_request(self, method: str, path: str, body: bytes = b"", headers=None):
        hdrs = {"Origin": self.base}
        if method == "POST":
            hdrs["Content-Type"] = "application/json"
        if headers:
            hdrs.update(headers)
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(method, path, body=body, headers=hdrs)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()


class TestBlindRelayReadOnlyGets(_RelayHttpCase):
    def test_list_envelopes_nao_cria_pasta_para_canal_inexistente(self):
        self.assertEqual(blind_relay.list_envelopes("canal_fantasma"), [])
        self.assertFalse((blind_relay.RELAY_DIR / "canal_fantasma").exists())

    def test_get_latest_snapshot_nao_cria_pasta_para_canal_inexistente(self):
        self.assertIsNone(blind_relay.get_latest_snapshot("snap_fantasma"))
        self.assertFalse((blind_relay.RELAY_DIR / "snap_fantasma").exists())

    def test_get_http_relay_nao_cria_diretorios_no_disco(self):
        st_env, raw_env = self._raw_request("GET", "/relay/envelope/leitura_vazia_1")
        st_snap, _ = self._raw_request("GET", "/relay/snapshot/leitura_vazia_2")
        self.assertEqual((st_env, json.loads(raw_env), st_snap), (200, [], 404))
        self.assertFalse((blind_relay.RELAY_DIR / "leitura_vazia_1").exists())
        self.assertFalse((blind_relay.RELAY_DIR / "leitura_vazia_2").exists())


class TestOAuthAndPostSizeHardening(_RelayHttpCase):
    def test_oauth_exchange_recusa_payload_nao_objeto_com_400(self):
        for bad in ([], None, "texto", 42):
            with self.assertRaises(oauth_exchange.OAuthError) as ctx:
                oauth_exchange.exchange(bad, {})
            self.assertEqual(ctx.exception.status, 400)

    def test_http_oauth_exchange_corpo_invalido_retorna_400(self):
        for body in (b"{invalido", b"\xff\xfe", b"[]", b"null", b"123"):
            status, _ = self._raw_request("POST", "/oauth/exchange", body=body)
            self.assertEqual(status, 400, f"esperado 400 para {body!r}, veio {status}")

    def test_http_post_acima_do_teto_retorna_413_em_oauth_beacon_e_seed(self):
        for path, length in (("/oauth/exchange", "9000"), ("/peer/beacon", "20000"), ("/p2p/seed", "20000")):
            status, _ = self._raw_request("POST", path, body=b"", headers={"Content-Length": length})
            self.assertEqual(status, 413, f"esperado 413 em {path}, veio {status}")


class TestP2PSeederAndBeaconHardening(_RelayHttpCase):
    def test_p2p_seed_http_recusa_nao_objeto_e_sizebytes_invalido_com_400(self):
        sha = "a" * 64
        self.seeder.authorize_hash(sha)
        bad_bodies = (
            b"[]",
            b"null",
            json.dumps({"hash": sha, "sizeBytes": None}).encode(),
            json.dumps({"hash": sha, "sizeBytes": [1]}).encode(),
            json.dumps({"hash": sha, "sizeBytes": True}).encode(),
        )
        for body in bad_bodies:
            status, _ = self._raw_request("POST", "/p2p/seed", body=body)
            self.assertEqual(status, 400, f"esperado 400 para {body!r}, veio {status}")

    def test_peer_beacon_recusa_httpport_booleano_com_400(self):
        body = json.dumps({"nodeId": "n_bool", "protocol": "VOX-PEER-v1", "httpPort": True}).encode()
        status, _ = self._raw_request("POST", "/peer/beacon", body=body)
        self.assertEqual(status, 400)

    def test_register_seed_request_usa_metadados_da_memoria_central(self):
        blob = _blob_payload(b"conteudo-semeavel")
        self.assertTrue(central_memory.ingest_event({"type": "MEDIA_BLOB", "blob": blob})["changed"])
        status, raw = self._raw_request("POST", "/p2p/seed", body=json.dumps({"hash": blob["hash"]}).encode())
        self.assertEqual(status, 201)
        record = json.loads(raw)
        self.assertEqual(record["sizeBytes"], len(b"conteudo-semeavel"))
        self.assertEqual(record["mimeType"], "image/png")


class TestCentralMemoryNumericAndInfinityHardening(_RelayHttpCase):
    def test_memory_sync_recusa_tipos_numericos_invalidos_e_infinity_com_400(self):
        bad_bodies = (
            json.dumps({"clientRevision": [1]}).encode(),
            json.dumps({"since": {"x": 1}}).encode(),
            json.dumps({"since": True}).encode(),
            b'{"since": Infinity}',
            b'{"clientRevision": NaN}',
        )
        for body in bad_bodies:
            status, _ = self._raw_request("POST", "/memory/sync", body=body)
            self.assertEqual(status, 400, f"esperado 400 para {body!r}, veio {status}")

    def test_memory_ingest_ignora_timestamp_infinity_e_booleano_sem_500(self):
        self.assertEqual(central_memory._item_timestamp({"ts": float("inf")}), 0)
        self.assertEqual(central_memory._item_timestamp({"ts": float("nan")}), 0)
        self.assertEqual(central_memory._item_timestamp({"ts": True}), 0)
        self.assertFalse(genesis_guard.refuses_post({"id": "p_inf", "ts": float("inf")}))
        for body in (
            b'{"id":"p_inf","type":"topic","author":"vx_a","ts":Infinity}',
            json.dumps({"id": "p_bool", "type": "topic", "author": "vx_a", "ts": True}).encode(),
        ):
            status, _ = self._raw_request("POST", "/memory/ingest", body=body)
            self.assertIn(status, (200, 201))

    def test_memory_sync_blob_com_bytelength_invalido_nao_retorna_500(self):
        good = _blob_payload(b"blob-bom")
        bad_list = dict(_blob_payload(b"blob-lista"), byteLength=[1])
        bad_str = dict(_blob_payload(b"blob-texto"), byteLength="nao-inteiro")
        body = json.dumps({"blobs": [bad_list, bad_str, good]}).encode()
        status, raw = self._raw_request("POST", "/memory/sync", body=body)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(json.loads(raw)["counts"]["blobs"], 1)


class _DummyWsHandler(signaling.WebSocketHandler):
    def __init__(self):
        self.peer_id = None
        self.closed = False
        self.sent = []

    def send_json(self, data: dict):
        self.sent.append(data)


class TestSignalingPeerRegistryHardening(unittest.TestCase):
    def setUp(self):
        self.reg = signaling.PeerRegistry()
        patcher = mock.patch.object(signaling, "registry", self.reg)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_on_register_ignora_peer_id_nao_string_sem_quebrar_cleanup(self):
        handler = _DummyWsHandler()
        for bad_id in (["lista"], {"k": "v"}, 123, "   "):
            handler.on_register(bad_id)
            self.assertIsNone(handler.peer_id)
        handler.cleanup()
        self.assertEqual(self.reg.peers, {})

    def test_reregister_mesma_conexao_remove_peer_anterior(self):
        handler = _DummyWsHandler()
        handler.on_register("peer_antigo", address="vx_1")
        handler.on_register("peer_novo", address="vx_2")
        self.assertIsNone(self.reg.get("peer_antigo"))
        self.assertIs(self.reg.get("peer_novo"), handler)
        handler.cleanup()
        self.assertEqual(self.reg.peers, {})

    def test_cleanup_de_conexao_antiga_nao_remove_nova_conexao_mesmo_peer_id(self):
        old_handler, new_handler = _DummyWsHandler(), _DummyWsHandler()
        old_handler.on_register("peer_dup", address="vx_old")
        new_handler.on_register("peer_dup", address="vx_new")
        old_handler.cleanup()
        self.assertIs(self.reg.get("peer_dup"), new_handler)


if __name__ == "__main__":
    unittest.main()
