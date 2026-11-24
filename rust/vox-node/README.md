# `rust/vox-node`

> **Status:** rascunho (PR4.1a: scaffold inicial do binário e CLI `--health-json`, sem rede/WebSocket) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-23  
> **Referências:** [ADR-039](../../docs/adr/039-rust-por-fases.md) · [Blueprint Fase 4](../../docs/specs/vox-node-rust-fase4.md) · [DEPENDENCIAS.md](../../docs/DEPENDENCIAS.md)

Binário unificado da Fase 4 do [ADR-039](../../docs/adr/039-rust-por-fases.md), construído com `#![forbid(unsafe_code)]`, `#![deny(missing_docs)]` e zero dependências externas no PR4.1a (apenas `vox-core` + `std`).

## Escopo deste scaffold (PR4.1a)

- `--help` / `-h`: exibe ajuda da linha de comando.
- `--version` / `-V`: exibe a versão do pacote.
- `--health-json` / `--check`: valida o `vox_core::genesis_guard` e imprime JSON de saúde (`status`, `service`, `version`, `genesis_ms`, `genesis_guard`).

O servidor de sinalização WebSocket (`LAN-09`), as rotas HTTP e o rate limiting entram a partir do PR4.1b conforme [vox-node-rust-fase4.md](../../docs/specs/vox-node-rust-fase4.md).

## Verificação local

```bash
cargo fmt --manifest-path rust/Cargo.toml --check
cargo clippy --manifest-path rust/Cargo.toml -p vox-node --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml -p vox-node
```
