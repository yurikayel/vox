# Derivados e HUD por sistema — spec v0 (SUB-17)

> **Status:** aceita em 26/11/2026 (opções recomendadas; autorização geral do mantenedor) · **Owner:** mantenedor / revisor · **Escopo:** módulo `dungeon/` (ficha e HUD do **Subversus VTT**) · **Relacionados:** [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) (§4, §7, §9), [hud-jogo-v0.md](./hud-jogo-v0.md), [pacote-t20-v0.md](./pacote-t20-v0.md), [pacote-gurps4e-v0.md](./pacote-gurps4e-v0.md), [voxchar-v0.md](./voxchar-v0.md)
> **Nota de governança (`ADR-017`):** este documento especifica contratos e critérios de aceite; as caixas `[ ]` de acompanhamento ficam só no `ROADMAP.md`. As decisões da §8 foram tomadas em 26/11/2026 com a opção recomendada (autorização geral do mantenedor).

## 1. Problema (o que o código faz hoje)

Os três pacotes (`dnd5e-2024`, `t20`, `gurps4e`) já existem, mas a tela e o HUD seguem o D&D:

- **Faixa de derivados** (`screen-sheet-derived.js`, `renderDerivedStrip`): lista fixa de cinco números (proficiência, CA, iniciativa, percepção passiva, deslocamento), depois salvaguardas, testes contra a morte, condições, Exaustão, Dados de Vida e descansos. Só os **rótulos** vêm do pacote (`pack.labels`); a lista não.
- **Motor** (`system-derive.js`, `deriveSheet`): exige as fórmulas `armorClass`, `initiative` e `passivePerception` em todo pacote, mesmo quando o sistema não tem o conceito. O `t20` preenche com valores que não são regra (treino em zero, percepção passiva 10 + perícia); o `gurps4e` põe o rótulo "DX" no campo de CA e deixa a percepção passiva sem perícia. A matemática certa do GURPS (Esquiva, Deslocamento, carga) está em `system-gurps-math.js`, que **nenhuma tela usa**.
- **HUD** (`screen-hud-status.js`, `hud-status-model.js`): o texto "CA" é literal e o número vem de `attributes_lww.armor_class`, não do pacote. A linha móvel é "Nome · PV · CA". O indicador de magia procura o recurso `spell-slots` (`hud-bar-model.js`), que só o D&D tem; o `t20` (PM) e o `gurps4e` (PF) não aparecem.
- **Ficha** `.voxchar` não grava derivado (voxchar-v0 §3), então trocar a tela não muda arquivo nenhum.

Resultado: uma ficha `t20` mostra "Defesa" com o número certo por acaso, "Proficiência +0" e "Percepção passiva" sem sentido; uma ficha `gurps4e` mostra DX no lugar da Esquiva.

## 2. Proposta: o pacote declara o que mostrar

Cada pacote ganha um campo opcional **`display`** (dado puro, sem função nem HTML):

- `display.derived`: lista ordenada de entradas `{ id, label, source, hud? }`.
- `display.hud`: `{ vitals, defense, secondary }`, ids de recurso e de derivado que o HUD mostra (retrato, barra e linha móvel).

Cada entrada de `derived` tem um **`source`** de um destes tipos, todos validados por `validateSystemPack`:

| `source` | Significado | Exemplo |
| :-- | :-- | :-- |
| `{ formula: "armorClass" }` | usa a fórmula do motor que já existe | CA (D&D), Defesa (T20) |
| `{ resource: "hp" }` | máximo e atual de um recurso do pacote | PV, PM, PF |
| `{ computed: "gurps.dodge" }` | nome de uma **função pura registrada em código** (`system-gurps-math.js`); o pacote só guarda o nome | Esquiva, Deslocamento Básico, nível de carga |

- Nada de `eval`, de função dentro do pacote ou de fórmula em texto: nome desconhecido é recusado na validação (`computed` precisa estar num registro fechado). Pacote importado de fora, se existir um dia, só poderá usar `formula` e `resource`.
- O motor passa a exigir só o que o pacote **usa**: `armorClass`, `initiative` e `passivePerception` deixam de ser obrigatórios quando nenhuma entrada os referencia.
- Rótulos são termos de jogo curtos (limite de 24 caracteres), sem descrição nem texto de regra (mesma regra dos pacotes `t20` e `gurps4e`).

## 3. O que cada sistema declara

| Sistema | Derivados na faixa (ordem) | Fora da faixa |
| :-- | :-- | :-- |
| **D&D 2024** | Proficiência, CA, Iniciativa, Percepção passiva, Deslocamento | salvaguardas, testes contra a morte, Dados de Vida, descansos e Exaustão, como hoje |
| **Tormenta20** | Defesa, Iniciativa (só atributo, rótulo "Iniciativa (atributo)"; no livro é perícia, a perícia `iniciativa` existe à parte; **conferir com o mantenedor**), Deslocamento; PV e PM como recursos **(PM fica para depois, depende da D8)** | sem Proficiência, Percepção passiva, salvaguardas por atributo, testes contra a morte, Dados de Vida e Exaustão (Fortitude, Reflexos e Vontade já são perícias) |
| **GURPS 4e** | Esquiva, Deslocamento Básico, Velocidade Básica, nível de carga (com o peso do inventário); PV e PF como recursos | sem Proficiência, CA, Percepção passiva (Percepção é o secundário `per`), salvaguardas, testes contra a morte, Dados de Vida |

Os blocos opcionais (salvaguardas, testes contra a morte, descansos) passam a aparecer só quando o pacote os declara (`display.blocks`, lista de ids conhecidos). Sem a lista, vale o conjunto atual do D&D (§5).

## 4. O que o HUD mostra por sistema

| Parte do HUD | D&D 2024 | Tormenta20 | GURPS 4e |
| :-- | :-- | :-- | :-- |
| Barra de vida | PV | PV | PV |
| Indicador de magia | espaços de magia (rótulo do recurso `spell-slots`) | PM (só se o máximo for maior que zero; depende da D8) | PF (só se o personagem tiver magias; ver D4; depende da D8) |
| Defesa no retrato | "CA 16" | "Defesa 14" | "Esquiva 8" |
| Linha móvel | Nome · PV 18/24 · CA 16 | Nome · PV 18/24 · Defesa 14 | Nome · PV 12/12 · Esquiva 8 |
| Cinto e favoritos | iguais (não dependem do sistema) | iguais | iguais |

O HUD lê `display.hud` do pacote da ficha e usa o **rótulo do pacote**, não o literal "CA". O número vem do derivado declarado; o campo `attributes_lww.armor_class` continua valendo para o D&D e para fichas sem `display` (§5). De outras pessoas só aparece o que a projeção do jogador já entrega; **nenhum campo novo passa a sair na projeção** (o rótulo vem do pacote, que é público).

## 5. Fallback e compatibilidade

- **Pacote sem `display`:** a tela e o HUD usam o conjunto de hoje (cinco números, blocos do D&D, "CA" via `labels.armorClass`). Nada muda para o `dnd5e-2024` enquanto ele não declarar `display`, e a primeira fatia o declara com exatamente o que mostra hoje (sem diferença visível).
- **Entrada inválida em `display`:** `validateSystemPack` recusa o pacote inteiro no registro (erro de programação, aparece nos testes), nunca em tempo de uso.
- **Ficha com sistema desconhecido ou sem pacote:** como hoje, sem faixa e sem erro.
- **`.voxchar` existentes:** o formato não muda e nenhuma versão sobe. Derivado nunca foi gravado, então fichas antigas e novas abrem com a tela do pacote que o arquivo declara. Id de sistema desconhecido continua recusado na importação (voxchar-v0 §4).
- **Campo `armor_class` da ficha:** continua sendo o valor digitado/gravado; a Defesa do T20 e a Esquiva do GURPS são calculadas na hora e não gravadas (spec brainstorm §4: a ficha nunca grava derivado).
- **Ficha de outro sistema na mesma mesa:** cada ficha usa o pacote dela; o retrato do grupo mostra o rótulo do sistema de cada pessoa.

## 6. Fatias de implementação (SUB-17)

1. **Modelo e D&D idêntico:** `display` na validação, leitura em `renderDerivedStrip` e no HUD, `dnd5e-2024` declarando o que já mostra. Aceite: nenhum teste existente muda de resultado. **Feita (módulo `system-display.js`):** erro de forma (lista maior que 16, id fora de `^[a-z][A-Za-z0-9_-]{0,31}$` ou repetido, rótulo vazio ou com mais de 24 caracteres) recusa o pacote; `source` desconhecido ou `computed` fora do registro é **ignorado** na hora de desenhar, sem derrubar as outras entradas; `computed` que lança some; o registro de `computed` está vazio nesta fatia; `resource` é aceito na forma, mas só o HUD o usará, nas fatias seguintes. Sem declaração de defesa, o HUD mostra o literal "CA" (o T20 só muda na fatia 2). Teste de igualdade do D&D por hash do HTML em `tests/subversus-derivados-display.test.js`.
2. **Tormenta20:** declara `display`; some o que não existe; o HUD mostra Defesa e PM (PM depende da D8). **Feita em parte (PR da fatia 2):** faixa com Defesa, Iniciativa (atributo) e Deslocamento; `display.blocks` (`saves`, `deathSaves`, `conditions`; sem a lista valem todos; teto de 8 textos, só strings; o erro de `blocks` não esconde o de `derived`) vazio no T20, que também não declara condições; o sufixo "sem armadura" só existe em pacote com `formulas.armor` (o T20 mostra "Defesa" pura); HUD com o rótulo "Defesa". **Fica para depois:** PV e PM como recurso na faixa e o indicador de PM no HUD, porque o Vox ainda não guarda PM na ficha (`pools_base` só tem PV e espaços de magia); precisa de decisão de armazenamento.
3. **GURPS 4e:** ligar `system-gurps-math.js` (Esquiva, Deslocamento, carga pelo inventário) e o HUD com PV, PF e Esquiva. Aqui o módulo sai de `UNPLUGGED_MODULES` do `sw.js`.

Cada fatia é um PR; JSDoc em todo export; função de produção com no máximo 30 linhas lógicas; arquivo legado acima de 350 linhas não cresce.

## 7. Testes de aceite

| # | Teste | Falha na base? |
| :-- | :--- | :--- |
| 1 | `validateSystemPack` aceita `display` válido e recusa `source` com tipo desconhecido, `computed` fora do registro, rótulo acima de 24 caracteres e id de recurso inexistente | Sim |
| 2 | Pacote sem `display` renderiza a faixa e o HUD exatamente como hoje (comparação de HTML) | Não: guarda de regressão |
| 3 | Ficha `t20` na faixa: Defesa, Iniciativa (atributo), Deslocamento (PV e PM dependem da D8); sem Proficiência, Percepção passiva, testes contra a morte nem Dados de Vida | Sim |
| 4 | Ficha `gurps4e` na faixa: Esquiva, Deslocamento Básico, Velocidade Básica e carga (com e sem peso), valores iguais aos de `gurpsSecondaries` e `encumbrance` | Sim |
| 5 | HUD: rótulo e número da defesa vêm do pacote (D&D "CA", T20 "Defesa", GURPS "Esquiva"); a linha móvel segue o formato por sistema | Sim |
| 6 | Indicador de magia: aparece com PM no T20 e com PF no GURPS só quando D4 mandar; some sem máximo (depende da D8) | Sim |
| 7 | `computed` com nome registrado não executa nada vindo do pacote (o pacote é congelado e só guarda texto) e função lançando erro não derruba a tela (entrada some, resto aparece) | Sim |
| 8 | Roundtrip `.voxchar` de ficha `t20` e `gurps4e`: exporta, importa, mesma tela; arquivo igual ao de antes da mudança (sem campo novo) | Parcial |
| 9 | Projeção do jogador não ganha campo novo (comparar chaves antes e depois) | Não: guarda de regressão |
| 10 | Rótulos escapados (`escapeHtml`) em faixa e HUD, inclusive com `<` num rótulo de pacote de teste | Sim |
| 11 | Pacote que não declara PV (recurso `hp` ausente): barra de vida some sem erro | Sim |

## 8. Decisões pendentes (cada uma com a opção recomendada)

- **D1.** Onde o pacote declara os derivados: campo `display` de dado puro (recomendado), ou código por sistema no lugar do pacote?
  - **Recomendado: `display` de dado puro**, com `computed` só por nome de função registrada. Mantém o pacote como dado e o registro fechado.
  - **Decidido em 26/11/2026:** campo `display` de dado puro (opção recomendada; autorização geral do mantenedor).
- **D2.** Tornar `armorClass`, `initiative` e `passivePerception` opcionais no motor quando nenhuma entrada os usa?
  - **Recomendado: sim**, na fatia 1; os pacotes `t20` e `gurps4e` deixam de carregar valores que não são regra.
  - **Decidido em 26/11/2026:** sim, opcionais na fatia 1 (opção recomendada; autorização geral do mantenedor).
- **D3.** Blocos opcionais (salvaguardas, testes contra a morte, descansos, Dados de Vida, Exaustão): lista `display.blocks` por pacote, ou esconder por regra no código?
  - **Recomendado: lista `display.blocks`**, com o conjunto atual do D&D como padrão quando ausente (§5).
  - **Decidido em 26/11/2026:** lista `display.blocks` (opção recomendada; autorização geral do mantenedor).
- **D4.** Indicador de magia no GURPS: mostrar PF sempre, ou só se a ficha tiver magias (spec brainstorm §7)?
  - **Recomendado: só se tiver magias**, e enquanto não existir marca de "tem magias" na ficha GURPS o HUD não mostra PF como magia (PF continua na faixa).
  - **Decidido em 26/11/2026:** só se tiver magias (opção recomendada; autorização geral do mantenedor).
- **D5.** Nível de carga do GURPS na faixa: peso do inventário somado pela ficha (recomendado), ou valor digitado?
  - **Recomendado: somado pelo inventário** (`totalCarriedWeight`, já existente), com aviso quando algum item não tem peso.
  - **Decidido em 26/11/2026:** somado pelo inventário (opção recomendada; autorização geral do mantenedor).
- **D6.** Ordem das fatias: D&D idêntico → T20 → GURPS (recomendado), ou GURPS antes do T20?
  - **Recomendado: D&D idêntico, T20, GURPS**, pela mesma ordem dos pacotes e porque a fatia 1 prova a não regressão.
  - **Decidido em 26/11/2026:** D&D idêntico, T20, GURPS (opção recomendada; autorização geral do mantenedor).
- **D7.** Tela de **editar** (campos de salvaguardas, especialização e dado de vida) acompanha `display` na mesma fatia, ou fica para depois?
  - **Recomendado: depois**, em item próprio; a faixa de leitura e o HUD vêm primeiro, e a edição só some o que o pacote não declara.
  - **Decidido em 26/11/2026:** depois, em item próprio (opção recomendada; autorização geral do mantenedor).
- **D8.** Onde guardar PM (T20) e PF (GURPS) para a barra do HUD e a faixa: hoje `pools_base` só tem PV e espaços de magia, então `resource: "mp"` não tem dado.
  - **Recomendado: reservas genéricas por id do recurso do pacote** em `pools_base` (`<id>_max` e `<id>_current`, mesmo molde do PV, mudando pelo livro-razão `delta_ledger`), sem campo novo na projeção do jogador além do que o HUD já mostra. PM/PF novos passam pelo mesmo teto e validação do livro-razão (inteiros ≥ 0, máximo limitado), pela projeção ao jogador e pelo round-trip do `.voxchar`, cada um com teste. Sai em fatia própria, antes de `resource` na faixa e do indicador de PM.
  - **Decidido em 26/11/2026:** reservas genéricas `<id>_max`/`<id>_current` em `pools_base` com `delta_ledger`, em fatia própria (opção recomendada; autorização geral do mantenedor).

## 9. Fora de escopo

Texto de livro (descrições, tabelas, poderes, vantagens); novos pacotes; cálculo de treino por perícia do T20 e curva de pontos do GURPS (itens próprios); mudança de formato do `.voxchar`; novo tráfego de rede ou campo na projeção do jogador; identidade, entrada, conta, cofre e guardiões (congelados).
