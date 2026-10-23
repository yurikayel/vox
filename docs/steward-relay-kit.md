# Kit steward relay (V-I08) — rascunho operacional

Stewards são **voluntários da comunidade**, não o mantenedor do repositório Vox. Este kit descreve o pacote mínimo para camada **Steward** em [`espacos-digitais-infra.md`](./espacos-digitais-infra.md).

**V-I08 MVP (3 dias):** volume cache no compose, `.env.example`, `/health` com inventário de índices, quota disco HTTP, runbook HTTPS relay (não só `:3920`), alinhar [`steward-seed-15min.md`](./steward-seed-15min.md). Branch: `feat/steward-relay-kit`.

---

## Componentes

| Peça | Onde | Função |
|------|------|--------|
| Signaling WSS | [`relay/deploy`](../relay/deploy) + Caddy | Pareamento WebRTC |
| Coturn | `turnserver.conf` | NAT simétrico 4G |
| Relay HTTP | `relay/server.py` | `GET /tx/:id`, `POST /vox/mirror`, health |
| Manifesto pins | gossip `CACHE_MANIFEST` + spec v0 | Prioridade WANT na malha |
| Espelho read-only | Pages ou nginx estático | Shell PWA (`vox-brasil`) |

---

## Configuração recomendada

1. **Domínio dedicado** por coletivo (`signal.coletivo.org`).
2. **Credenciais TURN** fortes; rotacionar a cada 90 dias.
3. **Quota relay:** limitar `max-bps` no Coturn; monitorar `blobsServed` no PWA (métricas locais).
4. **Multi-índice:** um JSON por `Community-Id` em `/vox/index/<slug>.json` (mirror POST).
5. **Não** centralizar identidade — usuários continuam com `vx_…` local.

---

## Integração com o cliente

- Rede: `#/settings/network` ou `client/config/signaling.json` em forks.
- Publicar manifesto assinado: API `peers.publishSignedCacheManifest()` após montar corpo com `cache-manifest.js`.
- Runbook rápido: [`steward-seed-15min.md`](./steward-seed-15min.md).

---

## Fora do kit v0

- Billing central ou boost pago
- AppView único
- TURN global do mantenedor do repo

*Antigravity: branch futura `feat/steward-relay-kit` para automação (compose profiles, env templates).*
