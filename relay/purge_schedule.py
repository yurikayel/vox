"""Varredura periódica de expirados do relay e limites de leitura de `/tx`.

A limpeza antes era só preguiçosa: endereço ou canal sem leituras ficava no disco.
Este módulo roda uma thread daemon que varre os dois diretórios a cada
`VOX_RELAY_PURGE_INTERVAL_SECONDS` (padrão 900; `0` desliga). Cada pasta é varrida
com a trava do seu módulo tomada só enquanto é examinada, nunca durante a varredura toda.

A memória central e o cofre não têm TTL no código; não há o que varrer neles.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional

from relay import blind_relay, inbox

DEFAULT_PURGE_INTERVAL_SECONDS = 900.0
MIN_PURGE_INTERVAL_SECONDS = 1.0
DEFAULT_MAX_CACHE_MB = 512
DEFAULT_MAX_TX_MB = 32


def _env_number(name: str, default: float, env=None) -> Optional[float]:
    """Número não negativo da variável; vazio ou inválido volta o padrão."""
    raw = str((env if env is not None else os.environ).get(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value >= 0 and value == value and value != float("inf") else default


def resolve_purge_interval(env=None) -> float:
    """Segundos entre varreduras; 0 = desligada. Valor positivo abaixo do mínimo sobe ao mínimo."""
    value = _env_number("VOX_RELAY_PURGE_INTERVAL_SECONDS", DEFAULT_PURGE_INTERVAL_SECONDS, env)
    if value == 0:
        return 0.0
    return max(value, MIN_PURGE_INTERVAL_SECONDS)


def resolve_max_cache_bytes(env=None) -> Optional[int]:
    """Teto do cache em bytes: padrão 512 MB; `0` explícito = sem teto (None)."""
    value = _env_number("VOX_RELAY_MAX_CACHE_MB", DEFAULT_MAX_CACHE_MB, env)
    return None if value == 0 else int(value * 1024 * 1024)


def resolve_max_tx_bytes(env=None) -> int:
    """Maior resposta de gateway aceita em `/tx` (padrão 32 MB); `0` ou inválido volta o padrão."""
    value = _env_number("VOX_RELAY_MAX_TX_MB", DEFAULT_MAX_TX_MB, env)
    return int((value or DEFAULT_MAX_TX_MB) * 1024 * 1024)


def _expired(path: Path, now: float) -> bool:
    """Arquivo de registro vencido ou ilegível (ilegível é lixo, como na limpeza preguiçosa)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return not isinstance(data, dict) or data.get("expiresAt", 0) <= now
    except (OSError, ValueError, TypeError):
        return True


def _purge_dir(directory: Path, pattern: str, lock, now: float) -> int:
    """Apaga os registros vencidos sob a trava do módulo; remove pasta se esvaziar."""
    removed = 0
    with lock:
        for path in list(directory.glob(pattern)):
            if path.is_file() and _expired(path, now):
                path.unlink(missing_ok=True)
                removed += 1
        if not any(directory.iterdir()):
            try:
                directory.rmdir()
            except OSError:
                pass
    return removed


def _purge_root(root: Path, pattern: str, lock, now: float) -> int:
    """Varre cada subpasta de `root` em uma tomada de trava própria."""
    if not root.is_dir():
        return 0
    removed = 0
    for sub in list(root.iterdir()):
        try:
            if sub.is_dir():
                removed += _purge_dir(sub, pattern, lock, now)
        except OSError:
            continue
    return removed


def purge_expired_once(now: Optional[float] = None) -> dict:
    """Uma varredura: devolve quantos registros saíram do inbox e do canal cego."""
    moment = time.time() if now is None else now
    return {
        "inbox": _purge_root(inbox.INBOX_DIR, "*.json", inbox._INBOX_LOCK, moment),
        "blind": _purge_root(blind_relay.RELAY_DIR, "env_*.json", blind_relay._RELAY_LOCK, moment),
    }


class PurgeSweeper:
    """Thread daemon que repete `purge_expired_once` até `stop()`."""

    def __init__(self, interval: float, sweep: Callable[[], dict] = purge_expired_once):
        """Prepara o agendador com o intervalo (0 desliga) e a função de varredura."""
        self.interval = interval
        self._sweep = sweep
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> bool:
        """Inicia a thread; False se o intervalo é 0 (desligada) ou ela já roda."""
        if self.interval <= 0 or self._thread is not None:
            return False
        self._thread = threading.Thread(target=self._run, name="vox-relay-purge", daemon=True)
        self._thread.start()
        return True

    def _run(self) -> None:
        """Laço da thread: varre a cada intervalo até ser parada; falha na varredura não derruba o relay."""
        while not self._stop.wait(self.interval):
            try:
                self._sweep()
            except Exception as exc:  # a varredura nunca derruba o relay
                print(f"[purge] varredura falhou: {exc!r}", flush=True)

    def stop(self, timeout: float = 5.0) -> None:
        """Pede a parada e espera a thread terminar."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout)
            self._thread = None


def start_default_sweeper() -> PurgeSweeper:
    """Cria e inicia a varredura com o intervalo do ambiente (pode ficar desligada)."""
    sweeper = PurgeSweeper(resolve_purge_interval())
    sweeper.start()
    return sweeper
