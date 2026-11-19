# 🖥️ Vox Relay Desktop — Nó Local de Espelho & Cache

O **Vox Relay Desktop** é um serviço leve e opcional para computadores pessoais. Ele atua como um nó local de cache acelerador e espelho parcial para o cliente web (PWA) do Vox, reduzindo requisições a gateways públicos e garantindo navegação rápida mesmo com conexão instável.

---

## 🚀 Como Iniciar

> **Dois processos:** `server.py` é o relay completo (porta 3920, abaixo). `signaling.py` é só a sinalização WebRTC (porta 3921) — é o que `npm start`, o [`relay/Dockerfile`](./Dockerfile) e o nó público Render rodam. Ver [docs/specs/relay-api.md](../docs/specs/relay-api.md).

O servidor utiliza apenas a biblioteca padrão do Python 3 (nenhuma instalação via `pip` é necessária):

```bash
cd vox/relay
python server.py
```

O serviço iniciará na porta padrão `3920`:
```text
======================================================
  Vox Relay Desktop — Nó Local de Espelho & Cache
  Escutando em: http://127.0.0.1:3920
  Verificação de status: http://127.0.0.1:3920/health
  Diretório de cache: .../relay/.cache
======================================================
```

---

## 🛠️ Como o PWA se conecta ao Relay

Ao abrir o Vox no navegador (`http://127.0.0.1:8080`), o cliente consulta automaticamente `http://127.0.0.1:3920/health`.
* Se o relay estiver ligado, o Vox prioriza buscar os corpos de transações via `http://127.0.0.1:3920/tx/<txId>`, que armazena os dados no disco local (`.cache/`).
* Na tela **"Nó"** (`#/settings/network`), o badge exibirá:  
  `🟢 Relay Online (127.0.0.1:3920) — X itens em disco`.

---

## 🌐 Endpoints Disponíveis

| Rota | Método | Descrição |
|---|---|---|
| `/health` | `GET` | Status, `communityIndexes`, `cacheBytes`, `maxCacheBytes` e resumo `centralMemory`. |
| `/tx/<txId>` | `GET` | Retorna o payload da transação (Cache HIT se local; busca em `arweave.net` se MISS). |
| `/vox/index/<commId>.json` | `GET` | Retorna índice consolidado da comunidade armazenado localmente. |
| `/vox/mirror` | `POST` | Salva espelho local de comunidade recebido pelo cliente. |
| `/inbox/<address>` | `GET` / `POST` / `DELETE` | Inbox efêmero com TTL para envelopes E2E cifrados de DM (`inbox.py`). O `DELETE` de envelope com chave de apagar exige `X-Vox-Delete-Token` (PM-94). |
| `/relay/envelope/<room>` | `GET` / `POST` | Relay cego (*Blind Relay* — `blind_relay.py`) para pacotes opacos sem inspeção de conteúdo. |
| `/memory/status` | `GET` | Status e contadores da memória central (`posts`, `profiles`, `tombstones`, `manifests`, `blobs`, `tunnelUrl`). |
| `/memory/state` | `GET` | Exportação completa do estado persistido localmente (`central_memory.py`). |
| `/memory/ingest` | `POST` | Ingestão unitária (`GOSSIP`, `GOSSIP_UPDATE`, `GOSSIP_DELETE`, `PROFILE_CARD`, `MEDIA_BLOB`) com journal append-only. |
| `/memory/sync` | `POST` | Sincronização bidirecional incremental (Delta Sync via `clientRevision`, `since` e `knownBlobs`). |
| `/memory/blob/<hash>` | `GET` | Recuperação direta de blob multimídia deduplicado por SHA-256. |
| `/memory/vault/<chave>` | `GET` / `POST` | Cofre v2 cifrado no cliente (ADR-025). Regravar exige a prova do dono `ownerToken` (PM-94, ADR-027). |
| `/relay/snapshot/<canal>` | `GET` / `POST` | Último snapshot consolidado do relay cego. O `POST` leva a prova de dono em `X-Vox-Snapshot-Proof` ([RFC 0002](../docs/rfc/0002-snapshot-autenticado-do-relay-cego.md)); só snapshot autenticado poda envelopes. |
| `/p2p/*`, `/peer/beacon` | vários | Seeder P2P e anúncio de pares. |
| `/oauth/exchange` | `POST` | Troca código OAuth pelo `@usuário` (token descartado). |

**Política de pedido (PM-94, `request_guard.py`):** `Host` de loopback (ou `VOX_RELAY_ALLOWED_HOSTS`), `POST`/`DELETE` só das origens do app (ou `VOX_RELAY_ALLOWED_ORIGINS`), `POST` só `application/json`, e no máximo `VOX_RELAY_WRITE_LIMIT_PER_MIN` escritas por minuto por IP.

**Limpeza e limites (lacunas 5 e 7):** `purge_schedule.py` roda uma thread daemon que apaga o expirado do inbox (72 h) e do canal cego (7 d) a cada `VOX_RELAY_PURGE_INTERVAL_SECONDS` (padrão 900; `0` desliga). `VOX_RELAY_MAX_CACHE_MB` tem padrão **512** (`0` explícito = sem teto) e `VOX_RELAY_MAX_TX_MB` (padrão 32) limita a resposta de gateway aceita em `/tx/<id>`: acima disso, `413`.

**Snapshot autenticado (RFC 0002):** `POST /relay/snapshot/<canal>` aceita o cabeçalho `X-Vox-Snapshot-Proof` (64 hex, HMAC calculado pelo cliente; o relay guarda só o SHA-256). **O primeiro a provar vira dono do canal**; depois, só a mesma prova grava (`403` sem ela ou com outra). `VOX_RELAY_SNAPSHOT_AUTH=compat` (padrão) aceita snapshot sem prova como `auth: false`, **sem podar** nem travar; `enforce` responde `403` sem prova. Tetos: `VOX_RELAY_SNAPSHOT_MAX_COVERED_JUMP` (1000) e `VOX_RELAY_SNAPSHOT_MAX_EPOCH_JUMP` (16). Conflito → `409` com `currentEpoch`/`currentCoveredSerial`; reenvio idêntico → `200` com `"idempotent": true`.
**Reiniciar o dono (steward):** segredo perdido, relay em outro domínio ou falso dono → apague `latest_snapshot.json` do canal (`<VOX_RELAY_BLIND_DIR>/<canal>/latest_snapshot.json`; o diretório padrão está em `resolve_relay_dir`). O próximo snapshot com prova reivindica o canal; envelopes e TTL ficam como estão. Limite aceito: quem prova primeiro num canal novo vira dono, por isso o cliente confere a `sig` do snapshot contra os autores antes de aplicar.

**CORS:** o relay só devolve `Access-Control-Allow-Origin` (com `Vary: Origin`) para as origens do app (`https://yurikayel.github.io`, `https://vox-9df.pages.dev`), para `http(s)://localhost` e `127.0.0.1` e para as listadas em **`VOX_RELAY_ALLOWED_ORIGINS`** (separadas por vírgula, origem exata, ex.: `https://meu-espelho.example,https://outro.example`). Outras páginas não conseguem ler as respostas; `Access-Control-Allow-Private-Network` também só vai para origem permitida. Quem publica o app em outro domínio precisa pôr esse domínio na variável, senão o navegador bloqueia a leitura.

Referência completa (limites, TTLs, variáveis de ambiente, testes): **[docs/specs/relay-api.md](../docs/specs/relay-api.md)**.

---

## 💾 Nó Windows System Tray Modo 3 (`VoxPopuli-ZeroMemory.exe`)

Para sustentar a memória da rede durante Alpha e Beta sem depender de janela de terminal aberta:

* **Código-fonte e compilador:** [`../packaging/zero-central-memory-windows/`](../packaging/zero-central-memory-windows/) (`build.ps1`, usa `csc.exe` nativo do Windows, gerando binário standalone de **~170 KB**).
* **Arquitetura Modo 3:**
  * **WAL append-only (`< 0,2 ms`):** grava cada evento imediatamente em `central_memory.journal.ndjson`.
  * **Batch Snapshot (2s):** consolida atomicamente em `central_memory.state.json` + `.bak` a cada 2 segundos se houver alterações.
  * **Túnel HTTPS Cloudflare + Signaling Beacon:** inicia automaticamente `cloudflared` (se instalado) e anuncia a URL pública em `wss://vox-sentinel.onrender.com` (`vx_zero_memory_beacon`) para descoberta automática por clientes remotos.

---

## 📡 Servidor de Sinalização WebRTC (`signaling.py` — Fase 3.2)

Para conectar instâncias do Vox em **dispositivos diferentes** (mesma rede local Wi-Fi ou pela internet) via WebRTC DataChannel, o relay inclui um servidor WebSocket leve baseado na biblioteca padrão:

```bash
cd vox/relay
python signaling.py --port 3921
```

* **Porta padrão:** `3921` (`ws://127.0.0.1:3921`).
* **Função estrita:** Apenas troca de ofertas/respostas SDP e candidatos ICE entre pares. O servidor **não armazena conteúdo**, não analisa mensagens e não faz persistência.
* **Rede descentralizada:** Comunidades, coletivos ou usuários avançados podem rodar seu próprio servidor de sinalização em LAN ou VPS (`wss://seu-dominio/`), configurando a URL customizada diretamente no PWA em `#/settings/network`.
* **Prazos e mensagens fragmentadas:** o handshake HTTP tem prazo total (`HANDSHAKE_TIMEOUT`, 10 s); depois que o cabeçalho de um quadro chega, o resto precisa chegar em `FRAME_TIMEOUT` (30 s). Esperar o próximo quadro não tem prazo: um par registrado pode ficar quieto. Mensagens fragmentadas (RFC 6455 §5.4) são remontadas por `MessageAssembler`, com teto `MAX_WS_MESSAGE_SIZE` para a soma dos fragmentos; quadro de controle fragmentado, opcode desconhecido ou continuação fora de ordem encerram a conexão. Testes em `relay/test_signaling_robustez.py`.

---

## 🔒 Segurança e Privacidade

* **Escuta apenas em `127.0.0.1`:** Por padrão, o relay não expõe portas para a internet externa.
* **Dados públicos:** O relay armazena em cache apenas transações públicas que já estão gravadas na rede Arweave.
* **Pasta `.cache/` no `.gitignore`:** Nenhum dado baixado é versionado no repositório Git.
