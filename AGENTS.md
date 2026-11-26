# Agentes — Vox (local) · Perfil Canônico v3.2

Escopo **somente** o sub-repo [`vox/`](.). Não escrever roteiro Matrix/vídeo aqui nem promover conteúdo de `politica/` para `~/.gemini/config/AGENTS.md`.
- **Hardening v3.2:** [docs/HARDENING.md](docs/HARDENING.md) (limites e o que o CI bloqueia) · **Evidência de testes e auditoria:** [docs/process/qualidade-e-evidencia.md](docs/process/qualidade-e-evidencia.md). Este repositório é autossuficiente: não dependa de arquivos de `politica/`.
- **Postura vibe/qualidade v2:** completa [`../.cursor/rules/engineering-vibe-quality.mdc`](../.cursor/rules/engineering-vibe-quality.mdc) · compacta [`../.cursor/rules/engineering-vibe-quality-compact.mdc`](../.cursor/rules/engineering-vibe-quality-compact.mdc) — complementa o Canônico; **limites numéricos e CI** seguem HARDENING v3.2.

## Mutex e Ownership

- **Um agente por arquivo** (ou por **§N** se o markdown tiver **>200 linhas**).
- **Ownership & Handoff:** Registrar locks ativos e encerrar todo turno com `SHA`, `Branch`, `Arquivos`, `Testes` (`PASS`, `FAIL` separando *Erro observado / Causa confirmada / Causa provável*, `NOT RUN`, `BLOCKED`), `Ownership`, `Restrições` e `Pendências`.
- **Proibido:** edição paralela do mesmo doc canônico em `docs/` (coordenar via PR ou fila no chat).

## Revisor vs implementação

Operação curta: [docs/process/metodo-agentes-mutex-e-revisor.md](docs/process/metodo-agentes-mutex-e-revisor.md).

**Orçamento de orquestração:** um executor por padrão (no máximo 2 em paralelo, com mutex disjunto), brief com aceite, até 8 caminhos e um comando de teste, sem ondas automáticas nem polling de CI. Regra completa em [metodo-agentes-mutex-e-revisor.md § Orçamento de orquestração](docs/process/metodo-agentes-mutex-e-revisor.md#orçamento-de-orquestração-fonte-única).

## Testes e Qualidade

PRs de feature vão para `develop`; `develop` vai para `main` por PR quando o lote está pronto. Antes de pedir merge: `npm run validate` na raiz de `vox/` (lint, lint do Python, auditoria de complexidade, auditoria de documentação e testes). `develop` e `main` são protegidos: merge só por PR com o CI verde.
