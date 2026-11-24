#!/usr/bin/env python3
"""Benchmark de carga local (loopback) para o servidor de sinalização WebRTC (LAN-09).

Inicia instância local de `relay/signaling.py` em 127.0.0.1 (porta efêmera),
conecta N pares WebSocket concorrentes via asyncio (stdlib pura), mede latência
de conexão/registro, roundtrip de sinalização (offer/answer) e uso de memória.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import math
import os
import struct
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Any

try:
    import psutil
except ImportError:
    psutil = None

_SERVER_BOOT = """
import os, sys, threading, tracemalloc
sys.path.insert(0, os.getcwd())
tracemalloc.start()
from relay import signaling
srv = signaling.ThreadedTCPServer(("127.0.0.1", int(sys.argv[1])), signaling.WebSocketHandler)
print(f"PORT={srv.server_address[1]}", flush=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    sys.stdin.readline()
finally:
    cur, peak = tracemalloc.get_traced_memory()
    print(f"TRACEMALLOC={cur},{peak}", flush=True)
    srv.shutdown()
    srv.server_close()
""".strip()

_WS_MASK = b"\x37\xfa\x21\x3d"


def build_masked_frame(payload: bytes, opcode: int = 1) -> bytes:
    """Empacota quadro WebSocket mascarado de cliente (RFC 6455)."""
    first, size = 0x80 | (opcode & 0x0F), len(payload)
    if size < 126:
        header = bytes([first, 0x80 | size])
    elif size <= 0xFFFF:
        header = bytes([first, 0x80 | 126]) + struct.pack(">H", size)
    else:
        header = bytes([first, 0x80 | 127]) + struct.pack(">Q", size)
    masked = bytes(b ^ _WS_MASK[i & 3] for i, b in enumerate(payload))
    return header + _WS_MASK + masked


async def _read_length(reader: asyncio.StreamReader, code: int) -> int:
    if code == 126:
        return struct.unpack(">H", await reader.readexactly(2))[0]
    if code == 127:
        return struct.unpack(">Q", await reader.readexactly(8))[0]
    return code


async def read_ws_frame(reader: asyncio.StreamReader) -> tuple[int | None, bytes | None]:
    """Lê um quadro WebSocket completo (remontando continuações se houver)."""
    chunks, msg_opcode = bytearray(), None
    while True:
        head = await reader.readexactly(2)
        fin, opcode, masked = bool(head[0] & 0x80), head[0] & 0x0F, bool(head[1] & 0x80)
        length = await _read_length(reader, head[1] & 0x7F)
        mask_key = await reader.readexactly(4) if masked else b""
        data = await reader.readexactly(length) if length else b""
        if masked and data:
            data = bytes(b ^ mask_key[i & 3] for i, b in enumerate(data))
        if opcode in (0x8, 0x9, 0xA):
            return opcode, data
        if opcode != 0x0:
            msg_opcode = opcode
        chunks.extend(data)
        if fin:
            return msg_opcode, bytes(chunks)


async def ws_handshake(
    host: str, port: int, timeout: float
) -> tuple[asyncio.StreamReader | None, asyncio.StreamWriter | None, str | None]:
    """Abre TCP + upgrade WebSocket RFC 6455; devolve (reader, writer, erro)."""
    try:
        conn = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(conn, timeout=timeout)
    except OSError as exc:
        return None, None, type(exc).__name__
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    req = (
        f"GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    )
    try:
        writer.write(req.encode("ascii"))
        await writer.drain()
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=timeout)
    except (asyncio.IncompleteReadError, asyncio.TimeoutError, OSError) as exc:
        writer.transport.abort()
        return None, None, type(exc).__name__
    parts = raw.split(b"\r\n", 1)[0].decode("latin1").split()
    code = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    if code != 101:
        writer.transport.abort()
        return None, None, f"http_{code}"
    return reader, writer, None


@dataclass
class PeerClient:
    """Cliente WebSocket asyncio de um par do benchmark."""

    peer_id: str
    reader: asyncio.StreamReader
    writer: asyncio.StreamWriter
    registered_ev: asyncio.Event = field(default_factory=asyncio.Event)
    signals: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)
    rx_frames: int = 0
    errors: int = 0
    _task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._read_loop())

    async def send_json(self, data: dict[str, Any]) -> None:
        raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.writer.write(build_masked_frame(raw, opcode=1))
        await self.writer.drain()

    async def _read_loop(self) -> None:
        try:
            while True:
                opcode, payload = await read_ws_frame(self.reader)
                if opcode is None or opcode == 0x8:
                    break
                if opcode == 0x9:
                    self.writer.write(build_masked_frame(payload or b"", opcode=0xA))
                    await self.writer.drain()
                elif opcode == 0x1 and payload is not None:
                    self.rx_frames += 1
                    msg = json.loads(payload.decode("utf-8"))
                    if msg.get("type") == "registered":
                        self.registered_ev.set()
                    elif msg.get("type") in ("offer", "answer", "ice"):
                        self.signals.put_nowait(msg)
        except (asyncio.IncompleteReadError, asyncio.CancelledError, OSError):
            pass
        except Exception:
            self.errors += 1

    async def close(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
        try:
            self.writer.write(build_masked_frame(b"", opcode=0x8))
            await self.writer.drain()
        except OSError:
            pass
        self.writer.close()


def build_env_overrides(peers: int, max_conns: int, default_limits: bool) -> dict[str, str]:
    """Monta variáveis de ambiente para o servidor de sinalização em loopback."""
    if default_limits:
        return {}
    cap = max_conns if max_conns > 0 else max(64, peers + 64)
    burst, msg_burst = max(200, peers * 2), max(2000, peers * 20)
    return {
        "VOX_SIGNAL_MAX_CONNECTIONS": str(cap),
        "VOX_RELAY_RATE_SIGNAL_PER_MIN": str(max(6000, burst * 4)),
        "VOX_RELAY_RATE_SIGNAL_BURST": str(burst),
        "VOX_RELAY_RATE_SIGNAL_MSG_PER_MIN": str(max(60000, msg_burst * 4)),
        "VOX_RELAY_RATE_SIGNAL_MSG_BURST": str(msg_burst),
    }


def start_server_process(
    port: int, env_overrides: dict[str, str], server_bin: str | None = None
) -> tuple[subprocess.Popen[str], int]:
    """Inicia processo filho com `relay.signaling` ou binário `--server-bin` em 127.0.0.1."""
    env = {**os.environ, **env_overrides}
    cmd = (
        [server_bin, "--mode", "signaling", "--host", "127.0.0.1", "--port", str(port)]
        if server_bin
        else [sys.executable, "-u", "-c", _SERVER_BOOT, str(port)]
    )
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )
    assert proc.stdout is not None
    line = proc.stdout.readline().strip()
    if not line.startswith("PORT="):
        err = proc.stderr.read() if proc.stderr else ""
        proc.kill()
        raise RuntimeError(f"Falha ao iniciar servidor de sinalização: {line!r} {err}")
    return proc, int(line.split("=", 1)[1])


def sample_memory(proc: subprocess.Popen[str]) -> dict[str, float]:
    """Coleta RSS e pico de working set do processo servidor via psutil, se disponível."""
    if psutil is None or proc.poll() is not None:
        return {}
    try:
        info = psutil.Process(proc.pid).memory_info()
    except psutil.Error:
        return {}
    out = {"rss_mb": round(info.rss / (1024 * 1024), 2)}
    peak = getattr(info, "peak_wset", None)
    if peak is not None:
        out["peak_wset_mb"] = round(peak / (1024 * 1024), 2)
    return out


def stop_server_process(proc: subprocess.Popen[str], external: bool = False) -> dict[str, float]:
    """Encerra servidor filho de forma limpa e lê pico de tracemalloc."""
    mem = sample_memory(proc)
    if external:
        proc.terminate()
    else:
        try:
            if proc.stdin:
                proc.stdin.write("\n")
                proc.stdin.flush()
        except OSError:
            pass
    out, _ = proc.communicate(timeout=15)
    for line in out.splitlines():
        if line.startswith("TRACEMALLOC="):
            cur, peak = (int(x) for x in line.split("=", 1)[1].split(","))
            mem["tracemalloc_current_mb"] = round(cur / (1024 * 1024), 2)
            mem["tracemalloc_peak_mb"] = round(peak / (1024 * 1024), 2)
    return mem


def percentile(values: list[float], pct: float) -> float:
    """Calcula percentil linearmente interpolado (0..100)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = (len(ordered) - 1) * (pct / 100.0)
    lo, hi = math.floor(idx), math.ceil(idx)
    if lo == hi:
        return round(ordered[lo], 3)
    return round(ordered[lo] + (ordered[hi] - ordered[lo]) * (idx - lo), 3)


def summarize_latencies(values: list[float]) -> dict[str, float]:
    """Resume lista de latências em ms (min, p50, p95, p99, max)."""
    if not values:
        return {k: 0.0 for k in ("count", "min_ms", "p50_ms", "p95_ms", "p99_ms", "max_ms")}
    return {
        "count": len(values),
        "min_ms": round(min(values), 3),
        "p50_ms": percentile(values, 50),
        "p95_ms": percentile(values, 95),
        "p99_ms": percentile(values, 99),
        "max_ms": round(max(values), 3),
    }


def _tally_results(
    results: list[tuple[Any, float | None, str | None]],
) -> tuple[list[Any], list[float], dict[str, int]]:
    items, latencies, failures = [], [], {}
    for item, ms, err in results:
        if err is None and ms is not None:
            latencies.append(ms)
            if item is not None:
                items.append(item)
        elif err:
            failures[err] = failures.get(err, 0) + 1
    return items, latencies, failures


async def _connect_one(port: int, idx: int, sem: asyncio.Semaphore, timeout: float):
    async with sem:
        t0 = time.perf_counter()
        reader, writer, err = await ws_handshake("127.0.0.1", port, timeout)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        if err or reader is None or writer is None:
            return None, elapsed_ms, err or "connect_failed"
        client = PeerClient(f"bench-{idx:04d}", reader, writer)
        client.start()
        return client, elapsed_ms, None


async def phase_connect(port: int, count: int, concurrency: int, timeout: float):
    """Abre `count` conexões WebSocket concorrentes (limitadas por `concurrency`)."""
    sem = asyncio.Semaphore(max(1, concurrency))
    t0 = time.perf_counter()
    results = await asyncio.gather(*(_connect_one(port, i, sem, timeout) for i in range(count)))
    clients, latencies, failures = _tally_results(results)
    return clients, latencies, failures, time.perf_counter() - t0


async def _register_one(client: PeerClient, sem: asyncio.Semaphore, timeout: float):
    async with sem:
        t0 = time.perf_counter()
        try:
            await client.send_json({"type": "register", "peerId": client.peer_id})
            await asyncio.wait_for(client.registered_ev.wait(), timeout=timeout)
            return None, (time.perf_counter() - t0) * 1000.0, None
        except (asyncio.TimeoutError, OSError) as exc:
            return None, None, type(exc).__name__


async def phase_register(clients: list[PeerClient], concurrency: int, timeout: float):
    """Registra todos os pares conectados e mede latência até `registered`."""
    sem = asyncio.Semaphore(max(1, concurrency))
    t0 = time.perf_counter()
    results = await asyncio.gather(*(_register_one(c, sem, timeout) for c in clients))
    _, latencies, failures = _tally_results(results)
    return latencies, failures, time.perf_counter() - t0


async def _pair_roundtrips(a: PeerClient, b: PeerClient, rounds: int, timeout: float):
    rtts, errors = [], 0
    for seq in range(rounds):
        t0 = time.perf_counter()
        try:
            await a.send_json(
                {"type": "offer", "to": b.peer_id, "seq": seq, "sdp": {"type": "offer"}}
            )
            offer = await asyncio.wait_for(b.signals.get(), timeout=timeout)
            errors += int(offer.get("from") != a.peer_id or offer.get("seq") != seq)
            await b.send_json(
                {"type": "answer", "to": a.peer_id, "seq": seq, "sdp": {"type": "answer"}}
            )
            answer = await asyncio.wait_for(a.signals.get(), timeout=timeout)
            errors += int(answer.get("from") != b.peer_id or answer.get("seq") != seq)
            rtts.append((time.perf_counter() - t0) * 1000.0)
        except (asyncio.TimeoutError, OSError):
            errors += 1
    return rtts, errors


async def phase_signal(clients: list[PeerClient], rounds: int, timeout: float):
    """Executa `rounds` trocas offer->answer concorrentes entre pares emparelhados."""
    pairs = [(clients[i], clients[i + 1]) for i in range(0, len(clients) - 1, 2)]
    t0 = time.perf_counter()
    results = await asyncio.gather(*(_pair_roundtrips(a, b, rounds, timeout) for a, b in pairs))
    rtts = [ms for pair_rtts, _ in results for ms in pair_rtts]
    return rtts, sum(err for _, err in results), time.perf_counter() - t0


def _phase_metrics(
    prefix: str, count: int, elapsed_s: float, latencies: list[float], failures: dict[str, int]
):
    rate = round(count / elapsed_s, 1) if elapsed_s > 0 else 0.0
    return {
        f"{prefix}_total_s": round(elapsed_s, 3),
        f"{prefix}_peers_per_sec": rate,
        f"{prefix}_latency_ms": summarize_latencies(latencies),
        f"{prefix}_failures": failures,
    }


async def run_benchmark(args: argparse.Namespace) -> dict[str, Any]:
    """Orquestra ciclo completo do benchmark em loopback local."""
    env_overrides = build_env_overrides(args.peers, args.max_connections, args.default_limits)
    proc, actual_port = start_server_process(args.port, env_overrides, args.server_bin)
    try:
        t_start = time.perf_counter()
        conn = await phase_connect(actual_port, args.peers, args.concurrency, args.timeout)
        clients, conn_ms, conn_fail, conn_s = conn
        reg_ms, reg_fail, reg_s = await phase_register(clients, args.concurrency, args.timeout)
        rtt_ms, sig_errs, sig_s = await phase_signal(clients, args.rounds, args.timeout)
        peak_mem = sample_memory(proc)
        total_rx = sum(c.rx_frames for c in clients)
        client_errs = sum(c.errors for c in clients)
        await asyncio.gather(*(c.close() for c in clients), return_exceptions=True)
        total_s = time.perf_counter() - t_start
    finally:
        peak_mem.update(stop_server_process(proc, external=bool(args.server_bin)))
    return {
        "target_peers": args.peers, "connected_peers": len(clients),
        "registered_peers": len(reg_ms), "rounds_per_pair": args.rounds,
        "concurrency": args.concurrency, "default_limits": args.default_limits,
        "env_overrides": env_overrides, "port": actual_port,
        **_phase_metrics("connect", len(clients), conn_s, conn_ms, conn_fail),
        **_phase_metrics("register", len(reg_ms), reg_s, reg_ms, reg_fail),
        "signal_total_s": round(sig_s, 3), "signal_roundtrip_ms": summarize_latencies(rtt_ms),
        "signal_errors": sig_errs, "client_rx_frames": total_rx,
        "client_decode_errors": client_errs, "server_memory": peak_mem,
        "total_elapsed_s": round(total_s, 3),
    }


def _fmt_phase(label: str, prefix: str, report: dict[str, Any]) -> str:
    lat = report[f"{prefix}_latency_ms"]
    rate = report[f"{prefix}_peers_per_sec"]
    return (
        f"- **{label}:** {report[f'{prefix}_total_s']}s ({rate} peers/s)"
        f" · p50={lat['p50_ms']}ms p95={lat['p95_ms']}ms p99={lat['p99_ms']}ms"
    )


def format_markdown(report: dict[str, Any]) -> str:
    """Formata o resultado do benchmark como resumo Markdown."""
    s_lat = report["signal_roundtrip_ms"]
    mode = "stock defaults" if report["default_limits"] else "loopback tuned"
    lines = [
        f"## Signaling Load Benchmark ({mode})",
        "",
        f"- **Peers:** {report['connected_peers']}/{report['target_peers']} conectados, "
        f"{report['registered_peers']} registrados (`concurrency={report['concurrency']}`)",
        _fmt_phase("Conexão WebSocket", "connect", report),
        _fmt_phase("Registro", "register", report),
        f"- **Roundtrip Signal (offer/answer, {report['rounds_per_pair']} rounds):** "
        f"{s_lat['count']} trocas em {report['signal_total_s']}s · "
        f"p50={s_lat['p50_ms']}ms p95={s_lat['p95_ms']}ms p99={s_lat['p99_ms']}ms",
        f"- **Erros:** connect={report['connect_failures']} register={report['register_failures']} "
        f"signal={report['signal_errors']} decode={report['client_decode_errors']}",
        f"- **Frames recebidos (clientes):** {report['client_rx_frames']}",
        f"- **Memória servidor:** {report['server_memory']}",
        f"- **Tempo total:** {report['total_elapsed_s']}s",
    ]
    return "\n".join(lines)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark local para relay/signaling.py.")
    parser.add_argument("--peers", type=int, default=500, help="Pares concorrentes (padrão: 500).")
    parser.add_argument("--rounds", type=int, default=3, help="Rodadas offer/answer (padrão: 3).")
    parser.add_argument("--port", type=int, default=0, help="Porta em 127.0.0.1 (0 = efêmera).")
    parser.add_argument("--concurrency", type=int, default=25, help="Concorrência handshake/reg.")
    parser.add_argument("--max-connections", type=int, default=0, help="Override max conexões.")
    parser.add_argument("--timeout", type=float, default=20.0, help="Timeout por operação (s).")
    parser.add_argument("--default-limits", action="store_true", help="Usa limites padrão.")
    parser.add_argument("--server-bin", default=None, help="Binário externo (ex.: vox-node).")
    parser.add_argument("--json", action="store_true", help="Imprime saída em JSON.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    report = asyncio.run(run_benchmark(args))
    out = json.dumps(report, indent=2, ensure_ascii=False) if args.json else format_markdown(report)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
