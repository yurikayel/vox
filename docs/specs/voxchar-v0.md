# Ficha portátil `.voxchar` (v0)

> **Status:** parcial (aceita pelo mantenedor em 2026-11-25; exportar e importar `.voxchar` implementados em `client/js/dungeon/voxchar.js` e `voxchar-check.js`; link só de leitura fica fora do v1, §6) · **Owner:** mantenedor · **Revisado:** 2026-11-25
> **Relacionados:** [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) (§6) · [subversus-vtt-v0.md](./subversus-vtt-v0.md)

Define o arquivo `.voxchar`, que leva a ficha-base de um personagem de uma instalação do Vox para outra. Aceita em 2026-11-25. O v1 (exportar e importar) está implementado; o link só de leitura (§6) e o item dentro do `.voxrpg.zip` não.

## 1. Escopo

- **v1:** exportar e importar um arquivo `.voxchar` avulso, com validação.
- **Futuro, mesmo conteúdo:** o mesmo JSON como item dentro do `.voxrpg.zip`.
- **Decisão pendente:** link só de leitura (§6).
- **Cópia-modelo:** importar o arquivo e zerar o estado de jogo (§5).

## 2. Formato

Arquivo JSON em UTF-8, no máximo 256 KiB, extensão `.voxchar`. Os nomes dos campos são os do documento de ficha real (`createCharacterSheetDoc` em `rpg-sheet-and-lore.js`, `ensureSheetMeta` em `vtt-schema.js`):

```json
{
  "kind": "voxchar",
  "format": 1,
  "system": { "id": "dnd5e-2024", "version": 1 },
  "exportedAt": "2026-11-25T12:00:00.000Z",
  "sheet": {
    "attributes_lww": { "name": "", "ancestry": "", "class_name": "", "armor_class": 10, "abilities": {}, "level": 1, "speed_ft": 30 },
    "system_choices": {},
    "inventory_orset": {},
    "sheet_meta": {
      "clickable_actions": [], "skill_refs": [], "proficiency_bonus": 2,
      "notes_public": "", "level_milestones": []
    }
  }
}
```

- `name`, `ancestry` (ancestralidade, como "Humano") e `class_name` ficam em `attributes_lww`, como na ficha real; `ancestry` é da ficha-base, não identidade.
- `format` é o inteiro da versão do arquivo; maior que o conhecido: recusa com o motivo. `system.version` maior que a do pacote instalado: recusa com o motivo.
- `exportedAt` é informativo: validado como data ISO ou ignorado; nunca decide nada.
- `system_choices` só leva o que o pacote de sistema declara (perícias, salvaguardas, especialização, Deslocamento, Dado de Vida).

## 3. O que fica de fora

- **Do documento da ficha:** `owner_pubkey_p256`, `campaign_id`, `character_id`, `spatial_state`, `sheet_meta.notes_gm`, `pools_base` e `delta_ledger`.
- **Identidade e conta:** chaves, guardiões, e-mail, cofre e qualquer dado de conta (identidade congelada).
- **Retrato**, nem como URL: URL externa faz o app buscar conteúdo de fora e permite rastreio. Reavaliar em outra versão com imagem embutida e limitada.
- **Estado de jogo:** PV atual, espaços de magia, condições, Exaustão, Dados de Vida gastos e marcas de morte.
- **Tokens e segredos de Mestre.**

Ao importar, o id da ficha, a campanha e o dono vêm da instalação que importa; o arquivo não os define.

## 4. Importar: ameaças e defesas

O arquivo é entrada não confiável. A normalização reaproveita a do import de Markdown (`importMarkdownIntoCampaign` e `markdownToSheet` em `dungeon-persistence.js`), que já limita nome e campos e grava por `SHEET_UPSERT`.

| Ameaça | Defesa |
| :--- | :--- |
| Arquivo gigante (esgotar memória) | `file.size` checado antes de ler e o tamanho do texto lido checado antes do `JSON.parse`; acima de 256 KiB recusa. |
| JSON malformado ou de outro tipo | `kind` e `format` conferidos primeiro; qualquer falha recusa com motivo em português, sem gravar. |
| Campos extras ou tipos errados | Lista branca de campos e tipos; o que não está na lista é descartado. |
| Números absurdos | Faixa para cada número: atributos e CA pelo pacote; `qty` e peso em `inventory_orset` e os números de `attributes_lww` fora do pacote com faixa fixa; fora da faixa recusa com o campo e o motivo. |
| Estruturas enormes ou profundas | Limite de nº de itens, de nº de chaves e de profundidade em `system_choices` e `inventory_orset`; limite de tamanho por texto. |
| Injeção de HTML | Nenhum dado do arquivo vai para `innerHTML`; a tela usa os renderizadores existentes, que escapam. |
| Sobrescrever ficha existente | A ficha importada ganha id novo; nunca substitui outra. |
| Sistema desconhecido ou de versão maior | Recusa com o motivo, sem tentar adivinhar. |
| Chaves perigosas (`__proto__`, `constructor`) | Cópia por lista branca para objeto novo; chaves fora da lista nunca são lidas. |

Depois da validação, a ficha passa pelos mesmos caminhos de normalização do app (`ensureSheetMeta`, `migrateLegacySheet`).

## 5. Exportar e cópia-modelo

- **Exportar:** monta o JSON da ficha ativa só com a lista branca e baixa o arquivo `Nome.voxchar`. Nada vai a servidor.
- **Cópia-modelo:** importa o arquivo como ficha nova com o estado de jogo no valor inicial (PV e espaços no máximo, sem condições). Como o arquivo já não leva estado, a cópia-modelo é o mesmo import com o nome marcado como modelo.

## 6. Opção para decisão: link só de leitura

JSON comprimido (`CompressionStream` nativo, sem dependência) e codificado em base64url no fragmento `#voxchar=…`. A tela abre em modo visualização e não grava.

- **A favor:** o fragmento não vai ao servidor; funciona sem infraestrutura.
- **Contra:** fica no histórico do navegador e com quem recebe o link; o limite prático é de cerca de 8 KB, e fichas maiores só vão por arquivo.
- **Recomendação:** não entra no v1.

## 7. Código e interface

- Módulo `client/js/dungeon/voxchar.js`, carregado por `import()` dinâmico ao tocar em Exportar ou Importar; nenhum byte em `SHELL_ASSETS`.
- Botões **Exportar ficha (.voxchar)** e **Importar ficha** dentro do bloco "Editar Dados da Ficha" (`renderSheetEditPanel` em `screen-sheet-levelup.js`), com o aviso de erro no mesmo alerta de validação do painel.
- Funções com no máximo 30 LLOC e JSDoc em todo export.

## 8. Testes de aceite

1. Exportar e importar devolve a mesma ficha-base (round-trip), com id novo.
2. O arquivo exportado não contém nenhum campo da lista de exclusões da §3 (`owner_pubkey_p256`, `campaign_id`, `character_id`, `spatial_state`, `sheet_meta.notes_gm`, `pools_base`, `delta_ledger`, retrato).
3. Arquivo acima de 256 KiB é recusado sem chamar `JSON.parse` (o teste espiona `JSON.parse` e prova que não foi chamado).
4. JSON malformado, `kind` errado e `format` maior que o conhecido são recusados com motivo.
5. Sistema desconhecido é recusado; sistema com versão maior que a instalada também.
6. Campo extra e chave `__proto__` são descartados sem efeito.
7. Texto com marcação aparece escapado na tela.
8. Importar não altera a ficha existente.
9. Número fora da faixa e itens em excesso são recusados com o campo e o motivo.
10. Exportar uma ficha com `notes_gm` e `owner_pubkey_p256` preenchidos não os leva ao arquivo.
