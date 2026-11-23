# Método — mutex de agentes e modo revisor

> **Status:** canônico (fonte única do mutex) · **Owner:** mantenedor / revisor · **Revisado:** 2026-11-23

Operacional (repo `vox`). Tese longa: [antigravity-estrategia-mantenedor-revisor-2026.md](../strategy/antigravity-estrategia-mantenedor-revisor-2026.md).

## Mutex (markdown canônico)

- **Um agente por arquivo** — ou **por §N** em arquivos com **>200 linhas**.
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

Para gastar menos contexto e evitar conflito de arquivo, toda orquestração com agentes segue:

1. **Um executor por padrão.** Paralelo só com até **2** executores e mutex disjunto (nenhum arquivo em comum).
2. **Brief curto:** critério de aceite, **no máximo 8 caminhos** e **um** comando de teste. Proibido colar lobby, ADR inteiro ou árvore de pastas no brief.
3. **Leitura mínima:** o executor lê só os arquivos do mutex, a porta de entrada do contexto (fachada ou índice do módulo) e o teste irmão.
4. **Modelo:** auditoria e leitura em Haiku Low; Opus só para cripto, ADR ou identidade crítica (tabela acima).
5. **Sem ondas automáticas** (lote 1 → 3 → 9) e **sem polling de CI** feito por agente: o próximo lote abre depois de o anterior entrar, com decisão explícita.

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

**Versão:** 1.1
