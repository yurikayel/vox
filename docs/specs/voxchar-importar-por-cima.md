# `.voxchar` — importar por cima (SUB-27)

> **Status:** implementada em `client/js/dungeon/voxchar-over.js`. Complementa `voxchar-v0.md` (§4 "Sobrescrever ficha existente": o import comum continua criando ficha nova e nunca substitui outra).

## 1. O que faz

Na ficha aberta, a caixa **Importar por cima desta ficha** (painel "Editar Dados da Ficha") arma a substituição. Com ela marcada, **Importar ficha** lê e valida o arquivo como sempre, mas não grava: deixa o arquivo pendente e mostra a confirmação **Substituir** / **Cancelar**. Só depois de confirmar a ficha é gravada, com `SHEET_UPSERT` na mesma ficha.

## 2. O que troca e o que fica

| Troca (lista branca do arquivo) | Fica (sempre da ficha atual) |
|---|---|
| `attributes_lww`: nome, ancestralidade, classe, nível, CA, deslocamento, atributos | `character_id`, `campaign_id`, `owner_pubkey_p256` |
| `system` e `system_choices` do pacote (perícias, salvaguardas, Dado de Vida, deslocamento) | PV atual: `delta_ledger` (o dano sofrido) |
| `inventory_orset` (itens, com `x`/`y`/`rot`) | Condições, salvaguardas contra a morte, Exaustão, dados gastos |
| `sheet_meta`: ações clicáveis, perícias de referência, bônus de proficiência, notas públicas, marcos de nível | `sheet_meta.notes_gm`, favoritos e o resto de `sheet_meta` fora da lista |
| `pools_base`: `hp_max` e `<id>_max` das reservas presentes no arquivo (chave ausente mantém o valor atual) | `spatial_state`, ouro e espaços de magia atuais |

O PV atual é o saldo do `delta_ledger` sobre o máximo: trocar o `hp_max` muda o teto, não apaga o dano já sofrido.

## 3. Garantias

- **Nada de identidade vem do arquivo.** `owner_pubkey_p256`, `character_id`, `campaign_id`, `delta_ledger`, `spatial_state` e `notes_gm` do arquivo são ignorados (a ficha nova é montada a partir da atual e só a lista branca é copiada, em objetos novos).
- **Confirma antes de gravar.** Arquivo inválido é recusado com o motivo (mesma validação do import comum) e não deixa nada pendente.
- **A ficha certa.** Se a ficha aberta mudar entre escolher o arquivo e confirmar, o pendente é descartado sem gravar.
- **Portão de autorização.** `SHEET_UPSERT` sobre ficha existente só passa para o dono (jogador) ou para o Mestre; o reducer mantém o dono atual.
- **Identidade da conta intocada**: nenhum código de `identity/` é tocado.

## 4. Código

- `buildOverwrittenSheet`, `stageVoxcharOver`, `confirmVoxcharOver`, `cancelVoxcharOver` e `runVoxcharOver` em `voxchar-over.js`, carregado por `import()` só ao usar.
- `importVoxchar` (`voxchar.js`) desvia para `stageVoxcharOver` quando `state.voxcharOver.armed`.
- A tela (`renderVoxcharOverBlock` em `screen-sheet-levelup.js`) usa a ação `hud-op` com `data-hud-op="voxchar-over"` (registro de `dungeon-hud-actions.js`) e `data-step` `arm`, `confirm` ou `cancel`.

## 5. Testes

`tests/subversus-voxchar-por-cima.test.js`: troca e mantém; arquivo de outro dono e campos fora da lista branca; pendente e confirmar; cancelar; ficha aberta trocada; arquivo inválido; import comum inalterado; portão por dono; painel e ação.
