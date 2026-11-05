#!/usr/bin/env python3
"""
blind_relay.py — Nó Compartilhado e Relay Cego Zero-Knowledge (Vox Populi / Vox Relay)

Armazena e retransmite envelopes cifrados por canal/comunidade sem inspecionar
o texto claro (zero-knowledge). Suporta compactação de épocas com snapshots
consolidados (ex.: Y.encodeStateAsUpdateV2) para garantir cold boot veloz.
"""

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

MAX_ENVELOPE_SIZE = 64 * 1024  # 64 KB por envelope
MAX_SNAPSHOT_SIZE = 512 * 1024  # 512 KB por snapshot consolidado
DEFAULT_TTL_SECONDS = 7 * 86400  # 7 dias de retenção para envelopes de canal

_RELAY_LOCK = threading.RLock()


def resolve_relay_dir(env: Optional[Dict[str, str]] = None) -> Path:
    environ = env if env is not None else os.environ
    raw = str(environ.get("VOX_RELAY_BLIND_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    base = str(environ.get("VOX_RELAY_CACHE_DIR") or "").strip()
    if base:
        return Path(base).resolve() / "blind_relay"
    return Path(__file__).resolve().parent / ".blind_relay"


RELAY_DIR = resolve_relay_dir()


def set_relay_dir(path: Path) -> Path:
    global RELAY_DIR
    RELAY_DIR = Path(path).resolve()
    return RELAY_DIR


def ensure_channel_dir(channel_id: str) -> Path:
    clean = "".join(c for c in str(channel_id) if c.isalnum() or c in ("-", "_"))
    if not clean:
        raise ValueError("ID de canal comunitário inválido")
    chan_path = RELAY_DIR / clean
    chan_path.mkdir(parents=True, exist_ok=True)
    return chan_path


def store_envelope(channel_id: str, envelope: Dict[str, Any], ttl_seconds: int = DEFAULT_TTL_SECONDS) -> Dict[str, Any]:
    if not isinstance(envelope, dict):
        raise ValueError("Envelope deve ser um dicionário JSON")
    if not envelope.get("sender") or not envelope.get("sig"):
        raise ValueError("Envelope deve conter sender e sig")

    raw_bytes = json.dumps(envelope).encode("utf-8")
    if len(raw_bytes) > MAX_ENVELOPE_SIZE:
        raise ValueError(f"Envelope excede o tamanho máximo de {MAX_ENVELOPE_SIZE} bytes")

    ts = int(envelope.get("timestamp") or (time.time() * 1000))
    nonce = str(envelope.get("nonce") or "")[:16]
    msg_id = f"env_{ts}_{nonce}"

    with _RELAY_LOCK:
        chan_path = ensure_channel_dir(channel_id)
        file_path = chan_path / f"{msg_id}.json"
        record = {
            "id": msg_id,
            "channelId": channel_id,
            "storedAt": int(time.time()),
            "expiresAt": int(time.time()) + ttl_seconds,
            "envelope": envelope,
        }
        file_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return record


def list_envelopes(channel_id: str, since_ts: int = 0, since_serial: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    with _RELAY_LOCK:
        try:
            chan_path = ensure_channel_dir(channel_id)
        except ValueError:
            return []

        now = int(time.time())
        results = []
        for file in chan_path.glob("env_*.json"):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
                if data.get("expiresAt", 0) < now:
                    file.unlink(missing_ok=True)
                    continue
                env = data.get("envelope", {})
                ts = int(env.get("timestamp", 0))
                serial = int(env.get("serial", 0))
                if since_serial > 0:
                    if serial > since_serial:
                        results.append(env)
                elif ts >= since_ts:
                    results.append(env)
            except (json.JSONDecodeError, OSError):
                continue

        results.sort(key=lambda x: int(x.get("timestamp", 0)))
        return results[:limit]


def store_snapshot(channel_id: str, snapshot_data: Dict[str, Any], prune_older: bool = True) -> Dict[str, Any]:
    if not isinstance(snapshot_data, dict):
        raise ValueError("Snapshot deve ser um dicionário JSON")
    if not snapshot_data.get("snapshot"):
        raise ValueError("Snapshot deve conter o campo 'snapshot'")

    raw_bytes = json.dumps(snapshot_data).encode("utf-8")
    if len(raw_bytes) > MAX_SNAPSHOT_SIZE:
        raise ValueError(f"Snapshot excede limite de {MAX_SNAPSHOT_SIZE} bytes")

    epoch = int(snapshot_data.get("epoch") or 1)
    timestamp = int(snapshot_data.get("timestamp") or (time.time() * 1000))
    covered_serial = int(snapshot_data.get("coveredSerial") or snapshot_data.get("covered_serial") or 0)

    with _RELAY_LOCK:
        chan_path = ensure_channel_dir(channel_id)
        snap_path = chan_path / "latest_snapshot.json"
        if snap_path.is_file():
            try:
                curr = json.loads(snap_path.read_text(encoding="utf-8"))
                curr_epoch = int(curr.get("epoch", 0))
                if epoch <= curr_epoch:
                    raise ValueError(f"Época do snapshot ({epoch}) deve ser estritamente maior que a época atual ({curr_epoch})")
            except (json.JSONDecodeError, OSError):
                pass

        record = {
            "channelId": channel_id,
            "epoch": epoch,
            "timestamp": timestamp,
            "coveredSerial": covered_serial,
            "storedAt": int(time.time()),
            "data": snapshot_data,
        }
        snap_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")

        if prune_older and timestamp > 0:
            prune_older_deltas(chan_path, timestamp)
        return record


def get_latest_snapshot(channel_id: str) -> Optional[Dict[str, Any]]:
    with _RELAY_LOCK:
        try:
            chan_path = ensure_channel_dir(channel_id)
        except ValueError:
            return None
        snap_path = chan_path / "latest_snapshot.json"
        if not snap_path.is_file():
            return None
        try:
            data = json.loads(snap_path.read_text(encoding="utf-8"))
            return data.get("data")
        except (json.JSONDecodeError, OSError):
            return None


def prune_older_deltas(chan_path: Path, before_timestamp: int) -> int:
    removed = 0
    for file in chan_path.glob("env_*.json"):
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
            ts = int(data.get("envelope", {}).get("timestamp", 0))
            if ts < before_timestamp:
                file.unlink(missing_ok=True)
                removed += 1
        except (json.JSONDecodeError, OSError):
            file.unlink(missing_ok=True)
            removed += 1
    return removed
