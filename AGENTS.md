# Agentes — Vox (local) · Perfil Canônico v3.2

Escopo **somente** o sub-repo [`vox/`](.). Não escrever roteiro Matrix/vídeo aqui nem promover conteúdo de `politica/` para `~/.gemini/config/AGENTS.md`.
- **Hardening v3.2:** [docs/HARDENING.md](docs/HARDENING.md) (limites e o que o CI bloqueia) · **Evidência de testes e auditoria:** [docs/process/qualidade-e-evidencia.md](docs/process/qualidade-e-evidencia.md). Este repositório é autossuficiente: não dependa de arquivos de `politica/`.

## Ler é livre, escrever pede caneta

Regra completa (fonte única): [metodo-agentes-mutex-e-revisor.md § Orçamento de orquestração](docs/process/metodo-agentes-mutex-e-revisor.md#orçamento-de-orquestração-fonte-única).

- **Leitura, análise, revisão e planejamento** rodam em paralelo, sem teto de agentes.
- **Escrever no repositório** (editar arquivo versionado, inclusive no próprio worktree, commit, push, PR, comentário em PR ou issue) exige uma **caneta**. Há **3 canetas**; quem não tem espera na fila.
- **Caneta e lock são coisas diferentes:** a caneta vem com um conjunto fechado de arquivos; dois portadores nunca têm arquivo em comum (ou §N em markdown com **>200 linhas**). A **caneta** volta ao abrir o PR com CI verde ou ao travar; o **lock dos arquivos** daquele PR só sai no merge em `develop` ou no fechamento do PR.
- **Plano antes da caneta, sobre arquivos livres:** não planejar edição em arquivo com lock ativo. Antes de pegar a caneta, `git fetch origin develop` e conferir que o alvo não mudou. Ajuste pedido na revisão retoma a caneta com prioridade.
- **Arquivos quentes** (um portador por vez): `CHANGELOG.md`, `docs/ROADMAP.md`, `docs/README.md`, `docs/release-metadata.json` e `package.json`. `client/sw.js` só muda em PR de release.
- **Worktree isolado:** quem tem caneta escreve só num worktree próprio criado a partir de `origin/develop`. Nunca trocar a branch do checkout principal nem rodar `git` numa pasta de worktree que deixou de estar registrada (o `git` cai no checkout principal).
- **Merge** é uma fila serial à parte. **Recursos físicos:** no máximo 2 execuções pesadas ao mesmo tempo (`npm run validate`, e2e, mutação) e 1 agente por vez no navegador.

## Ownership e handoff

Encerrar todo turno com `SHA`, `Branch`, `Arquivos`, `Testes` (`PASS`, `FAIL` separando *Erro observado / Causa confirmada / Causa provável*, `NOT RUN`, `BLOCKED`), `Ownership`, `Restrições` e `Pendências`, em no máximo 10 linhas; detalhe longo vai em arquivo à parte. Revisor e auditor são só leitura ([qualidade-e-evidencia.md §4](docs/process/qualidade-e-evidencia.md)).

## Testes e Qualidade

PRs de feature vão para `develop`; `develop` vai para `main` por PR quando o lote está pronto. Antes de pedir merge: `npm run validate` na raiz de `vox/` (lint, lint do Python, auditoria de complexidade, auditoria de documentação e testes). `develop` e `main` são protegidos: merge só por PR com o CI verde.
