# Método — mutex de agentes e modo revisor

> **Status:** canônico (fonte única do mutex) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-26

Operacional (repo `vox`). Tese longa: [antigravity-estrategia-mantenedor-revisor-2026.md](../strategy/antigravity-estrategia-mantenedor-revisor-2026.md).

## Mutex (markdown canônico)

- **Um portador de caneta por arquivo** — ou **por §N** em arquivos com **>200 linhas** (ver caneta abaixo).
- **Handoff** ao encerrar o turno: listar paths tocados + o que **não** mexer neste lote.
- **Proibido:** duas sessões editando o **mesmo** markdown canônico em paralelo (PRs concorrentes no mesmo doc = rebase + dono único).

## Escolha de modelo e esforço

O mantenedor delega cada tarefa a uma sessão com modelo e esforço escolhidos pelo tipo de trabalho:

| Tipo de tarefa | Modelo e esforço | Exemplo real |
| :--- | :--- | :--- |
| Só ler, auditar ou contar | Haiku Low | Auditoria de licenças das dependências |
| Diagnosticar sem escrever código | Haiku High | Diagnóstico do `deps-mensal` (cron ainda sem disparo, sem defeito no arquivo) |
| Doc que exige conferir o código | Sonnet Low | [PR #192](https://github.com/yurikayel/vox/pull/192): contradições em specs |
| Bug ou correção espalhada por vários módulos | Sonnet High | [PR #197](https://github.com/yurikayel/vox/pull/197): apagar conta local apaga tudo |
| Teste de fluxo crítico, caçando bug | Sonnet Extra | [PR #198](https://github.com/yurikayel/vox/pull/198): E2E do login (LT-08) |
| Cripto, identidade ou ADR | Opus High ou Extra | ADR-037, cofre na malha |

### Regras de corte

1. Se a tarefa escreve código, não use Haiku com esforço acima de Medium.
2. Antes de trocar para um modelo maior, tente o mesmo modelo com esforço mais alto.

### Título de sessão

No máximo 3 palavras (ex.: `testes-relay`, `apagar-tudo-local`).

## Orçamento de orquestração (fonte única)

Desde 26/11/2026 (decisão do mantenedor): **ler é livre, escrever pede caneta.** Conflito só nasce na escrita; o resto roda em paralelo.

1. **Leitura, análise, revisão e planejamento** rodam em paralelo, sem teto de agentes. Cada um entrega relatório curto (≤10 linhas) e deixa o detalhe em arquivo à parte.
2. **Três canetas para escrever no repositório.** Escrever = editar arquivo versionado (inclusive no próprio worktree), commit, push, PR, comentário em PR ou issue. Quem não tem caneta não escreve; o quarto pedido espera na fila.
3. **Caneta vem com mutex; lock dura até o merge.** O orquestrador entrega a caneta com um conjunto fechado de arquivos (**no máximo 8 caminhos**) e **um** comando de teste; dois portadores nunca têm arquivo em comum. A caneta volta cedo (item 4), mas o lock dos arquivos de um PR só sai no merge em `develop` ou no fechamento do PR.
4. **Plano antes da caneta, sobre arquivos livres.** O agente planeja sem caneta, só sobre arquivos sem lock, e antes de pegá-la faz `git fetch origin develop` e confere que o alvo não mudou. Solta a caneta ao abrir o PR com CI verde ou ao travar (handoff). Ajuste pedido na revisão retoma a caneta com prioridade.
5. **Arquivos quentes** (`CHANGELOG.md`, `docs/ROADMAP.md`, `docs/README.md`, `docs/release-metadata.json`, `package.json`): um portador por vez; os outros deixam a linha para quem tem a vez. `client/sw.js` só muda em PR de release.
6. **Merge é fila serial à parte**, um PR por vez, com o CI verde no SHA exato.
7. **Recursos físicos:** no máximo 2 execuções pesadas ao mesmo tempo (`npm run validate`, e2e, mutação), mesmo para quem só lê; 1 agente por vez no navegador.
8. **Worktree isolado.** Quem tem caneta escreve só num worktree próprio a partir de `origin/develop`; nunca troca a branch do checkout principal nem roda `git` em pasta de worktree desregistrada. Ao descartar: tirar a junção `node_modules`, conferir que ela sumiu, e só então `git worktree remove` sem `--force`.
9. **Brief curto e leitura mínima:** critério de aceite, caminhos e comando de teste; proibido colar lobby, ADR inteiro ou árvore de pastas. O executor lê só os arquivos do mutex, a porta de entrada do contexto e o teste irmão.
10. **Contexto:** uma tarefa por contexto; o agente que encher o contexto entrega o handoff e recomeça limpo, em vez de seguir com contexto degradado.
11. **Sem ondas automáticas** (lote 1 → 3 → 9) e **sem polling de CI** feito por agente: o próximo lote abre com decisão explícita.

## Mantenedor → revisor (o que muda na prática)

### Mantenedor **faz**

- Revisar PR (RFC quando protocolo/malha mudar).
- Manter **CI verde** na linha de release.
- Contribuir como **cidadão** em **um** quadrado local (uma comunidade / um PR pequeno), sem operar a rede inteira.

### Mantenedor **não faz**

- VPS relay/comunidade, TURN ou inbox global do projeto.
- Suporte **1:1** (WhatsApp/Zap “salva minha comunidade”).
- Ritual de **SHA à mão** no lobby ou em chat — quando existir, usar [`release-metadata.json`](../release-metadata.json) gerado no CI (até lá: tag/release notes no PR).

### Definição: semana em **modo revisor**

Conta como revisor-mode se, na semana civil:

1. **Zero** commits próprios em `main`/`develop` que não sejam **review merge**, **docs** ou **hotfix** mínimo; e  
2. **Zero** registros de suporte 1:1 atribuídos ao mantenedor (issues “ops emergência” viram tarefa comunitária ou ficam abertas).

Fora do modo revisor: ok feature branch + PR normal — desde que não viole freeze de piloto (CODE-01).

**Versão:** 1.4
