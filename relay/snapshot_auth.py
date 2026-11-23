"""Autenticação do snapshot do relay cego (RFC 0002, opção A).

O relay não tem conta nem segredo do canal. Quem pode emitir snapshot (os autores)
calcula no aparelho `HMAC-SHA256(segredoSnapshot, "vox-snapshot-proof-v1|<host>|<canal>")`
e manda o resultado (64 hex) no cabeçalho `X-Vox-Snapshot-Proof`. O relay **não consegue
recalcular** essa prova (não tem o segredo, e é isso que o torna cego): trata-a como valor
opaco e guarda só o SHA-256 dela (`ownerHash`). O vínculo a `host` e `channelId` mora no
cálculo do cliente: a prova feita para outro relay ou outro canal é outro valor e não
confere com o dono guardado aqui.

Este módulo reúne o que não depende do disco: o modo (`compat`/`enforce`), os tetos de
salto, o formato da prova, a decisão de autorização e a visão pública do registro. Ler,
decidir e gravar acontece sob o lock do relay em `blind_relay.store_snapshot`.
"""

import hashlib
import hmac
import json
import os
from typing import Any, Dict, Mapping, Optional

from relay.safe_path import only_chars

PROOF_HEADER = "X-Vox-Snapshot-Proof"
OWNER_FIELD = "ownerHash"
MODE_COMPAT = "compat"
MODE_ENFORCE = "enforce"
DEFAULT_MAX_COVERED_JUMP = 1000
DEFAULT_MAX_EPOCH_JUMP = 16

_HEX = frozenset("0123456789abcdef")
_PROOF_LENGTH = 64
_PRIVATE_FIELDS = (OWNER_FIELD, "digest", "auth")


class SnapshotForbidden(Exception):
    """Prova do dono ausente ou incorreta (o servidor responde 403).

    Não é `ValueError` de propósito.
    """


class SnapshotConflict(ValueError):
    """Snapshot em conflito com o estado do canal.

    O servidor responde 409 com a época e a cobertura atuais.
    Subclasse de `ValueError`: quem já trata `ValueError` como "snapshot recusado"
    continua funcionando.
    """

    def __init__(self, message: str, current_epoch: int, current_covered_serial: int):
        """Guarda a mensagem e a época e o serial coberto atuais do canal."""
        super().__init__(message)
        self.current_epoch = current_epoch
        self.current_covered_serial = current_covered_serial


def auth_mode(env: Optional[Mapping[str, str]] = None) -> str:
    """`enforce` se `VOX_RELAY_SNAPSHOT_AUTH=enforce`; outro valor é `compat`."""
    raw = (env if env is not None else os.environ).get("VOX_RELAY_SNAPSHOT_AUTH") or ""
    return MODE_ENFORCE if raw.strip().lower() == MODE_ENFORCE else MODE_COMPAT


def _env_limit(name: str, default: int, env: Optional[Mapping[str, str]]) -> int:
    """Inteiro positivo da variável de ambiente; vazio, inválido ou menor que 1 volta ao padrão."""
    raw = str((env if env is not None else os.environ).get(name) or "").strip()
    if not raw.isascii() or not raw.isdigit() or len(raw) > 9:
        return default
    return int(raw) or default


def max_covered_jump(env: Optional[Mapping[str, str]] = None) -> int:
    """Teto de `coveredSerial` acima do que o relay viu (padrão 1000)."""
    return _env_limit("VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP", DEFAULT_MAX_COVERED_JUMP, env)


def max_epoch_jump(env: Optional[Mapping[str, str]] = None) -> int:
    """Teto de salto de `epoch` sobre a época do dono (padrão 16)."""
    return _env_limit("VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP", DEFAULT_MAX_EPOCH_JUMP, env)


def proof_hash(proof: Any) -> Optional[str]:
    """SHA-256 da prova (`ownerHash`), `None` se ausente, `ValueError` se mal formada.

    Mal formado é tudo que não for 64 dígitos hexadecimais (maiúsculas normalizadas).
    A mensagem de erro nunca repete o valor recebido.
    """
    if proof is None:
        return None
    text = str(proof).strip().lower()
    if len(text) != _PROOF_LENGTH or not only_chars(text, _HEX, _PROOF_LENGTH, _PROOF_LENGTH):
        raise ValueError(f"{PROOF_HEADER} deve ter 64 dígitos hexadecimais")
    return hashlib.sha256(bytes.fromhex(text)).hexdigest()


def snapshot_digest(snapshot_data: Dict[str, Any]) -> str:
    """SHA-256 do corpo do snapshot em JSON canônico (chaves ordenadas, sem espaços)."""
    canonical = json.dumps(
        snapshot_data, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def stored_owner(record: Optional[Dict[str, Any]]) -> Optional[str]:
    """`ownerHash` do registro, só se ele é autenticado e o valor tem o formato certo.

    Registro legado (sem `auth`), `auth: false` e corrompido não têm dono: nunca valem
    contra um snapshot autenticado.
    """
    if not isinstance(record, dict) or record.get("auth") is not True:
        return None
    owner = record.get(OWNER_FIELD)
    ok = isinstance(owner, str) and only_chars(owner, _HEX, _PROOF_LENGTH, _PROOF_LENGTH)
    return owner if ok else None


def authorize(
    record: Optional[Dict[str, Any]], presented: Optional[str], mode: Optional[str] = None
) -> bool:
    """Decide se o snapshot entra e se é autenticado (`True`) ou legado de `compat` (`False`).

    Canal com dono: só a mesma prova (comparação em tempo constante).
    Canal sem dono: a prova válida vira o dono (quem prova primeiro); sem prova,
    `compat` aceita como `auth: false` e `enforce` recusa.
    Levanta `SnapshotForbidden` quando recusa.
    """
    owner = stored_owner(record)
    if owner is not None:
        if presented is not None and hmac.compare_digest(presented, owner):
            return True
        raise SnapshotForbidden("prova do dono do snapshot ausente ou incorreta")
    if presented is not None:
        return True
    if (mode or auth_mode()) == MODE_ENFORCE:
        raise SnapshotForbidden("este relay exige a prova do dono do snapshot")
    return False


def check_jumps(
    base: Optional[tuple],
    max_seen: int,
    epoch: int,
    covered_serial: int,
    env: Optional[Mapping[str, str]] = None,
) -> None:
    """Tetos do RFC 0002 §5 para snapshot autenticado (`ValueError` se passar).

    `base` é `(época, coveredSerial)` do dono, ou `None` se sem dono.
    `max_seen` é o maior `serial` entre envelopes vivos.
    Época: `1..16` sem dono, `+16` sobre a do dono.
    Cobertura: no máximo `max(cobertura do dono, max_seen) + 1000`.
    A ordem já foi conferida por `_assert_snapshot_advances`.
    """
    epoch_jump = max_epoch_jump(env)
    base_epoch, base_covered = base if base is not None else (0, 0)
    if epoch > base_epoch + epoch_jump:
        raise ValueError(
            f"Época do snapshot ({epoch}) salta mais de {epoch_jump} sobre a atual ({base_epoch})"
        )
    covered_jump = max_covered_jump(env)
    if covered_serial > max(base_covered, max_seen) + covered_jump:
        raise ValueError(
            f"coveredSerial ({covered_serial}) passa de {covered_jump} acima do que o relay já viu"
        )


def public_view(record: Dict[str, Any], idempotent: bool = False) -> Dict[str, Any]:
    """Registro como a resposta do `POST` o mostra: sem `ownerHash` nem campos internos.

    `auth` vira `"owner"` (autenticado) ou `false` (aceito sem prova em `compat`);
    `idempotent: true` marca o reenvio idêntico que não regravou nada.
    """
    view = {key: value for key, value in record.items() if key not in _PRIVATE_FIELDS}
    view["auth"] = "owner" if record.get("auth") is True else False
    if idempotent:
        view["idempotent"] = True
    return view
