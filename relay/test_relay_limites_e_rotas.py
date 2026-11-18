"""Rotas HTTP, limites de tamanho, entradas ruins e quadros WebSocket do relay.

Vindo da varredura de cobertura de 2026-11-16 (Antigravity), mantido só o que confere comportamento.
Todas as pastas do relay (cache, inbox, relay cego, memória central) ficam num diretório temporário
durante o módulo inteiro e voltam ao original no fim: o teste nunca escreve nos dados de um relay real.
"""

import hashlib
import http.client
import json
import os
import pathlib
import struct
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest import mock

from relay import (
    blind_relay,
    central_memory,
    inbox,
    mirror_validate,
    p2p_seeder,
    server,
    signaling,
)


_MODULE_TMP = None
_ORIGINAL_DIRS = None


def setUpModule():
    global _MODULE_TMP, _ORIGINAL_DIRS
    _ORIGINAL_DIRS = (server.CACHE_DIR, inbox.INBOX_DIR, blind_relay.RELAY_DIR, central_memory.MEMORY_DIR)
    _MODULE_TMP = tempfile.TemporaryDirectory()
    root = pathlib.Path(_MODULE_TMP.name)
    server.set_cache_dir(root / "cache")
    inbox.set_inbox_dir(root / "inbox")
    blind_relay.set_relay_dir(root / "blind")
    central_memory.set_memory_dir(root / "memory")


def tearDownModule():
    cache_dir, inbox_dir, blind_dir, memory_dir = _ORIGINAL_DIRS
    server.set_cache_dir(cache_dir)
    inbox.set_inbox_dir(inbox_dir)
    blind_relay.set_relay_dir(blind_dir)
    central_memory.set_memory_dir(memory_dir)
    _MODULE_TMP.cleanup()


class _MemorySocket:
    """Soquete em memória para testar frames WebSocket e HTTP."""

    def __init__(self, incoming: bytes = b""):
        self.buf = bytearray(incoming)
        self.sent = bytearray()

    def recv(self, n: int) -> bytes:
        chunk = bytes(self.buf[:n])
        del self.buf[:n]
        return chunk

    def sendall(self, data: bytes) -> None:
        self.sent.extend(data)

    def settimeout(self, value) -> None:
        self.timeout = value

    def gettimeout(self):
        return getattr(self, "timeout", None)


def _masked_frame(payload: bytes, opcode: int = 1) -> bytes:
    mask = b"\x11\x22\x33\x44"
    first = 0x80 | opcode
    ln = len(payload)
    if ln < 126:
        hdr = bytes([first, 0x80 | ln])
    else:
        hdr = bytes([first, 0x80 | 126]) + struct.pack(">H", ln)
    masked = bytes([b ^ mask[i % 4] for i, b in enumerate(payload)])
    return hdr + mask + masked


class RelayHttpEndpointsTest(unittest.TestCase):
    """Testa endpoints HTTP do VoxRelayHandler e cache local em disco."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.tmp.name)
        self.prev_cache = server.CACHE_DIR
        server.set_cache_dir(root / "cache")
        server.ensure_cache_dir()
        inbox.set_inbox_dir(root / "inbox")
        inbox.ensure_inbox_dir()
        blind_relay.set_relay_dir(root / "blind")
        central_memory.set_memory_dir(root / "memory")
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        self.base = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        server.set_cache_dir(self.prev_cache)
        self.tmp.cleanup()

    def _req(self, path, method="GET", body=None, headers=None):
        data = json.dumps(body).encode("utf-8") if isinstance(body, (dict, list)) else body
        hdrs = {"Origin": self.base}
        if data is not None:
            hdrs["Content-Type"] = "application/json"
        if headers:
            hdrs.update(headers)
        req = urllib.request.Request(f"{self.base}{path}", data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as err:
            return err.code, err.read()

    def test_health_options_and_tx_cache(self):
        st, _ = self._req("/health", method="OPTIONS")
        self.assertEqual(st, 204)
        st, raw = self._req("/health")
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(raw)["app"], "vox-relay")
        self.assertEqual(self._req("/tx/bad")[0], 400)
        tx_id = "A" * 43
        server.write_cache_entry(server.CACHE_DIR / tx_id, b'{"hello":1}')
        st, raw = self._req(f"/tx/{tx_id}")
        self.assertEqual(st, 200)
        self.assertEqual(json.loads(raw)["hello"], 1)
        self.assertEqual(self._req("/rota-inexistente")[0], 404)

    def test_inbox_blind_relay_and_memory_endpoints(self):
        env = {"id": "m1", "v": 1, "ephPub": {"kty": "EC"}, "ct": "abc"}
        st, _ = self._req("/inbox/vx_bob", method="POST", body=env)
        self.assertEqual(st, 200)
        st, raw = self._req("/inbox/vx_bob")
        self.assertGreaterEqual(len(json.loads(raw)["envelopes"]), 1)
        self.assertEqual(self._req("/inbox/!/bad")[0], 200)

        st, _ = self._req("/relay/envelope/ch1", method="POST", body={"sender": "vx_a", "sig": "sig1", "timestamp": 1, "nonce": "n1"})
        self.assertEqual(st, 201)
        st, raw = self._req("/relay/envelope/ch1?since=0&since_serial=0")
        parsed = json.loads(raw)
        self.assertGreaterEqual(len(parsed["envelopes"] if isinstance(parsed, dict) else parsed), 1)
        self.assertEqual(self._req("/relay/snapshot/ch1")[0], 404)
        st, _ = self._req("/relay/snapshot/ch1", method="POST", body={"snapshot": {"items": {"a": 1}}, "epoch": 1, "coveredSerial": 1})
        self.assertEqual(st, 201)
        self.assertEqual(self._req("/relay/snapshot/ch1")[0], 200)

        st, _ = self._req("/memory/ingest", method="POST", body={"event": {"id": "e_cov", "type": "topic", "author": "vx_a", "ts": 9999999999999}})
        self.assertIn(st, (200, 201))
        blob_h = hashlib.sha256(b"AAAA").hexdigest()
        st, _ = self._req("/memory/sync", method="POST", body={"items": [{"id": "e_s2", "type": "topic", "author": "vx_a", "ts": 9999999999999}], "blobs": [{"hash": blob_h, "data": "data:application/octet-stream;base64,QUFBQQ=="}]})
        self.assertEqual(st, 200)
        self.assertEqual(self._req("/memory/status")[0], 200)
        self.assertEqual(self._req("/memory/state?since=0&includeBlobs=1")[0], 200)
        self.assertEqual(self._req(f"/memory/blob/{blob_h}")[0], 200)
        self.assertEqual(self._req("/memory/blob/missing")[0], 404)
        self.assertEqual(self._req("/memory/badroute")[0], 404)

    def test_p2p_mirror_and_vault_routes(self):
        st, _ = self._req("/peer/beacon", method="POST", body={"nodeId": "node_cov_1", "protocol": "VOX-PEER-v1", "httpPort": 8080, "capabilities": ["cache"]})
        self.assertIn(st, (200, 201))
        self.assertEqual(self._req("/p2p/peers")[0], 200)
        sha = "b" * 64
        p2p_seeder.SEEDER_MANAGER.authorize_hash(sha)
        st, _ = self._req("/p2p/seed", method="POST", body={"hash": sha, "sizeBytes": 12})
        self.assertEqual(st, 201)
        self.assertEqual(self._req("/p2p/status")[0], 200)
        self.assertEqual(self._req("/p2p/blobs")[0], 200)
        self.assertEqual(self._req(f"/p2p/seed/{sha}")[0], 200)
        self.assertEqual(self._req(f"/p2p/seed/{sha}", method="DELETE")[0], 200)
        self.assertEqual(self._req(f"/p2p/seed/{sha}")[0], 404)

        self.assertEqual(self._req("/memory/vault/k_miss")[0], 404)
        self.assertEqual(self._req("/vox/index/missing.json")[0], 404)
        st, _ = self._req("/vox/mirror", method="POST", body={"communityId": "c_mir", "title": "Vila", "topics": []})
        self.assertEqual(st, 200)
        self.assertEqual(self._req("/vox/index/c_mir.json")[0], 200)
        # Sem corpo: rota POST desconhecida responde 404 sem ler o corpo; no Windows, corpo não lido faz o
        # sistema resetar a conexão às vezes (comportamento do servidor, anotado no PR da triagem).
        self.assertEqual(self._req("/bad/post", method="POST", headers={"Content-Type": "application/json"})[0], 404)
        self.assertEqual(self._req("/bad/delete", method="DELETE")[0], 404)


class RelayHelpersAndSignalingTest(unittest.TestCase):
    """Testa helpers do server, central_memory, inbox, signaling e mirror_validate."""

    def test_server_quota_and_eviction(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prev_cache = server.CACHE_DIR
            server.set_cache_dir(root)
            try:
                f1 = root / ("B" * 43)
                server.write_cache_entry(f1, b"x" * 100)
                os.utime(f1, (1000, 1000))
                f2 = root / ("C" * 43)
                server.write_cache_entry(f2, b"y" * 100)
                with mock.patch.dict(os.environ, {"VOX_RELAY_MAX_CACHE_MB": "1"}):
                    self.assertEqual(server.max_cache_bytes(), 1024 * 1024)
                with mock.patch.object(server, "max_cache_bytes", return_value=120):
                    server.evict_cache_if_needed(60)
                self.assertFalse(f1.exists())
                self.assertEqual(server.resolve_listen_port({"VOX_RELAY_PORT": "9123"}), 9123)
            finally:
                server.set_cache_dir(prev_cache)

    def test_central_memory_persistence_and_inbox_helpers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            central_memory.set_memory_dir(root / "mem")
            inbox.set_inbox_dir(root / "inb")
            central_memory.ingest_event({"id": "t1", "type": "topic", "author": "vx_a", "ts": 9999999999999})
            central_memory.ingest_event({"id": "pc1", "type": "profile-card", "routeId": "vx_1", "name": "Ana", "ts": 9999999999999})
            central_memory.save_state()
            loaded = central_memory.load_state(force_reload=True)
            self.assertIn("posts", loaded)
            self.assertEqual(central_memory.get_blob("none"), None)
            self.assertRaises(ValueError, inbox.store_envelope, "", {})
            self.assertEqual(inbox.get_envelopes("bad/id!"), [])
            ok = inbox.store_envelope("vx_alice", {"id": "e1", "v": 1, "ephPub": {"kty": "EC"}, "ct": "abc", "ts": 10})
            self.assertTrue(ok)
            self.assertEqual(inbox.delete_envelope("vx_alice", "e1"), "deleted")
            self.assertEqual(inbox.delete_envelope("vx_alice", "missing"), "not_found")

    def test_signaling_frames_http_and_registry(self):
        self.assertEqual(len(signaling.compute_accept_key("dGhlIHNhbXBsZSBub25jZQ==")), 28)
        frame = _masked_frame(b'{"type":"ping"}', opcode=1)
        op, payload = signaling.read_ws_frame(_MemorySocket(frame))
        self.assertEqual(op, 1)
        self.assertEqual(json.loads(payload)["type"], "ping")
        big_frame = _masked_frame(b"a" * 200, opcode=2)
        op2, pl2 = signaling.read_ws_frame(_MemorySocket(big_frame))
        self.assertEqual((op2, len(pl2)), (2, 200))

        mem = _MemorySocket()
        signaling.handle_http_request(mem, "GET /health HTTP/1.1", peer_count=2)
        self.assertIn(b'"peers": 2', bytes(mem.sent))
        mem_opt = _MemorySocket()
        signaling.handle_http_request(mem_opt, "OPTIONS /health HTTP/1.1")
        self.assertIn(b"204 No Content", bytes(mem_opt.sent))
        mem_405 = _MemorySocket()
        signaling.handle_http_request(mem_405, "POST /health HTTP/1.1")
        self.assertIn(b"405", bytes(mem_405.sent))

        reg = signaling.PeerRegistry()
        h1, h2 = mock.MagicMock(), mock.MagicMock()
        reg.register("p1", h1, address="vx_1", dm_pub={"k": 1})
        reg.register("p2", h2, address="vx_2")
        self.assertEqual(reg.get_peer_by_address("vx_1"), "p1")
        self.assertIn("vx_2", reg.get_address_map(exclude_peer="p1"))
        reg.broadcast_others("p1", {"type": "test"})
        h2.send_json.assert_called_once()
        reg.unregister("p1")
        self.assertIsNone(reg.get("p1"))

    def test_mirror_validate_blind_and_p2p_edges(self):
        self.assertFalse(mirror_validate.validate_mirror_body(b"bad json")[0])
        self.assertFalse(mirror_validate.validate_mirror_body(b'{"community":{},"topics":"bad"}')[0])
        self.assertFalse(mirror_validate.validate_mirror_body(b'{"communityId":"bad/id!","topics":[]}')[0])
        self.assertRaises(ValueError, blind_relay.store_envelope, "ch1", {})
        self.assertRaises(ValueError, blind_relay.store_envelope, "!!/!!", {"sender": "a", "sig": "b"})
        self.assertRaises(ValueError, blind_relay.store_snapshot, "ch1", "bad")
        self.assertRaises(ValueError, blind_relay.store_snapshot, "ch1", {})
        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp)
            self.assertEqual(blind_relay.resolve_relay_dir({"VOX_RELAY_BLIND_DIR": str(p / "b")}), (p / "b").resolve())
            self.assertEqual(central_memory.resolve_memory_dir({"VOX_RELAY_CACHE_DIR": str(p)}), (p / "central_memory").resolve())
            inbox.set_inbox_dir(p / "inb")
            inbox.ensure_inbox_dir()
            exp_dir = inbox.INBOX_DIR / "vx_exp"
            exp_dir.mkdir(parents=True, exist_ok=True)
            (exp_dir / "old.json").write_text('{"expiresAt": 1}', encoding="utf-8")
            (exp_dir / "bad.json").write_text("{corrupt", encoding="utf-8")
            self.assertGreaterEqual(inbox.purge_all_expired(), 2)
            central_memory.set_memory_dir(p / "cm")
            _, _, jpath, _ = central_memory._state_paths()
            jpath.parent.mkdir(parents=True, exist_ok=True)
            ev = {"type": "GOSSIP", "item": {"id": "p_j1", "type": "topic", "author": "vx_j", "ts": 9999999999999}}
            jpath.write_text(f"\n{{bad_json\n{json.dumps(ev)}\n", encoding="utf-8")
            loaded = central_memory.load_state(force_reload=True)
            self.assertIn("p_j1", loaded["posts"])
        self.assertTrue(isinstance(p2p_seeder.get_p2p_summary(), dict))
        self.assertEqual(signaling.resolve_port("4000"), 4000)
        self.assertGreater(len(signaling.make_ws_frame(b"x" * 70000)), 70000)

    def test_server_miss_fetch_and_signaling_dispatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prev_cache = server.CACHE_DIR
            server.set_cache_dir(root / "cache")
            server.ensure_cache_dir()
            central_memory.set_memory_dir(root / "memory")
            inbox.set_inbox_dir(root / "inbox")
            blind_relay.set_relay_dir(root / "blind")
            httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
            port = httpd.server_address[1]
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            try:
                fake_resp = mock.MagicMock()
                fake_resp.__enter__.return_value = fake_resp
                fake_resp.status = 200
                fake_resp.read.return_value = b'{"fromGw":1}'
                with mock.patch("urllib.request.urlopen", return_value=fake_resp):
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/tx/{'D'*43}", timeout=5) as r:
                        self.assertEqual(r.status, 200)
                req400 = urllib.request.Request(f"http://127.0.0.1:{port}/relay/snapshot/chx", data=b"{}", method="POST", headers={"Content-Type": "application/json", "Content-Length": "2"})
                with self.assertRaises(urllib.error.HTTPError):
                    urllib.request.urlopen(req400, timeout=5)
            finally:
                httpd.shutdown()
                httpd.server_close()
                server.set_cache_dir(prev_cache)

        class _MockWs(signaling.WebSocketHandler):
            def __init__(self):
                self.peer_id = "p_sig1"
                self.closed = False
                self.sent = []
            def send_json(self, obj):
                self.sent.append(obj)
        h1, h2 = _MockWs(), _MockWs()
        signaling.registry.register("p_sig1", h1, address="vx_s1")
        signaling.registry.register("p_sig2", h2, address="vx_s2")
        try:
            h1.dispatch_message({"type": "ping"})
            self.assertEqual(h1.sent[-1]["type"], "pong")
            h1.dispatch_message({"type": "offer", "to": "p_sig2", "sdp": "x"})
            self.assertEqual(h2.sent[-1]["from"], "p_sig1")
            h1.cleanup()
        finally:
            signaling.registry.unregister("p_sig1")
            signaling.registry.unregister("p_sig2")

    def test_memoria_central_e_relay_cego_recusam_entradas_ruins(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            blind_relay.set_relay_dir(root / "blind")
            central_memory.set_memory_dir(root / "mem")
            inbox.set_inbox_dir(root / "inb")
            central_memory._STATE_CACHE = {
                "version": 1, "mode": "zero-central-memory", "revision": 1, "updatedAt": 1,
                "posts": {}, "tombstones": {}, "manifests": {}, "blobs": {},
                "profiles": {
                    "vx_g1": {"routeId": "vx_g1", "avatarUrl": "https://lh3.googleusercontent.com/a/same", "ts": 1},
                    "vx_g2": {"routeId": "vx_g2", "avatarUrl": "https://lh3.googleusercontent.com/a/same", "ts": 2},
                },
            }
            norm = central_memory._normalize_loaded_state(dict(central_memory._STATE_CACHE))
            self.assertEqual(len(norm["profiles"]), 1)
            for ev in [
                {"type": "GOSSIP", "item": {"id": "gp1", "author": "vx_a", "ts": 9999999999990}},
                {"type": "GOSSIP_UPDATE", "item": {"id": "gp1", "author": "vx_a", "ts": 9999999999999, "body": "v2"}},
                {"type": "GOSSIP_DELETE", "tombstone": {"id": "gp1", "author": "vx_a", "editedAt": 9999999999999}},
                {"type": "CACHE_MANIFEST", "item": {"communityId": "c1", "issuedAt": 9999999999999}},
                {"type": "MEDIA_BLOB", "blob": {"hash": hashlib.sha256(b"AAAA").hexdigest(), "data": "data:application/octet-stream;base64,QUFBQQ=="}},
            ]:
                central_memory.ingest_event(ev)
            blobs = central_memory.export_state(since=0, include_blobs=True).get("blobs", [])
            self.assertTrue(any(b.get("hash") == hashlib.sha256(b"AAAA").hexdigest() for b in blobs))
            blind_relay.store_snapshot("ch_ep", {"snapshot": {"x": 1}, "epoch": 2})
            self.assertRaises(ValueError, blind_relay.store_snapshot, "ch_ep", {"snapshot": {"x": 1}, "epoch": 1})
            self.assertRaises(ValueError, blind_relay.store_envelope, "ch_ep", {"sender": "a", "sig": "b", "blob": "x" * 70000})
            self.assertIsInstance(blind_relay.list_envelopes("ch_ep", since_ts=0, since_serial=5), list)
            self.assertFalse(mirror_validate.validate_mirror_body(b"x" * (300 * 1024))[0])
            big_frame = _masked_frame(b"z" * 130, opcode=2)
            op, data = signaling.read_ws_frame(_MemorySocket(big_frame))
            self.assertEqual((op, len(data)), (2, 130))
            self.assertEqual(signaling.read_ws_frame(_MemorySocket(b"")), (None, None))

    def test_rotas_recusam_corpo_ruim_ou_grande_demais(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            prev_cache = server.CACHE_DIR
            server.set_cache_dir(root / "cache")
            server.ensure_cache_dir()
            central_memory.set_memory_dir(root / "memory")
            inbox.set_inbox_dir(root / "inbox")
            blind_relay.set_relay_dir(root / "blind")
            sync_res = central_memory.sync_bundle({
                "since": 0,
                "items": [{"id": "itm1", "author": "vx_a", "ts": 9999999999999}],
                "tombstones": [{"id": "itm1", "author": "vx_a", "editedAt": 9999999999999}],
                "profiles": [{"routeId": "vx_p", "name": "Ana", "ts": 9999999999999}],
                "manifests": [{"communityId": "c_sync", "issuedAt": 9999999999999}],
            })
            self.assertIn("revision", sync_res)
            self.assertIn("revision", central_memory.export_state(since=99999999999999))
            httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
            port = httpd.server_address[1]
            t = threading.Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            try:
                base = f"http://127.0.0.1:{port}"
                for path, method, body, exp in [
                    ("/memory/ingest", "POST", b"", 400),
                    ("/peer/beacon", "POST", b"", 400),
                    ("/p2p/seed", "POST", b"", 400),
                    ("/oauth/exchange", "POST", b"{}", 400),
                    ("/p2p/seed/missing", "DELETE", None, 404),
                    ("/inbox/vx_alice/missing", "DELETE", None, 404),
                    ("/vox/mirror", "POST", b'{"bad":1}', 400),
                    ("/memory/sync", "POST", b"badjson", 400),
                ]:
                    req = urllib.request.Request(base + path, data=body, method=method, headers={"Origin": base, "Content-Type": "application/json"})
                    with self.assertRaises(urllib.error.HTTPError) as ctx:
                        urllib.request.urlopen(req, timeout=5)
                    self.assertEqual(ctx.exception.code, exp)
                with mock.patch("relay.oauth_exchange.exchange", return_value={"ok": True}):
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    conn.request("POST", "/oauth/exchange", body=b'{"code":"c"}', headers={"Origin": base, "Content-Type": "application/json"})
                    self.assertEqual(conn.getresponse().status, 200)
                    conn.close()
                for path, cl in [("/inbox/bob", "33000"), ("/relay/envelope/ch1", "66000"), ("/relay/snapshot/ch1", "525000")]:
                    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                    # Só os cabeçalhos: o relay recusa pelo tamanho declarado, sem ler o corpo.
                    conn.request("POST", path, body=b"", headers={"Origin": base, "Content-Type": "application/json", "Content-Length": cl})
                    self.assertEqual(conn.getresponse().status, 413)
                    conn.close()
            finally:
                httpd.shutdown()
                httpd.server_close()
                server.set_cache_dir(prev_cache)

        self.assertIsNone(server.read_verified_cache_entry(None))
        hs = b"GET / HTTP/1.1\r\nHost: localhost\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
        f_reg = _masked_frame(b'{"type":"register","peerId":"p_ws1","address":"vx_ws1","dmPub":{"k":1}}', opcode=1)
        f_ans = _masked_frame(b'{"type":"answer","to":"missing","sdp":"a"}', opcode=1)
        f_ice = _masked_frame(b'{"type":"ice","to":"missing","candidate":"c"}', opcode=1)
        frames = _masked_frame(b"", opcode=0x9) + f_reg + f_ans + f_ice + _masked_frame(b'{"type":"ping"}', opcode=1) + _masked_frame(b"", opcode=0x8)
        sock = _MemorySocket(hs + frames)
        h = signaling.WebSocketHandler.__new__(signaling.WebSocketHandler)
        h.request = sock
        h.setup()
        self.assertTrue(h.perform_handshake())
        h.receive_loop()
        h.cleanup()
        self.assertIn(b"101 Switching Protocols", bytes(sock.sent))

    def test_manifesto_quadro_websocket_e_cache_corrompido_sao_recusados(self):
        for bad_m in [
            {},
            {"communityId": "c1", "manifestVersion": "bad"},
            {"communityId": "c1", "manifestVersion": 99},
            {"communityId": "c1", "pins": "bad"},
            {"communityId": "c1", "pins": []},
            {"communityId": "c1", "pins": [123]},
            {"communityId": "c1", "pins": [{"txId": "short"}]},
            {"communityId": "c1", "pins": [{"txId": "A" * 43, "role": "badrole"}]},
            {"communityId": "c1", "pins": [{"txId": "A" * 43, "sha256": "xyz"}]},
        ]:
            self.assertFalse(mirror_validate.validate_cache_manifest_body(bad_m)[0])

        self.assertEqual(signaling.parse_frame_length(_MemorySocket(struct.pack(">Q", 65536)), 127), 65536)
        self.assertIsNone(signaling.parse_frame_length(_MemorySocket(struct.pack(">Q", 2_000_000)), 127))
        self.assertEqual(signaling.resolve_port("bad", default=3921), 3921)
        http_req = _MemorySocket(b"GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n")
        h_http = signaling.WebSocketHandler.__new__(signaling.WebSocketHandler)
        h_http.request = http_req
        h_http.setup()
        self.assertFalse(h_http.perform_handshake())
        self.assertIn(b"200 OK", bytes(http_req.sent))

        with tempfile.TemporaryDirectory() as tmp:
            p = pathlib.Path(tmp)
            prev_cache = server.CACHE_DIR
            server.set_cache_dir(p / "c")
            server.ensure_cache_dir()
            try:
                self.assertFalse(server.remove_cache_entry(p / "outside"))
                self.assertEqual(server.resolve_listen_port({"VOX_RELAY_PORT": "bad"}), 3920)
                with mock.patch("relay.server.max_cache_bytes", return_value=1):
                    self.assertFalse(server.store_cache_entry_with_quota(server.CACHE_DIR / ("E" * 43), b"1234567890"))
                bad_entry = server.CACHE_DIR / ("F" * 43)
                bad_entry.write_bytes(b"corrupted")
                server.cache_hash_path(bad_entry).write_text("badsha", encoding="utf-8")
                self.assertIsNone(server.read_verified_cache_entry(bad_entry))
            finally:
                server.set_cache_dir(prev_cache)
        self.assertRaises(ValueError, inbox.store_envelope, "vx_a", "notdict")
        self.assertRaises(ValueError, inbox.store_envelope, "vx_a", {"v": 1, "ephPub": {"k": 1}, "ct": "x" * 35000})
        self.assertIsNone(signaling.parse_frame_length(_MemorySocket(b""), 126))
        self.assertEqual(signaling.read_exact(_MemorySocket(b"abc"), 5), None)


if __name__ == "__main__":
    unittest.main()
