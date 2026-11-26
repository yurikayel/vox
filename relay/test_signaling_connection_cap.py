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
    WAIT_SECONDS = 30  # prazo de espera da condição (não é dormir): o laço sai assim que ela vale

    def slots_free(self):
        """Vagas livres do servidor (o semáforo é a fonte da verdade do teto)."""
        return self.server._slots._value

    def wait_slots(self, expected):
        """Espera o servidor ter exatamente `expected` vagas livres; devolve o último valor visto."""
        deadline = time.monotonic() + self.WAIT_SECONDS
        while self.slots_free() != expected and time.monotonic() < deadline:
            time.sleep(0.01)
        return self.slots_free()

    def health_if_served(self):
        """Health, ou texto vazio se a conexão foi recusada (fechada sem dados ou derrubada com reset, conforme o SO)."""
        try:
            return self.health_status()
        except OSError:
            return ""

    def close_idle(self, idle):
        for sock in idle:
            sock.close()
            self._sockets.remove(sock)

    def test_connection_over_the_cap_is_closed_and_slot_is_reused(self):
        idle = [self.raw_socket(), self.raw_socket()]
        self.assertEqual(self.wait_slots(0), 0, msg="o servidor deve ter ocupado as duas vagas")
        refused = self.raw_socket()
        refused.settimeout(2)
        chunk = refused.recv(32)
        self.assertEqual(chunk, b"", msg="conexão acima do teto deve fechar sem dados")
        self.close_idle(idle)
        self.assertEqual(self.wait_slots(2), 2, msg="as vagas devem voltar depois que os clientes saem")
        self.assertIn("200 OK", self.health_status())

    def test_health_is_refused_while_a_slot_is_held_and_served_once_it_frees(self):
        """Regressão da CI: conexão recusada devolve texto vazio (não OSError), então só a vaga livre prova o health."""
        gate = threading.Event()
        real_release = self.server._slots.release
        self.server._slots.release = lambda: (gate.wait(self.WAIT_SECONDS), real_release())[1]
        idle = [self.raw_socket(), self.raw_socket()]
        self.assertEqual(self.wait_slots(0), 0)
        self.close_idle(idle)
        self.assertEqual(self.health_if_served(), "", msg="com as vagas presas o health é recusado sem dados")
        gate.set()
        self.assertEqual(self.wait_slots(2), 2)
        self.assertIn("200 OK", self.health_status())


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
