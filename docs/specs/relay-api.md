# Relay Vox — referência de API

> **Status:** canônico · **Owner:** steward ops / mantenedor relay · **Revisado:** 2026-11-17
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

**Corte da gênese** ([`genesis_guard.py`](../../relay/genesis_guard.py); o nó em C# repete a regra em `GenesisGuard.cs`): `ingest` e `sync` ignoram, sem erro (`200`, `ingestedCount` não conta), cartão de perfil de conta de teste, post de autor de teste e post com `ts`/`timestamp`/`createdAt` anterior à gênese. Ao carregar o estado do disco, o que a regra recusa sai e a revisão sobe. Lista e data vêm de `client/js` via `node scripts/gen-genesis-guard.mjs`.

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

## 6. Limites e retenção

Estado **medido no código em `origin/develop` (2116595), 2026-11-17**; só descreve, não propõe mudança. Caminhos relativos a `relay/`. "Nenhum (lacuna)" = o código não impõe o limite.

**Vale para todas as rotas do `server.py`:** rate limit por IP só em `POST`/`DELETE`, 120/min por padrão, janela deslizante de 60 s, estado em memória (`request_guard.py:22,68-87,103`); `GET` não tem limite. CORS: `Access-Control-Allow-Origin: *` em toda resposta (`server.py:309`), mas `POST`/`DELETE` com `Origin` fora da lista do app dão `403` (`request_guard.py:55-61,99`). Os campos abaixo só repetem o que difere da regra.

| Endpoint / mailbox | Teto do corpo | Teto de quantidade | TTL / limpeza | Onde guarda |
|---|---|---|---|---|
| `GET /tx/<id>` + cache Arweave | resposta do gateway sem teto de leitura (`server.py:461-463`, `urlopen().read()`); só o id é validado (`server.py:62`) | teto em bytes do diretório, **só se** `VOX_RELAY_MAX_CACHE_MB` definida (`server.py:112-120`); sem teto de arquivos; sem a variável: nenhum (lacuna) | evicção por mtime ao passar do teto (`server.py:261-290`); sem TTL | disco (`CACHE_DIR`) |
| `POST /vox/mirror` | `256 KB` (`mirror_validate.py:9,80`); o handler lê `Content-Length` sem teto antes (`server.py:606`) | `500` tópicos por espelho (`mirror_validate.py:10,117`); nº de comunidades: mesmo teto em bytes do cache | sem TTL; sobrescreve `index_<id>.json`; `507` se passar da cota (`server.py:620-624`) | disco (`CACHE_DIR`) |
| `/inbox/<addr>` POST | `32 KB` (`inbox.py:16,73`; `server.py:628`) | nenhum por endereço nem total (lacuna) (`inbox.py:62-105`) | TTL `72 h` (`inbox.py:15`); expirado só sai quando alguém faz `GET` ou `DELETE` naquele endereço (`inbox.py:118-123`); `purge_all_expired` existe (`inbox.py:157`) mas nada no relay a chama | disco (`INBOX_DIR/<addr>/<id>.json`) |
| `/inbox/<addr>` GET | n/a | devolve todos os envelopes do endereço, sem paginação (`inbox.py:108-129`) | ver linha anterior | disco |
| `/relay/envelope/<canal>` POST | `64 KB` (`blind_relay.py:17,60`; `server.py:575`) | nenhum por canal nem total (lacuna) | TTL `7 dias` (`blind_relay.py:19`); expirado só sai quando alguém lista o canal (`blind_relay.py:93-95`); snapshot novo apaga os deltas mais antigos (`blind_relay.py:147,168`) | disco (`RELAY_DIR/<canal>/env_*.json`) |
| `/relay/envelope/<canal>` GET | n/a | `100` por resposta (`blind_relay.py:81,108`) | idem | disco |
| `/relay/snapshot/<canal>` POST | `512 KB` (`blind_relay.py:18,118`; `server.py:590`) | `1` por canal (`latest_snapshot.json`, `blind_relay.py:127,145`); nº de canais: nenhum (lacuna) | sem TTL: o snapshot fica até ser substituído | disco |
| `/memory/ingest`, `/memory/sync` | `4 MB` (`MAX_BLOB_BYTES*2`, `server.py:552`; `central_memory.py:27`) | nenhum para posts, perfis, tombstones, manifestos e blobs (lacuna) (`central_memory.py:414-435`); `MAX_ITEM_BYTES = 512 KB` está definida (`central_memory.py:26`) mas **não é usada** em lugar nenhum | sem TTL: o estado só cresce; corte da gênese remove o que for anterior à gênese (`central_memory.py:135`) | disco (journal + estado + `blobs/`, `central_memory.py:79-95,180-185`), espelhado em memória (`_STATE_CACHE`, `:30`) |
| `/memory/blob/<sha256>` GET | n/a | n/a | n/a | disco |
| blob de mídia (`MEDIA_BLOB`) | `2 MB` (`central_memory.py:27,347`) | nenhum (lacuna) | sem TTL | disco |
| `/memory/vault/<chave>` POST | `4 MB` (limite da memória, `server.py:552`); sem teto próprio (lacuna) (`vault_store.py:104-122`) | nenhum de cofres (lacuna) | sem TTL; regravar exige a prova do dono (`vault_store.py:104-110`) | disco |
| `/p2p/seed` POST | `16 KB` (`server.py:655-657`) | `64` seeds simultâneos (`p2p_seeder.py:26`), `512 MB` somados (`p2p_seeder.py:25,89-91`) | sem TTL; remoção só por `DELETE /p2p/seed/<hash>` | **memória** (`active_seeds`, `p2p_seeder.py:39`); some ao reiniciar |
| `/peer/beacon` POST | `16 KB` (`server.py:640-642`) | nenhum (lacuna): um `nodeId` novo por pedido (`p2p_seeder.py:149-186`) | TTL `60 s` (`p2p_seeder.py:27`); a varredura roda no próprio `POST`/`GET` (`p2p_seeder.py:186,202`) | **memória** (`known_peers`) |
| `/oauth/exchange` POST | `8 KB` (`server.py:539`) | n/a | nada é guardado | n/a |
| Sinalização (`signaling.py`) | quadro WebSocket `1 MB`, mensagem remontada `1 MB`, cabeçalho `64 KB` (`signaling.py:21-23`); handshake `10 s`, resto do quadro `30 s` (`signaling.py:24-25`) | nenhum de pares conectados nem de mensagens por segundo (lacuna) (`signaling.py:215-232`); sem rate limit (o `request_guard` não vale aqui) | conexão aberta não tem prazo de ociosidade (`signaling.py:92-96`) | **memória** (`PeerRegistry`) |

CORS da sinalização: `Access-Control-Allow-Origin: *` só nas respostas HTTP de saúde (`signaling.py:175`); o WebSocket não checa `Origin` (nenhuma verificação encontrada).

### Lacunas conhecidas

1. **`GET` sem rate limit.** O limite de 120/min vale só para `POST`/`DELETE` (`request_guard.py:97`). Leituras de `/inbox`, `/memory/state` e `/tx` ficam abertas. (O briefing desta tarefa dizia "nenhum endpoint tem rate limit": no `develop` atual a escrita já tem; a lacuna é a leitura e a sinalização.)
2. **Limite por IP em memória e por `client_address`.** O dicionário de IPs nunca é esvaziado (`request_guard.py:75,81`), e atrás de proxy ou túnel todos os pedidos aparecem com o mesmo IP.
3. **Sinalização sem rate limit, sem teto de pares e sem prazo de ociosidade.**
4. **Mailboxes sem teto de quantidade:** inbox por endereço, envelopes por canal cego, número de canais, cofres, posts/perfis/blobs da memória central.
5. **Limpeza só preguiçosa:** inbox e canal cego só descartam o expirado quando alguém lê aquele endereço ou canal; `purge_all_expired` não é chamada pelo relay. Endereço que ninguém lê mais fica no disco para sempre.
6. **Memória central e cofre sem TTL** e sem teto total; `MAX_ITEM_BYTES` declarada e não aplicada.
7. **`/tx/<id>` lê a resposta do gateway inteira em memória**, sem teto de bytes, e só limita o disco se `VOX_RELAY_MAX_CACHE_MB` existir (sem ela, cache ilimitado).
8. **`/vox/mirror` lê `Content-Length` sem teto antes de validar** (`server.py:606`); o teto de 256 KB só vale depois da leitura. Há outros pontos do mesmo padrão (corpo lido pelo `Content-Length` informado em `inbox` e `blind_relay`, mas com teto antes da leitura).
9. **CORS `*`** em todas as respostas do `server.py` e da sinalização; a defesa é o filtro de `Origin` nas escritas, que não cobre `GET` (`GET` de qualquer página lê inbox, estado e índices se alcançar o relay).
10. **Beacon sem teto:** cada `nodeId` novo cria um registro, sem limite de quantidade dentro da janela de 60 s.
11. **Servidor `HTTPServer` de uma thread só** (`server.py:696`): uma conexão lenta bloqueia as demais; não há `timeout` de socket no `server.py`.

Testes de referência: `test_request_guard.py`, `test_relay_limites_e_rotas.py`, `test_blind_relay.py`, `test_p2p_seeder.py`, `test_signaling_robustez.py`.
