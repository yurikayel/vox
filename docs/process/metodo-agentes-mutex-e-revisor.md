# Método — frentes paralelas, mutex de arquivos e revisão

> **Status:** canônico (fonte única do mutex e do fluxo de entrega) · **Owner:** mantenedor · **Revisado:** 2026-11-27

Operacional (repo `vox`). A tese longa da transição mantenedor → revisor está em `docs/strategy/` (ver o índice em [docs/README.md](../README.md)).

## Mutex (markdown canônico)

- **Um portador por arquivo**, ou **por §N** em arquivos com **>200 linhas**.
- **Handoff** ao encerrar o turno: listar os caminhos tocados e o que **não** mexer neste lote.
- **Proibido:** duas frentes editando o **mesmo** markdown canônico em paralelo (PRs concorrentes no mesmo doc = rebase + dono único).

## Orçamento de orquestração (fonte única)

Desde 26/11/2026 (decisão do mantenedor): **ler é livre, escrever pede vez.** Conflito só nasce na escrita; o resto roda em paralelo.

1. **Leitura, análise, revisão e planejamento** rodam em paralelo, sem teto. Cada um entrega relatório curto (≤10 linhas) e deixa o detalhe em arquivo à parte.
2. **Até 3 frentes escrevendo ao mesmo tempo, cada uma isolada em worktree próprio.** Escrever = editar arquivo versionado, commit, push, PR, comentário em PR ou issue. A quarta frente espera na fila.
3. **1 ID por frente.** Cada frente tem um item (um ID de ROADMAP ou de PR) e um conjunto fechado de arquivos (**no máximo 8 caminhos**) com **um** comando de teste. Duas frentes nunca têm arquivo em comum, e o lock dos arquivos de um PR só sai no merge em `develop` ou no fechamento do PR.
4. **WIP = 1 por frente.** Uma tarefa em curso por vez; a próxima só começa depois de entregar o PR e o SHA. **PR entregue não ocupa a frente**: ela segue para o item seguinte. **Retorno de revisão volta com prioridade** e retoma a frente antes de qualquer item novo.
5. **Plano antes da escrita, sobre arquivos livres.** Antes de escrever, `git fetch origin develop` e conferir que o alvo não mudou.
6. **Arquivos quentes** (`CHANGELOG.md`, `docs/ROADMAP.md`, `docs/README.md`, `docs/release-metadata.json`, `package.json`): um portador por vez; as outras frentes deixam a linha para quem tem a vez.
7. **`client/sw.js` e `CACHE_NAME` só mudam no corte de release**, nunca em PR de feature, correção ou teste.
8. **Merge é fila serial à parte**, um PR por vez, com o CI verde no SHA exato.
9. **Recursos físicos:** no máximo 2 execuções pesadas ao mesmo tempo (`npm run validate`, e2e, mutação), mesmo para quem só lê; 1 agente por vez no navegador.
10. **Worktree isolado.** Quem escreve usa só um worktree próprio a partir de `origin/develop`; nunca troca a branch do checkout principal nem roda `git` em pasta de worktree desregistrada. Ao descartar: tirar a junção `node_modules`, conferir que ela sumiu, e só então `git worktree remove` sem `--force`. Antes de qualquer `git` num worktree, conferir que existe o **arquivo** `.git` na pasta e que `git rev-parse --show-toplevel` é a própria pasta; sem o arquivo, o `git` sobe calado para o checkout principal. Nunca `git stash` em pasta compartilhada: prove a base num worktree de `origin/develop`.
11. **Brief curto e leitura mínima:** critério de aceite, caminhos e comando de teste; proibido colar ADR inteiro ou árvore de pastas. O executor lê só os arquivos do mutex, a porta de entrada do contexto e o teste irmão.
12. **Spec com âncoras conferidas.** Toda âncora `arquivo:linha` no brief foi conferida na base (`origin/develop`) antes de ser enviada; âncora velha é corrigida, não repassada.
13. **Contexto:** uma tarefa por contexto; quem encher o contexto entrega o handoff e recomeça limpo.
14. **Sem ondas automáticas** (lote 1 → 3 → 9) e **sem polling de CI** feito por agente: o próximo lote abre com decisão explícita.

## Qualidade e evidência

1. **`fix:` com teste que falha na base por asserção.** O teste vermelho é provado num worktree de `origin/develop` (erro de import ou de módulo ausente não conta como prova).
2. **`test:` provado por mutação.** Cada caso do teste novo tem de morrer numa mutação real do código; os mutantes mortos e os vivos (com a justificativa de equivalência) vão no corpo do PR.
3. **Sem atalho de métrica.** Não vale juntar linhas, pular teste (`skip`), afrouxar limite ou comprimir código para passar num gate. Reduzir tamanho é tirar redundância real ou extrair um helper com JSDoc e consumidor. Limites e catraca: [HARDENING.md](../HARDENING.md).
4. **Evidência com contagem e tempo reais**, no vocabulário `PASS` / `FAIL` / `NOT RUN` / `BLOCKED` ([qualidade-e-evidencia.md](./qualidade-e-evidencia.md)): comando exato, número de testes e duração.
5. **Flake:** a 1ª ocorrência é registrada (teste, erro, comando); a 2ª vira diagnóstico, com causa confirmada ou provável separada do erro observado. Não se re-roda até ficar verde sem registrar.

## Revisão independente

- **Duas faixas por risco:** (a) doc e teste puro; (b) todo o resto (código de produção, CI, segurança, dados). A faixa (b) não é revisada pela mesma frente que escreveu.
- **Reconferência a cada head novo:** push depois de pedido de mudança invalida a aprovação anterior; o revisor confere o diff novo, não só a resposta.
- O revisor roda os gates, prova a falha na base de `fix:` e reexecuta a mutação de `test:` em worktree próprio, só leitura; devolve achados com arquivo, linha e cenário de falha.

## Mantenedor → revisor (o que muda na prática)

### Mantenedor **faz**

- Revisar PR (RFC quando protocolo/malha mudar).
- Manter **CI verde** na linha de release.
- Contribuir como **cidadão** em **um** quadrado local (uma comunidade / um PR pequeno), sem operar a rede inteira.

### Mantenedor **não faz**

- VPS relay/comunidade, TURN ou inbox global do projeto.
- Suporte **1:1** (app de mensagens: “salva minha comunidade”).
- Ritual de **SHA à mão** em chat — quando existir, usar [`release-metadata.json`](../release-metadata.json) gerado no CI (até lá: tag/release notes no PR).

### Definição: semana em **modo revisor**

Conta como revisor-mode se, na semana civil:

1. **Zero** commits próprios em `main`/`develop` que não sejam **review merge**, **docs** ou **hotfix** mínimo; e  
2. **Zero** registros de suporte 1:1 atribuídos ao mantenedor (issues “ops emergência” viram tarefa comunitária ou ficam abertas).

Fora do modo revisor: ok feature branch + PR normal — desde que não viole freeze de piloto (CODE-01).

**Versão:** 1.4
