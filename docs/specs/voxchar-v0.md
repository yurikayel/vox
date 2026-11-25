# Ficha portátil `.voxchar` (v0)

> **Status:** rascunho (proposta; aguarda aceite do mantenedor, zero código antes) · **Owner:** mantenedor · **Revisado:** 2026-11-25
> **Relacionados:** [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) (§6) · [subversus-vtt-v0.md](./subversus-vtt-v0.md)

Define o arquivo `.voxchar`, que leva a ficha-base de um personagem de uma instalação do Vox para outra. Nada aqui está implementado; o código só começa depois do aceite.

## 1. Escopo

- **v1:** exportar e importar um arquivo `.voxchar` avulso, com validação.
- **Futuro, mesmo conteúdo:** o mesmo JSON como item dentro do `.voxrpg.zip`.
- **Decisão pendente:** link só de leitura (§6).
- **Cópia-modelo:** importar o arquivo e zerar o estado de jogo (§5).

## 2. Formato

Arquivo JSON em UTF-8, no máximo 256 KiB, extensão `.voxchar`.

```json
{
  "kind": "voxchar",
  "format": 1,
  "system": { "id": "dnd5e-2024", "version": 1 },
  "exportedAt": "2026-11-25T12:00:00.000Z",
  "sheet": {
    "name": "", "class_name": "",
    "attributes_lww": {}, "system_choices": {},
    "inventory_orset": {}, "custom_actions": [], "notes": ""
  }
}
```

- `format` é o inteiro da versão do arquivo. Versão maior que a conhecida: recusa com o motivo.
- `sheet` leva só os campos da lista acima, mais o que o pacote de sistema declara como escolha (`system_choices`).

## 3. O que fica de fora

- Identidade, chaves, guardiões, e-mail, cofre e qualquer dado de conta (identidade congelada).
- Retrato, nem como URL: URL externa faz o app buscar conteúdo de fora e permite rastreio. Reavaliar em outra versão com imagem embutida e limitada.
- Estado de jogo: `pools_base`, `delta_ledger`, PV atual, espaços de magia, condições, Exaustão, Dados de Vida gastos e marcas de morte.
- Segredos de Mestre, tokens, ids de campanha, de cena e de ator.

## 4. Importar: ameaças e defesas

O arquivo é entrada não confiável.

| Ameaça | Defesa |
| :--- | :--- |
| Arquivo gigante (esgotar memória) | Limite de bytes checado antes do `JSON.parse`; acima de 256 KiB recusa. |
| JSON malformado ou de outro tipo | `kind` e `format` conferidos primeiro; qualquer falha recusa com motivo em português, sem gravar. |
| Campos extras ou tipos errados | Lista branca de campos e tipos; o que não está na lista é descartado, números limitados aos intervalos do pacote. |
| Injeção de HTML | Nenhum dado do arquivo vai para `innerHTML`; a tela usa os renderizadores existentes, que escapam. |
| Sobrescrever ficha existente | A ficha importada ganha id novo; nunca substitui outra. |
| Sistema desconhecido | Recusa com o motivo, sem tentar adivinhar. |
| Chaves de objeto perigosas (`__proto__`) | Cópia por lista branca para objeto novo; chaves fora da lista nunca são lidas. |
| Itens e ações em excesso | Limites de quantidade e de tamanho de texto por campo. |

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
- Botões **Exportar ficha (.voxchar)** e **Importar ficha** dentro do bloco "Editar Dados da Ficha" (`screen-sheet-levelup.js`), com o aviso de erro no mesmo alerta de validação do painel.
- Funções com no máximo 30 LLOC e JSDoc em todo export.

## 8. Testes de aceite

1. Exportar e importar devolve a mesma ficha-base (round-trip), com id novo.
2. O arquivo exportado não contém `pools_base`, `delta_ledger`, retrato, chaves nem ids de campanha.
3. Arquivo acima de 256 KiB é recusado antes do parse.
4. JSON malformado, `kind` errado e `format` maior que o conhecido são recusados com motivo.
5. Sistema desconhecido é recusado.
6. Campo extra e chave `__proto__` são descartados sem efeito.
7. Texto com marcação aparece escapado na tela.
8. Importar não altera a ficha existente.
9. Os testes falham quando o código de validação é removido (mutação manual).
