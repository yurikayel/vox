# Kit steward relay (V-I08)

Stewards são **voluntários da comunidade**, não o mantenedor do repositório Vox. Este kit fecha o pacote mínimo para a camada **Steward** em [`espacos-digitais-infra.md`](./espacos-digitais-infra.md): qualquer coletivo sobe relay + sinalização **sem** depender do mantenedor.

**Status:** fechado em `main` — compose + Caddy (`/health`, `/vox/*`), quota via env, wizard `#/settings/network/steward`, kits 1-clique Windows/Linux.

---

## Escolha de caminho

| Cenário | Onde começar | Relay HTTP no PWA |
|---------|----------------|-------------------|
| **Desktop / LAN** (teste ou feira local) | [`tools/steward-kit-windows/`](../tools/steward-kit-windows/) ou [`tools/steward-kit-linux/start-steward-kit.sh`](../tools/steward-kit-linux/start-steward-kit.sh) | `http://127.0.0.1:8787` (kit) ou `http://127.0.0.1:3920` (`python server.py`) |
| **VPS coletivo** (produção) | [`relay/deploy/`](../relay/deploy/) — Docker + Caddy TLS | `https://signal.coletivo.org` (mesmo host que WSS; ver abaixo) |
| **Só leitura** (sem relay) | [`steward-seed-15min.md`](./steward-seed-15min.md) caminho A | gateways padrão |

Runbook rápido (15 min): [`steward-seed-15min.md`](./steward-seed-15min.md).

---

## Componentes

| Peça | Onde | Função |
|------|------|--------|
| Signaling WSS | `relay/deploy` + Caddy `@ws` | Pareamento WebRTC |
| Coturn | `turnserver.conf` | NAT simétrico 4G |
| Relay HTTP | `relay/server.py` (serviço `vox-relay`) | `GET /health`, `/tx/:id`, `POST /vox/mirror`, `GET /vox/index/<id>.json` |
| Volume cache | compose `vox_relay_cache` | Espelhos + tx cache em disco |
| Manifesto pins | gossip `CACHE_MANIFEST` + [`cache-manifest-v0.md`](./cache-manifest-v0.md) | Prioridade WANT na malha |
| Espelho read-only | Pages ou nginx estático | Shell PWA (`vox-brasil`) |

### Caddy (VPS)

No [`Caddyfile`](../relay/deploy/Caddyfile), tráfego **não-WebSocket** no mesmo domínio do signaling vai para `vox-relay:3920`. Isso expõe:

- `GET https://signal.coletivo.org/health`
- `POST https://signal.coletivo.org/vox/mirror`
- `GET https://signal.coletivo.org/vox/index/<communityId>.json`

**URL HTTP relay no wizard:** use a **mesma origem HTTPS** do WSS (não a porta 3920 exposta).

---

## Saúde (`GET /health`)

Resposta JSON (campos principais):

| Campo | Significado |
|-------|-------------|
| `status` | `"ok"` quando o processo responde |
| `communityIndexes` | Lista de `communityId` com espelho em disco |
| `communityIndexCount` | Contagem de espelhos |
| `cacheBytes` | Bytes usados em `.cache` (tx + índices) |
| `maxCacheBytes` | Teto opcional (`VOX_RELAY_MAX_CACHE_MB`); `null` = sem teto |
| `cachedCount` | Itens tx em cache |

**Verificação manual:**

```bash
curl -sS https://signal.coletivo.org/health | jq .
```

No PWA: wizard passo 4 → **Verificar Relay HTTP**, ou `#/settings/network` → botão de verificação do relay.

---

## Quota de disco

1. Copie [`relay/deploy/.env.example`](../relay/deploy/.env.example) para `relay/deploy/.env` (opcional; default 512 MB no compose).
2. Variável **`VOX_RELAY_MAX_CACHE_MB`**: limite soft para o diretório de cache do relay.
3. Quando `cacheBytes` ≥ `maxCacheBytes`, novos `POST /vox/mirror` retornam **413** com `{ "error": "quota de cache excedida" }` — stewards devem monitorar `/health` ou aumentar a quota / limpar volume Docker.

**Coturn (largura de banda):** `max-bps` em [`turnserver.conf`](../relay/deploy/turnserver.conf) — complementar à quota de disco, não substituto.

---

## Deploy VPS (resumo)

1. DNS `A`/`AAAA` → IP da VPS (`signal.coletivo.org`).
2. Editar `Caddyfile` e `turnserver.conf` (domínio + senha TURN).
3. Firewall: `80/tcp`, `443/tcp`, `3478/tcp+udp`, `49152-49200/udp`.
4. Na pasta deploy:

```bash
cd vox/relay/deploy
cp .env.example .env   # ajuste VOX_RELAY_MAX_CACHE_MB se quiser
docker compose up -d --build
curl -sS https://signal.coletivo.org/health
```

Detalhes: [`relay/deploy/README.md`](../relay/deploy/README.md).

---

## Multi-comunidade

Um relay pode servir **vários** `communityId`: cada `POST /vox/mirror` grava `/vox/index/<communityId>.json`. `/health` lista todos em `communityIndexes`. Heurística doc: ~1 steward voluntário para 3–5 comunidades do mesmo coletivo.

---

## Integração com o cliente

- **Assistente:** `#/settings/network/steward` (5 passos) — grava WSS + relay HTTP em preferências ao concluir.
- **Rede manual:** `#/settings/network` ou `client/config/signaling.json` em forks.
- **Espelho:** `community-mirror.js` → `POST /vox/mirror` (pré-validação V-P06).
- **Manifesto assinado:** `peers.publishSignedCacheManifest()` após montar corpo com `cache-manifest.js`.

---

## Kits 1-clique (sem Docker)

| OS | Entrada |
|----|---------|
| Windows | `tools/steward-kit-windows/Start-StewardKit.ps1` |
| Linux/macOS | `tools/steward-kit-linux/start-steward-kit.sh` |

Ambos sobem relay local + servidor estático `client/` e abrem o wizard no navegador.

---

## Fora do kit v0

- Billing central ou boost pago
- AppView único
- TURN global do mantenedor do repo
