# Relay Vox — referência de API

> **Status:** canônico · **Owner:** steward ops / mantenedor relay · **Revisado:** 2026-11
> Fonte: `relay/server.py` (relay completo) e `relay/signaling.py` (sinalização). Python 3 stdlib, sem dependências.

O Vox tem **dois processos** no diretório `relay/`. Eles são independentes:

| Processo | Comando | Porta padrão | Bind padrão | O que faz | Quem roda |
|---|---|---|---|---|---|
| **Sinalização** | `npm start` = `python relay/signaling.py [--port N]` | `3921` (ou `$PORT`) | `0.0.0.0` (ou `$HOST`) | WebSocket que só troca SDP/ICE entre pares. Não guarda conteúdo. | `relay/Dockerfile`, nó público Render (`wss://vox-sentinel.onrender.com`), HF Space |
| **Relay completo** | `python relay/server.py [--host H --port N --cache-dir D]` | `3920` (ou `$VOX_RELAY_PORT`) | `127.0.0.1` | Cache Arweave, índice/espelho de comunidade, inbox de DM, relay cego, memória central, seeder P2P, troca OAuth. | Stewards, Node Zero (Windows/Linux), `vox-populi/` |

Todas as respostas são JSON com CORS aberto (`OPTIONS` → `204`). Rota desconhecida → `404`.

**Política de pedido (PM-94, [ADR-027](../adr/027-autorizacao-no-relay-dono-e-origem.md), `request_guard.py`)**, antes de qualquer rota do `server.py`:
- com o servidor em loopback, `Host` precisa ser de loopback ou estar em `VOX_RELAY_ALLOWED_HOSTS` → `421`;
- `POST`/`DELETE` com `Origin` fora das origens do app (GitHub Pages, Cloudflare Pages, localhost) e de `VOX_RELAY_ALLOWED_ORIGINS` → `403`; sem `Origin` passa;
- `POST` sem `Content-Type: application/json` → `415`;
- mais de `VOX_RELAY_WRITE_LIMIT_PER_MIN` escritas por minuto do mesmo IP → `429`.

## 1. Sinalização (`signaling.py`)

| Rota | Tipo | Descrição |
|---|---|---|
| `/`, `/health`, `/status`, `/ping` | HTTP GET | Health check (usado pelo `sentinel-keepalive.yml`). |
| qualquer outra | WebSocket (RFC 6455) | Troca de mensagens de sinalização entre pares. Frame máx. **1 MB**, cabeçalho de handshake máx. **64 KB**. |

Testes: `relay/test_signaling.py`.

## 2. Relay completo (`server.py`)

### Saúde e cache Arweave

| Rota | Método | Descrição |
|---|---|---|
| `/health` | GET | Status, versão, `cachedCount`, `communityIndexes`, `cacheBytes`/`maxCacheBytes`, integridade SHA-256 do cache, resumo da memória central. |
| `/tx/<txId>` | GET | Corpo da transação: HIT do disco ou busca no gateway e grava. Leituras verificadas por SHA-256. |

### Comunidade

| Rota | Método | Descrição |
|---|---|---|
| `/vox/index/<commId>.json` | GET | Índice consolidado da comunidade guardado localmente. |
| `/vox/mirror` | POST | Grava o espelho de comunidade enviado pelo cliente, validado por `mirror_validate.py` ([spec](./mirror-validate-v1.md)). |

### Mensagens diretas (`inbox.py`)

| Rota | Método | Descrição |
|---|---|---|
| `/inbox/<addr>` | GET | Lista envelopes E2E cifrados (ECDH P-256 + AES-GCM) para o endereço. |
| `/inbox/<addr>` | POST | Deposita envelope. Máx. **32 KB**; TTL padrão **72 h**. Campo opcional `del: { iv, ct, hash }` (chave de apagar cifrada para o destinatário; `hash` = SHA-256 hex) → o relay guarda `delHash`; `del` mal formado → `400`. |
| `/inbox/<addr>/<msgId>` | DELETE | Remove envelope após leitura. Envelope com `delHash` exige `X-Vox-Delete-Token: <hex>` que confira → senão `403`. `404` se não existe. |

### Relay cego (`blind_relay.py`)

| Rota | Método | Descrição |
|---|---|---|
| `/relay/envelope/<canal>?since=&since_serial=` | GET | Lista pacotes opacos do canal (o relay não inspeciona o conteúdo). |
| `/relay/envelope/<canal>` | POST | Deposita envelope. Máx. **64 KB**; retenção **7 dias**. |
| `/relay/snapshot/<canal>` | GET / POST | Último snapshot consolidado do canal. Máx. **512 KB**. |

### Memória central (`central_memory.py`, "Modo 3")

| Rota | Método | Descrição |
|---|---|---|
| `/memory`, `/memory/status` | GET | Contadores (`posts`, `profiles`, `tombstones`, `manifests`, `blobs`, `tunnelUrl`). |
| `/memory/state?since=&includeBlobs=` | GET | Exporta o estado persistido (delta a partir de `since`). |
| `/memory/blob/<sha256>` | GET | Blob de mídia deduplicado. |
| `/memory/ingest` | POST | Ingere um evento (`GOSSIP`, `GOSSIP_UPDATE`, `GOSSIP_DELETE`, `PROFILE_CARD`, `MEDIA_BLOB`) no journal. `201` se mudou, `200` se não. |
| `/memory/sync` | POST | Sync bidirecional incremental (`clientRevision`, `since`, `knownBlobs`). |
| `/memory/vault/<chave>` | GET / POST | Cofre v2 cifrado no cliente ([ADR-025](../adr/025-cofre-v2-so-a-senha-abre.md)). `POST { record, ownerToken }`: `ownerToken` é a prova do dono (64 hex); o relay guarda só o SHA-256 (`ownerHash`, nunca devolvido no `GET`). Cofre com dono só regrava com a mesma prova; v2 novo sem prova → `403`; prova mal formada → `400`. |

Payload máx. da memória: **2 × 2 MB** (`MAX_BLOB_BYTES` × 2) → acima disso, `413`.

### Seeder P2P e descoberta (`p2p_seeder.py`)

| Rota | Método | Descrição |
|---|---|---|
| `/p2p/status` | GET | Resumo do seeder. |
| `/p2p/blobs` | GET | Lista os seeds registrados. |
| `/p2p/seed/<hash>` | GET / DELETE | Consulta ou remove um seed. |
| `/p2p/seed` | POST | Registra seed (`hash`, `sizeBytes`, `mimeType`), só se autorizado. |
| `/peer/beacon`, `/p2p/peers` | GET | Pares anunciados. |
| `/peer/beacon` | POST | Anuncia um par (usado pelo Node Zero com túnel). |

### Login social (`oauth_exchange.py`)

| Rota | Método | Descrição |
|---|---|---|
| `/oauth/exchange` | POST | Troca o código OAuth 2.0 + PKCE pelo `@usuário` (X, Threads, GitHub, TikTok, Instagram profissional). O token da rede é **descartado**; nada é salvo. Payload máx. 8 KB. |

Configuração por variáveis de ambiente `VOX_OAUTH_<PROVEDOR>_CLIENT_ID` e `VOX_OAUTH_<PROVEDOR>_CLIENT_SECRET`. Guia: [login-social.md](./login-social.md).

## 3. Variáveis de ambiente

| Variável | Processo | Efeito |
|---|---|---|
| `PORT`, `HOST` | signaling | Porta e bind (padrão de PaaS). |
| `VOX_RELAY_PORT` | server | Porta (padrão 3920). |
| `VOX_RELAY_CACHE_DIR` | server | Diretório base de cache (`.cache/` ou `%LOCALAPPDATA%`). |
| `VOX_RELAY_MAX_CACHE_MB` | server | Teto do cache em disco. |
| `VOX_RELAY_INBOX_DIR`, `VOX_RELAY_BLIND_DIR`, `VOX_CENTRAL_MEMORY_DIR` | server | Diretórios específicos (senão, ficam sob o cache). |
| `VOX_OAUTH_<P>_CLIENT_ID` / `_CLIENT_SECRET` | server | Habilita `/oauth/exchange` para o provedor `P`. |
| `VOX_RELAY_ALLOWED_HOSTS` | server | Nomes extras aceitos no `Host` quando o relay escuta em loopback (ex.: o endereço do túnel), separados por vírgula. |
| `VOX_RELAY_ALLOWED_ORIGINS` | server | Origens extras que podem fazer `POST`/`DELETE` (ex.: um espelho do app), separadas por vírgula. |
| `VOX_RELAY_WRITE_LIMIT_PER_MIN` | server | Escritas (`POST`/`DELETE`) por minuto por IP (padrão 120). |

## 4. Testes

`npm run test:relay` (ou `python -m unittest discover -s relay -p "test_*.py"`):
`test_server.py` (rotas e cache), `test_signaling.py`, `test_blind_relay.py`, `test_mirror_validate.py`,
`test_oauth_exchange.py`, `test_p2p_seeder.py`, `test_desktop_launchers.py`, `test_central_memory_vault.py`, `test_request_guard.py` (PM-94).

## 5. Exposição pública

Hoje **não existe** relay completo público: só a sinalização roda na nuvem. Inbox de DM entre aparelhos diferentes, `/oauth/exchange` e memória central dependem de um steward rodar `server.py` exposto (TLS via `relay/deploy/`, Caddy + coturn) ou do túnel Cloudflare do Node Zero. Riscos e custos em [INFRA-CUSTOS.md](../INFRA-CUSTOS.md).
