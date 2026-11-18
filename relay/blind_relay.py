#!/usr/bin/env python3
"""
blind_relay.py — Nó Compartilhado e Relay Cego Zero-Knowledge (Vox Populi / Vox Relay)

Armazena e retransmite envelopes cifrados por canal/comunidade sem inspecionar
o texto claro (zero-knowledge). Suporta compactação de épocas com snapshots
consolidados (ex.: Y.encodeStateAsUpdateV2) para garantir cold boot veloz.
"""

import hashlib
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MAX_ENVELOPE_SIZE = 64 * 1024  # 64 KB por envelope
MAX_SNAPSHOT_SIZE = 512 * 1024  # 512 KB por snapshot consolidado
DEFAULT_TTL_SECONDS = 7 * 86400  # 7 dias de retenção para envelopes de canal

_RELAY_LOCK = threading.RLock()
_INT_TEXT = re.compile(r"\d{1,19}")
_INT_LIMIT = 2**63
_CHANNEL_ID = re.compile(r"[A-Za-z0-9_-]{1,128}")
_STORED_NAME = re.compile(r"env_[0-9]{1,19}_[0-9a-f]{20}\.json|latest_snapshot\.json")


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
    stripped = "".join(c for c in str(channel_id) if c.isalnum() or c in ("-", "_"))
    match = _CHANNEL_ID.fullmatch(stripped)
    if match is None:
        raise ValueError("ID de canal comunitário inválido")
    chan_path = RELAY_DIR / match.group(0)
    chan_path.mkdir(parents=True, exist_ok=True)
    return chan_path


def _stored_file(chan_path: Path, name: str) -> Optional[Path]:
    """Arquivo do canal só se o nome é um dos nossos (sem separador e sem `..`)."""
    match = _STORED_NAME.fullmatch(os.path.basename(name))
    if match is None:
        return None
    return chan_path / match.group(0)


def _coerce_int(value: Any, field: str, default: int = 0) -> int:
    """Converte `value` em inteiro não negativo ou levanta ValueError.

    Aceita int e texto só de dígitos (o que o cliente envia); vazio, None e 0
    viram `default`. Recusa bool, float, lista, objeto e texto livre, que antes
    entravam no disco e derrubavam a listagem do canal inteiro.
    """
    if isinstance(value, bool) or not isinstance(value, (int, str, type(None))):
        raise ValueError(f"Campo '{field}' deve ser inteiro")
    if value is None or value == "" or value == 0:
        return default
    if isinstance(value, str) and not _INT_TEXT.fullmatch(value):
        raise ValueError(f"Campo '{field}' deve ser inteiro")
    number = int(value)
    if number < 0 or number > _INT_LIMIT:
        raise ValueError(f"Campo '{field}' fora do intervalo")
    return number


def _envelope_id(envelope: Dict[str, Any], ts: int) -> str:
    """Id estável: o mesmo envelope dá o mesmo id; envelopes diferentes não colidem."""
    canonical = json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"env_{ts}_{hashlib.sha256(canonical).hexdigest()[:20]}"


def _read_live_record(file_path: Path, now: int) -> Optional[Dict[str, Any]]:
    """Registro já gravado, se for objeto válido e ainda não tiver expirado."""
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and _coerce_int(data.get("expiresAt"), "expiresAt") >= now:
            return data
    except (ValueError, TypeError, OSError):
        pass
    return None


def store_envelope(channel_id: str, envelope: Dict[str, Any], ttl_seconds: int = DEFAULT_TTL_SECONDS) -> Dict[str, Any]:
    if not isinstance(envelope, dict):
        raise ValueError("Envelope deve ser um dicionário JSON")
    if not envelope.get("sender") or not envelope.get("sig"):
        raise ValueError("Envelope deve conter sender e sig")

    raw_bytes = json.dumps(envelope).encode("utf-8")
    if len(raw_bytes) > MAX_ENVELOPE_SIZE:
        raise ValueError(f"Envelope excede o tamanho máximo de {MAX_ENVELOPE_SIZE} bytes")

    ts = _coerce_int(envelope.get("timestamp"), "timestamp", int(time.time() * 1000))
    _coerce_int(envelope.get("serial"), "serial")
    msg_id = _envelope_id(envelope, ts)

    with _RELAY_LOCK:
        chan_path = ensure_channel_dir(channel_id)
        file_path = _stored_file(chan_path, f"{msg_id}.json")
        if file_path is None:
            raise ValueError("id de envelope inválido")
        existing = _read_live_record(file_path, int(time.time()))
        if existing is not None:
            return existing
        record = {
            "id": msg_id,
            "channelId": channel_id,
            "storedAt": int(time.time()),
            "expiresAt": int(time.time()) + ttl_seconds,
            "envelope": envelope,
        }
        file_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return record


def _load_listable(file_path: Path, now: int) -> Optional[Tuple[Dict[str, Any], int, int]]:
    """(envelope, timestamp, serial) de um arquivo do canal, ou None se não serve.

    Expirado é removido; ilegível ou com campos fora do formato é ignorado, para
    um arquivo ruim não derrubar a listagem do canal inteiro.
    """
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        expires = _coerce_int(data.get("expiresAt"), "expiresAt")
        env = data.get("envelope")
        if expires < now:
            file_path.unlink(missing_ok=True)
            return None
        ts = _coerce_int(env.get("timestamp"), "timestamp")
        return env, ts, _coerce_int(env.get("serial"), "serial")
    except (ValueError, TypeError, AttributeError, OSError):
        return None


def list_envelopes(channel_id: str, since_ts: int = 0, since_serial: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    """Envelopes do canal em ordem estável.

    Com `since_serial > 0` devolve `serial > since_serial` ordenados por serial:
    a página cortada em `limit` é contígua e o cliente pagina repetindo com
    `since_serial = maior serial recebido`. Sem ele, filtra `timestamp >= since_ts`.
    """
    with _RELAY_LOCK:
        try:
            chan_path = ensure_channel_dir(channel_id)
        except ValueError:
            return []

        now = int(time.time())
        by_serial = since_serial > 0
        entries = []
        for file in chan_path.glob("env_*.json"):
            stored = _stored_file(chan_path, file.name)
            if stored is None:
                continue
            loaded = _load_listable(stored, now)
            if loaded is None:
                continue
            env, ts, serial = loaded
            if (serial > since_serial) if by_serial else (ts >= since_ts):
                entries.append((serial, ts, env) if by_serial else (ts, serial, env))
        entries.sort(key=lambda item: item[:2])
        return [item[2] for item in entries[:limit]]


def _read_current_snapshot(snap_path: Path) -> Optional[Dict[str, Any]]:
    """Registro do snapshot atual, ou None se não existir ou estiver ilegível."""
    if not snap_path.is_file():
        return None
    try:
        curr = json.loads(snap_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return curr if isinstance(curr, dict) else None


def _assert_snapshot_advances(curr: Dict[str, Any], epoch: int, covered_serial: int) -> None:
    """Recusa snapshot que não avança a época ou que recua a cobertura.

    Recuar `coveredSerial` deixaria um buraco: os deltas entre o novo e o antigo
    já foram podados pelo snapshot anterior e o cold boot não os recuperaria.
    """
    curr_epoch = _coerce_int(curr.get("epoch"), "epoch")
    if epoch <= curr_epoch:
        raise ValueError(f"Época do snapshot ({epoch}) deve ser estritamente maior que a época atual ({curr_epoch})")
    curr_covered = _coerce_int(curr.get("coveredSerial"), "coveredSerial")
    if covered_serial < curr_covered:
        raise ValueError(f"coveredSerial ({covered_serial}) não pode ficar abaixo do atual ({curr_covered})")


def store_snapshot(channel_id: str, snapshot_data: Dict[str, Any], prune_older: bool = True) -> Dict[str, Any]:
    if not isinstance(snapshot_data, dict):
        raise ValueError("Snapshot deve ser um dicionário JSON")
    if not snapshot_data.get("snapshot"):
        raise ValueError("Snapshot deve conter o campo 'snapshot'")

    raw_bytes = json.dumps(snapshot_data).encode("utf-8")
    if len(raw_bytes) > MAX_SNAPSHOT_SIZE:
        raise ValueError(f"Snapshot excede limite de {MAX_SNAPSHOT_SIZE} bytes")

    epoch = _coerce_int(snapshot_data.get("epoch"), "epoch", 1)
    timestamp = _coerce_int(snapshot_data.get("timestamp"), "timestamp", int(time.time() * 1000))
    covered_raw = snapshot_data.get("coveredSerial") or snapshot_data.get("covered_serial")
    covered_serial = _coerce_int(covered_raw, "coveredSerial")

    with _RELAY_LOCK:
        chan_path = ensure_channel_dir(channel_id)
        snap_path = _stored_file(chan_path, "latest_snapshot.json")
        if snap_path is None:
            raise ValueError("nome de snapshot inválido")
        curr = _read_current_snapshot(snap_path)
        if curr is not None:
            _assert_snapshot_advances(curr, epoch, covered_serial)

        record = {
            "channelId": channel_id,
            "epoch": epoch,
            "timestamp": timestamp,
            "coveredSerial": covered_serial,
            "storedAt": int(time.time()),
            "data": snapshot_data,
        }
        snap_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")

        if prune_older:
            prune_covered_deltas(chan_path, covered_serial)
        return record


def get_latest_snapshot(channel_id: str) -> Optional[Dict[str, Any]]:
    with _RELAY_LOCK:
        try:
            chan_path = ensure_channel_dir(channel_id)
        except ValueError:
            return None
        snap_path = _stored_file(chan_path, "latest_snapshot.json")
        if snap_path is None or not snap_path.is_file():
            return None
        try:
            data = json.loads(snap_path.read_text(encoding="utf-8"))
            return data.get("data")
        except (json.JSONDecodeError, OSError):
            return None


def prune_covered_deltas(chan_path: Path, covered_serial: int) -> int:
    """Remove só os envelopes que o snapshot comprovadamente cobre (`0 < serial <= covered_serial`).

    O critério é o mesmo do cold boot (`since_serial`). Por timestamp, um delta
    com relógio atrasado e serial acima da cobertura seria apagado em silêncio.
    Envelope sem serial não tem como ser provado coberto e fica até o TTL.
    """
    removed = 0
    if covered_serial <= 0:
        return removed
    for file in chan_path.glob("env_*.json"):
        stored = _stored_file(chan_path, file.name)
        if stored is None:
            continue
        try:
            data = json.loads(stored.read_text(encoding="utf-8"))
            serial = _coerce_int(data.get("envelope", {}).get("serial"), "serial")
        except json.JSONDecodeError:
            stored.unlink(missing_ok=True)
            removed += 1
            continue
        except (ValueError, TypeError, AttributeError, OSError):
            continue
        if 0 < serial <= covered_serial:
            stored.unlink(missing_ok=True)
            removed += 1
    return removed
