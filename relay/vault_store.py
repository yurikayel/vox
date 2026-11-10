"""Cofres de recuperação na memória central (`/memory/vault/<endereço>`).

O relay guarda o envelope cifrado e não consegue abri-lo. Desde o PM-90, só aceita e serve o formato v2
(sal e iterações no envelope) ou a marca de revogado que o dono grava por cima de um cofre antigo.
Registros em formato antigo continuam no disco, mas não saem mais daqui.
"""

import json
from typing import Any, Dict, Optional

from relay import central_memory

VAULT_MIN_ITERATIONS = 100_000
VAULT_MAX_ITERATIONS = 5_000_000


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


def get_vault(lookup_key: str) -> Optional[Dict[str, Any]]:
    clean = str(lookup_key or "").strip().lower()
    if not central_memory._is_valid_id(clean):
        return None
    vault_file = central_memory.MEMORY_DIR / "vaults" / f"{clean}.json"
    if not vault_file.is_file():
        return None
    try:
        record = json.loads(vault_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return record if is_servable_vault(record) else None


def save_vault(lookup_key: str, payload: Any) -> bool:
    clean = str(lookup_key or "").strip().lower()
    if not central_memory._is_valid_id(clean) or not payload:
        return False
    record = payload.get("record") if isinstance(payload, dict) and "record" in payload else payload
    if not is_servable_vault(record):
        return False
    vaults_dir = central_memory.MEMORY_DIR / "vaults"
    try:
        vaults_dir.mkdir(parents=True, exist_ok=True)
        body = json.dumps(record, ensure_ascii=False)
        central_memory._atomic_write_bytes(vaults_dir / f"{clean}.json", body.encode("utf-8"))
        return True
    except OSError:
        return False
