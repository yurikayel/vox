# PROFILE_CARD gossip v0

**Tipo:** `profile-card` · **Id:** `pc_${routeId}` · **TTL:** 30 dias desde `editedAt` ou `ts`

## Schema (campos assinados)

| Campo | Obrigatório | Notas |
|-------|-------------|--------|
| `id` | sim | `pc_${routeId}` |
| `type` | sim | `"profile-card"` |
| `routeId` | sim | `vx_*`, igual a `author` |
| `displayName` | não | string ≤ 80 |
| `avatarUrl` | não | URL https ou vazio |
| `bio` | não | string ≤ 280 |
| `discoverable` | sim | boolean |
| `ts` | sim | ms (via signPayload) |
| `editedAt` | recomendado | ms da última publicação |
| `author` | sim | routeId do signatário |
| `pubKey` | sim | JWK público |
| `sig` | sim | ECDSA |

Revogação: `GOSSIP_UPDATE` com mesmo `id`, `discoverable: false`, `editedAt` maior. Opcional `GOSSIP_DELETE` tombstone no mesmo `id`.

## Wire

- Novo: `GOSSIP` com item profile-card.
- Atualização: `GOSSIP_UPDATE`.
- Retirada: `GOSSIP_UPDATE` (discoverable false) ou `GOSSIP_DELETE`.

## Testes (T1–T6)

| ID | Cenário | Esperado |
|----|---------|----------|
| T1 | Card válido assinado, discoverable true | `profile-directory` atualizado; índice `#/people` inclui `mesh-card` |
| T2 | `editedAt` > 30d atrás | Ignorado / removido do diretório |
| T3 | `author` ≠ `routeId` | Rejeitado |
| T4 | Assinatura inválida | Rejeitado |
| T5 | UPDATE discoverable false | Card removido do diretório |
| T6 | GOSSIP profile-card | `onGossipPost` **não** disparado |

Implementação: `tests/profile-card.test.js`, `tests/peers-profile-card.test.js`.
