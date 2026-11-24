# Vox Node em Rust — Blueprint de Execução (ADR-039 Fase 4)

> **Status:** rascunho (blueprint executável da Fase 4 do ADR-039; implementação Rust ainda não iniciada) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-22
> **Documentos base:** [ADR-039](../adr/039-rust-por-fases.md) · [relay-api.md](./relay-api.md) · [bench-sinalizacao-lan09.md](../operations/bench-sinalizacao-lan09.md) · [THREAT-MODEL.md](../THREAT-MODEL.md) · [DEPENDENCIAS.md](../DEPENDENCIAS.md) · [HARDENING.md](../HARDENING.md)

Este documento define a arquitetura executável, a matriz de contrato HTTP/WebSocket 1-para-1, o plano de mitigação dos gargalos de carga medidos no `LAN-09`, o harness de testes caixa-preta, a fronteira FFI/JNI mínima para o Android (`vox-populi.apk`) e a entrega em quatro PRs incrementais do binário unificado `rust/vox-node`.

---

## 1. Objetivo e impacto de consolidação

Hoje a infraestrutura de relay, sinalização e nó local do Vox está fragmentada em quatro superfícies distintas:

| Superfície atual | Tecnologia / runtime | O que executa hoje | Destino na Fase 4 (`rust/vox-node`) |
|---|---|---|---|
| [`relay/server.py`](../../relay/server.py) | Python 3 stdlib (`ThreadingHTTPServer`) | Relay HTTP completo (cache Arweave, espelho, inbox DM, relay cego, memória central, seeder P2P, OAuth) | Subcomando/modo `--mode relay` ou `--mode unified` |
| [`relay/signaling.py`](../../relay/signaling.py) | Python 3 stdlib (`ThreadedTCPServer` + RFC 6455 manual) | Sinalização WebSocket (`3921`) + health HTTP (`/`, `/health`, `/status`, `/ping`) | Subcomando/modo `--mode signaling` ou `--mode unified` |
| [`ZeroCentralMemory.cs`](../../packaging/zero-central-memory-windows/src/ZeroCentralMemory.cs) e [`node_zero.py`](../../packaging/node-zero-windows/node_zero.py) | C# .NET 4.8 (`VoxMemoria.exe`) e Python + PyInstaller (`VoxPopuli.exe`) | Nó local Windows na bandeja (portas `3921`/`3920` e controle `3922`, `MemoryStore`, `VaultOwnerGuard`, `GenesisGuard`, Job Objects, túnel Cloudflare, `dashboard.html`) | `--mode memoria` / `--headless` substituindo o motor HTTP/armazenamento com paridade de rotas, disco e controle |
| [`VoxPopuliNodeService.java`](../../android/src/org/vox/populi/VoxPopuliNodeService.java) | Java puro (Foreground Service stub sem daemon nativo) | Exibe notificação e monitora Wi-Fi (`NodeNetworkGuard`) sem subir relay real em segundo plano | Carrega `libvoxnode.so` via JNI (`rust/vox-node-ffi`) para operar relay/memória em loopback real |

### 1.1 Reuso de `rust/vox-core` e fronteira intocada do cliente cidadão

- **Reuso obrigatório de `rust/vox-core`:** O workspace [`rust/Cargo.toml`](../../rust/Cargo.toml) já entrega [`rust/vox-core`](../../rust/vox-core/Cargo.toml) (`#![no_std]`, `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]`, zero dependências externas) com `genesis_data`, `genesis_guard`, `shamir_gf256` em tempo constante e `sig_format`. `rust/vox-node` deve consumir `vox_core::genesis_guard` diretamente para o corte da gênese em `/memory/ingest` e `/memory/sync`, e reutilizar os tipos canônicos de `vox-core` para cofre v2, envelopes e manifestos.
- **Dependência explícita do PR #399 (ADR-039 Fase 1b):** `vault_v2`, `dm_envelope_v1` e `community_manifest_v1` em `rust/vox-core` só existem após o merge do PR #399 (`feat/adr039-voxcore-phase1b`) em `develop`. Este plano (PR #402) é só documentação, mas a implementação de `rust/vox-node` (PR4.1+) **não pode começar** antes desse merge; o `Cargo.toml` de `vox-node` depende de `vox-core` por `path`.
- **Cliente cidadão intocado (`client/` e `vox.apk`):** Conforme [ADR-039 §3.5](../adr/039-rust-por-fases.md#35-o-que-fica-de-fora), o PWA em `client/` continua em JavaScript vanilla e o micro-APK cidadão (`vox.apk`, pacote `org.vox.client` em [`android/build.ps1`](../../android/build.ps1)) **não recebe nenhuma biblioteca nativa `.so`**, preservando o orçamento abaixo de 100 KiB para o free tier do Turbo Arweave.
- **Prontidão Fria (*Cold Readiness*):** Em modo local/desktop/Android (`relay`, `memoria`), o bind padrão permanece estritamente em `127.0.0.1` (`3920`/`3921`/`3922`). Bind em `0.0.0.0` ocorre apenas no modo servidor (`--mode signaling` ou explícito por `HOST`/`--host`), sem abrir portas públicas, UPnP ou federação automática.

---

## 2. Matriz de contrato 1-para-1 (HTTP e WebSocket)

Toda rota, cabeçalho, limite de payload e código de erro documentados em [relay-api.md](./relay-api.md) e [THREAT-MODEL.md](../THREAT-MODEL.md) deve ser preservada sem quebra de clientes existentes.

### 2.1 Camada transversal de guarda, CORS, rate limit e socket (`T22`, `T30`, `T31`, `T32`)

| Controle | Comportamento canônico Python / C# | Especificação em `rust/vox-node` | Referência |
|---|---|---|---|
| **Guarda de `Host` (DNS rebinding)** | Em bind loopback (`127.0.0.1`, `localhost`, `::1`), `Host` fora de loopback e fora de `VOX_RELAY_ALLOWED_HOSTS` responde `421` (`request_guard.py`) | Middleware pré-roteamento aplica `421 Misdirected Request` (`{"error": ...}`) em qualquer método (`GET`/`POST`/`DELETE`/WS upgrade) quando o socket local está em loopback | `T22`, [ADR-027](../adr/027-autorizacao-no-relay-dono-e-origem.md) |
| **Guarda de `Origin` em escrita / WS** | `POST`/`DELETE` e handshake WS com `Origin` ausente passam; com `Origin` contendo caractere de controle (`<= 0x20` ou `0x7F`) ou fora de `APP_ORIGINS` (`https://yurikayel.github.io`, `https://vox-9df.pages.dev`), loopback (`http(s)://localhost[:p]`, `127.0.0.1[:p]`, `[::1][:p]`) e `VOX_RELAY_ALLOWED_ORIGINS` respondem `403` (WS: `{"error":"origin_not_allowed"}`) | Parser estrito de origem antes do roteamento e antes do `101 Switching Protocols`; comparação exata sem curinga e sem barra final; nenhuma origem fora da lista passa em `POST`, `DELETE` ou WS | `T22`, `T32`, [`request_guard.py`](../../relay/request_guard.py) |
| **CORS por lista (fecha lacuna `T32`)** | `server.py` emite `Vary: Origin`, `Access-Control-Expose-Headers: Retry-After` e só devolve `Access-Control-Allow-Origin` reconstruído da allowlist (nunca `*`, nunca eco bruto); `OPTIONS` → `204`. *Lacuna residual atual:* `signaling.py` histórico e `ZeroCentralMemory.cs` emitiam `*` | Política unificada de [`request_guard.py`](../../relay/request_guard.py) em **todos** os modos (relay, sinalização HTTP e Vox Populi / Vox Memoria Windows/Android), eliminando o `*` residual de `ZeroCentralMemory.cs` | `T32`, [relay-api.md §6](./relay-api.md#6-limites-e-retenção) |
| **`Content-Type` em `POST`** | `POST` sem `Content-Type: application/json` → `415` | Middleware valida `application/json` (aceitando parâmetros de charset) antes de ler corpo no modo relay | `T22`, [`request_guard.py`](../../relay/request_guard.py) |
| **Token bucket por IP (`rate_limit`)** | 5 classes: `mailbox` (120/60), `beacon` (60/30), `write` (60/30), `signal` (30/15), `signal_msg` (600/200). IPv6 agregado por `/64`; LRU cap `MAX_ENTRIES = 20_000` por classe; `GET`/`HEAD`/`OPTIONS` não consomem ficha. HTTP excedido → `429` + `Retry-After` (segundos); `signal_msg` excedido → descarte silencioso | Estrutura `DashMap` / `Mutex<LruCache>` shardada por classe com exatamente as mesmas taxas, `/64` para IPv6, teto de 20 000 entradas e suporte a `VOX_RELAY_WRITE_LIMIT_PER_MIN` e `VOX_RELAY_RATE_<CLASSE>_PER_MIN`/`_BURST` | [`rate_limit.py`](../../relay/rate_limit.py) |
| **Resolução de IP atrás de proxy** | `VOX_RELAY_TRUST_PROXY_HOPS`: `0` (padrão/inválido/negativo) usa IP do socket; `N >= 1` extrai a N-ésima entrada da direita de `X-Forwarded-For` (fallback para IP do socket se inválida ou lista menor) | Helper único compartilhado por HTTP e WebSocket com a mesma semântica de índice reverso | [relay-api.md §3](./relay-api.md#3-variáveis-de-ambiente) |
| **Dreno de corpo em rejeição (`T31`)** | Respostas antecipadas (`413`, `429`, `400`, `403`, `415`) levam `Content-Length` + `Connection: close` e drenam até `1 MiB` (`REJECTED_BODY_DRAIN_MAX`) por até `2 s` (`REJECTED_BODY_DRAIN_SECONDS`) antes de fechar | No `hyper`, após enviar a resposta de erro com `Connection: close`, tarefa auxiliar drena no máximo `1 MiB` com `tokio::time::timeout(2s)` antes de encerrar o socket, evitando TCP RST (erro 10053 no Windows) | `T31`, [`server.py`](../../relay/server.py#L400-L418) |
| **Teto de conexões e prazos (`T30`)** | `VOX_RELAY_MAX_CONNECTIONS` (64), `VOX_SIGNAL_MAX_CONNECTIONS` (64), `VOX_RELAY_SOCKET_TIMEOUT` (10 s), WS `HANDSHAKE_TIMEOUT` (10 s), WS `FRAME_TIMEOUT` (30 s) | `tokio::sync::Semaphore` global no loop de `accept` (com drop imediato se esgotado) + prazos dedicados de header/leitura/frame | `T30`, [`signaling.py`](../../relay/signaling.py) |

### 2.2 Rotas HTTP (Sinalização, Relay Completo e Vox Memoria)

| Rota | Método | Contrato de entrada, validação e limites | Status e resposta esperada |
|---|---|---|---|
| `/`, `/health`, `/status`, `/ping` *(modo signaling)* | `GET`, `HEAD` | Sem rate limit; `OPTIONS` → `204`; outros métodos → `405`; rota desconhecida → `404` | `200` JSON `{"status":"ok","service":"vox-signaling","version":...,"peers":N}` |
| `/health` *(e `/` no modo relay)* | `GET` | Inclui contadores de cache, `communityIndexes`, `cacheBytes`/`maxCacheBytes`, `cacheIntegrity` (`sha256`), `centralMemory` e `p2p` | `200` JSON compatível com `server.py` (e campos extras de `ZeroCentralMemory.cs` quando `--mode memoria`) |
| `/tx/<txId>` | `GET` | Valida exatamente 43 chars `[A-Za-z0-9_-]`; verificação SHA-256 em sidecar `.sha256` no disco; leitura upstream limitada a `VOX_RELAY_MAX_TX_MB` (padrão `32 MB`); evicção por `mtime` acima de `VOX_RELAY_MAX_CACHE_MB` (padrão `512 MB`, `0` = sem teto) | `200` (`X-Vox-Cache: HIT\|MISS`), `400` (`txId` inválido), `413` (acima do teto), `404` (não encontrado) |
| `/vox/index/<commId>.json` | `GET` | Valida `commId` path-safe (`^[a-zA-Z0-9._-]{1,128}$`) + leitura verificada por SHA-256 | `200` (`X-Vox-Cache: HIT`) ou `404` |
| `/vox/mirror` | `POST` | Checa `Content-Length` e corpo máximo de **256 KiB** antes de acumular em RAM; valida JSON conforme [mirror-validate-v1.md](./mirror-validate-v1.md) (≤ 500 tópicos); respeita cota do cache em disco | `200` `{"status":"mirrored","communityId":...}`, `400` estrutural, `413` corpo > 256 KiB, `507` cota excedida |
| `/inbox/<addr>` | `GET` | Lista envelopes não expirados (TTL **72 h**) com `safe_path` | `200` `{"envelopes":[...]}` |
| `/inbox/<addr>` | `POST` | Limite **32 KB**; campo opcional `del: {iv, ct, hash}` (`hash` 64 hex) armazenado como `delHash` | `200` registro salvo, `400` (`del` inválido / JSON inválido), `413` > 32 KB |
| `/inbox/<addr>/<msgId>` | `DELETE` | Se o envelope possui `delHash`, exige cabeçalho `X-Vox-Delete-Token: <hex>` cujo SHA-256 ou token corresponda exatamente em tempo constante (`subtle`) | `200` `{"status":"deleted","id":...}`, `403`, `404` |
| `/relay/envelope/<canal>` | `GET` | Query `since=` e `since_serial=`: se `since_serial > 0`, ordena por `serial > N` até **100** itens contíguos; caso contrário, `timestamp >= since` | `200` JSON com envelopes dentro do TTL de **7 dias** |
| `/relay/envelope/<canal>` | `POST` | Limite **64 KB**; `timestamp` e `serial` opcionais são inteiros não negativos; `id` determinístico `env_<ts>_<sha256>` (reenvio idêntico é idempotente) | `201` registro, `400` validação, `413` > 64 KB |
| `/relay/snapshot/<canal>` | `GET` | Devolve último snapshot do canal removendo `ownerHash` | `200` JSON ou `404` |
| `/relay/snapshot/<canal>` | `POST` | Limite **512 KB**; cabeçalho `X-Vox-Snapshot-Proof` (64 hex → guarda só SHA-256 `ownerHash`); modo `VOX_RELAY_SNAPSHOT_AUTH=compat\|enforce` ([RFC 0002](../rfc/0002-snapshot-autenticado-do-relay-cego.md)); saltos `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP` (16) e `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP` (1000); poda `0 < serial <= coveredSerial` só quando autenticado | `201` gravado, `200` `{"idempotent":true}`, `400` prova/teto inválido, `403` proibido, `409` conflito `{error, currentEpoch, currentCoveredSerial}`, `413` > 512 KB |
| `/memory`, `/memory/status` | `GET` | Contadores (`posts`, `tombstones`, `profiles`, `manifests`, `blobs`) + `revision`, `updatedAt`, `tunnelUrl` | `200` JSON |
| `/memory/state` | `GET` | Query `since=` e `includeBlobs=` (`0\|1`) | `200` delta do estado |
| `/memory/blob/<sha256>` | `GET` | Valida 64 hex; lê blob deduplicado em `blobs/` | `200` JSON ou `404` |
| `/memory/ingest` | `POST` | Payload máx. **4 MB** (`2 × 2 MB`); itens ≤ `512 KB`, blobs ≤ `2 MB` com verificação SHA-256 (`computeBlobHash`); corte via `vox_core::genesis_guard`; append em `events.jsonl` + flush atômico | `201` se `changed: true`, `200` se `changed: false`, `400`, `413` |
| `/memory/sync` | `POST` | Payload máx. **4 MB**; aceita `clientRevision`, `since`, `knownBlobs`; aplica `genesis_guard` | `200` JSON (com fast-path `upToDate: true` quando `changes == 0 && clientRevision == revision`) |
| `/memory/vault/<chave>` | `GET`, `POST` | `chave` 64 hex; valida formato v2 (`v==2`, `salt`, `iter` em `100_000..=5_000_000`, ou `revoked: true`); `POST` com `{record, ownerToken}` (64 hex → `ownerHash`, nunca devolvido no `GET`); v2 novo sem prova → `403` | `GET`: `200`/`404`; `POST`: `200` (`saved`), `403` (`forbidden`), `400` (`invalid`), `413` > 4 MB |
| `/p2p/status`, `/p2p/blobs` | `GET` | Resumo em memória e lista de seeds ativos | `200` JSON |
| `/p2p/seed`, `/p2p/seed/<hash>` | `GET`, `POST`, `DELETE` | `POST` máx. **16 KB**; teto de **64 seeds** simultâneos e **512 MB** somados | `POST`: `201`/`400`/`413`; `GET`/`DELETE`: `200`/`404` |
| `/peer/beacon`, `/p2p/peers` | `GET`, `POST` | `POST /peer/beacon` máx. **16 KB**, TTL **60 s** em memória | `GET`: `200`; `POST`: `201`/`400`/`413` |
| `/oauth/exchange` | `POST` | Payload máx. **8 KB**; troca código OAuth 2.0 + PKCE com `VOX_OAUTH_<P>_CLIENT_ID`/`_SECRET`; descarta token da rede sem persistir | `200` JSON, `400`/`413`/status do provedor/`502` |
| Rotas Vox Populi / Vox Memoria (`/dashboard`, `/memory/logs`, `/memory/vaults`, `/memory/telemetry`, `/memory/checkpoint`, `/memory/pause`, `/memory/resume`, porta `3922` `/api/*`) | `GET`, `POST` | Habilitadas apenas em `--mode memoria`; escrita em `3922` exige `control.token` gerado em loopback (`401` se ausente/inválido); quando pausado, escritas em `3921` retornam `503 {"error":"node_paused"}` | `200` / `401` / `404` / `503` (paridade com [`ZeroCentralMemory.cs`](../../packaging/zero-central-memory-windows/src/ZeroCentralMemory.cs)) |

### 2.3 Contrato WebSocket de Sinalização (RFC 6455)

- **Upgrade:** `GET` com `Sec-WebSocket-Key` passa por verificação de `Host`, `Origin` (`403 {"error":"origin_not_allowed"}`), `signal` rate limit (`429 {"error":"rate_limited"}` + `Retry-After`) e semáforo `VOX_SIGNAL_MAX_CONNECTIONS` antes de emitir `101 Switching Protocols`.
- **Limites de quadro e mensagem:** Cabeçalho HTTP de handshake ≤ `64 KB` em `10 s` total; quadro e mensagem remontada (fragmentação `FIN=0`/`0x0`) ≤ `1 MB`; timeout de continuação de quadro `30 s`; quadros de controle (`0x8` Close, `0x9` Ping, `0xA` Pong) com `FIN=1` e carga ≤ `125` bytes.
- **Mensagens JSON suportadas (idênticas a [`relay/signaling.py`](../../relay/signaling.py)):**
  - `{"type":"register","peerId":"...","address":"...","dmPub":{...}}` → devolve `{"type":"registered","peerId":...,"peers":[...],"addressMap":{...}}` ao remetente e difunde `{"type":"peer-joined","peerId":...,"address":...,"dmPub":...}` aos demais pares (se o mesmo handler troca de `peerId`, emite `peer-left` do anterior antes de registrar o novo).
  - `{"type":"offer"|"answer"|"ice","to":"<peerId>",...}` → injeta `"from": <sender_peer_id>` (sobrescrevendo qualquer `from` forjado) e encaminha ao destinatário se registrado.
  - `{"type":"ping"}` → responde `{"type":"pong"}`.
  - Desconexão / Close → remove apenas se o handle registrado ainda pertence a esta conexão e difunde `{"type":"peer-left","peerId":...}`.

### 2.4 Variáveis de ambiente preservadas

`rust/vox-node` lê exatamente as mesmas variáveis de ambiente do runtime atual ([relay-api.md §3](./relay-api.md#3-variáveis-de-ambiente), [`node_zero.py`](../../packaging/node-zero-windows/node_zero.py)):

- **Rede e limites de conexão:** `PORT`, `HOST`, `VOX_RELAY_PORT`, `VOX_RELAY_ALLOWED_HOSTS`, `VOX_RELAY_ALLOWED_ORIGINS`, `VOX_RELAY_TRUST_PROXY_HOPS`, `VOX_RELAY_MAX_CONNECTIONS`, `VOX_SIGNAL_MAX_CONNECTIONS`, `VOX_RELAY_SOCKET_TIMEOUT`, mais novas variáveis opcionais de hardening Rust: `VOX_SIGNAL_TCP_BACKLOG` (padrão `1024`) e `VOX_SIGNAL_MAX_OUTBOUND_QUEUE` (padrão `256` mensagens).
- **Rate limit:** `VOX_RELAY_WRITE_LIMIT_PER_MIN`, `VOX_RELAY_RATE_MAILBOX_PER_MIN`/`_BURST`, `VOX_RELAY_RATE_BEACON_PER_MIN`/`_BURST`, `VOX_RELAY_RATE_WRITE_PER_MIN`/`_BURST`, `VOX_RELAY_RATE_SIGNAL_PER_MIN`/`_BURST`, `VOX_RELAY_RATE_SIGNAL_MSG_PER_MIN`/`_BURST`.
- **Armazenamento, cache e purga:** `VOX_RELAY_CACHE_DIR`, `VOX_RELAY_INBOX_DIR`, `VOX_RELAY_BLIND_DIR`, `VOX_CENTRAL_MEMORY_DIR`, `VOX_RELAY_MAX_CACHE_MB`, `VOX_RELAY_MAX_TX_MB`, `VOX_RELAY_PURGE_INTERVAL_SECONDS`, `VOX_NODE_ZERO_CACHE_MB`, `VOX_NODE_ZERO_MEMORY_MB`.
- **Snapshot auth & OAuth:** `VOX_RELAY_SNAPSHOT_AUTH`, `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP`, `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP`, `VOX_OAUTH_<PROVEDOR>_CLIENT_ID`, `VOX_OAUTH_<PROVEDOR>_CLIENT_SECRET`.

---

## 3. Resolvendo os gargalos do `LAN-09` (#380)

### 3.1 Baseline real medido em Python (`relay/signaling.py`)

O relatório [bench-sinalizacao-lan09.md](../operations/bench-sinalizacao-lan09.md) (executado via [`tools/signaling-load-bench.py`](../../tools/signaling-load-bench.py) em loopback `127.0.0.1` com 500 pares) identificou quatro gargalos estruturais:

1. **Backlog TCP de fábrica `request_queue_size = 5`:** `ThreadedTCPServer` herda `listen(5)` da `socketserver.TCPServer`. Em rajadas (`concurrency=100`), 8 de 500 handshakes falharam com `ConnectionResetError` (`492/500`); mesmo com `concurrency=25`, uma das execuções perdeu `4/500` conexões (`ConnectionRefusedError`).
2. **Fan-out síncrono $O(N^2)$ de `peer-joined` na thread receptora:** Em `WebSocketHandler.on_register`, cada registro executa `registry.broadcast_others(...)` de forma síncrona na mesma thread antes de voltar ao `receive_loop()`. Com 500 pares simultâneos, isso gerou **~130 mil quadros** (`130.148` quadros recebidos pelos clientes no run de 500 pares), bloqueando as trocas `offer`→`answer` atrás da fila de escrita:
   - `concurrency=25` (`500/500`): `offer`→`answer` com `p50 = 167,63 ms`, mas cauda **`p95 = 7.891,19 ms` (~7,9 s)** e **`p99 = 8.060,29 ms` (~8,1 s)** (tempo total `10,528 s`).
   - `concurrency=100` (`492/500`): `offer`→`answer` com `p50 = 180,80 ms`, cauda **`p95 = 9.375,09 ms` (~9,4 s)** e **`p99 = 9.474,19 ms` (~9,5 s)** (tempo total `11,902 s`).
3. **Modelo 1-thread-por-conexão:** 500 threads consumiram **39,21 MB RSS** (pico **40,99 MB** vs baseline ~19,39 MB), inviabilizando escalar conexões no tier gratuito de 512 MB do Render junto com buffers de socket.
4. **Limites padrão de porta de entrada:** `VOX_SIGNAL_MAX_CONNECTIONS = 64` e `signal` burst `15` barram rajadas acima de 64 pares ou >15 pares sob mesmo NAT/CGNAT quando `VOX_RELAY_TRUST_PROXY_HOPS` não está ajustado.

### 3.2 Arquitetura assíncrona em `rust/vox-node`

```
TCP listen(backlog = VOX_SIGNAL_TCP_BACKLOG, padrão 1024)
   │
   ▼  Semaphore(VOX_SIGNAL_MAX_CONNECTIONS) + Origin/RateLimit guard
┌──────────────────────────────────────────────────────────┐
│  Conexão WebSocket (2 tasks leves Tokio por par)         │
│  ┌────────────────────┐      ┌────────────────────────┐  │
│  │ ws_read_task       │      │ ws_write_task          │  │
│  │ - frame <= 1 MB    │      │ - drena bounded mpsc   │  │
│  │ - ping/pong & JSON │      │   (capacity = 256)     │  │
│  │ - dispatch O(1)    │      │ - flush em lote no TCP │  │
│  └─────────┬──────────┘      └───────────▲────────────┘  │
└────────────┼─────────────────────────────┼───────────────┘
             │                             │
             ▼                             │ Arc<str> / Bytes (zero-copy)
┌──────────────────────────────────────────────────────────┐
│  PeerRegistry (RwLock / DashMap sharded)                 │
│  - Enfileira com try_send (não bloqueia em peer lento)   │
│  - Faixa prioritária p/ offer/answer/ice vs peer-joined  │
│  - Opção v2 (`proto: 2`): delta batched a cada 50 ms     │
└──────────────────────────────────────────────────────────┘
```

1. **Backlog TCP configurável:** `tokio::net::TcpSocket::listen(backlog)` controlado por `VOX_SIGNAL_TCP_BACKLOG` (padrão **1024**, 200× maior que `request_queue_size = 5`), eliminando `ConnectionResetError`/`ConnectionRefusedError` em rajadas de `concurrency=100+`.
2. **Desacoplamento leitor/escritor com canais limitados (*bounded channels*):** Cada conexão possui `ws_read_task` e `ws_write_task` ligadas por um canal `tokio::sync::mpsc` limitado (padrão `256` mensagens, ou par de filas `direct_tx` prioritário para `offer`/`answer`/`ice` + `presence_tx` limitado para `peer-joined`/`peer-left`).
   - O payload de `peer-joined` é serializado **uma única vez** como `Bytes` imutável e compartilhado por contagem de referência (`O(1)` alocação por destinatário).
   - O `try_send` na fila de presença nunca bloqueia a task que está registrando nem atrasa o `offer`/`answer` de outros pares. Um par com leitor travado que estoura o canal limitado é desconectado com código de fechamento limpo, evitando crescimento ilimitado de RAM.
   - Na ponta de saída (`ws_write_task`), quadros pendentes no canal são drenados e enviados antes de um único `flush()` de socket, reduzindo syscalls durante rajadas de 500 registros.
3. **Diff incremental / em lote (*batched peer list delta*):**
   - **Compatibilidade v1 (padrão para clientes existentes e `signaling-load-bench.py`):** O servidor continua emitindo `registered` + `peer-joined` / `peer-left` individuais, agora sem bloqueio síncrono.
   - **Negociação opcional v2 (`"proto": 2` em `register`, evolução futura no cliente):** Em salas grandes (>100 pares), o cliente optante recebe um único quadro `{"type":"peers-delta","joined":[...],"left":[...]}` a cada janela de `50 ms`, reduzindo a carga de **~130 mil quadros** para $O(\text{janelas})$ e reduzindo ainda mais a banda em redes móveis.
4. **Teto explícito de memória e conexão:**
   - Semáforo global `VOX_SIGNAL_MAX_CONNECTIONS` (mantém padrão **64** quando não configurado para preservar paridade de testes e contratos atuais; operadores elevam explicitamente via env ao cruzar o gatilho de 50 ativos).
   - Teto por conexão: `1 MB` para montagem de quadro + `256` itens na fila de saída (~`<= 256 KB` típico por peer em sinalização SDP/ICE) + timeout de ociosidade configurável (keepalive ping/pong) para limpar conexões zumbis no Render.

### 3.3 Critérios de aceite medidos diretamente com `tools/signaling-load-bench.py --peers 500`

Para a fase de testes lado a lado, [`tools/signaling-load-bench.py`](../../tools/signaling-load-bench.py) receberá apenas uma flag opcional `--server-bin <caminho>` (mantendo `relay/signaling.py` como alvo padrão) que inicia o binário `vox-node --mode signaling --host 127.0.0.1 --port 0` lendo `PORT=<n>` da saída padrão.

| Métrica (`--peers 500 --rounds 3`, rate limit liberado p/ loopback) | Baseline Python (`relay/signaling.py`, `LAN-09`) | Meta de aceite `rust/vox-node` (PR4.1) |
|---|---|---|
| Conectados / Registrados (`concurrency=100`) | `492 / 500` (8 `ConnectionResetError`) | **`500 / 500`** (`0` falhas de conexão/registro), com `VOX_SIGNAL_MAX_CONNECTIONS=512` definido explicitamente no teste (o padrão `64` rejeitaria conexões acima do teto) |
| Roundtrip `offer`→`answer` `p95` (`concurrency=25` e `100`) | `7.891,19 ms` – `9.375,09 ms` (7,9–9,4 s) | **`<= 100 ms`** |
| Roundtrip `offer`→`answer` `p99` (`concurrency=25` e `100`) | `8.060,29 ms` – `9.474,19 ms` (8,1–9,5 s) | **`<= 250 ms`** |
| `signal_errors` / `client_decode_errors` | `0` (nos 492 conectados) | **`0`** |
| Memória do processo servidor em 500 pares (RSS) | `39,21 MB` (pico WSet `40,99 MB`) | **`<= 25 MB` RSS** |

---

## 4. Harness de testes de contrato (risco zero na reescrita)

A suíte existente em `relay/test_*.py` (27 arquivos cobrindo rotas, validação estrutural, concorrência, segurança PM-94/T22–T32, RFC 0002 e fumaça de carga) é o **oráculo de contrato** antes de aposentar `relay/server.py`, `relay/signaling.py` ou `ZeroCentralMemory.cs`.

### 4.1 Estratégia caixa-preta lado a lado

1. **Alvo dual sem duplicar lógica de asserção:**
   - Os testes de unidade internos do Python (`test_safe_path.py`, `test_rate_limit.py`, `test_mirror_validate.py`) continuam testando os módulos Python enquanto eles existirem.
   - Os testes de contrato HTTP/WS por socket real (`test_server.py`, `test_signaling.py`, `test_signaling_origem.py`, `test_signaling_connection_cap.py`, `test_signaling_robustez.py`, `test_signaling_load_smoke.py`, `test_blind_relay.py`, `test_blind_relay_adversarial.py`, `test_blind_relay_snapshot_auth.py`, `test_central_memory_limites.py`, `test_central_memory_vault.py`, `test_cors_origens.py`, `test_mirror_body_cap.py`, `test_oauth_exchange.py`, `test_p2p_seeder.py`, `test_relay_edge_hardening.py`, `test_relay_get_endpoints.py`, `test_relay_limites_e_rotas.py`, `test_relay_threading.py`, `test_request_guard.py`) passam a suportar um fixture de processo externo controlado por `VOX_RELAY_TARGET=rust` e `VOX_RELAY_BIN=<path/to/vox-node>` que inicia `vox-node` em diretório temporário isolado (`VOX_RELAY_CACHE_DIR`) e porta efêmera `127.0.0.1:0`.
   - Para `/tx/<txId>` e `/oauth/exchange` sem rede externa (Cold Readiness), o harness aponta URLs de gateway/provedor mock locais via variáveis de teste restritas a loopback.
2. **Paridade de persistência em disco (*Golden State Fixtures*):**
   - Teste cruzado obrigatório: gravar estado com `server.py` / `ZeroCentralMemory.cs` (`state.json`, `events.jsonl`, `blobs/*.json`, `vaults/*.json`, `inbox/*/*.json`, `blind/*/env_*.json`, `latest_snapshot.json`, `index_*.json` + `.sha256`), abrir o mesmo diretório com `vox-node` e verificar leitura idêntica; e o inverso (estado gravado por `vox-node` lido por `server.py`).
3. **Critério de corte (*cutover*) para aposentar código legado:**
   - `relay/server.py`, `relay/signaling.py` e `packaging/zero-central-memory-windows/*.cs` **não são removidos** nos PRs 4.1–4.3 enquanto `VOX_RELAY_TARGET=rust` e `VOX_RELAY_TARGET=python` não estiverem 100% verdes em paralelo no CI e após validação operacional local.

---

## 5. Superfície C-ABI / JNI mínima (`libvoxnode.so`)

No Android, apenas o aplicativo de infraestrutura dedicada **`vox-populi.apk`** (`org.vox.populi`, Foreground Service [`VoxPopuliNodeService.java`](../../android/src/org/vox/populi/VoxPopuliNodeService.java)) recebe o daemon nativo. O cliente **`vox.apk`** (`org.vox.client`) permanece 100% Java puro sem `.so`.

### 5.1 Isolamento de `unsafe` ([ADR-039](../adr/039-rust-por-fases.md) + `HARDENING`)

- `rust/Cargo.toml` define `unsafe_code = "forbid"` em `[workspace.lints.rust]`, mas lints de workspace só valem para os crates que optam com `[lints] workspace = true`. `rust/vox-core` e `rust/vox-node` optam (`forbid` herdado). `forbid` não pode ser relaxado por crate filho que herda o lint; por isso `rust/vox-node-ffi` **não** usa `[lints] workspace = true`: declara no próprio `Cargo.toml` `[lints.rust] unsafe_code = "deny"` e libera `#[allow(unsafe_code)]` apenas nos módulos de marshalling C-ABI/JNI, mantendo os demais lints do workspace replicados explicitamente.
- O único crate autorizado a conter código `unsafe` (restrito estritamente ao marshalling de ponteiros C-ABI / `JNIEnv`) é o adaptador fino `rust/vox-node-ffi` (`crate-type = ["cdylib"]`), onde cada bloco `unsafe` exige comentário `// SAFETY:` auditável e verificação explícita de ponteiro nulo e UTF-8 válido antes de chamar o núcleo seguro de `vox-node`.

### 5.2 Assinatura C-ABI e mapeamento JNI exato

| Camada | Assinatura | Semântica e propriedade de memória |
|---|---|---|
| **C-ABI (`vox-node-ffi`)** | `int32_t vox_node_start(const char *data_dir, uint16_t port)` | Inicializa um runtime Tokio dedicado (armazenado em `OnceLock<Mutex<Option<NodeHandle>>>`) escutando estritamente em `127.0.0.1:<port>` usando `data_dir` para cache, inbox e memória central. Idempotente se já ativo na mesma porta/diretório. Retorna `0` em sucesso; `< 0` em erro (`-1` args inválidos/UTF-8, `-2` falha de bind/I/O, `-3` já rodando em outra configuração). |
| **C-ABI (`vox-node-ffi`)** | `int32_t vox_node_stop(void)` | Sinaliza shutdown gracioso (`oneshot` / `CancellationToken`), aguarda flush de `state.json` / journal e encerra o runtime. Retorna `0` em sucesso (`1` se já parado). |
| **C-ABI (`vox-node-ffi`)** | `char *vox_node_health_json(void)` + `void vox_node_string_free(char *ptr)` | Serializa o JSON de saúde/telemetria em buffer alocado por `CString::into_raw()`. O chamador C deve liberar o ponteiro com `vox_node_string_free`; em JNI o shim converte imediatamente para `jstring` e libera antes de retornar ao Java, evitando vazamentos e corridas em buffer estático. |
| **JNI (`VoxPopuliNodeService`)** | `native int nativeStart(String dataDir, int port)` → `Java_org_vox_populi_VoxPopuliNodeService_nativeStart` | Valida `port` em `1..=65535`, extrai `GetStringUTFChars`, delega a `vox_node_start` e libera a string JNI. |
| **JNI (`VoxPopuliNodeService`)** | `native int nativeStop()` → `Java_org_vox_populi_VoxPopuliNodeService_nativeStop` | Delega a `vox_node_stop()`. |
| **JNI (`VoxPopuliNodeService`)** | `native String nativeHealthJson()` → `Java_org_vox_populi_VoxPopuliNodeService_nativeHealthJson` | Chama `vox_node_health_json()`, cria `NewStringUTF`, chama `vox_node_string_free()` e devolve o `jstring` (ou `null` em falha). |

### 5.3 Integração no ciclo de vida de `VoxPopuliNodeService.java`

- Carregamento estático: `System.loadLibrary("voxnode");` em `VoxPopuliNodeService`.
- `onCreate()` / `onStartCommand()`: além de criar o canal de notificação e chamar `startForeground(...)`, inicia o nó local chamando `nativeStart(new File(getFilesDir(), "vox-node").getAbsolutePath(), 3921)` quando `!isPaused && NodeNetworkGuard.isWifiConnected(this)`.
- `ACTION_TOGGLE`: alternar para pausado chama `nativeStop()` (ou alterna pausa interna mantendo serviço em foreground) e atualiza a notificação; retomar em Wi-Fi chama `nativeStart(...)`.
- `onDestroy()`: chama `nativeStop()` antes de `super.onDestroy()` para garantir consolidação do `state.json` sem corrupção.
- Empacotamento em [`android/build.ps1`](../../android/build.ps1): somente a variante `vox-populi` inclui `lib/arm64-v8a/libvoxnode.so` (e `armeabi-v7a` / `x86_64` para emuladores/WSA) antes do `zipalign` e `apksigner`; a variante `vox` (`org.vox.client`) não inclui nenhum diretório `lib/`.

---

## 6. Cadeia de suprimentos (`LAN-20`) e entrega em 4 PRs

### 6.1 Disciplina de crates, métricas e CI

Em conformidade com [ADR-039 §3.1](../adr/039-rust-por-fases.md#31-regras-que-valem-em-todas-as-fases), [DEPENDENCIAS.md](../DEPENDENCIAS.md) e [HARDENING.md](../HARDENING.md):

1. **Árvore enxuta de crates (sem OpenSSL C):**
   - `vox-core`: 0 dependências (`#![no_std]`, `#![forbid(unsafe_code)]`).
   - `vox-node`: `tokio` (features mínimas `rt-multi-thread`, `net`, `io-util`, `sync`, `time`, `signal`, `fs`), `hyper` + `hyper-util` (ou `axum` minimal sem middleware pesado), `tokio-tungstenite`, `serde` + `serde_json` (`#[serde(deny_unknown_fields)]` nos contratos estritos), `bytes`, `sha2`, `hex`, `subtle` (comparação em tempo constante de tokens/provas), `rustls` + `hyper-rustls` + `webpki-roots` (TLS 100% Rust para `/tx/<id>` e `/oauth/exchange`, evitando dependência de `openssl-sys` em cross-compile Windows/Android), `dashmap` ou `std::sync::Mutex` + mapa LRU pequeno.
   - `vox-node-ffi`: `jni` (ou FFI C/JNI mínimo) + `vox-node`.
2. **Portões automáticos no CI (`.github/workflows/ci.yml`):**
   - `cargo fmt --all -- --check` e `cargo clippy --workspace --all-targets -- -D warnings`.
   - `cargo deny check` (com `rust/deny.toml`: licenças permitidas `AGPL-3.0-or-later`, `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `MPL-2.0`, `Unicode-3.0`; fontes restritas a `crates.io`; zero crates banidas como `openssl-sys`).
   - `cargo audit` (alertas RustSec bloqueiam PR).
   - Catraca de complexidade via `rust-code-analysis` alinhada ao [HARDENING.md](../HARDENING.md) (`LLOC <= 30`, `Aninhamento <= 4`, `CC <= 15`, `Cognitiva <= 15`, `Parâmetros <= 5`, `Arquivo <= 350`).
   - `#![deny(missing_docs)]` em todo crate, `README.md` com banner válido de `docs/CONTRIBUTING-DOCS.md` em cada crate novo, e registro de crates diretas e binários em [DEPENDENCIAS.md](../DEPENDENCIAS.md).

### 6.2 Plano incremental de 4 PRs

| PR | Escopo exato | Critério de verificação e aceite | Dependências |
|---|---|---|---|
| **PR4.1 · Sinalização + `LAN-09`** | Cria `rust/vox-node` (modo `signaling`), `rust/deny.toml`, jobs `cargo-deny` / `cargo-audit` no CI e inventário em `DEPENDENCIAS.md`. Implementa WebSocket RFC 6455 (`tokio-tungstenite`), rotas HTTP `/`, `/health`, `/status`, `/ping`, guarda `Host`/`Origin`/CORS, rate limit `signal`/`signal_msg`, `VOX_RELAY_TRUST_PROXY_HOPS`, backlog configurável e filas limitadas por par. | `test_signaling.py`, `test_signaling_origem.py`, `test_signaling_connection_cap.py`, `test_signaling_robustez.py` e `test_signaling_load_smoke.py` verdes contra `vox-node`; `python tools/signaling-load-bench.py --peers 500 --server-bin ...` atingindo `500/500`, `p95 <= 100 ms`, `p99 <= 250 ms`, `<= 25 MB` RSS. | `rust/Cargo.toml` (Fase 0/1) |
| **PR4.2 · Relay completo, memória e inbox** | Adiciona rotas HTTP `/health`, `/tx/*`, `/vox/*`, `/inbox/*`, `/relay/*`, `/memory/*`, `/p2p/*`, `/peer/beacon`, `/oauth/exchange`, persistência atômica compatível em disco (`state.json`, `events.jsonl`, sidecars `.sha256`), dreno `T31`, `vox_core::genesis_guard` e janela de purga (`VOX_RELAY_PURGE_INTERVAL_SECONDS`). | 100% dos testes caixa-preta em `relay/test_*.py` verdes com `VOX_RELAY_TARGET=rust` em paralelo ao Python; teste de fixture cruzada Python ↔ Rust no mesmo diretório em disco; `npm run validate` verde. | PR4.1 |
| **PR4.3 · Paridade Windows (`VoxPopuli.exe` / `VoxMemoria.exe`)** | Adiciona modo `--mode memoria` com porta de controle `3922`, `control.token`, endpoints `/dashboard`, `/memory/logs|vaults|telemetry|checkpoint|pause|resume`, túnel `cloudflared`, Job Objects / prioridade no Windows e wrapper de bandeja substituindo `node_zero.py` e `ZeroCentralMemory.cs`. | Testes de contrato Windows (`test_network_contract.py`, `smoke-test.ps1`, `test-smoke-preflight.ps1`) verdes contra `vox-node`; `release-binarios.yml` gerando `VoxPopuli.exe` e `VoxMemoria.exe` com `SHA256SUMS` e atestação de proveniência. | PR4.2 |
| **PR4.4 · Android JNI (`libvoxnode.so`)** | Cria `rust/vox-node-ffi` (`cdylib`), implementa `vox_node_start`/`stop`/`health_json`/`string_free` e os bindings JNI em `VoxPopuliNodeService.java`; atualiza `android/build.ps1` e `release-binarios.yml` para compilar `libvoxnode.so` via `cargo-ndk` apenas para `vox-populi.apk`. | `vox-populi.apk` sobe `127.0.0.1:3921/health` real em Foreground Service (verificado em emulador/dispositivo via `adb forward`); `vox.apk` (`org.vox.client`) permanece intacto sem `.so` e `<= 100 KiB`. | PR4.2 |
