# Relay Vox — referência de API

> **Status:** canônico · **Owner:** steward ops / mantenedor relay · **Revisado:** 2026-11-17
> Fonte: `relay/server.py` (relay completo) e `relay/signaling.py` (sinalização). Python 3 stdlib, sem dependências.

O Vox tem **dois processos** no diretório `relay/`. Eles são independentes:

| Processo | Comando | Porta padrão | Bind padrão | O que faz | Quem roda |
|---|---|---|---|---|---|
| **Sinalização** | `npm start` = `python relay/signaling.py [--port N]` | `3921` (ou `$PORT`) | `0.0.0.0` (ou `$HOST`) | WebSocket que só troca SDP/ICE entre pares. Não guarda conteúdo. | `relay/Dockerfile`, nó público Render (`wss://vox-sentinel.onrender.com`), HF Space |
| **Relay completo** | `python relay/server.py [--host H --port N --cache-dir D]` | `3920` (ou `$VOX_RELAY_PORT`) | `127.0.0.1` | Cache Arweave, índice/espelho de comunidade, inbox de DM, relay cego, memória central, seeder P2P, troca OAuth. | Stewards, Node Zero (Windows/Linux), `vox-populi/` |

Todas as respostas são JSON com CORS aberto (`OPTIONS` → `204`). Rota desconhecida → `404`.

**Política de pedido (PM-94, [ADR-027](../adr/027-autorizacao-no-relay-dono-e-origem.md), `request_guard.py` + `rate_limit.py`)**, antes de qualquer rota do `server.py`:
- com o servidor em loopback, `Host` precisa ser de loopback ou estar em `VOX_RELAY_ALLOWED_HOSTS` → `421` (`request_guard.py:45-48,67-68`);
- `POST`/`DELETE` com `Origin` fora das origens do app (GitHub Pages, Cloudflare Pages, localhost) e de `VOX_RELAY_ALLOWED_ORIGINS` → `403`; sem `Origin` passa (`request_guard.py:52-58,71-72`);
- `POST` sem `Content-Type: application/json` → `415` (`request_guard.py:73-74`);
- token bucket por classe de escrita no mesmo IP → `429` com `Retry-After` (`rate_limit.py:135-141`, `server.py:321-326`).

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
| `/relay/envelope/<canal>?since=&since_serial=` | GET | Lista pacotes opacos do canal (o relay não inspeciona o conteúdo). Com `since_serial=N` (N > 0): `serial > N`, **ordenado por serial**, até 100; a página cortada é contígua e o cliente pagina repetindo com o maior serial recebido até vir vazia. Sem ele: `timestamp >= since`, ordenado por timestamp. |
| `/relay/envelope/<canal>` | POST | Deposita envelope. Máx. **64 KB**; retenção **7 dias**. `timestamp` e `serial`, se presentes, são inteiros não negativos (senão `400`). O `id` vem do conteúdo (`env_<ts>_<sha256>`): reenvio idêntico é idempotente e não renova a validade; envelopes diferentes não se sobrescrevem. |
| `/relay/snapshot/<canal>` | GET / POST | Último snapshot consolidado do canal. Máx. **512 KB**. `epoch` tem de crescer e `coveredSerial` não pode recuar (senão `400`). Ao gravar, o relay apaga **só** os envelopes com `0 < serial <= coveredSerial`; sem `coveredSerial` nada é apagado (o TTL de 7 dias cuida). |

**Mudanças de contrato pendentes** (não feitas por exigirem `server.py` ou decisão do mantenedor): (a) o `GET` de envelopes não informa que cortou em 100; o cliente só sabe pelo tamanho da página (`len == 100` → pedir de novo). Falta um campo ou cabeçalho (`truncated` / `nextSerial`) e um modo "desde o início" por serial (`since_serial=0` hoje significa "por timestamp"). (b) `POST /relay/snapshot/<canal>` **não é autenticado**: qualquer um grava um snapshot com `coveredSerial` alto e apaga os envelopes do canal, ou grava `epoch` enorme e trava os snapshots seguintes. Quem pode emitir snapshot é decisão do mantenedor (ligada ao ADR-027). Testes em `skip` documentam os dois casos.

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
| `VOX_RELAY_WRITE_LIMIT_PER_MIN` | server | Define o `per_min` das três classes HTTP de escrita (`mailbox`, `beacon`, `write`) quando não há override por classe (`rate_limit.py:58-62`; padrão efetivo 120/60/30 conforme a classe). |
| `VOX_RELAY_RATE_<CLASSE>_PER_MIN` | server | Fichas por minuto do token bucket da classe (`MAILBOX`, `BEACON`, `WRITE`, `SIGNAL`, `SIGNAL_MSG`; padrões em `rate_limit.py:34-39`). |
| `VOX_RELAY_RATE_<CLASSE>_BURST` | server | Rajada máxima da classe (padrão em `rate_limit.py:34-39`; se inválido, `min(burst padrão, per_min)` — `rate_limit.py:62`). |
| `VOX_RELAY_TRUST_PROXY_HOPS` | server + signaling | Número de proxies confiáveis à frente; com N ≥ 1 o IP vem da N-ésima entrada da direita em `X-Forwarded-For` (`rate_limit.py:144-147,165-173`). |

## 4. Testes

`npm run test:relay` (ou `python -m unittest discover -s relay -p "test_*.py"`):
`test_server.py` (rotas e cache), `test_signaling.py`, `test_blind_relay.py`, `test_mirror_validate.py`,
`test_oauth_exchange.py`, `test_p2p_seeder.py`, `test_desktop_launchers.py`, `test_central_memory_vault.py`, `test_request_guard.py` (PM-94).

## 5. Exposição pública

Hoje **não existe** relay completo público: só a sinalização roda na nuvem. Inbox de DM entre aparelhos diferentes, `/oauth/exchange` e memória central dependem de um steward rodar `server.py` exposto (TLS via `relay/deploy/`, Caddy + coturn) ou do túnel Cloudflare do Node Zero. Riscos e custos em [INFRA-CUSTOS.md](../INFRA-CUSTOS.md).

## 6. Limites e retenção

Estado **medido no código em `origin/develop` (c661aa0), 2026-11-17**; só descreve, não propõe mudança. Caminhos relativos a `relay/`. "Nenhum (lacuna)" = o código não impõe o limite.

**Rate limit (`rate_limit.py`):** token bucket em memória, um mapa por (classe, IP). Cada classe tem `per_min` fichas por minuto e rajada `burst` (`rate_limit.py:34-39,70-71`). Bucket cheio volta a encher e sai do mapa (`rate_limit.py:81-87`); por classe há no máximo `MAX_ENTRIES` = 20 000 IPs, descartando o menos recente (`rate_limit.py:42,98-99`). IPv6 conta por rede /64 (`rate_limit.py:160-161`). Resposta `429` com corpo JSON e cabeçalho `Retry-After` em segundos (`rate_limit.py:140-141`, `server.py:322-326,315`).

| Classe | O que limita | Padrão (por min / rajada) |
|---|---|---|
| `mailbox` | `POST`/`DELETE` em rotas que começam com `/inbox`, `/memory/` ou `/relay/` | 120 / 60 (`rate_limit.py:35,43-44,125-132`) |
| `beacon` | `POST`/`DELETE` em `/peer/beacon` ou `/p2p/seed` (prefixo) | 60 / 30 (`rate_limit.py:36,44-45,130-131`) |
| `write` | demais `POST`/`DELETE` do `server.py` (espelho, OAuth, 404 de escrita, etc.) | 60 / 30 (`rate_limit.py:37,125-132`) |
| `signal` | cada nova conexão WebSocket na sinalização | 30 / 15 (`rate_limit.py:38`, `signaling.py:356-362`) |
| `signal_msg` | cada mensagem de texto em conexão já aberta | 600 / 200 (`rate_limit.py:39`, `signaling.py:399-401`) |

`GET`/`HEAD`/`OPTIONS` não gastam ficha (`rate_limit.py:127-128`). O guarda de `Host` do PM-94 vale também para `GET` (`request_guard.py:67-68`, `server.py:348-350`). No `server.py`, `GET /status` e `GET /ping` caem na rota desconhecida → `404` (`server.py:387-388`); esses caminhos existem só na sinalização (`signaling.py:205-215`).

Variáveis: `VOX_RELAY_RATE_<CLASSE>_PER_MIN` e `_BURST` por classe; `VOX_RELAY_WRITE_LIMIT_PER_MIN` sobrescreve o `per_min` de `mailbox`, `beacon` e `write` quando a variável da classe não está definida (`rate_limit.py:54-64`). IP atrás de proxy: `VOX_RELAY_TRUST_PROXY_HOPS` (`rate_limit.py:17-19,144-147`).

CORS: `Access-Control-Allow-Origin: *` em toda resposta (`server.py:311`), com `Access-Control-Expose-Headers: Retry-After` (`server.py:315`); `POST`/`DELETE` com `Origin` fora da lista do app dão `403` (`request_guard.py:71-72`). Os campos abaixo só repetem o que difere da regra.

| Endpoint / mailbox | Teto do corpo | Teto de quantidade | TTL / limpeza | Onde guarda |
|---|---|---|---|---|
| `GET /tx/<id>` + cache Arweave | resposta do gateway sem teto de leitura (`server.py:461-463`, `urlopen().read()`); só o id é validado (`server.py:62`) | teto em bytes do diretório, **só se** `VOX_RELAY_MAX_CACHE_MB` definida (`server.py:112-120`); sem teto de arquivos; sem a variável: nenhum (lacuna) | evicção por mtime ao passar do teto (`server.py:261-290`); sem TTL | disco (`CACHE_DIR`) |
| `POST /vox/mirror` | `256 KB` (`mirror_validate.py:9,80`); o handler lê `Content-Length` sem teto antes (`server.py:606`) | `500` tópicos por espelho (`mirror_validate.py:10,117`); nº de comunidades: mesmo teto em bytes do cache | sem TTL; sobrescreve `index_<id>.json`; `507` se passar da cota (`server.py:620-624`) | disco (`CACHE_DIR`) |
| `/inbox/<addr>` POST | `32 KB` (`inbox.py:16,73`; `server.py:628`) | nenhum por endereço nem total (lacuna) (`inbox.py:62-105`) | TTL `72 h` (`inbox.py:15`); expirado só sai quando alguém faz `GET` ou `DELETE` naquele endereço (`inbox.py:118-123`); `purge_all_expired` existe (`inbox.py:157`) mas nada no relay a chama | disco (`INBOX_DIR/<addr>/<id>.json`) |
| `/inbox/<addr>` GET | n/a | devolve todos os envelopes do endereço, sem paginação (`inbox.py:108-129`) | ver linha anterior | disco |
| `/relay/envelope/<canal>` POST | `64 KB` (`blind_relay.py:19,100`; `server.py:575`) | nenhum por canal nem total (lacuna) | TTL `7 dias` (`blind_relay.py:21`); expirado só sai quando alguém lista o canal (`blind_relay.py:124-140`, expiração em `:134`); snapshot novo apaga só os envelopes cobertos por `coveredSerial` (`blind_relay.py:228,248`), não por timestamp | disco (`RELAY_DIR/<canal>/env_*.json`) |
| `/relay/envelope/<canal>` GET | n/a | `100` por resposta (`blind_relay.py:143,167`), em ordem de serial com `since_serial`; **sem aviso de que cortou** (lacuna, ver "Mudanças de contrato pendentes") | idem | disco |
| `/relay/snapshot/<canal>` POST | `512 KB` (`blind_relay.py:20,202`; `server.py:590`) | `1` por canal (`latest_snapshot.json`, `blind_relay.py:212,225`); nº de canais: nenhum (lacuna) | sem TTL: o snapshot fica até ser substituído; **sem autenticação** (lacuna) | disco |
| `/memory/ingest`, `/memory/sync` | `4 MB` (`MAX_BLOB_BYTES*2`, `server.py:552`; `central_memory.py:27`) | nenhum de **quantidade** para posts, perfis, tombstones, manifestos e blobs (lacuna); cada item de post, perfil, tombstone e manifesto tem teto de `MAX_ITEM_BYTES = 512 KB` (`central_memory.py:30,229-246`; decorador `@_capped` em `:266,303,331,358`): acima disso o item é recusado (`changed=false` no ingest; ignorado no lote do sync) — o `413` ainda precisaria de `server.py` | sem TTL: o estado só cresce; corte da gênese remove o que for anterior à gênese (`central_memory.py:135`) | disco (journal + estado + `blobs/`, `central_memory.py:79-95,180-185`), espelhado em memória (`_STATE_CACHE`, `:30`) |
| `/memory/blob/<sha256>` GET | n/a | n/a | n/a | disco |
| blob de mídia (`MEDIA_BLOB`) | `2 MB` (`central_memory.py:32,395`); o SHA-256 do conteúdo tem de bater com `hash`, na mesma regra do `computeBlobHash` do cliente (data URL base64 → bytes decodificados; outro texto → UTF-8) (`central_memory.py:249-263,384`) | nenhum (lacuna) | sem TTL | disco |
| `/memory/vault/<chave>` POST | `4 MB` (limite da memória, `server.py:552`); sem teto próprio (lacuna) (`vault_store.py:104-122`) | nenhum de cofres (lacuna) | sem TTL; regravar exige a prova do dono (`vault_store.py:104-110`) | disco |
| `/p2p/seed` POST | `16 KB` (`server.py:655-657`) | `64` seeds simultâneos (`p2p_seeder.py:26`), `512 MB` somados (`p2p_seeder.py:25,89-91`) | sem TTL; remoção só por `DELETE /p2p/seed/<hash>` | **memória** (`active_seeds`, `p2p_seeder.py:39`); some ao reiniciar |
| `/peer/beacon` POST | `16 KB` (`server.py:640-642`) | nenhum (lacuna): um `nodeId` novo por pedido (`p2p_seeder.py:149-186`) | TTL `60 s` (`p2p_seeder.py:27`); a varredura roda no próprio `POST`/`GET` (`p2p_seeder.py:186,202`) | **memória** (`known_peers`) |
| `/oauth/exchange` POST | `8 KB` (`server.py:539`) | n/a | nada é guardado | n/a |
| Sinalização (`signaling.py`) | quadro WebSocket `1 MB`, mensagem remontada `1 MB`, cabeçalho `64 KB` (`signaling.py:26-28`); handshake `10 s`, resto do quadro `30 s` (`signaling.py:29-30`) | por IP: token bucket `signal` 30/15 por minuto/rajada em novas conexões (`signaling.py:356-362`, `rate_limit.py:38`); `signal_msg` 600/200 por mensagem de texto (`signaling.py:399-401`, `rate_limit.py:39`); sem teto de pares conectados (lacuna) (`signaling.py:224-273`) | conexão aberta não tem prazo de ociosidade (`signaling.py:292-293`) | **memória** (`PeerRegistry`) |

CORS da sinalização: `Access-Control-Allow-Origin: *` só nas respostas HTTP de saúde (`signaling.py:175`); o WebSocket não checa `Origin` (nenhuma verificação encontrada).

### Lacunas conhecidas

1. **`GET` sem rate limit.** Só `POST`/`DELETE` passam pelo token bucket (`rate_limit.py:127-128`). Leituras de `/inbox`, `/memory/state` e `/tx` ficam abertas (o guarda de `Host` ainda vale — `request_guard.py:67-68`).
2. **IP agregado atrás de proxy sem `VOX_RELAY_TRUST_PROXY_HOPS`.** Sem essa variável, o bucket usa só o IP do socket (`rate_limit.py:167-173`); atrás de um único NAT ou túnel muitos clientes compartilham o mesmo limite.
3. **Sinalização:** sem teto de pares conectados e sem prazo de ociosidade na conexão WebSocket aberta (`signaling.py:224-273,292-293`).
4. **Mailboxes sem teto de quantidade:** inbox por endereço, envelopes por canal cego, número de canais, cofres, posts/perfis/blobs da memória central.
5. **Limpeza só preguiçosa:** inbox e canal cego só descartam o expirado quando alguém lê aquele endereço ou canal; `purge_all_expired` não é chamada pelo relay. Endereço que ninguém lê mais fica no disco para sempre.
6. **Memória central e cofre sem TTL** e sem teto total (o teto por item já vale; falta o teto de quantidade e de bytes somados).
7. **`/tx/<id>` lê a resposta do gateway inteira em memória**, sem teto de bytes, e só limita o disco se `VOX_RELAY_MAX_CACHE_MB` existir (sem ela, cache ilimitado).
8. **`/vox/mirror` lê `Content-Length` sem teto antes de validar** (`server.py:606`); o teto de 256 KB só vale depois da leitura. Há outros pontos do mesmo padrão (corpo lido pelo `Content-Length` informado em `inbox` e `blind_relay`, mas com teto antes da leitura).
9. **CORS `*`** em todas as respostas do `server.py` e da sinalização; a defesa é o filtro de `Origin` nas escritas, que não cobre `GET` (`GET` de qualquer página lê inbox, estado e índices se alcançar o relay).
10. **Beacon sem teto de quantidade de `nodeId`:** cada `nodeId` novo cria um registro na janela de TTL (`p2p_seeder.py:149-186`); o rate limit só limita `POST`/`DELETE` por IP (`rate_limit.py:130-131`), não o número de pares distintos.
11. **Servidor `HTTPServer` de uma thread só** (`server.py:696`): uma conexão lenta bloqueia as demais; não há `timeout` de socket no `server.py`.

12. **Snapshot do relay cego sem autenticação e `GET` de envelopes sem aviso de corte** — ver "Mudanças de contrato pendentes" na seção do relay cego (`test_blind_relay_adversarial.py` tem os casos em `skip`).

Testes de referência: `test_blind_relay_adversarial.py`, `test_central_memory_limites.py`, `test_request_guard.py`, `test_rate_limit.py`, `test_relay_limites_e_rotas.py`, `test_blind_relay.py`, `test_p2p_seeder.py`, `test_signaling_robustez.py`.
