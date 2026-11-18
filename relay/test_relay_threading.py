"""Relay: um cliente lento não trava os outros, 413 chega legível e o estado compartilhado aguenta threads."""

from __future__ import annotations

import http.client
import json
import pathlib
import shutil
import socket
import tempfile
import threading
import time
import unittest
from unittest import mock

from relay import blind_relay, central_memory, inbox, mirror_validate, rate_limit, server, vault_store

LOOPBACK = "127.0.0.1"
JSON_HEADERS = {"Content-Type": "application/json"}


class _RelayFixture(unittest.TestCase):
    """Sobe o relay de produção (`VoxRelayServer`) em porta livre, com diretórios e limite de taxa isolados."""

    max_connections = None

    def setUp(self):
        self._sockets = []
        root = pathlib.Path(tempfile.mkdtemp(prefix="vox_threading_"))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self._isolate_state(root)
        self.httpd = server.VoxRelayServer((LOOPBACK, 0), server.VoxRelayHandler, max_connections=self.max_connections)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self._stop, thread)

    def _isolate_state(self, root):
        previous_cache = server.CACHE_DIR
        self.addCleanup(server.set_cache_dir, previous_cache)
        server.set_cache_dir(root / "cache")
        server.ensure_cache_dir()
        inbox.set_inbox_dir(root / "inbox")
        blind_relay.set_relay_dir(root / "blind")
        central_memory.set_memory_dir(root / "memory")
        limiter = mock.patch.object(rate_limit, "LIMITER", rate_limit.RateLimiter())
        limiter.start()
        self.addCleanup(limiter.stop)

    def _stop(self, thread):
        for sock in self._sockets:
            sock.close()
        self.httpd.shutdown()
        self.httpd.server_close()
        thread.join(timeout=5)

    def raw_socket(self):
        sock = socket.create_connection((LOOPBACK, self.port), timeout=5)
        self._sockets.append(sock)
        return sock

    def health_status(self, timeout=2):
        conn = http.client.HTTPConnection(LOOPBACK, self.port, timeout=timeout)
        try:
            conn.request("GET", "/health")
            return conn.getresponse().status
        finally:
            conn.close()


class SlowClientTest(_RelayFixture):
    def test_half_sent_request_line_does_not_block_other_clients(self):
        self.raw_socket().sendall(b"GET /heal")
        self.assertEqual(self.health_status(), 200)

    def test_stalled_post_body_does_not_block_other_clients(self):
        head = b"POST /inbox/abc HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n"
        self.raw_socket().sendall(head + b"{")
        self.assertEqual(self.health_status(), 200)

    def test_idle_connection_is_closed_after_the_socket_timeout(self):
        with mock.patch.object(server.VoxRelayHandler, "timeout", 0.4):
            sock = self.raw_socket()
            sock.settimeout(3)
            started = time.monotonic()
            self.assertEqual(sock.recv(1), b"")
        self.assertLess(time.monotonic() - started, 2.5)


class ConnectionCapTest(_RelayFixture):
    max_connections = 2

    def test_connection_over_the_cap_is_closed_and_slot_is_reused(self):
        idle = [self.raw_socket(), self.raw_socket()]
        time.sleep(0.2)
        self.assertEqual(self.raw_socket().recv(1), b"")
        idle[0].close()
        self.assertEqual(self._health_when_slot_frees(), 200)

    def _health_when_slot_frees(self):
        for _ in range(20):
            try:
                return self.health_status()
            except (OSError, http.client.HTTPException):
                time.sleep(0.1)
        return None


class RejectedBodyTest(_RelayFixture):
    """413 com o corpo ainda a caminho: o cliente lê o status em vez de levar um reset."""

    def post(self, path, size):
        conn = http.client.HTTPConnection(LOOPBACK, self.port, timeout=5)
        self.addCleanup(conn.close)
        conn.request("POST", path, body=b"x" * size, headers=JSON_HEADERS)
        response = conn.getresponse()
        return response, response.read()

    def test_oversized_posts_answer_413_with_connection_close(self):
        cases = {
            "inbox": ("/inbox/abc", inbox.MAX_ENVELOPE_SIZE + 150_000),
            "envelope": ("/relay/envelope/chan", blind_relay.MAX_ENVELOPE_SIZE + 150_000),
            "snapshot": ("/relay/snapshot/chan", blind_relay.MAX_SNAPSHOT_SIZE + 150_000),
            "mirror": ("/vox/mirror", mirror_validate.MAX_MIRROR_BODY_BYTES + 300_000),
        }
        for name, (path, size) in cases.items():
            with self.subTest(name):
                response, body = self.post(path, size)
                self.assertEqual(response.status, 413)
                self.assertEqual(response.getheader("Connection"), "close")
                self.assertEqual(int(response.getheader("Content-Length")), len(body))

    def test_declared_size_without_body_answers_413_promptly(self):
        sock = self.raw_socket()
        sock.settimeout(1.5)
        sock.sendall(
            b"POST /vox/mirror HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n"
            b"Content-Length: 10485760\r\n\r\n"
        )
        response = http.client.HTTPResponse(sock)
        response.begin()
        self.assertEqual(response.status, 413)
        self.assertIn(b"mirror.body_too_large", response.read())

    def test_rate_limited_post_keeps_retry_after_readable(self):
        limiter = rate_limit.RateLimiter({"mailbox": rate_limit.Policy(1, 1)})
        with mock.patch.object(rate_limit, "LIMITER", limiter):
            self.post("/inbox/abc", 100)
            response, body = self.post("/inbox/abc", 40_000)
        self.assertEqual(response.status, 429)
        self.assertTrue(response.getheader("Retry-After"))
        self.assertIn("Muitas escritas", json.loads(body)["error"])


class SharedStateUnderThreadsTest(unittest.TestCase):
    def setUp(self):
        root = pathlib.Path(tempfile.mkdtemp(prefix="vox_state_"))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        self.addCleanup(inbox.set_inbox_dir, inbox.INBOX_DIR)
        self.addCleanup(central_memory.set_memory_dir, central_memory.MEMORY_DIR)
        inbox.set_inbox_dir(root / "inbox")
        central_memory.set_memory_dir(root / "memory")

    def test_two_claims_on_an_ownerless_vault_yield_a_single_owner(self):
        record = {"v": 2, "salt": "c2FsdA", "iter": 600_000, "ct": "x"}
        real_write = central_memory._atomic_write_bytes

        def slow_write(target, data):
            time.sleep(0.15)
            real_write(target, data)

        barrier = threading.Barrier(2)
        results = []

        def claim(token):
            barrier.wait()
            results.append(vault_store.save_vault("vaultkey1", {"record": record, "ownerToken": token}))

        with mock.patch.object(central_memory, "_atomic_write_bytes", slow_write):
            threads = [threading.Thread(target=claim, args=(char * 64,)) for char in "ab"]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)
        self.assertEqual(sorted(results), [vault_store.FORBIDDEN, vault_store.SAVED])

    def test_reader_never_sees_a_half_written_envelope(self):
        envelope = {"v": 1, "id": "m1", "ephPub": "p", "ct": "c" * 200}
        writing = threading.Event()
        seen = {}

        def slow_write_text(path, data, encoding=None, **_):
            half = len(data) // 2
            with open(path, "w", encoding=encoding) as handle:
                handle.write(data[:half])
                handle.flush()
                writing.set()
                time.sleep(0.3)
                handle.write(data[half:])

        def read_while_writing():
            writing.wait(5)
            try:
                seen["read"] = inbox.get_envelopes("alice")
            except OSError as error:
                seen["error"] = error

        reader = threading.Thread(target=read_while_writing)
        reader.start()
        with mock.patch.object(pathlib.Path, "write_text", slow_write_text):
            inbox.store_envelope("alice", envelope)
        reader.join(timeout=5)
        self.assertNotIn("error", seen)
        self.assertEqual(seen.get("read"), [envelope])
        self.assertEqual(inbox.get_envelopes("alice"), [envelope])


class BlindRelayNonceTest(unittest.TestCase):
    def test_nonce_with_path_separators_stays_inside_the_channel_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.addCleanup(blind_relay.set_relay_dir, blind_relay.RELAY_DIR)
            blind_relay.set_relay_dir(pathlib.Path(tmp))
            envelope = {"sender": "a" * 64, "sig": "s" * 128, "timestamp": 1000, "nonce": "../../x\..\y"}
            record = blind_relay.store_envelope("canal", envelope)
            channel_files = [path.name for path in (pathlib.Path(tmp) / "canal").iterdir()]
            self.assertEqual(channel_files, [record["id"] + ".json"])
            self.assertNotRegex(record["id"], r"[/\.]")


if __name__ == "__main__":
    unittest.main()
