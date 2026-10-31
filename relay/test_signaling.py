#!/usr/bin/env python3
"""
Testes unitários e de integração para o servidor de sinalização WebRTC (signaling.py).
Biblioteca padrão Python (unittest).
"""

import base64
import json
import socket
import threading
import time
import unittest
from io import BytesIO

from relay.signaling import (
    PeerRegistry,
    ThreadedTCPServer,
    WebSocketHandler,
    compute_accept_key,
    make_ws_frame,
    parse_frame_length,
    read_ws_frame,
    resolve_port,
    make_http_response,
    parse_http_target,
)


class TestWebSocketProtocol(unittest.TestCase):
    def test_compute_accept_key_rfc_test_vector(self):
        # Vetor de teste oficial da RFC 6455
        test_key = "dGhlIHNhbXBsZSBub25jZQ=="
        expected = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        self.assertEqual(compute_accept_key(test_key), expected)

    def test_make_ws_frame_short(self):
        payload = b"hello"
        frame = make_ws_frame(payload, opcode=1)
        self.assertEqual(frame[0], 0x81)  # FIN + text opcode
        self.assertEqual(frame[1], 5)  # length
        self.assertEqual(frame[2:], payload)

    def test_make_ws_frame_medium(self):
        payload = b"x" * 200
        frame = make_ws_frame(payload, opcode=1)
        self.assertEqual(frame[0], 0x81)
        self.assertEqual(frame[1], 126)  # extended 16-bit length
        length = int.from_bytes(frame[2:4], "big")
        self.assertEqual(length, 200)
        self.assertEqual(frame[4:], payload)

    def test_read_ws_frame_masked(self):
        text = b'{"type":"ping"}'
        mask = b"\x12\x34\x56\x78"
        masked = bytes([b ^ mask[i % 4] for i, b in enumerate(text)])
        header = bytes([0x81, 0x80 | len(text)]) + mask
        raw_stream = header + masked

        sock = socket.socketpair()
        try:
            sock[0].sendall(raw_stream)
            opcode, payload = read_ws_frame(sock[1])
            self.assertEqual(opcode, 1)
            self.assertEqual(payload, text)
        finally:
            sock[0].close()
            sock[1].close()


class TestPeerRegistry(unittest.TestCase):
    def setUp(self):
        self.registry = PeerRegistry()

    def test_register_and_unregister(self):
        class DummyHandler:
            def __init__(self):
                self.messages = []

            def send_json(self, msg):
                self.messages.append(msg)

        h1 = DummyHandler()
        h2 = DummyHandler()

        others_for_p1 = self.registry.register("p1", h1)
        self.assertEqual(others_for_p1, [])

        others_for_p2 = self.registry.register("p2", h2)
        self.assertEqual(others_for_p2, ["p1"])
        self.assertEqual(self.registry.get("p1"), h1)
        self.assertEqual(self.registry.get("p2"), h2)

        self.registry.broadcast_others("p1", {"type": "test", "val": 42})
        self.assertEqual(len(h1.messages), 0)
        self.assertEqual(len(h2.messages), 1)
        self.assertEqual(h2.messages[0]["val"], 42)

        self.registry.unregister("p1")
        self.assertIsNone(self.registry.get("p1"))

    def test_register_with_address_and_dm_pub(self):
        class DummyHandler:
            def send_json(self, msg):
                pass

        h1 = DummyHandler()
        pub = {"kty": "EC", "crv": "P-256", "x": "abc", "y": "def"}
        self.registry.register("peer_alice", h1, address="addr_alice", dm_pub=pub)
        self.assertEqual(self.registry.get_peer_by_address("addr_alice"), "peer_alice")
        amap = self.registry.get_address_map(exclude_peer="peer_bob")
        self.assertIn("addr_alice", amap)
        self.assertEqual(amap["addr_alice"]["peerId"], "peer_alice")
        self.assertEqual(amap["addr_alice"]["dmPub"]["x"], "abc")


class TestSignalingIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadedTCPServer(("127.0.0.1", 0), WebSocketHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        from relay.signaling import registry
        with registry.lock:
            registry.peers.clear()
            registry.addresses.clear()
            registry.dm_pubs.clear()

    def _connect_client(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", self.port))
        key = base64.b64encode(b"0123456789abcdef").decode("ascii")
        req = (
            f"GET / HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        s.sendall(req.encode("ascii"))
        resp = s.recv(1024).decode("latin1")
        self.assertIn("101 Switching Protocols", resp)
        return s

    def _send_json(self, sock, data):
        text = json.dumps(data).encode("utf-8")
        mask = b"\xaa\xbb\xcc\xdd"
        masked = bytes([b ^ mask[i % 4] for i, b in enumerate(text)])
        header = bytes([0x81, 0x80 | len(text)]) + mask
        sock.sendall(header + masked)

    def _recv_json(self, sock):
        opcode, payload = read_ws_frame(sock)
        self.assertEqual(opcode, 1)
        return json.loads(payload.decode("utf-8"))

    def test_two_peers_signaling_exchange(self):
        s1 = self._connect_client()
        s2 = self._connect_client()

        try:
            # Registrar peer 1
            self._send_json(s1, {"type": "register", "peerId": "peer_alpha"})
            msg1 = self._recv_json(s1)
            self.assertEqual(msg1["type"], "registered")
            self.assertEqual(msg1["peerId"], "peer_alpha")
            self.assertEqual(msg1["peers"], [])

            # Registrar peer 2
            self._send_json(s2, {"type": "register", "peerId": "peer_beta"})
            msg2 = self._recv_json(s2)
            self.assertEqual(msg2["type"], "registered")
            self.assertIn("peer_alpha", msg2["peers"])

            # Peer 1 deve receber aviso de peer-joined
            joined = self._recv_json(s1)
            self.assertEqual(joined["type"], "peer-joined")
            self.assertEqual(joined["peerId"], "peer_beta")

            # Troca de oferta SDP (peer_alpha -> peer_beta)
            offer_sdp = {"type": "offer", "sdp": "v=0..."}
            self._send_json(s1, {"type": "offer", "to": "peer_beta", "sdp": offer_sdp})
            recvd_offer = self._recv_json(s2)
            self.assertEqual(recvd_offer["type"], "offer")
            self.assertEqual(recvd_offer["from"], "peer_alpha")
            self.assertEqual(recvd_offer["sdp"], offer_sdp)

            # Troca de resposta SDP (peer_beta -> peer_alpha)
            answer_sdp = {"type": "answer", "sdp": "v=0...answer"}
            self._send_json(s2, {"type": "answer", "to": "peer_alpha", "sdp": answer_sdp})
            recvd_answer = self._recv_json(s1)
            self.assertEqual(recvd_answer["type"], "answer")
            self.assertEqual(recvd_answer["from"], "peer_beta")
            self.assertEqual(recvd_answer["sdp"], answer_sdp)

            # Troca de candidato ICE
            ice_cand = {"candidate": "candidate:1 1 UDP ..."}
            self._send_json(s1, {"type": "ice", "to": "peer_beta", "candidate": ice_cand})
            recvd_ice = self._recv_json(s2)
            self.assertEqual(recvd_ice["type"], "ice")
            self.assertEqual(recvd_ice["from"], "peer_alpha")
            self.assertEqual(recvd_ice["candidate"], ice_cand)
        finally:
            s1.close()
            s2.close()

    def test_http_health_check_returns_200_json(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", self.port))
        try:
            req = f"GET /health HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nConnection: close\r\n\r\n"
            s.sendall(req.encode("ascii"))
            resp = s.recv(4096).decode("utf-8")
            self.assertIn("HTTP/1.1 200 OK", resp)
            self.assertIn("Content-Type: application/json", resp)
            body = resp.split("\r\n\r\n")[1]
            data = json.loads(body)
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["service"], "vox-signaling")
            self.assertIn("peers", data)
        finally:
            s.close()

    def test_http_options_preflight_returns_204(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", self.port))
        try:
            req = f"OPTIONS / HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nConnection: close\r\n\r\n"
            s.sendall(req.encode("ascii"))
            resp = s.recv(1024).decode("utf-8")
            self.assertIn("HTTP/1.1 204 No Content", resp)
            self.assertIn("Access-Control-Allow-Origin: *", resp)
        finally:
            s.close()

    def test_http_unknown_route_returns_404(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("127.0.0.1", self.port))
        try:
            req = f"GET /rota_inexistente HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nConnection: close\r\n\r\n"
            s.sendall(req.encode("ascii"))
            resp = s.recv(1024).decode("utf-8")
            self.assertIn("HTTP/1.1 404 Not Found", resp)
        finally:
            s.close()


class TestPortResolution(unittest.TestCase):
    def test_cli_port_priority(self):
        self.assertEqual(resolve_port("8080", default=3921), 8080)
        self.assertEqual(resolve_port("invalid", default=3921), 3921)

    def test_env_port(self):
        import os
        old = os.environ.get("PORT")
        try:
            os.environ["PORT"] = "7860"
            self.assertEqual(resolve_port(None, default=3921), 7860)
        finally:
            if old is None:
                os.environ.pop("PORT", None)
            else:
                os.environ["PORT"] = old

    def test_default_fallback(self):
        import os
        old = os.environ.get("PORT")
        try:
            os.environ.pop("PORT", None)
            self.assertEqual(resolve_port(None, default=3921), 3921)
        finally:
            if old is not None:
                os.environ["PORT"] = old


if __name__ == "__main__":
    unittest.main()
