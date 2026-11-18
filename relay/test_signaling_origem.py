"""Sinalização: CORS por lista de origens e checagem de `Origin` no handshake do WebSocket (mesma política do `server.py`)."""

from __future__ import annotations

import base64
import socket
import threading
import unittest
from unittest import mock

from relay import signaling

APP = "https://yurikayel.github.io"


class _Fixture(unittest.TestCase):
    def setUp(self):
        self.server = signaling.ThreadedTCPServer(("127.0.0.1", 0), signaling.WebSocketHandler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def ask(self, request_line: str, origin=None, upgrade=False) -> str:
        lines = [request_line, f"Host: 127.0.0.1:{self.port}", "Connection: close"]
        if origin is not None:
            lines.append(f"Origin: {origin}")
        if upgrade:
            key = base64.b64encode(b"0123456789abcdef").decode("ascii")
            lines += ["Upgrade: websocket", f"Sec-WebSocket-Key: {key}", "Sec-WebSocket-Version: 13"]
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as sock:
            sock.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("ascii"))
            return sock.recv(2048).decode("latin1")


class TestWebSocketOrigin(_Fixture):
    def test_foreign_origin_gets_403(self):
        self.assertIn("403 Forbidden", self.ask("GET / HTTP/1.1", "https://evil.example", upgrade=True))

    def test_control_char_origin_gets_403(self):
        self.assertIn("403 Forbidden", self.ask("GET / HTTP/1.1", "https://yurikayel.github.io\x01", upgrade=True))

    def test_app_origin_is_accepted(self):
        self.assertIn("101 Switching Protocols", self.ask("GET / HTTP/1.1", APP, upgrade=True))

    def test_localhost_origin_is_accepted(self):
        self.assertIn("101", self.ask("GET / HTTP/1.1", "http://localhost:8080", upgrade=True))

    def test_missing_origin_is_accepted(self):
        self.assertIn("101 Switching Protocols", self.ask("GET / HTTP/1.1", upgrade=True))

    def test_env_listed_origin_is_accepted(self):
        with mock.patch.dict("os.environ", {"VOX_RELAY_ALLOWED_ORIGINS": "https://meu.exemplo"}):
            self.assertIn("101", self.ask("GET / HTTP/1.1", "https://meu.exemplo", upgrade=True))


class TestCors(_Fixture):
    def test_never_returns_wildcard(self):
        for origin in (None, "https://evil.example", APP):
            resp = self.ask("GET /health HTTP/1.1", origin)
            self.assertNotIn("Access-Control-Allow-Origin: *", resp)
            self.assertIn("Vary: Origin", resp)

    def test_foreign_origin_gets_no_allow_headers(self):
        resp = self.ask("OPTIONS /health HTTP/1.1", "https://evil.example")
        self.assertNotIn("Access-Control-Allow", resp)

    def test_app_origin_gets_the_listed_constant(self):
        resp = self.ask("OPTIONS /health HTTP/1.1", APP.upper())
        self.assertIn(f"Access-Control-Allow-Origin: {APP}\r\n", resp)
        self.assertIn("Access-Control-Allow-Methods: GET, HEAD, OPTIONS", resp)

    def test_health_get_from_app_origin_is_readable(self):
        resp = self.ask("GET /health HTTP/1.1", APP)
        self.assertIn("200 OK", resp)
        self.assertIn(f"Access-Control-Allow-Origin: {APP}", resp)


if __name__ == "__main__":
    unittest.main()
