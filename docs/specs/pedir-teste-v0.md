# Pedir teste — modelo (SUB-24a)

> **Status:** parcial (modelo implementado, com ops e testes; a tela vem em SUB-24b) · **Owner:** mantenedor · **Revisado:** 2026-11-27

O Mestre pede um teste de perícia a até 8 jogadores, com a CD pública ou oculta. Esta etapa cobre só o modelo: operações, redutor e vínculo da rolagem.

## Operações (só o Mestre)

| Op | Payload | Efeito |
| :--- | :--- | :--- |
| `CHECK_REQUEST` | `{ requestId, skillId, label, targets[1..8], dcHidden, dc?, rollVisibility }` | Abre o pedido em `state.checkRequestsById` e põe uma linha pública na Crônica. |
| `CHECK_REVEAL` | `{ requestId, dc? }` | Fecha o pedido, calcula o resultado de cada alvo e põe a linha de resultado na Crônica. |

- `dc` é inteiro de 1 a 60. Com CD pública é obrigatório no pedido; com CD oculta é descartado e vem só na revelação.
- `rollVisibility` é `public` ou `gm`; qualquer outro valor vira `public`.
- Pedido repetido, revelação repetida, revelação sem pedido aberto ou com CD inválida: ignorados.
- Jogador não autoriza nenhuma das duas (`isPlayerAuthorizedForCampaignOp`).

## Sigilo da CD

Por construção: o pedido com CD oculta não tem campo `dc` na op nem no estado. A CD entra no log só com a revelação, que é pública. Por isso não há filtro de envio nem projeção novos. `buildCheckRequestOp` e `normalizeCheckRequest` descartam a `dc` quando `dcHidden`.

## Vínculo da rolagem

`recordFormulaRoll` aceita `opts.requestId` e grava `rollResult.requestId`; o redutor guarda em `state.rolls[].requestId` (com `lamport` e `opId` da op). O autor da rolagem ligada a um pedido é sempre quem enviou a op (`op.actor`), nunca o `author` do payload.

## Resultado (determinístico)

A Crônica grava só `<rótulo> · CD <dc>` e o ponteiro `checkRequestId`. Os ✓/✗ saem de `checkResults`, uma função pura calculada na hora de exibir sobre o log ordenado por `(lamport, opId)`, a mesma ordem do replay. Por isso, para as rolagens, o texto é igual em todo par, na ordem de chegada que for, e igual ao recarregar a mesa. Não vale para o par pedido/revelação: se a revelação chega antes do pedido, o redutor ao vivo a descarta (o pedido segue `open`) e só o replay, na recarga, acerta (`revealed`).

Para cada alvo vale a PRIMEIRA rolagem pública dele com esse `requestId` até a revelação (rolagem posterior é ignorada):

- pública: `total >= dc` dá ✓ ou ✗, com o total;
- nenhuma rolagem pública, pedido com rolagem do Mestre: "resultado com o Mestre", sem o total, para todos os alvos (nem todo par recebe a rolagem do Mestre, então ela não entra na conta);
- nenhuma rolagem pública, pedido público: "não rolou".

## Limites conhecidos

- O caminho de rolagem com prova de justiça não leva `requestId` nesta versão.
- O total e o `lamport` da rolagem são autodeclarados por quem a envia. Um jogador que já rolou, vê a revelação e manda outra rolagem com `lamport` anterior à revelação (inclusive 0) e o total que quiser entra como resultado, no estado vivo e no replay. "Rolagem posterior é ignorada" vale só para cliente honesto. É o modelo de confiança atual de `ROLL_RECORDED` (o total já era autodeclarado). O ✓/✗ é conveniência de mesa, não prova; a prova de justiça é o caminho Fairplay.
