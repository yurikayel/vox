# Pacote de sistema `t20` — spec v0 (SUB-10)

> **Status:** aceita (opções recomendadas; decisão SUB-D2: texto é campo livre editável) · **Owner:** mantenedor · **Código:** `client/js/dungeon/system-pack-t20.js` · **Testes:** `tests/subversus-pacote-t20.test.js`

## 1. Escopo

Só estrutura e matemática, no mesmo formato dos pacotes existentes (`validateSystemPack`):

- `testKind: "d20_vs_cd"`.
- 6 atributos (FOR, DES, CON, INT, SAB, CAR).
- 29 perícias básicas, cada uma ligada a um atributo.
- Recursos `hp` (PV) e `mp` (PM), ambos `pool`.
- Rótulos `Defesa`, `Iniciativa` e `Deslocamento`.

## 2. Conteúdo e licença

Não há licença aberta para o conteúdo editorial do sistema. O pacote traz só nomes e ligações de mecânica de jogo (atributos, perícias e a ligação de cada perícia a um atributo); estrutura e matemática do Vox. Fica fora: poderes, magias, classes, raças, divindades, descrições e qualquer texto de regra. O que for texto vem do jogador (campo livre) ou de importação local. `license.spdx` é `LicenseRef-Vox-Estrutura-Propria`; a atribuição diz isso e que a marca é de seus titulares. Nota em `docs/legal/licenca-e-contribuicoes.md` §5.

## 3. Representação no motor

| Parâmetro | Valor | Efeito |
| --- | --- | --- |
| `modifier` | `base 10, step 1` | valor guardado = 10 + modificador; o cartão mostra o modificador |
| `proficiency` | `base 0, every 20` | treino não é calculado: bônus zero |
| `armorClass` | `base 10, ability dex` | Defesa sem armadura = 10 + mod. DES |
| `initiative` | `ability dex` | |
| `passivePerception` | `base 10, skill percepcao` | |

## 4. Limites conhecidos (não entram neste PR)

- A tela de derivados é a da 5e: salvaguardas por atributo, testes contra a morte, dados de vida, descansos e percepção passiva aparecem com rótulos genéricos que não existem no T20.
- Treino por perícia e meio nível não são calculados.
- HUD de magia por PM não é coberto (`hud-bar-model` lê o recurso `spell-slots`).
- Registrar o pacote o torna selecionável na ficha; por isso o nome visível é "Tormenta20 (estrutura)".
- As ligações perícia-atributo vieram de memória, sem o livro à mão: o mantenedor precisa conferi-las.

Próximo passo sugerido: item SUB para adaptar tela de derivados e HUD ao T20.
