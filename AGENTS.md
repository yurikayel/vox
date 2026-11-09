# Agentes — Vox (local) · Perfil Canônico v3.2

Escopo **somente** o sub-repo [`vox/`](.). Não escrever roteiro Matrix/vídeo aqui nem promover conteúdo de `politica/` para `~/.gemini/config/AGENTS.md`.
- **Hardening v3.2:** [docs/HARDENING.md](docs/HARDENING.md) (limites e o que o CI bloqueia) · **Evidência de testes e auditoria:** [docs/process/qualidade-e-evidencia.md](docs/process/qualidade-e-evidencia.md). Este repositório é autossuficiente: não dependa de arquivos de `politica/`.

## Mutex e Ownership

- **Um agente por arquivo** (ou por **§N** se o markdown tiver **>200 linhas**).
- **Ownership & Handoff:** Registrar locks ativos e encerrar todo turno com `SHA`, `Branch`, `Arquivos`, `Testes` (`PASS`, `FAIL` separando *Erro observado / Causa confirmada / Causa provável*, `NOT RUN`, `BLOCKED`), `Ownership`, `Restrições` e `Pendências`.
- **Proibido:** edição paralela do mesmo doc canônico em `docs/` (coordenar via PR ou fila no chat).

## Revisor vs implementação

Operação curta: [docs/process/metodo-agentes-mutex-e-revisor.md](docs/process/metodo-agentes-mutex-e-revisor.md).

## Testes e Qualidade

Antes de merge em `main`: `npm run validate` na raiz de `vox/` (lint, lint do Python, auditoria de complexidade e testes). O `main` é protegido: merge só por PR com o CI verde.
