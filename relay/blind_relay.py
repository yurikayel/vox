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

from relay import snapshot_auth
from relay.safe_path import child_of, only_chars

MAX_ENVELOPE_SIZE = 64 * 1024  # 64 KB por envelope
MAX_SNAPSHOT_SIZE = 512 * 1024  # 512 KB por snapshot consolidado
DEFAULT_TTL_SECONDS = 7 * 86400  # 7 dias de retenção para envelopes de canal

_RELAY_LOCK = threading.RLock()
_INT_TEXT = re.compile(r"\d{1,19}")
_INT_LIMIT = 2**63
_SNAPSHOT_NAME = "latest_snapshot.json"
_ENVELOPE_PREFIX = "env_"
_ENVELOPE_SUFFIX = ".json"
_DIGITS = frozenset("0123456789")
_HEX = frozenset("0123456789abcdef")


def _is_stored_name(text: str) -> bool:
    """True para `latest_snapshot.json` ou `env_<1-19 dígitos>_<20 hex minúsculos>.json`."""
    if text == _SNAPSHOT_NAME:
        return True
    if not (text.startswith(_ENVELOPE_PREFIX) and text.endswith(_ENVELOPE_SUFFIX)):
        return False
    middle = text[len(_ENVELOPE_PREFIX) : -len(_ENVELOPE_SUFFIX)]
    stamp, sep, digest = middle.partition("_")
    return bool(sep) and only_chars(stamp, _DIGITS, 1, 19) and only_chars(digest, _HEX, 20, 20)


def resolve_relay_dir(env: Optional[Dict[str, str]] = None) -> Path:
    """Resolve o diretório do relay cego: `VOX_RELAY_BLIND_DIR`, senão `<cache>/blind_relay`, senão o padrão local."""
    environ = env if env is not None else os.environ
    raw = str(environ.get("VOX_RELAY_BLIND_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    base = str(environ.get("VOX_RELAY_CACHE_DIR") or "").strip()
    if base:
        return Path(base).resolve() / "blind_relay"
    return Path(__file__).resolve().parent / ".blind_relay"


# Exceções de `store_snapshot` (RFC 0002): quem chama o relay cego não importa `snapshot_auth`.
SnapshotConflict = snapshot_auth.SnapshotConflict
SnapshotForbidden = snapshot_auth.SnapshotForbidden

RELAY_DIR = resolve_relay_dir()


def set_relay_dir(path: Path) -> Path:
    """Troca o diretório do relay cego em uso e devolve o caminho resolvido (usado nos testes)."""
    global RELAY_DIR
    RELAY_DIR = Path(path).resolve()
    return RELAY_DIR


def _channel_dir(channel_id: str) -> Path:
    """Resolve e valida o diretório do canal dentro de `RELAY_DIR`, sem criar nada no disco."""
    stripped = "".join(c for c in str(channel_id) if c.isalnum() or c in ("-", "_"))
    base = os.path.basename(stripped)
    try:
        return child_of(RELAY_DIR, base)
    except ValueError as err:
        raise ValueError("ID de canal comunitário inválido") from err


def ensure_channel_dir(channel_id: str) -> Path:
    """Cria (se preciso) e devolve o diretório de um canal validado."""
    chan_path = _channel_dir(channel_id)
    chan_path.mkdir(parents=True, exist_ok=True)
    return chan_path


def _stored_file(chan_path: Path, name: str) -> Optional[Path]:
    """Arquivo do canal só se o nome é dos nossos (sem `..` e sem symlink externo)."""
    try:
        return child_of(chan_path, os.path.basename(name), _is_stored_name)
    except ValueError:
        return None


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


def store_envelope(
    channel_id: str, envelope: Dict[str, Any], ttl_seconds: int = DEFAULT_TTL_SECONDS
) -> Dict[str, Any]:
    """Valida e grava um envelope assinado no canal, respeitando tamanho, TTL e cotas.\n\n    Args:\n        channel_id: Identificador do canal.\n        envelope: Envelope JSON com ao menos `sender` e `sig`.\n        ttl_seconds: Validade do envelope, em segundos.\n\n    Returns:\n        Metadados do envelope gravado.\n\n    Raises:\n        ValueError: Se o envelope for inválido ou grande demais."""
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


def list_envelopes(
    channel_id: str, since_ts: int = 0, since_serial: int = 0, limit: int = 100
) -> List[Dict[str, Any]]:
    """Envelopes do canal em ordem estável.

    Com `since_serial > 0` devolve `serial > since_serial` ordenados por serial:
    a página cortada em `limit` é contígua e o cliente pagina repetindo com
    `since_serial = maior serial recebido`. Sem ele, filtra `timestamp >= since_ts`.
    """
    with _RELAY_LOCK:
        try:
            chan_path = _channel_dir(channel_id)
        except ValueError:
            return []
        if not chan_path.is_dir():
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
    """Recusa snapshot que não avança a época ou que recua a cobertura (`SnapshotConflict`, 409).

    Recuar `coveredSerial` deixaria um buraco: os deltas entre o novo e o antigo
    já foram podados pelo snapshot anterior e o cold boot não os recuperaria.
    """
    curr_epoch = _coerce_int(curr.get("epoch"), "epoch")
    curr_covered = _coerce_int(curr.get("coveredSerial"), "coveredSerial")
    if epoch <= curr_epoch:
        raise snapshot_auth.SnapshotConflict(
            (
                f"Época do snapshot ({epoch}) deve ser estritamente maior que "
                f"a época atual ({curr_epoch})"
            ),
            curr_epoch,
            curr_covered,
        )
    if covered_serial < curr_covered:
        raise snapshot_auth.SnapshotConflict(
            f"coveredSerial ({covered_serial}) não pode ficar abaixo do atual ({curr_covered})",
            curr_epoch,
            curr_covered,
        )


def _max_live_serial(chan_path: Path) -> int:
    """Maior `serial` entre os envelopes vivos do canal (0 se não há nenhum com serial)."""
    now = int(time.time())
    top = 0
    for file in chan_path.glob("env_*.json"):
        stored = _stored_file(chan_path, file.name)
        loaded = _load_listable(stored, now) if stored is not None else None
        if loaded is not None:
            top = max(top, loaded[2])
    return top


def _owner_numbers(record: Optional[Dict[str, Any]]) -> Optional[Tuple[int, int]]:
    """`(epoch, coveredSerial)` do registro do dono, ou None se o canal não tem dono."""
    if snapshot_auth.stored_owner(record) is None:
        return None
    return _coerce_int(record.get("epoch"), "epoch"), _coerce_int(
        record.get("coveredSerial"), "coveredSerial"
    )


def _is_same_snapshot(record: Optional[Dict[str, Any]], epoch: int, digest: str) -> bool:
    """True se o dono já guardou exatamente este snapshot (mesma época e mesmo resumo)."""
    if snapshot_auth.stored_owner(record) is None:
        return False
    return record.get("digest") == digest and _coerce_int(record.get("epoch"), "epoch") == epoch


def _check_snapshot_rules(
    chan_path: Path, curr: Optional[Dict[str, Any]], authed: bool, epoch: int, covered_serial: int
) -> None:
    """Regras de avanço do snapshot.

    Autenticado ignora registro sem dono (legado ou `auth: false`) e tem tetos de salto.
    """
    if not authed:
        if curr is not None:
            _assert_snapshot_advances(curr, epoch, covered_serial)
        return
    owner_numbers = _owner_numbers(curr)
    if owner_numbers is not None:
        _assert_snapshot_advances(curr, epoch, covered_serial)
    snapshot_auth.check_jumps(owner_numbers, _max_live_serial(chan_path), epoch, covered_serial)


def _snapshot_record(
    channel_id: str,
    snapshot_data: Dict[str, Any],
    numbers: Tuple[int, int, int],
    proof_hash: Optional[str],
) -> Dict[str, Any]:
    """Registro de `latest_snapshot.json`.

    Só o autenticado leva `ownerHash`, `auth: true` e o resumo.
    """
    epoch, timestamp, covered_serial = numbers
    record = {
        "channelId": channel_id,
        "epoch": epoch,
        "timestamp": timestamp,
        "coveredSerial": covered_serial,
        "storedAt": int(time.time()),
        "data": snapshot_data,
        "auth": proof_hash is not None,
    }
    if proof_hash is not None:
        record[snapshot_auth.OWNER_FIELD] = proof_hash
        record["digest"] = snapshot_auth.snapshot_digest(snapshot_data)
    return record


def _snapshot_numbers(snapshot_data: Dict[str, Any]) -> Tuple[int, int, int]:
    """Valida o corpo do snapshot e devolve `(epoch, timestamp, coveredSerial)`."""
    if not isinstance(snapshot_data, dict):
        raise ValueError("Snapshot deve ser um dicionário JSON")
    if not snapshot_data.get("snapshot"):
        raise ValueError("Snapshot deve conter o campo 'snapshot'")
    if len(json.dumps(snapshot_data).encode("utf-8")) > MAX_SNAPSHOT_SIZE:
        raise ValueError(f"Snapshot excede limite de {MAX_SNAPSHOT_SIZE} bytes")
    epoch = _coerce_int(snapshot_data.get("epoch"), "epoch", 1)
    timestamp = _coerce_int(snapshot_data.get("timestamp"), "timestamp", int(time.time() * 1000))
    covered_raw = snapshot_data.get("coveredSerial") or snapshot_data.get("covered_serial")
    return epoch, timestamp, _coerce_int(covered_raw, "coveredSerial")


def store_snapshot(
    channel_id: str,
    snapshot_data: Dict[str, Any],
    prune_older: bool = True,
    proof: Optional[str] = None,
) -> Dict[str, Any]:
    """Grava snapshot do canal e devolve registro público (nunca com `ownerHash`).

    `proof` é o valor de `X-Vox-Snapshot-Proof` (None se ausente).
    Autorizar, checar regras e gravar é uma só decisão sob `_RELAY_LOCK` (RFC 0002).
    A poda só roda para snapshot autenticado; reenvio idêntico do dono devolve o
    registro com `idempotent: true` sem regravar nem podar.
    Levanta `SnapshotForbidden` (403), `SnapshotConflict` (409) ou `ValueError` (400).
    """
    numbers = _snapshot_numbers(snapshot_data)
    presented = snapshot_auth.proof_hash(proof)
    with _RELAY_LOCK:
        chan_path = ensure_channel_dir(channel_id)
        snap_path = _stored_file(chan_path, _SNAPSHOT_NAME)
        if snap_path is None:
            raise ValueError("nome de snapshot inválido")
        curr = _read_current_snapshot(snap_path)
        authed = snapshot_auth.authorize(curr, presented)
        if authed and _is_same_snapshot(
            curr, numbers[0], snapshot_auth.snapshot_digest(snapshot_data)
        ):
            return snapshot_auth.public_view(curr, idempotent=True)
        _check_snapshot_rules(chan_path, curr, authed, numbers[0], numbers[2])
        record = _snapshot_record(channel_id, snapshot_data, numbers, presented if authed else None)
        snap_path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        if authed and prune_older:
            prune_covered_deltas(chan_path, numbers[2])
        return snapshot_auth.public_view(record)


def get_latest_snapshot(channel_id: str) -> Optional[Dict[str, Any]]:
    """Devolve o snapshot mais recente do canal, ou None se não houver (ou o canal for inválido)."""
    with _RELAY_LOCK:
        try:
            chan_path = _channel_dir(channel_id)
        except ValueError:
            return None
        if not chan_path.is_dir():
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
