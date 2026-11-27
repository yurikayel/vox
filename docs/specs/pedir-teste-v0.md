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

`recordFormulaRoll` aceita `opts.requestId` e grava `rollResult.requestId`; o redutor guarda em `state.rolls[].requestId`. O resultado de cada alvo vem da primeira rolagem dele com esse `requestId`, feita até a revelação:

- pública: `total >= dc` dá ✓ ou ✗, com o total;
- do Mestre: "resultado com o Mestre", sem o total;
- nenhuma: "não rolou".

## Limites conhecidos

- O texto da revelação sai das rolagens que o próprio redutor viu. Um par de jogador que não recebeu a rolagem do Mestre pode mostrar "não rolou" até o próximo estado completo. Não vaza nada; só diverge na tela.
- Um cliente do Mestre com defeito que monte a op sem passar pelo construtor pode gravar a `dc`. Fora de escopo.
- O caminho de rolagem com prova de justiça não leva `requestId` nesta versão.
