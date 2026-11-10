"""Cofres de recuperação na memória central (`/memory/vault/<endereço>`).

O relay guarda o envelope cifrado e não consegue abri-lo. Desde o PM-90, só aceita e serve o formato v2
(sal e iterações no envelope) ou a marca de revogado que o dono grava por cima de um cofre antigo.
Registros em formato antigo continuam no disco, mas não saem mais daqui.

PM-94: cada cofre tem um dono. O aparelho manda uma prova do dono (`ownerToken`, 32 bytes em hex derivados da
Senha Soberana por PBKDF2 com 600 mil iterações); o relay guarda só o SHA-256 dela (`ownerHash`). Depois disso,
regravar o cofre exige a mesma prova. Cofre v2 novo sem prova é recusado. Registro antigo sem dono aceita a
primeira gravação com prova, que passa a ser o dono.
"""

import hashlib
import hmac
import json
from typing import Any, Dict, Optional, Tuple

from relay import central_memory

VAULT_MIN_ITERATIONS = 100_000
VAULT_MAX_ITERATIONS = 5_000_000
OWNER_FIELD = "ownerHash"

SAVED = "saved"
INVALID = "invalid"
FORBIDDEN = "forbidden"


def is_servable_vault(record: Any) -> bool:
    """PM-90: só cofre v2 (sal e iterações no envelope) ou a marca de revogado entra e sai daqui.

    Registros em formato antigo continuam no disco, mas não são mais servidos nem aceitos.
    """
    if not isinstance(record, dict):
        return False
    if record.get("revoked") is True:
        return True
    iterations = record.get("iter")
    return (
        record.get("v") == 2
        and bool(record.get("salt"))
        and isinstance(iterations, int)
        and VAULT_MIN_ITERATIONS <= iterations <= VAULT_MAX_ITERATIONS
    )


def _vault_file(lookup_key: str):
    clean = str(lookup_key or "").strip().lower()
    if not central_memory._is_valid_id(clean):
        return None
    return central_memory.MEMORY_DIR / "vaults" / f"{clean}.json"


def _read_stored(vault_file) -> Optional[Dict[str, Any]]:
    if vault_file is None or not vault_file.is_file():
        return None
    try:
        stored = json.loads(vault_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return stored if isinstance(stored, dict) else None


def owner_hash(token: Any) -> Optional[str]:
    """SHA-256 da prova do dono; None se a prova não tem o formato esperado (64 dígitos hex)."""
    text = str(token or "").strip().lower()
    if len(text) != 64:
        return None
    try:
        raw = bytes.fromhex(text)
    except ValueError:
        return None
    return hashlib.sha256(raw).hexdigest()


def get_vault(lookup_key: str) -> Optional[Dict[str, Any]]:
    stored = _read_stored(_vault_file(lookup_key))
    if not stored or not is_servable_vault(stored):
        return None
    return {k: v for k, v in stored.items() if k != OWNER_FIELD}


def _split_payload(payload: Any) -> Tuple[Any, Any]:
    if isinstance(payload, dict) and "record" in payload:
        return payload.get("record"), payload.get("ownerToken")
    return payload, None


def _authorize(stored: Optional[Dict[str, Any]], record: Dict[str, Any], token: Any) -> Tuple[str, Optional[str]]:
    """Decide se a gravação entra e com qual dono fica."""
    current = (stored or {}).get(OWNER_FIELD)
    presented = owner_hash(token)
    if current:
        if presented and hmac.compare_digest(presented, current):
            return SAVED, current
        return FORBIDDEN, None
    if token is not None and not presented:
        return INVALID, None
    if not presented and record.get("revoked") is not True:
        return FORBIDDEN, None
    return SAVED, presented


def save_vault(lookup_key: str, payload: Any) -> str:
    """Grava o cofre se a prova do dono confere. Devolve `saved`, `invalid` ou `forbidden`."""
    vault_file = _vault_file(lookup_key)
    record, token = _split_payload(payload)
    if vault_file is None or not is_servable_vault(record):
        return INVALID
    status, owner = _authorize(_read_stored(vault_file), record, token)
    if status != SAVED:
        return status
    stored = {k: v for k, v in record.items() if k != OWNER_FIELD}
    if owner:
        stored[OWNER_FIELD] = owner
    try:
        vault_file.parent.mkdir(parents=True, exist_ok=True)
        body = json.dumps(stored, ensure_ascii=False)
        central_memory._atomic_write_bytes(vault_file, body.encode("utf-8"))
        return SAVED
    except OSError:
        return INVALID
