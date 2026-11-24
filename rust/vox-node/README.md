# `rust/vox-node`

> **Status:** em desenvolvimento (PR4.2a: modo `relay` HTTP essencial + modo `signaling` WebSocket RFC 6455 em Rust `std` puro) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-23  
> **Referências:** [ADR-039](../../docs/adr/039-rust-por-fases.md) · [Blueprint Fase 4](../../docs/specs/vox-node-rust-fase4.md) · [DEPENDENCIAS.md](../../docs/DEPENDENCIAS.md)

Binário unificado da Fase 4 do [ADR-039](../../docs/adr/039-rust-por-fases.md), construído com `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]` e zero dependências externas (apenas `vox-core` + `std`).

## Escopo atual (PR4.2a)

- `--help` / `-h`: exibe ajuda da linha de comando.
- `--version` / `-V`: exibe a versão do pacote.
- `--health-json` / `--check`: valida o `vox_core::genesis_guard` e imprime JSON de saúde (`status`, `service`, `version`, `genesis_ms`, `genesis_guard`).
- `--mode signaling [--host <ADDR>] [--port <PORT>]`: servidor WebSocket RFC 6455 (`register`, `offer`, `answer`, `ice`, `ping`, `peer-joined`, `peer-left`, fragmentação e controle ping/pong/close) + rotas HTTP `/`, `/health`, `/status`, `/ping`, guarda `Host`/`Origin`/CORS por allowlist, rate limit `signal`/`signal_msg` por IP (IPv6 `/64` + `VOX_RELAY_TRUST_PROXY_HOPS`), `VOX_SIGNAL_MAX_CONNECTIONS` e fan-out não-bloqueante por filas limitadas (`VOX_SIGNAL_MAX_OUTBOUND_QUEUE`).
- `--mode relay [--host <ADDR>] [--port <PORT>] [--data-dir <DIR>]`: recorte HTTP essencial do relay (Cold Readiness: bind padrão `127.0.0.1:3920`) com rotas `/`, `/health`, `/status`, `/ping`, `/version`, `/inbox/<addr>` (`GET`/`POST`, persistência atômica em disco com TTL 72 h e teto de 32 KiB) e `/inbox/<addr>/<msgId>` (`DELETE` com verificação SHA-256 em tempo constante via `X-Vox-Delete-Token`), guarda `Host`/`Origin`/`Content-Type`/CORS por allowlist, rate limit `mailbox`/`write` por IP (`429` + `Retry-After`) e dreno de corpo rejeitado (`T31`).

## Verificação local

```bash
cargo fmt --manifest-path rust/Cargo.toml --all -- --check
cargo clippy --manifest-path rust/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml -p vox-node
```
