# ADR-017: Consolidação do planejamento — ROADMAP único

**Status:** accepted · **Revisado:** 2026-11-07 · **Tipo:** meta-processo / documentação

## 1. Contexto

Entre out/2026 e nov/2026 o planejamento do Vox se espalhou por pelo menos cinco documentos com escopos sobrepostos:

- `dossie-geral-inventario-master-breakdown-2026-11.md`: plano mestre N=25 e "único checklist vivo" (§3.6);
- `inventario-estado-e-tarefas-documentacao-2026-11.md`: inventário + DoD de DOC/NET/CODE/PIL;
- `brainstorm-proximas-10-tarefas-pos-v82-2026-11.md`: ordem de execução T1–T10;
- `brainstorm-dez-tarefas-estrategia-2026-10.md`: T1–T10 de out/2026, já marcado como histórico;
- `revisao-estado-2026-10-25.md`: snapshot de auditoria.

Os mesmos IDs aparecem em várias tabelas com status diferentes. Contagens de testes e SHAs repetidos nos cabeçalhos ficaram desatualizados (de 356 a 805 testes, contra 847 reais). As features entregues em nov/2026 (compose Social/Cívico, contas vinculadas, fluxos em etapas) não aparecem em nenhum deles. Quem chega não consegue responder rápido à pergunta "o que falta fazer agora?".

A regra anti-inflação do [índice](../README.md) proíbe criar outro plano mestre "N=…" sem um ADR que revogue e arquive o anterior. Este é esse ADR.

## 2. Decisão

1. **`docs/ROADMAP.md` passa a ser o único plano vivo e o único lugar com caixas `[ ]` / `[x]`.** Ele herda, sem mudar o status, todos os IDs abertos do dossiê §3.6 (DOC, NET, CODE, PIL, EXP) e acrescenta os itens desta revisão.
2. **O dossiê N=25 deixa de ser o checklist vivo.** Recebe banner `SUPERSEDED → ROADMAP.md`. O conteúdo histórico (inventário de out/nov, flywheel) continua legível, e as caixas dele não devem mais ser marcadas.
3. **Recebem banner `SUPERSEDED` e não são movidos** (para não quebrar cerca de 16 links): inventário nov/2026, pós-v82, dez-tarefas out/2026, revisao-estado 2026-10-25, `gateway-honest-fallback-brainstorm.md` (→ ADR-004) e `steward-wizard-brainstorm.md` (→ kit steward).
4. **Teses e notas de campo continuam canônicas**, porque explicam o *porquê* e não o *quando*: direcionamento-crescimento, campo-debate, tese-praca, rede-sustentada, backlog-participacao, infra-participativa. Cada uma ganha uma linha "Não substitui o ROADMAP".
5. **Os números de release** (SHA, testes, `CACHE_NAME`) vivem só em `docs/release-metadata.json` e na tabela do README, regenerados por `npm run release-line`. Os outros docs só apontam para lá.
6. **Ideias novas** entram como brainstorm (banner `brainstorm` + "Não substitui o ROADMAP") e só viram linha com caixa no ROADMAP quando ganham DoD e responsável.

## 3. Consequências

- **Positivas:** existe uma resposta única para "o que falta"; acaba a divergência de status entre tabelas; menos documento para manter.
- **Negativas:** links antigos apontam para docs superseded; o banner resolve, mas exige que se clique de novo. O ROADMAP tem de ser mantido a cada lote, e ninguém mais "marca no dossiê".
- **Reversão:** um novo ADR pode devolver o papel ao dossiê ou a outro arquivo. Os docs superseded não são apagados.

## 4. Verificação

- Todo ID aberto no dossiê §3.6 aparece no ROADMAP com o mesmo status.
- Nenhum outro doc em `docs/` tem caixas `[ ]` de planejamento ativo (templates de piloto e checklists de drill são formulários, não plano).
- O índice [docs/README.md](../README.md) aponta o ROADMAP como fonte de verdade.
