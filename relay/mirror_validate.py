"""Validação estrutural v1 para POST /vox/mirror (V-P06)."""

from __future__ import annotations

import json
import re
from typing import Any

MAX_MIRROR_BODY_BYTES = 256 * 1024
MAX_TOPICS = 500
MANIFEST_VERSION = 0

COMMUNITY_ID_RE = re.compile(r"^[a-zA-Z0-9._-]{1,128}$")
TX_ID_RE = re.compile(r"^[A-Za-z0-9_-]{43}$")
PIN_ROLES = frozenset({"community", "topic", "reply", "post", "blob", "index"})


def _err(code: str, message: str) -> dict[str, str]:
    return {"code": code, "error": message}


def _validate_pin_entry(raw: dict[str, Any]) -> tuple[bool, str | None]:
    tx_id = str(raw.get("txId") or raw.get("id") or "").strip()
    if not TX_ID_RE.match(tx_id):
        return False, "txId inválido (43 caracteres base64url)."
    role = str(raw.get("role") or raw.get("kind") or "blob").strip().lower()
    if role and role not in PIN_ROLES:
        return False, "role de pin não reconhecida."
    sha256 = str(raw.get("sha256") or "").strip().lower()
    if sha256 and not re.fullmatch(r"[a-f0-9]{64}", sha256):
        return False, "sha256 deve ser hex de 64 caracteres."
    return True, None


def validate_cache_manifest_body(body: dict[str, Any]) -> tuple[bool, str | None]:
    """Regras v0 de cache-manifest.js (sem assinatura)."""
    community_id = str(body.get("communityId") or "").strip()
    if not community_id:
        return False, "communityId obrigatório."
    version = body.get("v", body.get("manifestVersion", MANIFEST_VERSION))
    try:
        v = int(version)
    except (TypeError, ValueError):
        return False, "manifestVersion incompatível."
    if v != MANIFEST_VERSION:
        return False, "manifestVersion incompatível."

    pins = body.get("pins")
    if not isinstance(pins, list):
        return False, "pins não pode ser vazio."
    if not pins:
        return False, "pins não pode ser vazio."
    if len(pins) > 512:
        return False, "pins excede limite de 512 entradas."

    seen: set[str] = set()
    for pin in pins:
        if not isinstance(pin, dict):
            return False, "pin inválido."
        ok, msg = _validate_pin_entry(pin)
        if not ok:
            return False, msg
        tx_id = str(pin.get("txId") or pin.get("id") or "").strip()
        if tx_id in seen:
            return False, "txId duplicado no manifesto."
        seen.add(tx_id)

    prev = body.get("previousManifestTx")
    if prev is not None and str(prev).strip():
        if not TX_ID_RE.match(str(prev).strip()):
            return False, "previousManifestTx inválido."
    return True, None


def validate_mirror_body(raw: bytes) -> tuple[bool, dict[str, Any] | None, dict[str, str] | None, int]:
    """
    Retorna (ok, payload, error_json, http_status).
    http_status só é relevante quando ok é False.
    """
    if len(raw) > MAX_MIRROR_BODY_BYTES:
        return (
            False,
            None,
            _err("mirror.body_too_large", "Corpo excede 256 KiB."),
            413,
        )

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False, None, _err("mirror.invalid_json", "JSON inválido."), 400

    if not isinstance(payload, dict):
        return False, None, _err("mirror.not_object", "Corpo deve ser um objeto JSON."), 400

    comm_raw = payload.get("communityId")
    if comm_raw is None or not isinstance(comm_raw, str):
        return (
            False,
            None,
            _err("mirror.community_id_invalid", "communityId inválido ou ausente."),
            400,
        )
    comm_id = comm_raw.strip()
    if not comm_id or not COMMUNITY_ID_RE.match(comm_id):
        return (
            False,
            None,
            _err("mirror.community_id_invalid", "communityId inválido ou ausente."),
            400,
        )

    if "topics" in payload:
        topics = payload["topics"]
        if not isinstance(topics, list):
            return False, None, _err("mirror.topics_invalid", "topics deve ser um array."), 400
        if len(topics) > MAX_TOPICS:
            return (
                False,
                None,
                _err("mirror.topics_limit", f"topics excede limite de {MAX_TOPICS} entradas."),
                400,
            )

    if "cacheManifest" in payload and payload["cacheManifest"] is not None:
        cm = payload["cacheManifest"]
        if not isinstance(cm, dict):
            return (
                False,
                None,
                _err("mirror.cache_manifest_invalid", "cacheManifest deve ser um objeto."),
                400,
            )
        ok, msg = validate_cache_manifest_body(cm)
        if not ok:
            return (
                False,
                None,
                _err("mirror.cache_manifest_invalid", msg or "cacheManifest inválido."),
                400,
            )

    return True, payload, None, 200
