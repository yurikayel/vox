# Seed comunitário — checklist 15 min

Objetivo: uma comunidade real com **leitura** via gateway **ou** relay voluntário, sem depender do mantenedor do repo.

**Baseline:** PWA em [GitHub Pages](https://yurikayel.github.io/vox/) ou espelho estático equivalente.

---

## Pré-requisitos (5 min)

| Item | Ação |
|------|------|
| Comunidade | Criar no PWA (`#/compose/community`) ou usar slug existente |
| DNS (opcional) | Subdomínio `signal.sua-comunidade.org` → IP da VPS |
| VPS (opcional) | 1 vCPU, Ubuntu 22+, portas 80/443/3478/49152-49200 |

---

## Caminho A — só leitura (sem VPS)

1. Abrir o PWA e entrar na comunidade.
2. Em **Configurações → Rede**, deixar gateways padrão (`config/gateways.json`).
3. Publicar um post assinado na comunidade (prova de autoria local).
4. Compartilhar o link `#/c/<slug>` no grupo (WhatsApp/Telegram).

**Pronto:** visitantes leem via GraphQL; posts locais sincronizam via gossip quando pares estão na mesma aba/rede.

---

## Caminho B — relay + espelho (15 min)

1. **Deploy relay:** [`relay/deploy/README.md`](../relay/deploy/README.md) (`docker compose up -d --build`) **ou** kit desktop [`steward-relay-kit.md`](./steward-relay-kit.md).
2. **PWA:** assistente `#/settings/network/steward` **ou** `#/settings/network` → WSS, TURN, **URL HTTP relay** (`https://signal…` na VPS; `http://127.0.0.1:8787` no kit local).
3. **Espelho de índice:** passo 5 do wizard → **Testar espelho agora** (`community-mirror.js` / `POST /vox/mirror`).
4. **Manifesto de pins (v0):** `peers.publishSignedCacheManifest(manifestBody)` ou transação Arweave `Type: cache-manifest` ([`cache-manifest-v0.md`](./cache-manifest-v0.md)).
5. **Hard refresh** após deploy do shell (`Ctrl+Shift+R`) — conferir `CACHE_NAME` em [`client/sw.js`](../client/sw.js).

---

## Verificação (2 min)

- [ ] `GET <relay>/health` → `{ "status": "ok", "communityIndexCount": …, "cacheBytes": … }`
- [ ] Wizard passo 4 → **Verificar Relay HTTP** mostra espelhos e uso de quota
- [ ] Dois navegadores na mesma comunidade: post via gossip (ou relay se configurado)
- [ ] Retratação: autor apaga/edita → par vê tombstone/badge (gossip v1)

---

## Referência completa

Kit steward (health, quota, multi-comunidade): [`steward-relay-kit.md`](./steward-relay-kit.md).
