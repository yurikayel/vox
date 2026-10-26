# Brainstorm — 10 pontos fracos do método de planejamento e implementação (nov/2026)

> **Status:** brainstorm meta-processo (crítica ao **método**, não backlog de produto)  
> **Data:** nov/2026  
> **Baseline:** `main` **`4ddc4ca`** · SW **`vox-pwa-v6.83-steward-kit-v-i08`** · **355** testes (**333** JS + **22** Python)  
> **Canônicos relacionados:** [Dossiê N=25](./dossie-geral-inventario-master-breakdown-2026-11.md) · [Direcionamento §1–§6](./direcionamento-crescimento-rede-2026-11.md) · [T1–T10 pós-v82](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) · [Inventário nov/2026](./inventario-estado-e-tarefas-documentacao-2026-11.md)

Este documento critica **como** o Vox planeja, documenta e executa trabalho (lobby frictionless, Composer 2.5, docs-first, merge `--no-ff` após `npm test`) — **não** avalia se o produto deveria ter mais features. Evidências vêm de incidentes recentes (DOC-01, README corrompido por script PowerShell, inventário N=20 vs dossiê N=25, perda de conteúdo em `direcionamento` por agentes paralelos) e do estado atual do repositório na baseline acima.

---

## 1. Múltiplos canons sobrepostos (N=20, N=25, T1–T10 em duplicata)

**Evidência:** [dossie-geral-inventario-master-breakdown-2026-11.md](./dossie-geral-inventario-master-breakdown-2026-11.md) declara **N=25** (inclui EXP-01…05); [inventario-estado-e-tarefas-documentacao-2026-11.md](./inventario-estado-e-tarefas-documentacao-2026-11.md) mantém **N=20 + DOC-06…08** com tabela de reconciliação; existem dois índices **T1–T10** ([brainstorm-dez-tarefas-estrategia-2026-10.md](./brainstorm-dez-tarefas-estrategia-2026-10.md) out/2026 e [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) nov/2026). Checklists `[ ]` equivalentes (DOC/NET/CODE/PIL) aparecem em dois lugares com instrução “marcar uma vez” — fácil marcar no artefato errado.

**Por que quebra escala / piloto / revisor:** Revisores e agentes não sabem qual checklist é **fonte de verdade** para “pronto”; piloto e ops humanos ficam enterrados entre 25+ linhas de doc-only; o mantenedor-revisor vira curador de índices em vez de gate de release.

**Mitigação:**
- Um **índice único** em `docs/README.md` com papéis explícitos: dossiê = master EXP; inventário = DoD doc; pós-v82 = sequência ops (sem re-listar IDs).
- Proibir nova tabela N=… sem ADR de “retire/arquive” o anterior.
- T1–T10 out/2026 → banner **histórico**; só pós-v82 + direcionamento para ordem de execução.

---

## 2. Baseline SHA como ritual manual (drift entre cabeçalhos)

**Evidência:** Na mesma semana, cabeçalhos citam SHAs diferentes: dossiê **`8217d18`**, inventário **`e44a1b4`** / T1 **`26e7b7d`**, `docs/README.md` **`e44a1b4`**, tip real **`4ddc4ca`**. Commits recentes (`ff89be2`, `5d8c26`, `4ddc4ca`) existem **só** para corrigir release line e README após scripts/edits manuais. [brainstorm-proximas-10-tarefas-pos-v82-2026-11.md](./brainstorm-proximas-10-tarefas-pos-v82-2026-11.md) ainda ancora **`898509c`**.

**Por que quebra escala / piloto / revisor:** “Baseline” deixa de ser contrato verificável; retrospectiva V-P09 e drill T2 não sabem qual build foi testado; agentes re-escrevem parágrafos inteiros para trocar um hash.

**Mitigação:**
- Gerar **`docs/release-metadata.json`** (ou footer único) no CI pós-`npm test`: `git_sha`, `test_count`, `cache_name`.
- Script `npm run doc:release-line` que atualiza **só** placeholders, nunca corpo narrativo (evitar corrupção UTF-8 do README).
- Docs estratégicos linkam metadata, não repetem SHA inline (exceto este brainstorm na data de escrita).

---

## 3. Agentes paralelos sem mutex de arquivo/seção

**Evidência:** Edição simultânea de [direcionamento-crescimento-rede-2026-11.md](./direcionamento-crescimento-rede-2026-11.md) — agentes Composer sobrescreveram **§1 (flywheel)** vs **§2 (P0 ops)**; conteúdo recuperado manualmente. Lobby politica manda “Composer 2.5 only” mas **não** define exclusão mútua por path (contraste com mutex explícito em outros domínios do monorepo).

**Por que quebra escala / piloto / revisor:** Perda silenciosa de tese de tração (§1) ou de cadeia T2→V-P09 (§2); revisão humana não escala; Antigravity/Cursor split amplifica colisões em docs longos.

**Mitigação:**
- Regra lobby: **um agente por arquivo** ou ordem serial §N→§N+1 com diff obrigatório antes do próximo.
- Arquivos >200 linhas estratégicos: blocos `<!-- mutex:section-id -->` + checklist handoff (o que mudou, o que não tocar).
- PR doc-only: anexar “áreas tocadas” no corpo (§1 vs §2).

---

## 4. Ops P0 (espelho B, DR) tratado como entregável documental

**Evidência:** [ops-shell-mirrors.md](./ops-shell-mirrors.md) termina em *“Playbook: spike segundo espelho shell (23/10)”* — registro `mirror_id` / URL B **vazio**. NET-01/T2/T9 marcados **P0** no dossiê e inventário; [direcionamento §2.2](./direcionamento-crescimento-rede-2026-11.md) exige drill antes do piloto. Sprint history no lobby politica é quase só merges Cursor + docs; **nenhum** commit de “espelho B vivo”.

**Por que quebra escala / piloto / revisor:** Pages único = SPOF de distribuição; piloto V-P09 convida 10–30 pessoas sem URL alternativa; mantenedor vira plano B de infra (anti-T1).

**Mitigação:**
- Sprint **ops-only** (sem feature): voluntário registra linha na tabela de `ops-shell-mirrors.md` + smoke `#/settings/network`.
- DR drill **datado** (mesmo falho): 6 passos + resultado uma frase no inventário §1 gaps.
- Separar ID **NET-01** de “doc T2 ✓” — ✓ só com URL pública verificável.

---

## 5. Feature freeze piloto (CODE-01) sem enforcement em git/CI

**Evidência:** CODE-01 no dossiê/inventário: “só hotfix/docs em `main`” durante V-P09 — implementado como **nota** em brainstorm/direcionamento, não como branch rule, label PR ou job CI. Histórico recente: merges de polish, gossip, steward kit **durante** fase declarada de preparação piloto; nenhum `CODEOWNERS`/workflow bloqueia `feat/*` → `main`.

**Por que quebra escala / piloto / revisor:** Piloto testa build **instável**; facilitador não sabe se bug veio do grupo ou do freeze quebrado; revisor não tem sinal automático de violação.

**Mitigação:**
- Flag **`PILOT_FREEZE=1`** em `lobby.md` + branch **`release/pilot-*`**; `main` só merge freeze-aware enquanto flag ativa.
- CI opcional: falhar se PR toca `client/js/**` sem label `pilot-hotfix`.
- Ao abrir piloto: tag anotada `pilot-week0` = SHA congelado documentado.

---

## 6. Piloto V-P09: template pronto, operação humana sem owner

**Evidência:** [piloto-comunidade-retrospectiva-template.md](./piloto-comunidade-retrospectiva-template.md) ✓; backlog V-P09 **execução humana** `[ ]` no inventário; PIL-01/PIL-02 P0 com owner “Facilitador” **sem nome, calendário ou go/no-go** em repo. Direcionamento exige trio mínimo (fundador + mod buddy + steward candidato) — método não registra **quem** fecha isso.

**Por que quebra escala / piloto / revisor:** T3/T2 viram “quando alguém aparecer”; mantenedor faz convite informal; retrospectiva nunca nasce; tese mantenedor-revisor não é testada em campo.

**Mitigação:**
- Issue/Notion **única** V-P09: facilitador, janela 4 semanas, critério abort (≤N ativos semana 2).
- Go/no-go checklist: T2 comunicado **ou** exceção explícita assinada no template.
- Lobby foco D: uma linha **só** estado piloto (não SHA).

---

## 7. Fluxo real contradiz tese mantenedor → revisor

**Evidência:** [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md) limita papel a CI/Pages/RFC; na prática: lobby politica atualiza SHA/testes a cada merge; DOC-01/DOC-02 são tarefas **Cursor** no mantenedor; commits de correção README (`4ddc4ca`) após automação falha. Anti-loop §3.2 lista ops humanas, mas **nenhum** indicador alerta “ticket ops voltou ao Yuri”.

**Por que quebra escala / piloto / revisor:** Equipe externa assume que “verde em CI” = projeto saudável, ocultando gargalo humano central; piloto escala suporte 1:1 no WhatsApp do maintainer.

**Mitigação:**
- Métrica trimestral **uma linha**: “PRs mergeados sem push humano maintainer” (meta subir).
- Transferir DOC-01/02 para artefato gerado (ponto 2) — maintainer só aprova diff mecânico.
- Escalar incidente produto quando ops P0 >14d sem owner voluntário (não novo doc).

---

## 8. Definition of Done única para doc, código e ops humanos

**Evidência:** Inventário §2 marca docs **fresh** quando narrativa está ok, mas README/DEV ainda **stale** na matriz §2.1 enquanto README na tip já tem **355** testes. T1 Antigravity **✓** com baseline **`26e7b7d`** desalinhado da tip. Itens NET-01/PIL-02 ficam `[ ]` ao lado de DOC-03 **fresh** — leitor conclui “pacote nov/2026 pronto”.

**Por que quebra escala / piloto / revisor:** Checklist verde **documental** mascara P0 **operacional**; facilitador acha que espelho/piloto estão cobertos porque o dossiê existe.

**Mitigação:**
- Três colunas DoD: **Doc** | **Código/CI** | **Ops humano** — só ✓ quando coluna preenchida.
- “Fresh” exige script `npm test` + grep zero `(201|350) testes` em README/DEV/CI descritivo.
- Retirar `[x]` de T1 doc se critério incluía SHA vivo (ou renomear T1 → “narrativa publicada”).

---

## 9. Contagem de testes sem fonte gerada única

**Evidência:** [client/DEV.md](../client/DEV.md) linha 7: **355**; mesma file linha 36: **350** (**329** JS + **21** Python). Inventário §2.1 ainda lista README **stale (201 testes)** após fix **`4ddc4ca`**. `.github/workflows/ci.yml` não imprime total agregado no log (jobs separados `test:client` / `test:relay`). Lobby e dossiê repetem **355** manualmente.

**Por que quebra escala / piloto / revisor:** Release notes mentirosas quebram confiança de steward técnico; CI verde ≠ docs honestos; agentes copiam número errado para COMPLIANCE/onboarding.

**Mitigação:**
- `npm test` final echo **`TOTAL=N`** único; opcional `tools/count-tests.js` consumido por DEV template.
- Job CI upload artifact `test-summary.txt` referenciado no README via link fixo “ver último run”.
- DOC-02 done = grep gate no pre-commit ou CI doc-audit (allowlist 355 only).

---

## 10. Deploy Pages + `CACHE_NAME` sem runbook de rollback/incidente

**Evidência:** [client/DEV.md](../client/DEV.md) manda hard refresh pós-merge; `sw.js` **`CACHE_NAME`** canônico por release; workflow Pages em push `main` — **não** há doc de rollback (revert commit vs bump SW vs invalidar cache CDN), nem exercício registrado. T2/DR fala em espelho B, mas método não descreve **incidente A down** com usuários presos em SW antigo.

**Por que quebra escala / piloto / revisor:** Piloto com cantina/feira perde 30–50% sessões em shell quebrado; maintainer faz deploy heroico; segundo espelho não ajuda se procedimento não existir.

**Mitigação:**
- `docs/ops-pages-rollback.md` (1 página): revert SHA, bump `CACHE_NAME`, comunicado facilitador, tempo alvo <30 min.
- Drill anual **junto** T9: simular deploy ruim + recovery.
- Expor `git_sha` no shell (`#/settings/about`) para suporte comunitário sem abrir DevTools.

---

## Prioridade — top 3 para corrigir primeiro

1. **Execução vs inflação doc:** travar novos brainstorms/checklists até NET-01 ou V-P09 ter linha de evidência **não-doc** (URL B ou data semana 0 piloto).
2. **Ops humano bloqueado (T2 + V-P09):** owner nomeado + registro espelho ou exceção; parar de marcar T2 “✓” em roadmap doc-only.
3. **Fonte única release (SHA + testes + SW):** metadata gerada + matriz inventário §2.1 sincronizada com tip — elimina commits só-DOC-01 e README corrupto.

---

**Meta:** [Inventário nov/2026](./inventario-estado-e-tarefas-documentacao-2026-11.md) · **Estratégia revisor:** [antigravity-estrategia-mantenedor-revisor-2026.md](./antigravity-estrategia-mantenedor-revisor-2026.md)
