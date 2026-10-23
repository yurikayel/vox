# Community module manifest v0 (Horizonte C — kickoff)

**Type:** `community-module-manifest` · **`App-Name: vox-brasil`**

Complementa **`cache-manifest`** (pins TX) com **módulos de conectividade** (index mirror, TURN, `ar-pool`, signaling, relay-http).

## Corpo JSON (resumo)

- `v: 0`, `communityId`, `issuedAt`, `modules[]` (max 32)
- `modules[].kind`: `index` | `turn` | `ar-pool` | `signaling` | `relay-http`
- `pinHints[]` → referência `cache-manifest-tx` ou pins embutidos (WANT priority inalterado)
- `governance.binding` **must be false** v0; hook V-I07 `mirrorRecommendation`

## Cliente (futuro)

Camadas Apoiador/Steward: card **Sugestões da comunidade** em `#/settings/network` — **nunca** auto-aplicar segredos; sem gate de postagem/feira.

## Non-goals v0

Billing central, score público, relay enforcement, substituir `cache-manifest`.

*Spec expandida: spike Horizonte C módulos comunitários (23/10).*
