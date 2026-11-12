"""Corte da gênese no servidor: a memória central recusa o que o cliente já não aceita.

Os aparelhos (v7.82+) apagam e recusam as contas de teste e os posts anteriores à gênese, mas um
aparelho ainda na versão antiga reenviava tudo na primeira sincronização. Por isso o servidor aplica
a mesma regra na entrada e ao carregar o estado do disco.

- Cartão de perfil: recusado se a chave está na lista de contas de teste. A data do cartão não serve:
  cada aparelho regrava `updatedAt` com a hora em que o recebeu.
- Post: recusado se o autor está na lista ou se a data de criação (`ts`, `timestamp` ou `createdAt`)
  é anterior à gênese. Sem data de criação, fica (mesma regra de `isBeforeGenesisMs` no cliente).

A lista e a data vêm de `relay/genesis_data.py`, gerado de `client/js` por `scripts/gen-genesis-guard.mjs`.
"""

from __future__ import annotations

from typing import Any, Dict

from relay.genesis_data import GENESIS_MS, TEST_ROUTE_IDS

_CREATED_FIELDS = ("ts", "timestamp", "createdAt")


def is_test_route_id(route_id: Any) -> bool:
    """Diz se a chave `vx_…` é de uma conta de teste anterior à rede viva."""
    return isinstance(route_id, str) and route_id.strip() in TEST_ROUTE_IDS


def _created_ms(item: Dict[str, Any]) -> int:
    for field in _CREATED_FIELDS:
        val = item.get(field)
        if isinstance(val, (int, float)) and not isinstance(val, bool) and val > 0:
            return int(val)
    return 0


def is_before_genesis_ms(ms: int) -> bool:
    """Timestamp em ms anterior à gênese. Zero (sem data) não conta como antigo."""
    return 0 < ms < GENESIS_MS


def refuses_post(item: Dict[str, Any]) -> bool:
    """Post de conta de teste ou criado antes da gênese."""
    author = item.get("author") or item.get("owner") or ""
    return is_test_route_id(author) or is_before_genesis_ms(_created_ms(item))


def refuses_profile(route_id: Any) -> bool:
    """Cartão de perfil de conta de teste."""
    return is_test_route_id(route_id)


def prune_state(state: Dict[str, Any]) -> int:
    """Tira do estado carregado os posts e cartões que a regra recusa.

    Args:
        state: Estado normalizado da memória central (dicionários `posts` e `profiles`).

    Returns:
        Quantos itens saíram.
    """
    removed = 0
    posts = state.get("posts")
    if isinstance(posts, dict):
        drop = [k for k, p in posts.items() if isinstance(p, dict) and refuses_post(p)]
        for key in drop:
            del posts[key]
        removed += len(drop)
    profiles = state.get("profiles")
    if isinstance(profiles, dict):
        drop = [k for k in profiles if refuses_profile(k)]
        for key in drop:
            del profiles[key]
        removed += len(drop)
    return removed
