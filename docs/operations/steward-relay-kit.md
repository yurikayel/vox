# Kit steward relay (V-I08)

Stewards são **voluntários da comunidade**, não o mantenedor do repositório Vox. Este kit fecha o pacote mínimo para a camada **Steward** em [`espacos-digitais-infra.md`](../strategy/espacos-digitais-infra.md): qualquer coletivo sobe relay + sinalização **sem** depender do mantenedor.

**Status:** canônico (V-I08 fechado em `main`) — compose + Caddy (`/health`, `/vox/*`), quota via env, wizard `#/settings/network/steward`, kits 1-clique Windows/Linux.

---

## Escolha de caminho

| Cenário | Onde começar | Relay HTTP no PWA |
|---------|----------------|-------------------|
| **Desktop / LAN** (teste ou feira local) | [`packaging/steward-kit-windows/`](../../packaging/steward-kit-windows/) ou [`packaging/steward-kit-linux/start-steward-kit.sh`](../../packaging/steward-kit-linux/start-steward-kit.sh) | `http://127.0.0.1:8787` (kit) ou `http://127.0.0.1:3920` (`python server.py`) |
| **VPS coletivo** (produção) | [`relay/deploy/`](../../relay/deploy/) — Docker + Caddy TLS | `https://signal.coletivo.org` (mesmo host que WSS; ver abaixo) |
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
| Manifesto pins | gossip `CACHE_MANIFEST` + [`cache-manifest-v0.md`](../specs/cache-manifest-v0.md) | Prioridade WANT na malha |
| Espelho read-only | Pages ou nginx estático | Shell PWA (`vox-brasil`) |

### Caddy (VPS)

No [`Caddyfile`](../../relay/deploy/Caddyfile), tráfego **não-WebSocket** no mesmo domínio do signaling vai para `vox-relay:3920`. Isso expõe:

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

1. Copie [`relay/deploy/.env.example`](../../relay/deploy/.env.example) para `relay/deploy/.env` (opcional; default 512 MB no compose).
2. Variável **`VOX_RELAY_MAX_CACHE_MB`**: limite soft para o diretório de cache do relay.
3. Quando `cacheBytes` ≥ `maxCacheBytes`, novos `POST /vox/mirror` retornam **413** com `{ "error": "quota de cache excedida" }` — stewards devem monitorar `/health` ou aumentar a quota / limpar volume Docker.

**Coturn (largura de banda):** `max-bps` em [`turnserver.conf`](../../relay/deploy/turnserver.conf) — complementar à quota de disco, não substituto.

## Quem pode escrever no relay (PM-94)

O `server.py` confere cada pedido antes da rota ([ADR-027](../adr/027-autorizacao-no-relay-dono-e-origem.md), [referência](../specs/relay-api.md)):

- **Relay em loopback atrás de túnel ou proxy** (cloudflared, Caddy no mesmo host): ponha o nome público em **`VOX_RELAY_ALLOWED_HOSTS`** (ex.: `VOX_RELAY_ALLOWED_HOSTS=signal.coletivo.org`). Sem isso, o relay responde `421`.
- **Espelho do app em outro domínio:** ponha a origem em **`VOX_RELAY_ALLOWED_ORIGINS`**. As origens oficiais (GitHub Pages, Cloudflare Pages) e localhost já estão liberadas; a variável vale também para o CORS: origem fora da lista não consegue ler as respostas do relay.
- **Limite de escrita:** `VOX_RELAY_WRITE_LIMIT_PER_MIN` (padrão 120 por IP). Atrás de proxy, todo mundo chega com o IP do proxy; suba o limite se a comunidade for grande.
- O nó Windows (`VoxPopuli-ZeroMemory.exe`) libera o próprio túnel sozinho.

### Snapshot do relay cego: dono do canal e reinício ([RFC 0002](../rfc/0002-snapshot-autenticado-do-relay-cego.md))

- **Modo:** `VOX_RELAY_SNAPSHOT_AUTH=compat` (padrão) aceita snapshot sem prova, mas **sem apagar envelopes**; `enforce` recusa (`403`) o que vier sem prova. Mude para `enforce` só depois que os clientes da sua comunidade enviarem `X-Vox-Snapshot-Proof` (cliente ainda pendente na data deste kit).
- **Tetos:** `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP` (1000) e `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP` (16). Num relay novo e vazio (canal migrado) o primeiro snapshot só cobre até o teto de cobertura; suba a variável ou peça aos clientes que reenviem os envelopes recentes antes.
- **Quem é o dono:** o primeiro snapshot com prova num canal. Quem conhece só o id do canal não consegue ser dono depois disso, mas pode ser o primeiro se chegar antes (limite aceito, D6).
- **Reinício do dono** (segredo perdido, mudança de domínio do relay, falso dono): apague só o arquivo do canal e deixe o resto:

```bash
rm "$VOX_RELAY_BLIND_DIR/<canal>/latest_snapshot.json"
```

  Sem `VOX_RELAY_BLIND_DIR`, o diretório fica em `$VOX_RELAY_CACHE_DIR/blind_relay/` (ou `relay/.blind_relay/`). Nada mais muda: envelopes e TTL de 7 dias continuam, o próximo snapshot **com prova** reivindica o canal, e o snapshot que o cold boot entrega some até alguém emitir outro. O relay não precisa reiniciar (a leitura é feita a cada pedido).
- **Trocar de domínio** muda a prova (ela inclui o nome do relay): o canal vira do primeiro snapshot com a prova nova depois do reinício acima.

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

Detalhes: [`relay/deploy/README.md`](../../relay/deploy/README.md).

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
| Windows | `packaging/steward-kit-windows/Start-StewardKit.ps1` |
| Linux/macOS | `packaging/steward-kit-linux/start-steward-kit.sh` |

Ambos sobem relay local + servidor estático `client/` e abrem o wizard no navegador.

---

## Fora do kit v0

- Billing central ou boost pago
- AppView único
- TURN global do mantenedor do repo
