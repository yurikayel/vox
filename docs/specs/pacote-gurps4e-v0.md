# Pacote de sistema `gurps4e` — spec v0 (SUB-11)

> **Status:** aceita (opções recomendadas; decisão SUB-D3: só matemática) · **Owner:** mantenedor · **Código:** `client/js/dungeon/system-pack-gurps4e.js` e `client/js/dungeon/system-gurps-math.js` · **Testes:** `tests/subversus-pacote-gurps4e.test.js`

## 1. Escopo

Só matemática, no formato dos pacotes existentes (`validateSystemPack`):

- `testKind: "3d6_sob_nh"`; 4 atributos (ST, DX, IQ, HT); recursos `hp` (PV) e `fp` (PF), ambos `pool`.
- Secundários (`gurpsSecondaries`): PV = ST, Vontade = Percepção = IQ, PF = HT, Velocidade Básica = (DX + HT) / 4, Deslocamento Básico = parte inteira, Esquiva = Deslocamento + 3, Carga Básica = ST² / 5.
- Níveis de carga (`encumbrance`): limites de 1, 2, 3, 6 e 10 vezes a Carga Básica; fator de Deslocamento 1, 0,8, 0,6, 0,4 e 0,2; redutor de Esquiva 0 a −4; acima do último limite fica `overloaded`.
- Resolução (`resolve3d6`): sucesso com a soma até o NH, 3 e 4 sempre, 17 e 18 nunca; crítico de sucesso em 3, 4, 5 (NH 15+) e 6 (NH 16+); crítico de falha em 18, em 17 (NH 15 ou menos) e em 10 ou mais acima do NH.

## 2. Conteúdo e licença

Não há licença aberta para o conteúdo editorial. O pacote traz nomes de mecânica de jogo (os quatro atributos) e fórmulas e matemática do Vox. Fora: lista de perícias, vantagens, desvantagens, tabelas (inclusive a de dano por ST) e qualquer texto de regra; esses dados são escritos ou importados pelo jogador. `license.spdx` é `LicenseRef-Vox-Estrutura-Propria`. Nota em `docs/legal/licenca-e-contribuicoes.md`.

## 3. Limites conhecidos (não entram neste PR)

- O motor de derivados é o da 5e: o modificador mostra a diferença para 10, o campo de "classe de armadura" mostra o DX (não a Esquiva), a iniciativa e a percepção passiva não são as do GURPS. Use `gurpsSecondaries` para os números certos até a tela ser adaptada.
- Sem perícias, o cartão de perícias fica vazio; curva de pontos (F/M/D/MD), pontos totais e não gastos, e dano GdP/GeB ficam para depois.
- As fórmulas e os limites vieram de memória, sem o livro à mão: o mantenedor precisa conferi-los.
- Registrar o pacote o torna selecionável na ficha ("GURPS 4e (matemática)").

Próximo passo sugerido: item SUB para adaptar a tela de derivados e o HUD aos secundários do GURPS.
