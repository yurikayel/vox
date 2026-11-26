"""Sinalização: teto global de conexões não interfere nos limites por IP (signal, signal_msg)."""

from __future__ import annotations

import base64
import socket
import threading
import time
import unittest
from unittest import mock

from relay import rate_limit, signaling

LOOPBACK = "127.0.0.1"


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class _SignalingFixture(unittest.TestCase):
    max_connections = None

    def setUp(self):
        self._sockets = []
        self.server = signaling.ThreadedTCPServer(
            (LOOPBACK, 0),
            signaling.WebSocketHandler,
            max_connections=self.max_connections,
        )
        self.port = self.server.server_address[1]
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self._stop, thread)

    def _stop(self, thread):
        for sock in self._sockets:
            try:
                sock.close()
            except OSError:
                pass
        self.server.shutdown()
        self.server.server_close()
        thread.join(timeout=5)

    def raw_socket(self):
        sock = socket.create_connection((LOOPBACK, self.port), timeout=3)
        self._sockets.append(sock)
        return sock

    def health_status(self):
        sock = socket.create_connection((LOOPBACK, self.port), timeout=3)
        self._sockets.append(sock)
        req = f"GET /health HTTP/1.1\r\nHost: {LOOPBACK}:{self.port}\r\nConnection: close\r\n\r\n"
        sock.sendall(req.encode("ascii"))
        return sock.recv(256).decode("latin1")


class TestSignalingConnectionCap(_SignalingFixture):
    max_connections = 2

    def test_connection_over_the_cap_is_closed_and_slot_is_reused(self):
        idle = [self.raw_socket(), self.raw_socket()]
        time.sleep(0.35)
        refused = self.raw_socket()
        refused.settimeout(2)
        chunk = refused.recv(32)
        self.assertEqual(chunk, b"", msg="conexão acima do teto deve fechar sem dados")
        idle[0].close()
        idle[1].close()
        self._sockets.remove(idle[0])
        self._sockets.remove(idle[1])
        self.assertIn("200 OK", self._health_when_slot_frees())

    def _health_when_slot_frees(self):
        for _ in range(20):
            try:
                return self.health_status()
            except OSError:
                time.sleep(0.1)
        return ""


class TestSignalingCapWithRateLimit(_SignalingFixture):
    max_connections = 8

    def setUp(self):
        policies = {name: rate_limit.Policy(60, 1000) for name in rate_limit.DEFAULT_POLICIES}
        policies["signal"] = rate_limit.Policy(60, 1)
        patcher = mock.patch.object(
            rate_limit,
            "LIMITER",
            rate_limit.RateLimiter(policies, clock=FakeClock()),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        super().setUp()

    def handshake(self):
        sock = self.raw_socket()
        key = base64.b64encode(b"cap-rate-key").decode("ascii")
        request = (
            f"GET / HTTP/1.1\r\nHost: {LOOPBACK}:{self.port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(request.encode("ascii"))
        return sock.recv(1024).decode("latin1")

    def test_signal_rate_limit_still_refuses_above_policy(self):
        self.assertIn("101 Switching Protocols", self.handshake())
        refused = self.handshake()
        self.assertIn("429 Too Many Requests", refused)
        self.assertIn("Retry-After:", refused)


class TestResolveMaxConnections(unittest.TestCase):
    def test_resolve_max_connections_api_present(self):
        """Na base sem teto, o helper não existe (red-on-base por asserção)."""
        self.assertTrue(hasattr(signaling, "resolve_max_connections"))
        self.assertTrue(callable(signaling.resolve_max_connections))

    def test_default_when_unset(self):
        with mock.patch.dict("os.environ", {}, clear=True):
            self.assertEqual(signaling.resolve_max_connections(), 64)

    def test_env_override(self):
        with mock.patch.dict("os.environ", {"VOX_SIGNAL_MAX_CONNECTIONS": "32"}):
            self.assertEqual(signaling.resolve_max_connections(), 32)

    def test_invalid_env_falls_back(self):
        with mock.patch.dict("os.environ", {"VOX_SIGNAL_MAX_CONNECTIONS": "nope"}):
            self.assertEqual(signaling.resolve_max_connections(), 64)


if __name__ == "__main__":
    unittest.main()
