# ADR-002: Enriquecimento de perfil OAuth (client-only)

**Status:** accepted · **V-DIS**

## Contexto

Usuários pedem foto/nome rápidos; identidade Vox permanece `vx_*` local com chaves P2P/DM.

## Decisão

- Google Identity Services / Meta SDK **no browser** importam apenas claims públicos: `displayName`, `avatarUrl`, `bio` (quando disponível).
- **Não** persistir access tokens, refresh tokens ou IDs OAuth como chave primária.
- `routeId` e par ECDSA/ECDH **inalterados**; OAuth grava em `vox-profile-enrichment-v1` via [`local-account.js`](../../client/js/identity/local-account.js).
- Opcional: usuário **Pula** e edita perfil manualmente.

## LGPD

- Base legal: consentimento explícito no modal pós-Cantina.
- Revogação: limpar enriquecimento em `#/perfil` sem apagar conta `vx_*`.
- Dados ficam no aparelho; Vox não opera backend de auth no MVP.

## Consequências

- Requer `oauth.json` local (gitignored) com client IDs.
- DM E2E continua dependendo de chaves locais; perfil OAuth não substitui `crypto-dm`.

## Emenda 1 (18/11/2026): relay de troca de código

A decisão acima segue valendo para o perfil: o enriquecimento é gravado só no aparelho. A frase "Vox não opera backend de auth" deixou de ser literal para o login social por código OAuth 2.0 + PKCE (X, Threads, GitHub, TikTok, Instagram profissional): esse fluxo exige o `client_secret`, que não pode ficar no browser. Por isso o relay tem [`relay/oauth_exchange.py`](../../relay/oauth_exchange.py), exposto em `POST /oauth/exchange` ([relay-api.md](../specs/relay-api.md)).

- O relay só troca o código pelo `@usuário` e **descarta o token** da rede; nada é salvo.
- Fica ativo só para o provedor com `VOX_OAUTH_<P>_CLIENT_ID` e `_CLIENT_SECRET` configurados por quem opera o relay (steward).
- Google/Meta via SDK no browser continuam sem passar pelo relay.
- Esta emenda não reescreve a decisão; apenas registra o relay de troca.
