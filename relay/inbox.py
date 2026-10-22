#!/usr/bin/env python3
"""
Vox Relay — Módulo de Inbox Efêmero com TTL (Fase 4)
Armazena envelopes criptografados ponta-a-ponta (ECDH + AES-GCM) em disco com validade de 72h.
Nunca armazena nem inspeciona o texto claro (plaintext).
"""

import json
import time
from pathlib import Path

DEFAULT_TTL_SECONDS = 72 * 3600  # 72 horas
MAX_ENVELOPE_SIZE = 32 * 1024     # 32 KB por mensagem
INBOX_DIR = Path(__file__).resolve().parent / ".inbox"


def ensure_inbox_dir():
    INBOX_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename(name: str) -> str:
    return "".join(c for c in str(name) if c.isalnum() or c in ("-", "_"))


def store_envelope(to_address: str, envelope: dict, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> dict:
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
    addr_dir = INBOX_DIR / clean_addr
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

    target_file = addr_dir / f"{clean_id}.json"
    target_file.write_text(json.dumps(record), encoding="utf-8")

    return {
        "status": "queued",
        "id": clean_id,
        "to": clean_addr,
        "expiresAt": int(expires_at),
        "sizeBytes": len(raw_bytes),
    }


def get_envelopes(to_address: str) -> list:
    if not to_address:
        return []
    clean_addr = sanitize_filename(to_address)
    addr_dir = INBOX_DIR / clean_addr
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


def delete_envelope(to_address: str, message_id: str) -> bool:
    if not to_address or not message_id:
        return False
    clean_addr = sanitize_filename(to_address)
    clean_id = sanitize_filename(message_id)
    target_file = INBOX_DIR / clean_addr / f"{clean_id}.json"
    if target_file.is_file():
        target_file.unlink(missing_ok=True)
        return True
    return False


def purge_all_expired():
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
