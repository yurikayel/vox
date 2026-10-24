# ADR-002: Enriquecimento de perfil OAuth (client-only)

**Status:** accepted · **V-DIS**

## Contexto

Usuários pedem foto/nome rápidos; identidade Vox permanece `vx_*` local com chaves P2P/DM.

## Decisão

- Google Identity Services / Meta SDK **no browser** importam apenas claims públicos: `displayName`, `avatarUrl`, `bio` (quando disponível).
- **Não** persistir access tokens, refresh tokens ou IDs OAuth como chave primária.
- `routeId` e par ECDSA/ECDH **inalterados**; OAuth grava em `vox-profile-enrichment-v1` via [`local-account.js`](../../client/js/local-account.js).
- Opcional: usuário **Pula** e edita perfil manualmente.

## LGPD

- Base legal: consentimento explícito no modal pós-Cantina.
- Revogação: limpar enriquecimento em `#/perfil` sem apagar conta `vx_*`.
- Dados ficam no aparelho; Vox não opera backend de auth no MVP.

## Consequências

- Requer `oauth.json` local (gitignored) com client IDs.
- DM E2E continua dependendo de chaves locais; perfil OAuth não substitui `crypto-dm`.
