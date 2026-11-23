"""Limite de taxa por IP do relay (`rate_limit.py`): token bucket, classes e proxy.

Testes unitários usam relógio controlado; integração sobe `server.py` e sinalização,
com limitador pequeno no lugar do global.
"""

import base64
import json
import shutil
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path
from unittest.mock import patch

from relay import central_memory, inbox, rate_limit, server, signaling


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def limiter_with(clock, **classes):
    """Limitador só com as classes dadas, cada uma como `(por_minuto, rajada)`."""
    policies = {name: rate_limit.Policy(*values) for name, values in classes.items()}
    return rate_limit.RateLimiter(policies, clock=clock)


class TestTokenBucket(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.limiter = limiter_with(self.clock, mailbox=(60, 3))

    def test_allows_up_to_the_burst(self):
        for _ in range(3):
            self.assertEqual(self.limiter.check("mailbox", "1.2.3.4"), 0)

    def test_blocks_above_the_burst_with_retry_after(self):
        for _ in range(3):
            self.limiter.check("mailbox", "1.2.3.4")
        wait = self.limiter.check("mailbox", "1.2.3.4")
        self.assertIsInstance(wait, int)
        self.assertEqual(wait, 1, "60/min = uma ficha por segundo")

    def test_retry_after_grows_when_the_rate_is_slower(self):
        slow = limiter_with(self.clock, beacon=(6, 1))
        slow.check("beacon", "1.2.3.4")
        self.assertEqual(slow.check("beacon", "1.2.3.4"), 10, "6/min = uma ficha a cada 10 s")

    def test_recovers_as_time_passes(self):
        for _ in range(4):
            self.limiter.check("mailbox", "1.2.3.4")
        self.clock.now += 0.5
        self.assertGreater(
            self.limiter.check("mailbox", "1.2.3.4"), 0, "meia ficha ainda não basta"
        )
        self.clock.now += 0.6
        self.assertEqual(self.limiter.check("mailbox", "1.2.3.4"), 0)

    def test_refill_never_exceeds_the_burst(self):
        for _ in range(3):
            self.limiter.check("mailbox", "1.2.3.4")
        self.clock.now += 3600
        results = [self.limiter.check("mailbox", "1.2.3.4") for _ in range(4)]
        self.assertEqual(results[:3], [0, 0, 0])
        self.assertGreater(results[3], 0)

    def test_each_ip_has_its_own_bucket(self):
        for _ in range(4):
            self.limiter.check("mailbox", "1.2.3.4")
        self.assertGreater(self.limiter.check("mailbox", "1.2.3.4"), 0)
        self.assertEqual(self.limiter.check("mailbox", "5.6.7.8"), 0)

    def test_each_class_has_its_own_bucket(self):
        both = limiter_with(self.clock, mailbox=(60, 1), beacon=(60, 1))
        both.check("mailbox", "1.2.3.4")
        self.assertGreater(both.check("mailbox", "1.2.3.4"), 0)
        self.assertEqual(both.check("beacon", "1.2.3.4"), 0)

    def test_unknown_class_is_not_limited(self):
        self.assertEqual(self.limiter.check("inexistente", "1.2.3.4"), 0)


class TestBucketCleanup(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()

    def test_idle_buckets_leave_the_map(self):
        limiter = limiter_with(self.clock, mailbox=(60, 3))
        for index in range(50):
            limiter.check("mailbox", f"10.0.0.{index}")
        self.assertEqual(limiter.size("mailbox"), 50)
        self.clock.now += 10
        limiter.check("mailbox", "10.9.9.9")
        self.assertEqual(limiter.size("mailbox"), 1, "só o IP recém-chegado fica")

    def test_a_still_throttled_bucket_is_kept(self):
        limiter = limiter_with(self.clock, mailbox=(60, 2))
        for _ in range(3):
            limiter.check("mailbox", "1.2.3.4")
        self.clock.now += 0.5
        limiter.check("mailbox", "5.6.7.8")
        self.assertEqual(limiter.size("mailbox"), 2)
        self.assertGreater(
            limiter.check("mailbox", "1.2.3.4"), 0, "o abusador não ganhou bucket novo"
        )

    def test_map_size_is_capped(self):
        limiter = rate_limit.RateLimiter(
            {"mailbox": rate_limit.Policy(60, 3)}, clock=self.clock, max_entries=100
        )
        for index in range(1000):
            limiter.check("mailbox", f"10.{index // 256}.{index % 256}.1")
        self.assertEqual(limiter.size("mailbox"), 100)


class TestPolicies(unittest.TestCase):
    def test_defaults(self):
        policies = rate_limit.policies_from_env({})
        self.assertEqual(policies["mailbox"], rate_limit.Policy(120, 60))
        self.assertEqual(set(policies), {"mailbox", "beacon", "write", "signal", "signal_msg"})

    def test_environment_overrides_per_class(self):
        env = {"VOX_RELAY_RATE_BEACON_PER_MIN": "10", "VOX_RELAY_RATE_BEACON_BURST": "4"}
        policies = rate_limit.policies_from_env(env)
        self.assertEqual(policies["beacon"], rate_limit.Policy(10, 4))
        self.assertEqual(
            policies["mailbox"], rate_limit.Policy(120, 60), "as outras classes não mudam"
        )

    def test_invalid_or_zero_values_keep_the_default(self):
        env = {"VOX_RELAY_RATE_MAILBOX_PER_MIN": "zero", "VOX_RELAY_RATE_MAILBOX_BURST": "0"}
        self.assertEqual(rate_limit.policies_from_env(env)["mailbox"], rate_limit.Policy(120, 60))

    def test_burst_never_exceeds_a_lowered_rate(self):
        policies = rate_limit.policies_from_env({"VOX_RELAY_RATE_MAILBOX_PER_MIN": "20"})
        self.assertEqual(policies["mailbox"], rate_limit.Policy(20, 20))

    def test_legacy_write_limit_applies_to_http_write_classes_only(self):
        policies = rate_limit.policies_from_env({"VOX_RELAY_WRITE_LIMIT_PER_MIN": "30"})
        self.assertEqual(policies["mailbox"].per_min, 30)
        self.assertEqual(policies["write"].per_min, 30)
        self.assertEqual(policies["signal"], rate_limit.DEFAULT_POLICIES["signal"])


class TestRouteClasses(unittest.TestCase):
    def test_writes_are_classified_by_route(self):
        cases = (
            ("POST", "/inbox/bob", "mailbox"),
            ("DELETE", "/inbox/bob/dm_1", "mailbox"),
            ("POST", "/memory/vault/cofre1", "mailbox"),
            ("POST", "/relay/envelope/canal", "mailbox"),
            ("POST", "/peer/beacon", "beacon"),
            ("POST", "/p2p/seed", "beacon"),
            ("DELETE", "/p2p/seed/abc", "beacon"),
            ("POST", "/vox/mirror", "write"),
            ("POST", "/qualquer/coisa", "write"),
        )
        for method, path, expected in cases:
            self.assertEqual(rate_limit.write_class(method, path), expected, f"{method} {path}")

    def test_reads_and_health_are_exempt(self):
        for method, path in (
            ("GET", "/inbox/bob"),
            ("GET", "/ping"),
            ("GET", "/status"),
            ("HEAD", "/"),
            ("OPTIONS", "/inbox/x"),
        ):
            self.assertIsNone(rate_limit.write_class(method, path), f"{method} {path}")

    def test_query_string_does_not_change_the_class(self):
        self.assertEqual(rate_limit.write_class("POST", "/peer/beacon?x=1"), "beacon")

    def test_http_rejection_carries_status_message_and_retry_after(self):
        limiter = limiter_with(FakeClock(), mailbox=(60, 1))
        self.assertIsNone(rate_limit.http_rejection("POST", "/inbox/a", "1.2.3.4", limiter))
        status, message, retry = rate_limit.http_rejection("POST", "/inbox/a", "1.2.3.4", limiter)
        self.assertEqual((status, retry), (429, 1))
        self.assertTrue(message)
        self.assertIsNone(
            rate_limit.http_rejection("GET", "/inbox/a", "1.2.3.4", limiter),
            "leitura não gasta ficha",
        )


class TestClientIp(unittest.TestCase):
    def test_forwarded_for_is_ignored_unless_trusted(self):
        self.assertEqual(rate_limit.client_ip("10.0.0.1", "203.0.113.9", hops=0), "10.0.0.1")

    def test_trusted_proxy_uses_the_entry_added_by_it(self):
        self.assertEqual(rate_limit.client_ip("10.0.0.1", "203.0.113.9", hops=1), "203.0.113.9")

    def test_client_supplied_prefix_cannot_spoof_the_ip(self):
        forwarded = "1.1.1.1, 198.51.100.7"
        self.assertEqual(rate_limit.client_ip("10.0.0.1", forwarded, hops=1), "198.51.100.7")

    def test_two_hops_skip_the_inner_proxy(self):
        forwarded = "198.51.100.7, 172.16.0.5"
        self.assertEqual(rate_limit.client_ip("10.0.0.1", forwarded, hops=2), "198.51.100.7")

    def test_missing_short_or_garbage_header_falls_back_to_the_socket_ip(self):
        for forwarded in (None, "", "lixo", "203.0.113.9"):
            hops = 2 if forwarded == "203.0.113.9" else 1
            self.assertEqual(
                rate_limit.client_ip("10.0.0.1", forwarded, hops=hops), "10.0.0.1", forwarded
            )

    def test_ipv6_is_bucketed_by_64_and_ipv4_mapped_unwrapped(self):
        a = rate_limit.client_ip("2001:db8:1:2:aaaa::1", None, hops=0)
        b = rate_limit.client_ip("2001:db8:1:2:bbbb::9", None, hops=0)
        self.assertEqual(a, b)
        self.assertNotEqual(a, rate_limit.client_ip("2001:db8:1:3::1", None, hops=0))
        self.assertEqual(rate_limit.client_ip("::ffff:192.0.2.1", None, hops=0), "192.0.2.1")

    def test_trust_is_off_by_default_in_the_environment(self):
        self.assertEqual(rate_limit.trusted_hops({}), 0)
        self.assertEqual(rate_limit.trusted_hops({"VOX_RELAY_TRUST_PROXY_HOPS": "2"}), 2)
        self.assertEqual(rate_limit.trusted_hops({"VOX_RELAY_TRUST_PROXY_HOPS": "sim"}), 0)


class TestHttpRelayRateLimit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="vox_rate_")
        cls.previous = (inbox.INBOX_DIR, central_memory.MEMORY_DIR)
        inbox.INBOX_DIR = Path(cls.tmp) / "inbox"
        central_memory.set_memory_dir(Path(cls.tmp) / "mem")
        cls.httpd = HTTPServer(("127.0.0.1", 0), server.VoxRelayHandler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        inbox.INBOX_DIR, memory_dir = cls.previous
        central_memory.set_memory_dir(memory_dir)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def setUp(self):
        policies = {name: rate_limit.Policy(60, 1000) for name in rate_limit.DEFAULT_POLICIES}
        policies["mailbox"] = rate_limit.Policy(60, 2)
        self.clock = FakeClock()
        patcher = patch.object(
            rate_limit, "LIMITER", rate_limit.RateLimiter(policies, clock=self.clock)
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, method, path, headers=None):
        body = json.dumps({"x": 1}).encode("utf-8") if method == "POST" else None
        base = {"Content-Type": "application/json"} if body else {}
        url = f"http://127.0.0.1:{self.httpd.server_address[1]}{path}"
        request = urllib.request.Request(
            url, data=body, headers={**base, **(headers or {})}, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status, response.headers
        except urllib.error.HTTPError as error:
            return error.code, error.headers

    def test_mailbox_write_gets_429_with_retry_after_above_the_limit(self):
        for _ in range(2):
            self.assertNotEqual(self.call("POST", "/inbox/bob")[0], 429)
        status, headers = self.call("POST", "/inbox/bob")
        self.assertEqual(status, 429)
        self.assertEqual(headers["Retry-After"], "1")
        self.assertEqual(headers["Access-Control-Expose-Headers"], "Retry-After")

    def test_write_is_accepted_again_after_the_wait(self):
        for _ in range(3):
            self.call("POST", "/inbox/bob")
        self.clock.now += 1.1
        self.assertNotEqual(self.call("POST", "/inbox/bob")[0], 429)

    def test_reads_and_health_are_never_limited(self):
        for _ in range(10):
            self.assertEqual(self.call("GET", "/health")[0], 200)
            self.assertNotEqual(self.call("GET", "/inbox/bob")[0], 429)

    def test_other_class_is_untouched_by_a_flooded_mailbox(self):
        for _ in range(5):
            self.call("POST", "/inbox/bob")
        self.assertNotEqual(self.call("POST", "/peer/beacon")[0], 429)

    def test_refused_write_with_a_body_still_delivers_the_429(self):
        url = f"http://127.0.0.1:{self.httpd.server_address[1]}/inbox/bob"
        body = json.dumps({"pad": "x" * 8000}).encode("utf-8")
        statuses = []
        for _ in range(30):
            request = urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json"}
            )
            try:
                statuses.append(urllib.request.urlopen(request, timeout=3).status)
            except urllib.error.HTTPError as error:
                statuses.append(error.code)
        self.assertEqual(
            statuses.count(429), 28, "2 passam pela rajada e os outros 28 recebem o 429 inteiro"
        )

    def test_forwarded_for_is_ignored_without_explicit_trust(self):
        for index in range(3):
            status, _ = self.call("POST", "/inbox/bob", {"X-Forwarded-For": f"203.0.113.{index}"})
        self.assertEqual(status, 429, "trocar o cabeçalho não ganha bucket novo")

    def test_trusted_proxy_separates_clients_by_forwarded_for(self):
        with patch.object(rate_limit, "TRUSTED_HOPS", 1):
            for _ in range(3):
                self.call("POST", "/inbox/bob", {"X-Forwarded-For": "203.0.113.1"})
            self.assertEqual(
                self.call("POST", "/inbox/bob", {"X-Forwarded-For": "203.0.113.1"})[0], 429
            )
            self.assertNotEqual(
                self.call("POST", "/inbox/bob", {"X-Forwarded-For": "203.0.113.2"})[0], 429
            )


class TestSignalingRateLimit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = signaling.ThreadedTCPServer(("127.0.0.1", 0), signaling.WebSocketHandler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        policies = {name: rate_limit.Policy(60, 1000) for name in rate_limit.DEFAULT_POLICIES}
        policies["signal"] = rate_limit.Policy(60, 1)
        self.clock = FakeClock()
        patcher = patch.object(
            rate_limit, "LIMITER", rate_limit.RateLimiter(policies, clock=self.clock)
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def handshake(self):
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=3)
        self.addCleanup(sock.close)
        key = base64.b64encode(b"rate-limit-key-1").decode("ascii")
        request = (
            f"GET / HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        sock.sendall(request.encode("ascii"))
        return sock.recv(1024).decode("latin1")

    def test_new_websocket_is_refused_with_429_above_the_limit(self):
        self.assertIn("101 Switching Protocols", self.handshake())
        refused = self.handshake()
        self.assertIn("429 Too Many Requests", refused)
        self.assertIn("Retry-After: 1", refused)

    def test_connection_is_accepted_again_after_the_wait(self):
        self.handshake()
        self.handshake()
        self.clock.now += 1.1
        self.assertIn("101 Switching Protocols", self.handshake())

    def test_health_check_is_not_limited(self):
        for _ in range(5):
            sock = socket.create_connection(("127.0.0.1", self.port), timeout=3)
            self.addCleanup(sock.close)
            sock.sendall(b"GET /ping HTTP/1.1\r\nHost: x\r\n\r\n")
            self.assertIn("200 OK", sock.recv(1024).decode("latin1"))


class TestSignalingMessageLimit(unittest.TestCase):
    def make_handler(self, limit):
        handler = signaling.WebSocketHandler.__new__(signaling.WebSocketHandler)
        handler.peer_ip = "203.0.113.1"
        handler.seen = []
        handler.dispatch_message = handler.seen.append
        policies = {"signal_msg": rate_limit.Policy(60, limit)}
        return handler, rate_limit.RateLimiter(policies, clock=FakeClock())

    def test_messages_above_the_limit_are_dropped(self):
        handler, limiter = self.make_handler(2)
        with patch.object(rate_limit, "LIMITER", limiter):
            for _ in range(5):
                handler.handle_text_payload(b'{"type":"ping"}')
        self.assertEqual(len(handler.seen), 2)

    def test_handler_without_ip_is_not_limited(self):
        handler, limiter = self.make_handler(1)
        handler.peer_ip = None
        with patch.object(rate_limit, "LIMITER", limiter):
            for _ in range(3):
                handler.handle_text_payload(b'{"type":"ping"}')
        self.assertEqual(len(handler.seen), 3)


if __name__ == "__main__":
    unittest.main()
