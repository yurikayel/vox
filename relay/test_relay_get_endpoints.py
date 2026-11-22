"""Endpoints GET: `/`, `/status`, `/ping` e `/peer/beacon`.

`/`, `/status` e `/ping` respondem o health check de `signaling.handle_http_request`.
`/peer/beacon` é servido por `server.VoxRelayHandler` a partir de `p2p_seeder.PEER_DISCOVERY`.
Cada teste troca esse registro por uma instância nova para isolamento.
"""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from unittest import mock

from relay import p2p_seeder, server
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
        cls.server = ThreadedTCPServer(("127.0.0.1", 0), WebSocketHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
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
