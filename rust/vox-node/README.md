# `rust/vox-node`

> **Status:** em desenvolvimento (PR4.1b: modo `signaling` WebSocket RFC 6455 + health HTTP em Rust `std` puro) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-23  
> **Referências:** [ADR-039](../../docs/adr/039-rust-por-fases.md) · [Blueprint Fase 4](../../docs/specs/vox-node-rust-fase4.md) · [DEPENDENCIAS.md](../../docs/DEPENDENCIAS.md)

Binário unificado da Fase 4 do [ADR-039](../../docs/adr/039-rust-por-fases.md), construído com `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]` e zero dependências externas (apenas `vox-core` + `std`).

## Escopo atual (PR4.1b)

- `--help` / `-h`: exibe ajuda da linha de comando.
- `--version` / `-V`: exibe a versão do pacote.
- `--health-json` / `--check`: valida o `vox_core::genesis_guard` e imprime JSON de saúde (`status`, `service`, `version`, `genesis_ms`, `genesis_guard`).
- `--mode signaling [--host <ADDR>] [--port <PORT>]`: servidor WebSocket RFC 6455 (`register`, `offer`, `answer`, `ice`, `ping`, `peer-joined`, `peer-left`, fragmentação e controle ping/pong/close) + rotas HTTP `/`, `/health`, `/status`, `/ping`, guarda `Host`/`Origin`/CORS por allowlist, rate limit `signal`/`signal_msg` por IP (IPv6 `/64` + `VOX_RELAY_TRUST_PROXY_HOPS`), `VOX_SIGNAL_MAX_CONNECTIONS` e fan-out não-bloqueante por filas limitadas (`VOX_SIGNAL_MAX_OUTBOUND_QUEUE`).

## Verificação local

```bash
cargo fmt --manifest-path rust/Cargo.toml --check
cargo clippy --manifest-path rust/Cargo.toml -p vox-node --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml -p vox-node
```
