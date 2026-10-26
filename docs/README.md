# Vox — índice de documentação

> **Status:** canônico (índice único DOC-03) · **Owner:** voluntário doc (mutex 1 PR/arquivo) · **Revisado:** 2026-11  
> **Baseline release:** ver [../README.md](../README.md) e [release-metadata.json](./release-metadata.json)  
> **Checklist vivo único:** [Dossiê geral N=25](./dossie-geral-inventario-master-breakdown-2026-11.md#36-checklist-master-vivo-n25)

Entrada única para revisores, desenvolvedores e operadores cívicos.

## Fonte de verdade: qual arquivo é master de quê

| Documento | Papel canônico exclusivo | Tipo de conteúdo |
|---|---|---|
| [dossie-geral-inventario-master-breakdown-2026-11.md](./dossie-geral-inventario-master-breakdown-2026-11.md) | **Plano Mestre N=25 & Único Checklist Vivo** | Arquitetura, flywheel e **único lugar** com checkboxes `[ ]` e coluna `Tipo DoD`. |
| [inventario-estado-e-tarefas-documentacao-2026-11.md](./inventario-estado-e-tarefas-documentacao-2026-11.md) | **Inventário Técnico & DoD Documental** | Auditoria de módulos, inventário de specs e detalhamento DOC-01…08 (sem `[ ]` duplicados). |
| [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) | **Ordem de Execução Operacional** | Sequência linear pós-v82 (T2 espelho → V-P09 piloto → V-P08 sucessão → P2). |
| [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md) | **Tese Cívica & Flywheel de Tração** | Preceitos não negociáveis (§1–§6), escada de 4 camadas e moderação E1–E5. |
| [brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md](./brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md) | **Meta-Processo & Governança de Método** | Auditoria dos 10 gargalos metodológicos, antifrágil e guardrails do fluxo. |
| [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) | **HISTÓRICO / SUPERSEDED** | Registro de contexto de out/2026; superado pelo pós-v82 e dossiê N=25. |
| [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) | **Norma de Manutenção Documental** | Regras de mutex de agentes, padrão de banners de status e separação de DoD. |

### Justificativa do checklist vivo único (Dossiê N=25)
O **Dossiê N=25** foi escolhido como a fonte viva e exclusiva de checkboxes `[ ]` por abranger a totalidade do ecossistema: as 4 trilhas nucleares (DOC, NET, CODE, PIL) somadas à Trilha EXP-01…05 de expansão e POSSE. O documento de Inventário atua como catálogo auditável de código e critérios de texto, sem manter caixas paralelas para impedir conclusões fictícias de "pronto".

> [!IMPORTANT]
> **Regra anti-inflação:** É terminantemente proibido criar qualquer novo documento com convenção "N=..." sem um ADR formal de pelo menos 15 linhas que revogue e arquive expressamente o plano mestre anterior.

---

## 1. Participação & malha

- [rede-sustentada-participantes.md](./rede-sustentada-participantes.md) — meta trimestre, camadas 0→3  
- [backlog-participacao-rede.md](./backlog-participacao-rede.md) — IDs V-P  
- [infra-participativa-blindagem-crescimento.md](./infra-participativa-blindagem-crescimento.md) — blindagem regulatória e 4 camadas  
- [brainstorm-auto-escala-organica-2026-10.md](./brainstorm-auto-escala-organica-2026-10.md) — flywheel E1–E5  

## 2. Roadmap & estratégia

- [dossie-geral-inventario-master-breakdown-2026-11.md](./dossie-geral-inventario-master-breakdown-2026-11.md) — plano mestre N=25 e checklist vivo  
- [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) — T1–T10 pós-v82  
- [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md) — direcionamento e tração §1–§6  
- [brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md](./brainstorm-10-pontos-fracos-metodo-implementacao-2026-11.md) — crítica ao método de planejamento/ops  
- [brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) — histórico out/2026  
- [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md) — mantenedor → revisor  

## 3. Operações steward & espelhos

- [steward-relay-kit.md](./steward-relay-kit.md) · [steward-seed-15min.md](./steward-seed-15min.md)  
- [ops-shell-mirrors.md](./ops-shell-mirrors.md) — espelhos shell A/B, T2 executável  
- [ops-dr-drill-checklist.md](./ops-dr-drill-checklist.md) — procedimento e checklist de drill DR  
- [ops-pages-rollback.md](./ops-pages-rollback.md) — runbook de rollback do Pages e SW  
- [mirror-validate-v1.md](./mirror-validate-v1.md) · [antigravity-operating.md](./antigravity-operating.md)  

## 4. Desenvolvimento & governança

- [CONTRIBUTING-DOCS.md](./CONTRIBUTING-DOCS.md) — norma curta para voluntários e agentes  
- [metodo-agentes-mutex-e-revisor.md](./metodo-agentes-mutex-e-revisor.md) — regras de mutex e operação revisor  
- [piloto-comunidade-go-no-go.md](./piloto-comunidade-go-no-go.md) — gate humano do piloto (V-P09)  
- [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) — template retrospectiva  
- [../client/DEV.md](../client/DEV.md) — guia de desenvolvimento §0–36  
- [../README.md](../README.md) — release line e tabela canônica  
- [../ARCHITECTURE.md](../ARCHITECTURE.md) · [../GOVERNANCE.md](../GOVERNANCE.md) · [../COMPLIANCE-BR.md](../COMPLIANCE-BR.md)  
- `client/sw.js` — `CACHE_NAME` canônico  
- [revisao-estado-2026-10-25.md](./revisao-estado-2026-10-25.md) — snapshot auditoria pós-agentes (o que shipped vs P0 humano)

**Versão:** 1.2 · out/2026
