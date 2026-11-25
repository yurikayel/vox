# Assistente de criar ficha (v0)

> **Status:** rascunho (proposta; aguarda decisões do mantenedor na §7, zero código antes) · **Owner:** mantenedor · **Revisado:** 2026-11-25
> **Relacionados:** [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) (§6) · [voxchar-v0.md](./voxchar-v0.md) · [subversus-vtt-v0.md](./subversus-vtt-v0.md)

Define o assistente que cria uma ficha nova no pacote `dnd5e-2024`, com três entradas: **Rápido**, **Guiado** e **Importar**. Nada aqui está implementado.

## 1. O que a spec anterior já define e o que falta

A [§6 do brainstorm](./ficha-personagem-brainstorm-v0.md) diz só: "assistente por sistema com três entradas: **Rápido** (personagem pronto), **Guiado** (5 a 7 passos) e **Importar**". Não define os passos, o que cada um grava, as validações nem de onde vêm os valores prontos do Rápido. Esta proposta preenche isso **sem criar regra de sistema fora do pacote**: o pacote `dnd5e-2024` hoje traz atributos, perícias, salvaguardas, CA por armadura, recursos e condições, e **não traz** classes, ancestralidades, antecedentes, compra de pontos nem lista padrão de atributos. Onde o Guiado ou o Rápido precisariam desses dados, a §7 pede decisão do mantenedor em vez de inventar.

## 2. Princípios

- O assistente só monta o mesmo documento de ficha que o painel Editar já grava (`SHEET_UPSERT`); nenhum campo novo na ficha.
- Cada passo reaproveita as validações do Editar (`validateSheetEdit` em `sheet-edit-validate.js`): valor fora do limite não é ajustado em silêncio; o passo recusa o avanço e diz o motivo de cada campo, mantendo o que foi digitado.
- Nada é gravado até o último passo; sair no meio descarta o rascunho. Ficha nova sempre com id novo, e a ficha existente nunca é sobrescrita.
- Texto digitado é sempre escapado na tela; nenhum `innerHTML` com dado do usuário.
- Identidade congelada: o assistente não toca em conta, chaves nem cofre.

## 3. Entrada Rápido

Cria um personagem pronto com um toque: nome, e os valores iniciais do pacote.

- Pergunta só o **nome**.
- Grava a ficha com os padrões que a ficha nova já tem hoje (`createCharacterSheetDoc`: atributos 10, nível 1, CA 10, Deslocamento 30 pés, PV máximo 20) e o pacote `dnd5e-2024`.
- Depois de criada, a ficha abre no painel Editar para o jogador ajustar o resto.
- **Pendente (§7, D1):** "personagem pronto" com classe e atributos de verdade exige dados que o pacote não tem.

## 4. Entrada Guiada

Cinco a sete passos, cada um com "Voltar" e "Avançar", e um resumo antes de gravar. Proposta com o que o pacote já suporta:

| # | Passo | Campos | O que grava | Validação |
| :-- | :--- | :--- | :--- | :--- |
| 1 | Quem é | Nome, Classe/Título e Ancestralidade (texto livre) | `attributes_lww.name`, `class_name`, `ancestry` | Nome obrigatório; limite de 60 caracteres |
| 2 | Atributos | Seis atributos do pacote | `attributes_lww.abilities` | Inteiro entre 1 e 30 (limites do Editar) |
| 3 | Perícias | Perícias treinadas e, depois, especialização só nas treinadas | `system_choices.proficientSkills`, `expertSkills` | Só ids do pacote; especialização só em perícia treinada |
| 4 | Salvaguardas | Salvaguardas treinadas | `system_choices.proficientSaves` | Só ids de atributos do pacote |
| 5 | Defesa e movimento | CA, Deslocamento e Dado de Vida | `attributes_lww.armor_class`, `speed_ft`, `system_choices.hitDie` | CA 1–40; Deslocamento 0–200; Dado de Vida d4 a d12 |
| 6 | Equipamento (opcional) | Itens e armadura, pelo formulário de itens da ficha | `inventory_orset` | Mesmas regras do inventário (quantidade, peso, tipo de armadura do pacote) |
| 7 | Resumo | Mostra o que será gravado, com os derivados do pacote (modificadores, CA, iniciativa) | grava tudo de uma vez | Revalida a ficha inteira; qualquer aviso volta ao passo do campo |

- O número de perícias e de salvaguardas **não** é limitado pelo assistente: depende da classe, e o pacote não tem classes (§7, D2).
- Os passos 3 a 6 podem ser pulados; os padrões do pacote valem.
- Os derivados do resumo vêm de `system-derive.js`; o assistente não calcula nada por conta própria.

## 5. Entrada Importar

Reaproveita o `.voxchar` ([voxchar-v0.md](./voxchar-v0.md)):

- Botão "Importar ficha (.voxchar)" no assistente, com o mesmo módulo carregado sob demanda e as mesmas defesas de arquivo não confiável.
- Arquivo válido cria a ficha nova direto e abre no painel Editar; inválido mostra os motivos e não grava nada.
- Importar de Markdown (`.md`) continua no fluxo de campanha e fica fora desta spec.

## 6. Interface e código

- Tela do assistente aberta pelo botão "Nova ficha" da ficha, com as três entradas como três cartões; foco no primeiro campo a cada passo e teclado completo.
- Módulo `client/js/dungeon/sheet-wizard.js` carregado por `import()` dinâmico; nenhum byte em `SHELL_ASSETS`.
- Estado do rascunho só em memória da tela (`state.sheetWizard`), nunca em `localStorage`.
- Funções com no máximo 30 LLOC, JSDoc em todo export.

## 7. Decisões pendentes do mantenedor

- **D1. Rápido com personagem de verdade:** o pacote não tem classes. Opções: (a) Rápido só pede o nome e usa os padrões (proposta inicial, §3); (b) acrescentar ao pacote uma lista pequena de "modelos prontos" (dados: classe, atributos, perícias, salvaguardas, Dado de Vida) tirados do SRD 5.2, em PR próprio com a atribuição de licença.
- **D2. Regras de criação:** compra de pontos ou lista padrão de atributos, e quantas perícias treinar por classe. Proposta: **fora do v1**; o Guiado aceita os valores dentro dos limites do Editar, sem impor regra de criação.
- **D3. Equipamento no Guiado:** o passo 6 reaproveita o formulário de itens; confirmar se entra no v1 ou só depois.

## 8. Testes de aceite

1. Rápido cria uma ficha com o nome dado e os padrões do pacote, com id novo.
2. Guiado: cada passo recusa valor fora do limite com o motivo do campo e mantém o que foi digitado (mesma mensagem do Editar).
3. Guiado: avançar com campo inválido não muda de passo; voltar mantém o que foi digitado.
4. Nada é gravado antes do resumo; sair no meio não deixa ficha nem rascunho persistido.
5. O resumo mostra os derivados iguais aos do `system-derive.js` para os mesmos valores.
6. A ficha criada pelo Guiado é igual à que o Editar produziria com os mesmos valores.
7. Importar válido cria ficha nova; inválido mostra os motivos e não grava.
8. Texto com marcação aparece escapado em todos os passos.
9. Criar não altera nenhuma ficha existente.
10. O módulo do assistente não está em `SHELL_ASSETS` e carrega só ao abrir o assistente.
