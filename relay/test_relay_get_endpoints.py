"""Endpoints GET: `/`, `/status`, `/ping`, `/health`, `/inbox/<addr>` e `/peer/beacon`.

Suporta modo padrão Python (`VOX_RELAY_TARGET=python`) e modo caixa-preta Rust
(`VOX_RELAY_TARGET=rust`, usando `VOX_RELAY_BIN` ou `rust/target/debug/vox-node`).
"""

import json
import os
import pathlib
import subprocess
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest import mock

from relay import inbox, p2p_seeder, server
from relay.signaling import ThreadedTCPServer, WebSocketHandler

HEALTH_FIELDS = {"status", "service", "version", "peers"}
BEACON_FIELDS = {
    "nodeId",
    "host",
    "httpPort",
    "controlPort",
    "protocol",
    "capabilities",
    "version",
    "lastSeenTs",
    "status",
}
TTL_EXPIRED_MS = 120_000
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def _use_rust_target():
    """True quando o harness caixa-preta deve apontar para o binário Rust `vox-node`."""
    return os.environ.get("VOX_RELAY_TARGET", "python").strip().lower() == "rust"


def _resolve_rust_bin():
    """Localiza o binário `vox-node` via `VOX_RELAY_BIN` ou caminho padrão de debug."""
    explicit = os.environ.get("VOX_RELAY_BIN", "").strip()
    if explicit:
        return pathlib.Path(explicit)
    exe = "vox-node.exe" if os.name == "nt" else "vox-node"
    return REPO_ROOT / "rust" / "target" / "debug" / exe


def _spawn_rust_node(mode, extra_args=None):
    """Inicia `vox-node --mode <mode>` em `127.0.0.1:0` e devolve `(proc, port)`."""
    binary = _resolve_rust_bin()
    if not binary.is_file():
        raise unittest.SkipTest(f"Binário Rust vox-node ausente em {binary}")
    cmd = [str(binary), "--mode", mode, "--host", "127.0.0.1", "--port", "0", *(extra_args or [])]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    line = proc.stdout.readline().strip() if proc.stdout else ""
    if not line.startswith("PORT="):
        proc.terminate()
        raise RuntimeError(f"Saída inesperada do vox-node ({mode}): {line!r}")
    return proc, int(line.split("=", 1)[1])


def _stop_rust_node(proc):
    """Encerra o processo `vox-node` com fallback para kill."""
    if proc is None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def _call(port, method, path, body=None):
    """Chamada HTTP simples; devolve (status, content-type, corpo) mesmo para respostas de erro."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Origin": f"http://127.0.0.1:{port}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", data=data, method=method, headers=headers
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, resp.headers.get("Content-Type"), resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get("Content-Type"), err.read()


class SignalingHealthGetTest(unittest.TestCase):
    """`GET /`, `/status` e `/ping` no servidor de sinalização (mesmo de WebSocket)."""

    @classmethod
    def setUpClass(cls):
        cls.rust_proc = None
        cls.server = None
        if _use_rust_target():
            cls.rust_proc, cls.port = _spawn_rust_node("signaling")
            return
        cls.server = ThreadedTCPServer(("127.0.0.1", 0), WebSocketHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        if cls.rust_proc is not None:
            _stop_rust_node(cls.rust_proc)
        if cls.server is not None:
            cls.server.shutdown()
            cls.server.server_close()

    def _assert_health_shape(self, path):
        status, ctype, raw = _call(self.port, "GET", path)
        self.assertEqual(status, 200)
        self.assertEqual(ctype, "application/json")
        data = json.loads(raw)
        self.assertEqual(set(data), HEALTH_FIELDS)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "vox-signaling")
        self.assertIsInstance(data["version"], str)
        self.assertIsInstance(data["peers"], int)
        self.assertNotIsInstance(data["peers"], bool)

    def test_get_root_returns_health_shape(self):
        self._assert_health_shape("/")

    def test_get_status_returns_health_shape(self):
        self._assert_health_shape("/status")

    def test_get_ping_returns_health_shape(self):
        self._assert_health_shape("/ping")

    def test_get_ping_ignores_query_string(self):
        status, _, raw = _call(self.port, "GET", "/ping?probe=1")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["status"], "ok")


class RelayHealthAndInboxGetTest(unittest.TestCase):
    """`GET /health` e `/inbox/<addr>` no relay HTTP (Python padrão ou `VOX_RELAY_TARGET=rust`)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.rust_proc = None
        cls.httpd = None
        cls.orig_dirs = None
        if _use_rust_target():
            cls.rust_proc, cls.port = _spawn_rust_node("relay", ["--data-dir", cls.tmp.name])
            return
        root = pathlib.Path(cls.tmp.name)
        cls.orig_dirs = (server.CACHE_DIR, inbox.INBOX_DIR)
        server.set_cache_dir(root / "cache")
        server.ensure_cache_dir()
        inbox.set_inbox_dir(root / "inbox")
        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        if cls.rust_proc is not None:
            _stop_rust_node(cls.rust_proc)
        if cls.httpd is not None:
            cls.httpd.shutdown()
            cls.httpd.server_close()
        if cls.orig_dirs is not None:
            server.set_cache_dir(cls.orig_dirs[0])
            inbox.set_inbox_dir(cls.orig_dirs[1])
        cls.tmp.cleanup()

    def test_get_health_reports_ok_and_vox_relay(self):
        status, ctype, raw = _call(self.port, "GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(ctype.split(";")[0].strip(), "application/json")
        data = json.loads(raw)
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("app"), "vox-relay")

    def test_get_inbox_empty_returns_empty_envelopes(self):
        status, _, raw = _call(self.port, "GET", "/inbox/vx_alice")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw), {"envelopes": []})


@unittest.skipIf(
    _use_rust_target(), "/peer/beacon está fora do recorte PR4.2a (previsto no PR4.2b)"
)
class PeerBeaconGetTest(unittest.TestCase):
    """`GET /peer/beacon` no relay completo, com registro de pares isolado por teste."""

    def setUp(self):
        self.discovery = p2p_seeder.PeerDiscovery(local_node_id="test-beacon", ttl_seconds=60)
        patcher = mock.patch.object(p2p_seeder, "PEER_DISCOVERY", self.discovery)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self._stop_server)

    def _stop_server(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def _get_peers(self):
        status, ctype, raw = _call(self.port, "GET", "/peer/beacon")
        self.assertEqual(status, 200)
        self.assertEqual(ctype.split(";")[0].strip(), "application/json")
        data = json.loads(raw)
        self.assertEqual(set(data), {"peers"})
        self.assertIsInstance(data["peers"], list)
        return data["peers"]

    def _post_beacon(self, node_id):
        payload = {
            "nodeId": node_id,
            "protocol": "VOX-PEER-v1",
            "httpPort": 8080,
            "capabilities": ["cache"],
        }
        return _call(self.port, "POST", "/peer/beacon", payload)

    def _age_peer(self, node_id, ms):
        with p2p_seeder._LOCK:
            self.discovery.known_peers[node_id]["lastSeenTs"] -= ms

    def test_get_beacon_without_peers_returns_empty_list(self):
        self.assertEqual(self._get_peers(), [])

    def test_post_valid_beacon_then_get_lists_it(self):
        status, _, raw = self._post_beacon("node_beacon_1")
        self.assertEqual(status, 201)
        self.assertEqual(json.loads(raw)["nodeId"], "node_beacon_1")
        peers = self._get_peers()
        self.assertEqual(len(peers), 1)
        self.assertEqual(set(peers[0]), BEACON_FIELDS)
        self.assertEqual(peers[0]["nodeId"], "node_beacon_1")
        self.assertEqual(peers[0]["protocol"], "VOX-PEER-v1")
        self.assertEqual(peers[0]["httpPort"], 8080)
        self.assertEqual(peers[0]["capabilities"], ["cache"])
        self.assertEqual(peers[0]["status"], "online")
        self.assertIsInstance(peers[0]["lastSeenTs"], int)

    def test_expired_beacon_is_not_listed(self):
        self._post_beacon("node_fresh")
        self._post_beacon("node_stale")
        self._age_peer("node_stale", TTL_EXPIRED_MS)
        node_ids = [peer["nodeId"] for peer in self._get_peers()]
        self.assertEqual(node_ids, ["node_fresh"])


if __name__ == "__main__":
    unittest.main()
