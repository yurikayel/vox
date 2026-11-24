# `rust/vox-node`

> **Status:** em desenvolvimento (PR4.3: modo `--mode memoria` na porta `3922` com `control.token`, paridade HTTP do relay, `vox_core::genesis_guard` e sinalização WebSocket RFC 6455 em Rust `std` puro) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-23  
> **Referências:** [ADR-039](../../docs/adr/039-rust-por-fases.md) · [Blueprint Fase 4](../../docs/specs/vox-node-rust-fase4.md) · [DEPENDENCIAS.md](../../docs/DEPENDENCIAS.md)

Binário unificado da Fase 4 do [ADR-039](../../docs/adr/039-rust-por-fases.md), construído com `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]` e zero dependências externas (apenas `vox-core` + `std`).

## Escopo atual (PR4.3)

- `--help` / `-h`: exibe ajuda da linha de comando.
- `--version` / `-V`: exibe a versão do pacote.
- `--health-json` / `--check`: valida o `vox_core::genesis_guard` e imprime JSON de saúde (`status`, `service`, `version`, `genesis_ms`, `genesis_guard`).
- `--mode signaling [--host <ADDR>] [--port <PORT>]`: servidor WebSocket RFC 6455 (`register`, `offer`, `answer`, `ice`, `ping`, `peer-joined`, `peer-left`, fragmentação e controle ping/pong/close) + rotas HTTP `/`, `/health`, `/status`, `/ping`, guarda `Host`/`Origin`/CORS por allowlist, rate limit `signal`/`signal_msg` por IP (IPv6 `/64` + `VOX_RELAY_TRUST_PROXY_HOPS`), `VOX_SIGNAL_MAX_CONNECTIONS` e fan-out não-bloqueante por filas limitadas (`VOX_SIGNAL_MAX_OUTBOUND_QUEUE`).
- `--mode relay [--host <ADDR>] [--port <PORT>] [--data-dir <DIR>]`: servidor HTTP do relay (Cold Readiness: bind padrão `127.0.0.1:3920`) com:
  - Saúde e diagnóstico: `/`, `/health`, `/status`, `/ping`, `/version` (com contadores de cache, `cacheIntegrity` SHA-256, `centralMemory` e `p2p`).
  - Cache verificado por sidecar `.sha256`: `GET /tx/<txId>` (cache local), `GET /vox/index/<commId>.json`, `POST /vox/mirror` (validação estrutural v1 ≤ 256 KiB, ≤ 500 tópicos, cota `VOX_RELAY_MAX_CACHE_MB` com evicção por `mtime` e `507`).
  - Inbox cifrado: `GET`/`POST /inbox/<addr>`, `DELETE /inbox/<addr>/<msgId>` com `X-Vox-Delete-Token` em tempo constante.
  - Relay cego (RFC 0002): `GET`/`POST /relay/envelope/<canal>` (`since`, `since_serial`, limite 100, TTL 7 dias, idempotência) e `GET`/`POST /relay/snapshot/<canal>` (`X-Vox-Snapshot-Proof`, `compat`/`enforce`, `403`/`409`/`400`, tetos de salto 16/1000, poda de deltas cobertos).
  - Memória central e cofres v2: `GET /memory`, `/memory/status`, `/memory/state`, `/memory/blob/<sha256>`, `POST /memory/ingest`, `POST /memory/sync`, `GET`/`POST /memory/vault/<chave>` — com corte real via `vox_core::genesis_guard` (rejeita contas de teste e posts pré-gênese em ingest, sync e carga de `state.json`), escrita atômica (`state.json`, `.bak`, `events.jsonl`) e verificação SHA-256 de blobs.
  - P2P Seeder e Beacon (`VOX-PEER-v1`): `GET /p2p/status`, `/p2p/blobs`, `/p2p/seed/<hash>`, `/peer/beacon`, `/p2p/peers`, `POST /p2p/seed` (auto-autorização de blobs da memória central, teto 64 seeds / 512 MiB), `DELETE /p2p/seed/<hash>`, `POST /peer/beacon` (TTL 60 s).
  - Purga TTL determinística (`purge_expired_at` + sweeper opcional via `VOX_RELAY_PURGE_INTERVAL_SECONDS`), guarda `Host`/`Origin`/`Content-Type`/CORS por allowlist, rate limit por IP (`429` + `Retry-After`) e dreno de corpo rejeitado (`T31`).
- `--mode memoria [--host <ADDR>] [--port <PORT>] [--data-dir <DIR>]`: servidor local Vox Memória / Vox Populi (Cold Readiness: bind padrão `127.0.0.1:3922`) com:
  - Geração e persistência automática de `control.token` em `<data-dir>/control.token`, validado em tempo constante via `X-Vox-Control-Token` ou `Authorization: Bearer`.
  - Dashboard HTML embutido em `/` (`/dashboard`, `/monitor`), saúde e telemetria em `/health`, `/status`, `/api/status`, `/api/telemetry`, `/memory/telemetry`, `/memory/vaults` e `/memory/logs` (com CORS estritamente por allowlist, sem `*`).
  - Rotas `/memory/*` (`/memory`, `/memory/status`, `/memory/state`, `/memory/blob/<sha256>`, `/memory/ingest`, `/memory/sync`, `/memory/vault/<chave>`) reutilizando `MemoryStore` + `vox_core::genesis_guard`.
  - Controle autenticado por `control.token`: `POST /control/pause` (`/api/pause`, `/memory/pause`), `POST /control/resume` (`/api/resume`, `/memory/resume`), `POST /memory/checkpoint` e `POST /control/shutdown` (`/api/stop`), bloqueando escritas com `503 {"error":"node_paused"}` enquanto pausado.
  - Empacotamento Windows em [`packaging/vox-memoria-windows/`](../../packaging/vox-memoria-windows/README.md).

## Gaps conhecidos (Rust `std` puro, zero dependências externas)

Para manter `rust/Cargo.lock` com **zero dependências externas** nesta fase (conforme `tests/rust-genesis-parity.test.js`), não há cliente HTTPS/TLS embutido:

- **`GET /tx/<txId>` (cache miss):** serve normalmente hits verificados por `.sha256` do disco (`200`, `X-Vox-Cache: HIT`) e rejeita IDs inválidos (`400`), mas em *cache miss* retorna `404` local em vez de consultar gateways Arweave HTTPS upstream (`arweave.net` / `turbo-gateway.com`).
- **`POST /oauth/exchange`:** aplica o limite de 8 KiB (`413`) e valida JSON e campos obrigatórios `provider`/`code` (`400`), mas responde `501 Not Implemented` (`{"error":"oauth_exchange_requires_tls_client"}`) em vez de abrir conexão HTTPS externa para provedores OAuth.

## Verificação local

```bash
cargo fmt --manifest-path rust/Cargo.toml --all -- --check
cargo clippy --manifest-path rust/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml -p vox-node
```
