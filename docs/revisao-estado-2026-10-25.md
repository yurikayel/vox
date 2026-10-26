# Revisão de estado — Vox (25 out 2026)

> **Status:** canônico (snapshot auditoria) · **Owner:** revisor doc · **Revisado:** 2026-10-25  
> **Baseline:** `main` — ver [README.md](../README.md) e [release-metadata.json](./release-metadata.json) · **Testes:** **356** (`334` JS + `22` Python) via `npm test`  
> **Entrada para voluntários:** [docs/README.md](./README.md) · [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md)

Revisão pós-onda de agentes paralelos. Objetivo: um mantenedor comunitário audita sem conhecimento tribal.

---

## O que entrou (código vs doc vs ops humano vazio)

| Área | Entregue | Tipo |
|------|----------|------|
| Release line + metadata | `docs/release-metadata.json`, `npm run release-line`, tabela README, CI pilot freeze | code + doc |
| Voxpedia + norma doc | `#/voxpedia`, links GitHub, `CONTRIBUTING-DOCS.md`, bloco em `GOVERNANCE.md` | code + doc |
| Ops espelhos / rollback / DR | `ops-shell-mirrors.md`, `ops-pages-rollback.md`, `ops-dr-drill-checklist.md` (passos, **sem data**) | doc |
| Piloto / mutex | `piloto-comunidade-go-no-go.md`, `metodo-agentes-mutex-e-revisor.md`, `client/DEV.md` §0.1 `PILOT_FREEZE` | doc + code (gate) |
| Método doc (#1 + #8) | `docs/README.md` porta única; checklist vivo **dossiê §3.6**; brainstorm out/2026 **HISTÓRICO** | doc |
| **Espelho shell B (T2 / NET-01)** | Tabela T2 com `shell-b` **planned**, URL vazia | **ops-humano vazio** |
| **Drill DR (NET-02)** | Checklist 6 passos; Resultado/Data vazios | **ops-humano vazio** |
| **Piloto V-P09 (PIL-01/02)** | Template retrospectiva + go/no-go; **sem** comunidade/facilitador nomeados | **ops-humano vazio** |

---

## Inconsistências encontradas (e correção nesta passagem)

| Problema | Onde | Ação |
|----------|------|------|
| Dois checklists `[ ]` (dossiê vs inventário §5) | inventário + dossiê | **Único vivo:** [dossiê §3.6](./dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25); inventário §5 → links |
| Contagens **355/333** vs **356/334** | dossiê Parte 1, tabelas DoD legadas | Header dossiê → README/metadata; Parte 1 atualizada para 356 |
| SHA repetidos e stale (`898509c`, `99180f9`, `5d8c0d6`…) | brainstorm pós-v82, direcionamento, inventário §2 | Headers → README + `release-metadata.json` |
| `release-metadata.json` `git_sha` vs `git rev-parse HEAD` | metadata vs tip local | Regenerar `npm run release-line` quando tip avança |
| `ops-shell-mirrors` `shell-a` `git_sha` = deploy Pages (**full SHA**) vs README (**short**) | T2 | Auditor compara via `gh run list --workflow=deploy-pages.yml`; alinhar short = prefixo do deploy |
| §3.6 referenciado no índice mas ausente | dossiê | **Criado** §3.6 com coluna **Tipo DoD** |
| T2 posicionamento out/2026 vs pós-v82 | dois índices T1–T10 | out/2026 banner **HISTÓRICO**; ordem ops = pós-v82 |

---

## P0 humano / rede (permanece aberto)

1. **NET-01 — URL espelho B:** preencher `shell-b` em [ops-shell-mirrors.md](./ops-shell-mirrors.md) (paridade `CACHE_NAME` + SHA). **Não** marcar T2 ✓ só por doc.
2. **NET-02 — Drill DR:** executar 6 passos; preencher Resultado/Data em [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md).
3. **V-P09 / PIL-01–02:** nomes de comunidade, facilitador, trio mínimo ([direcionamento §4](./direcionamento-crescimento-rede-2026-11.md)); go/no-go [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md).
4. **DOC-01 / DOC-02:** drift residual em corpo do dossiê (tabelas Trilha A ainda citam 355) — limpar em passo doc-only; release line canônica já em README/metadata.

---

## Checklist vivo (decisão)

| Pergunta | Resposta |
|----------|----------|
| Onde marcar `[ ]` / `[x]` N=25? | **[dossiê §3.6](./dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25)** |
| Onde ler DoD detalhado + DOC-06…08? | [inventário §4](./inventario-estado-e-tarefas-documentacao-2026-11.md) (sem caixas) |

Itens **honestamente não fechados** nesta revisão: **NET-01 (B)**, **NET-02 (data)**, **PIL-02 / V-P09 execução**.

---

## Antigravity / canônicos doc

| Item | Estado |
|------|--------|
| DOC-05 steward-wizard brainstorm | ✓ banner SUPERSEDED |
| Brainstorm out/2026 T1–T10 | ✓ banner HISTÓRICO |
| Mutex + revisor | ✓ `metodo-agentes-mutex-e-revisor.md` + `vox/AGENTS.md` |

---

**Versão:** 1.0 · **Path:** `vox/docs/revisao-estado-2026-10-25.md`
