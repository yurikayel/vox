#!/usr/bin/env python3
"""Smoke test rápido de carga concorrente no servidor de sinalização (LAN-09)."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import struct
import threading
import time
import unittest
from unittest import mock

from relay import rate_limit, signaling

LOOPBACK = "127.0.0.1"
_MASK = b"\x21\x43\x65\x87"


def _masked_text_frame(data: dict) -> bytes:
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    first = 0x81
    size = len(raw)
    if size < 126:
        header = bytes([first, 0x80 | size])
    else:
        header = bytes([first, 0x80 | 126]) + struct.pack(">H", size)
    masked = bytes(b ^ _MASK[i & 3] for i, b in enumerate(raw))
    return header + _MASK + masked


async def _read_frame(reader: asyncio.StreamReader) -> tuple[int, bytes]:
    head = await reader.readexactly(2)
    opcode = head[0] & 0x0F
    code = head[1] & 0x7F
    if code == 126:
        length = struct.unpack(">H", await reader.readexactly(2))[0]
    elif code == 127:
        length = struct.unpack(">Q", await reader.readexactly(8))[0]
    else:
        length = code
    return opcode, (await reader.readexactly(length) if length else b"")


async def _ws_connect(port: int) -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    reader, writer = await asyncio.open_connection(LOOPBACK, port)
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    req = (
        f"GET / HTTP/1.1\r\nHost: {LOOPBACK}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    writer.write(req.encode("ascii"))
    await writer.drain()
    head = await reader.readuntil(b"\r\n\r\n")
    if b"101 Switching Protocols" not in head:
        raise AssertionError(f"Handshake falhou: {head!r}")
    return reader, writer


class _SmokePeer:
    """Par WebSocket mínimo em asyncio para o smoke test."""

    def __init__(self, peer_id: str, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.peer_id = peer_id
        self.reader = reader
        self.writer = writer
        self.registered = asyncio.Event()
        self.signals: asyncio.Queue[dict] = asyncio.Queue()
        self.task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self.task = asyncio.create_task(self._pump())

    async def send(self, payload: dict) -> None:
        self.writer.write(_masked_text_frame(payload))
        await self.writer.drain()

    async def _pump(self) -> None:
        try:
            while True:
                opcode, data = await _read_frame(self.reader)
                if opcode == 0x8:
                    break
                if opcode == 0x1:
                    msg = json.loads(data.decode("utf-8"))
                    if msg.get("type") == "registered":
                        self.registered.set()
                    elif msg.get("type") in ("offer", "answer", "ice"):
                        self.signals.put_nowait(msg)
        except (asyncio.IncompleteReadError, asyncio.CancelledError, OSError):
            pass

    async def close(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        self.writer.close()


class TestSignalingLoadSmoke(unittest.IsolatedAsyncioTestCase):
    """Conecta 50 pares simultâneos em loopback e valida registro + troca de sinais."""

    def setUp(self) -> None:
        self._clear_registry()
        policies = {name: rate_limit.Policy(60000, 10000) for name in rate_limit.DEFAULT_POLICIES}
        self._patcher = mock.patch.object(rate_limit, "LIMITER", rate_limit.RateLimiter(policies))
        self._patcher.start()
        self.addCleanup(self._patcher.stop)
        self.server = signaling.ThreadedTCPServer(
            (LOOPBACK, 0), signaling.WebSocketHandler, max_connections=64
        )
        self.port = self.server.server_address[1]
        self._thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self._thread.start()
        self.addCleanup(self._stop_server)

    def _clear_registry(self) -> None:
        with signaling.registry.lock:
            signaling.registry.peers.clear()
            signaling.registry.addresses.clear()
            signaling.registry.dm_pubs.clear()

    def _stop_server(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self._thread.join(timeout=5)
        self._clear_registry()

    async def _open_and_register(self, idx: int) -> _SmokePeer:
        reader, writer = await _ws_connect(self.port)
        peer = _SmokePeer(f"smoke-{idx:02d}", reader, writer)
        peer.start()
        await peer.send({"type": "register", "peerId": peer.peer_id})
        await asyncio.wait_for(peer.registered.wait(), timeout=3.0)
        return peer

    async def _exchange_pair(self, a: _SmokePeer, b: _SmokePeer) -> None:
        await a.send({"type": "offer", "to": b.peer_id, "sdp": "v=0"})
        offer = await asyncio.wait_for(b.signals.get(), timeout=3.0)
        self.assertEqual(offer["from"], a.peer_id)
        await b.send({"type": "answer", "to": a.peer_id, "sdp": "v=0-ans"})
        answer = await asyncio.wait_for(a.signals.get(), timeout=3.0)
        self.assertEqual(answer["from"], b.peer_id)

    async def test_fifty_concurrent_peers_register_and_signal_cleanly(self) -> None:
        t0 = time.monotonic()
        peers = await asyncio.gather(*(self._open_and_register(i) for i in range(50)))
        try:
            pairs = [(peers[i], peers[i + 1]) for i in range(0, len(peers), 2)]
            await asyncio.gather(*(self._exchange_pair(a, b) for a, b in pairs))
        finally:
            await asyncio.gather(*(p.close() for p in peers), return_exceptions=True)
        self.assertLess(time.monotonic() - t0, 5.0)


if __name__ == "__main__":
    unittest.main()
