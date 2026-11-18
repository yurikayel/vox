#!/usr/bin/env python3
"""
Vox Relay — Módulo de Inbox Efêmero com TTL (Fase 4)
Armazena envelopes criptografados ponta-a-ponta (ECDH + AES-GCM) em disco com validade de 72h.
Nunca armazena nem inspeciona o texto claro (plaintext).
"""

import hashlib
import hmac
import json
import threading
import time
import os
import re
from pathlib import Path

from relay.safe_path import child_of

# Depois de `sanitize_filename` só sobram letras/dígitos (Unicode, como `str.isalnum`), `-` e `_`.
_ADDR_NAME = re.compile(r"[\w-]+")
_MESSAGE_NAME = re.compile(r"[\w-]*\.json")

DEFAULT_TTL_SECONDS = 72 * 3600  # 72 horas
MAX_ENVELOPE_SIZE = 32 * 1024     # 32 KB por mensagem

# O relay atende uma conexão por thread: escrever, ler, apagar e expurgar a mesma caixa não podem se misturar
# (um leitor veria o JSON pela metade e apagaria a mensagem como se fosse lixo).
_INBOX_LOCK = threading.RLock()

DELETED = "deleted"
NOT_FOUND = "not_found"
FORBIDDEN = "forbidden"


def _delete_hash(envelope: dict):
    """PM-94: hash da chave de apagar que vai cifrada para o destinatário (`del`). None em envelope antigo."""
    sealed = envelope.get("del")
    if sealed is None:
        return None
    digest = str(sealed.get("hash") or "").lower() if isinstance(sealed, dict) else ""
    if len(digest) != 64 or not all(c in "0123456789abcdef" for c in digest) or not sealed.get("ct"):
        raise ValueError("Campo del inválido: precisa de hash SHA-256 em hex e ct")
    return digest


def resolve_inbox_dir(env=None):
    raw = str((env if env is not None else os.environ).get("VOX_RELAY_INBOX_DIR") or "").strip()
    if raw:
        return Path(raw).resolve()
    base = str((env if env is not None else os.environ).get("VOX_RELAY_CACHE_DIR") or "").strip()
    if base:
        return Path(base).resolve() / "inbox"
    return Path(__file__).resolve().parent / ".inbox"


INBOX_DIR = resolve_inbox_dir()


def set_inbox_dir(path):
    global INBOX_DIR
    INBOX_DIR = Path(path).resolve()
    return INBOX_DIR



def ensure_inbox_dir():
    INBOX_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    return "".join(c for c in str(name) if c.isalnum() or c in ("-", "_"))


def _addr_dir(to_address: str) -> Path:
    """Pasta da caixa do endereço, dentro de INBOX_DIR; `ValueError` se o nome não der caminho seguro."""
    return child_of(INBOX_DIR, sanitize_filename(to_address), _ADDR_NAME)


def _message_file(addr_dir: Path, message_id: str) -> Path:
    """Arquivo da mensagem dentro da caixa; `ValueError` se o nome não der caminho seguro."""
    return child_of(addr_dir, f"{sanitize_filename(message_id)}.json", _MESSAGE_NAME)


def store_envelope(to_address: str, envelope: dict, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> dict:
    with _INBOX_LOCK:
        return _store_envelope_locked(to_address, envelope, ttl_seconds)


def _store_envelope_locked(to_address: str, envelope: dict, ttl_seconds: int) -> dict:
    if not to_address or not isinstance(to_address, str):
        raise ValueError("Endereço de destino inválido")
    if not envelope or not isinstance(envelope, dict):
        raise ValueError("Envelope inválido")

    msg_id = envelope.get("id") or f"dm_{int(time.time() * 1000)}"
    if envelope.get("v") != 1 or not envelope.get("ephPub") or not envelope.get("ct"):
        raise ValueError("Envelope deve conter formato v:1 com ephPub e ct")

    raw_bytes = json.dumps(envelope).encode("utf-8")
    if len(raw_bytes) > MAX_ENVELOPE_SIZE:
        raise ValueError(f"Envelope excede limite de {MAX_ENVELOPE_SIZE} bytes")

    ensure_inbox_dir()
    clean_addr = sanitize_filename(to_address)
    clean_id = sanitize_filename(msg_id)
    try:
        addr_dir = _addr_dir(to_address)
        target_file = _message_file(addr_dir, msg_id)
    except ValueError as err:
        raise ValueError("Endereço de destino inválido") from err
    addr_dir.mkdir(parents=True, exist_ok=True)

    now = time.time()
    expires_at = now + ttl_seconds
    record = {
        "id": clean_id,
        "to": clean_addr,
        "from": str(envelope.get("from", "")),
        "receivedAt": int(now),
        "expiresAt": int(expires_at),
        "envelope": envelope,
    }
    delete_hash = _delete_hash(envelope)
    if delete_hash:
        record["delHash"] = delete_hash

    target_file.write_text(json.dumps(record), encoding="utf-8")

    return {
        "status": "queued",
        "id": clean_id,
        "to": clean_addr,
        "expiresAt": int(expires_at),
        "sizeBytes": len(raw_bytes),
    }


def get_envelopes(to_address: str) -> list:
    with _INBOX_LOCK:
        return _get_envelopes_locked(to_address)


def _get_envelopes_locked(to_address: str) -> list:
    if not to_address:
        return []
    try:
        addr_dir = _addr_dir(to_address)
    except ValueError:
        return []
    if not addr_dir.is_dir():
        return []

    now = time.time()
    results = []
    for f in list(addr_dir.glob("*.json")):
        try:
            content = json.loads(f.read_text(encoding="utf-8"))
            if content.get("expiresAt", 0) <= now:
                f.unlink(missing_ok=True)
                continue
            if "envelope" in content:
                results.append(content["envelope"])
        except Exception:
            f.unlink(missing_ok=True)

    return results


def _token_matches(token, expected_hash) -> bool:
    try:
        presented = hashlib.sha256(bytes.fromhex(str(token or ""))).hexdigest()
    except ValueError:
        return False
    return bool(token) and hmac.compare_digest(presented, expected_hash)


def delete_envelope(to_address: str, message_id: str, token: str = None) -> str:
    """Apaga um envelope. Desde o PM-94, envelope com `delHash` só sai com a chave de apagar do destinatário."""
    with _INBOX_LOCK:
        return _delete_envelope_locked(to_address, message_id, token)


def _delete_envelope_locked(to_address: str, message_id: str, token) -> str:
    if not to_address or not message_id:
        return NOT_FOUND
    try:
        target_file = _message_file(_addr_dir(to_address), message_id)
    except ValueError:
        return NOT_FOUND
    if not target_file.is_file():
        return NOT_FOUND
    try:
        expected = json.loads(target_file.read_text(encoding="utf-8")).get("delHash")
    except (OSError, ValueError):
        expected = None
    if expected and not _token_matches(token, expected):
        return FORBIDDEN
    target_file.unlink(missing_ok=True)
    return DELETED


def purge_all_expired():
    with _INBOX_LOCK:
        return _purge_all_expired_locked()


def _purge_all_expired_locked():
    if not INBOX_DIR.is_dir():
        return 0
    now = time.time()
    purged = 0
    for addr_dir in INBOX_DIR.iterdir():
        if not addr_dir.is_dir():
            continue
        for f in list(addr_dir.glob("*.json")):
            try:
                content = json.loads(f.read_text(encoding="utf-8"))
                if content.get("expiresAt", 0) <= now:
                    f.unlink(missing_ok=True)
                    purged += 1
            except Exception:
                f.unlink(missing_ok=True)
                purged += 1
        if not any(addr_dir.iterdir()):
            try:
                addr_dir.rmdir()
            except Exception:
                pass
    return purged
