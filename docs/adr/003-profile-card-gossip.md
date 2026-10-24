# ADR-003: Cartão de perfil na malha (PROFILE_CARD gossip, opt-in)

**Status:** accepted · **V-MESH**

## Contexto

Dois usuários novos não se encontram em `#/people` sem colar `#/connect` ou sem posts compartilhados. P1 indexa autores já vistos na malha; P2 permite **opt-in** para publicar um cartão assinado via o mesmo pipe `GOSSIP` usado em posts e listings.

## Decisão

- Payload `type: "profile-card"`, id estável `pc_${routeId}`, campos públicos: `displayName`, `avatarUrl`, `bio`, `discoverable`, `editedAt`.
- Assinatura ECDSA P-256 via `signPayload` / `verifyPayload` ([`local-account.js`](../../client/js/local-account.js)); `author` e `routeId` devem coincidir.
- **Opt-in explícito:** flag local `vox-discoverable-mesh-v1`; desligar envia revogação (`discoverable: false` via `GOSSIP_UPDATE`).
- Cartões **não** entram no feed (`handleGossipMessage` persiste só em `profile-directory`, sem `dispatchGossipPost`).
- Sem diretório central, ranking ou relay de descoberta global (P3/P4 fora de escopo).

## LGPD

- Base legal: **consentimento** ao ativar *Aparecer na busca da malha*.
- Dados: nome/foto/bio já tratados como apresentação pública; minimização — sem e-mail, tokens OAuth ou grafo de amigos.
- Revogação: desligar toggle + gossip de revogação; apagar cartão local no aparelho; peers que receberam gossip removem do índice local.
- Retenção local: TTL 30 dias por cartão recebido (spec `profile-card-gossip-v0.md`).

## Consequências

- Módulos: `profile-card.js`, extensões em `peers.js`, `profile-directory.js`, `people-index.js`.
- Testes T1–T6 na spec de protocolo.
