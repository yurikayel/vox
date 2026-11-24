# Empacotamento Windows — Vox Memória / Vox Populi (Rust `vox-node`)

> **Status:** ativo (ADR-039 PR4.3 — modo `--mode memoria` em Rust `std` puro) · **Owner:** mantenedor relay / steward ops · **Revisado:** 2026-11-23  
> **Referências:** [ADR-039](../../docs/adr/039-rust-por-fases.md) · [Blueprint Fase 4](../../docs/specs/vox-node-rust-fase4.md) · [`rust/vox-node/README.md`](../../rust/vox-node/README.md)

Scripts de empacotamento e verificação local para gerar os executáveis Windows `VoxMemoria.exe` e `VoxPopuli.exe` diretamente a partir do binário unificado [`rust/vox-node`](../../rust/vox-node/README.md), sem dependências externas de crates e em conformidade com **Cold Readiness** (bind padrão `127.0.0.1:3922`).

## Pré-requisitos no Windows

- Toolchain Rust estável (`cargo`, `rustc`) instalada via `rustup`.
- Linker MSVC (`link.exe` via Visual Studio C++ Build Tools) para gerar binários nativos `.exe`.

## Compilação (`build.ps1`)

```powershell
pwsh -File packaging/vox-memoria-windows/build.ps1
```

O script compila `rust/vox-node` em `--release`, copia o executável para `dist/VoxMemoria.exe` e `dist/VoxPopuli.exe`, grava `dist/SHA256SUMS-vox-memoria.txt` e executa o autoteste `--version` e `--health-json`.

## Smoke test local (`smoke-test.ps1`)

```powershell
pwsh -File packaging/vox-memoria-windows/smoke-test.ps1
```

Valida em diretório temporário isolado:
1. Subida de `VoxMemoria.exe --mode memoria --host 127.0.0.1 --port 13922 --data-dir <temp>`.
2. Resposta `200 OK` em `/` (dashboard HTML embutido), `/health`, `/status` e `/api/telemetry`.
3. Recusa de contas de teste (`vx_ana`) via `vox_core::genesis_guard` em `POST /memory/ingest`.
4. Proteção de `POST /control/shutdown`: `401 Unauthorized` sem token e `200 OK` + encerramento limpo com o `control.token` gravado em `<data-dir>/control.token`.
