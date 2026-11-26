# Ficha portátil `.voxchar` (v0)

> **Status:** parcial (aceita pelo mantenedor em 2026-11-25; exportar e importar `.voxchar` implementados em `client/js/dungeon/voxchar.js` e `voxchar-check.js`; link só de leitura: decisões da §9.6 registradas em 2026-11-25, código liberado) · **Owner:** mantenedor · **Revisado:** 2026-11-25
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

- **Do documento da ficha:** `owner_pubkey_p256`, `campaign_id`, `character_id`, `spatial_state`, `sheet_meta.notes_gm`, `pools_base` (a emenda da §10 propõe levar só `hp_max` e `<id>_max`) e `delta_ledger`.
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

## 9. Emenda (rascunho): link só de leitura e cópia-modelo (SUB-04, parte 2)

> **Status desta emenda:** aceita (decisões da §9.6 registradas em 2026-11-25). O que não está no código nem nos docs vai marcado **(proposta)**.

### 9.1 O que já existe

- **Arquivo e importação (parte 1):** `exportVoxchar` (`client/js/dungeon/voxchar.js:80`), `importVoxchar` (`voxchar.js:115`) e `checkVoxchar` (`client/js/dungeon/voxchar-check.js:103`), com limite de 256 KiB (`voxchar-check.js:12`) e lista branca. `importVoxchar` já cria a ficha **com id novo e sem estado de jogo** (PV, espaços, condições, Exaustão e dados gastos nunca entram no arquivo, §3).
- **Cópia-modelo hoje:** a §5 diz que ela é o próprio import. Não existe botão nem marca de "modelo" no código; a ficha importada é uma ficha comum.
- **Link:** só a opção descrita na §6 (fragmento comprimido), sem código. Sem `CompressionStream` em `client/js`; `DecompressionStream` (deflate-raw) só em `client/js/labs/parado/webxdc-loader.js:5,57`, que confere o suporte. Sem suporte no navegador: não gera link, oferece só o arquivo e explica o motivo.
- **Convites da mesa** usam fragmento (`#k=`) fora da query (`client/js/dungeon/vtt-sync-codec.js:48`), precedente de como o app trata segredo em URL. O aviso de que o fragmento fica no navegador de quem abre **não está no código** **(proposta:** passa a existir na tela de geração, §9.3).
- **Modo só leitura:** não existe tela de ficha "somente leitura" para dados de fora; a ficha do jogador na mesa (`viewerRole` em `screen-sheet.js:186`) é outra coisa.

### 9.2 O que a spec ainda não define

Formato do link (esquema, compressão, versão), de onde vem o conteúdo, onde o link abre, validade, revogação, o que a cópia-modelo leva ou zera, e como o app avisa que o dado é de outra pessoa.

### 9.3 Link só de leitura **(proposta)**

- **Formato:** `#/ficha/ver#voxchar=<base64url>`, em que o valor é o mesmo JSON do `.voxchar` comprimido (deflate pelo `CompressionStream` nativo, com suporte conferido) e depois codificado em base64url. Rota e nome são proposta (D2).
- **Transporte:** o fragmento não vai ao servidor. Funciona sem infraestrutura, mas fica no histórico do navegador e com quem recebe o link (já dito na §6).
- **Limite:** compressão antes do limite; o link só é gerado quando o resultado cabe em cerca de 8 KB (D3); ficha maior só por arquivo, com mensagem explicando.
- **Abertura:** (a) recusa o fragmento acima de ~12 KB de base64 **antes** de decodificar (os ~8 KB da D3 valem só para gerar); (b) descomprime lendo o stream em pedaços e **aborta ao passar de 256 KiB**, sem ler tudo para depois medir (proteção contra "bomba de compressão"); (c) **(proposta)** depois de ler o fragmento, troca a URL por `#/ficha/ver` com `history.replaceState` (precedente: `client/js/app/screens-sync.js:17` e `client/js/app/screens-dm-draft.js:91`); passa o resultado pelo **mesmo `checkVoxchar`** e só então mostra. Não grava nada, nem em `localStorage`, nem no store.
- **Dado de outra pessoa é não confiável:** mesmas defesas da §4 (lista branca, faixas, nenhum `innerHTML`, `__proto__` e `constructor` ignorados). A tela diz que o conteúdo veio de um link e não foi conferido por ninguém; o app não afirma autoria nem integridade (o `.voxchar` não é assinado, §2).
- **Validade e revogação:** **não existem e não podem existir sem servidor.** O link é uma cópia do conteúdo no momento da geração: quem o tem continua a vê-lo para sempre e a ficha original não pode "tirar" o acesso. A tela de geração deve dizer isso. Revogar de verdade exigiria servidor ou id com consulta (fora do v1, D4).
- **Privacidade:** o link fica no histórico e na sincronização do navegador e com quem o receber; a tela de geração avisa isso. O link contém a ficha-base inteira (nome, itens, notas públicas). Antes de gerar, a tela mostra o que vai e pede confirmação (D5). Notas do Mestre nunca vão (§3).

### 9.4 Cópia-modelo **(proposta)**

- **O que leva:** a ficha-base do arquivo (a mesma lista branca da §2), exatamente como o import de hoje.
- **O que zera:** o estado de jogo (já ausente do arquivo): PV no máximo do padrão, espaços no máximo, sem condições, Exaustão 0, Dados de Vida inteiros, sem marcas de morte, `delta_ledger` vazio.
- **O que a distingue do import comum:** a única diferença é o ponto de partida: abrir o link de visualização e tocar em "Usar como modelo" cria a ficha nova com o mesmo código do import; não há marca de "modelo" gravada na ficha (D6).
- **Id, campanha e dono** vêm da instalação que cria, nunca do link (§3).
- **Origem de dados:** mesmos limites e `checkVoxchar` da importação.

### 9.5 Código e interface **(proposta)**

- Módulo `client/js/dungeon/voxchar-link.js` com `buildVoxcharLink(sheet)` e `parseVoxcharLink(hash)`, por `import()` dinâmico; nenhum byte em `SHELL_ASSETS`.
- Botão "Copiar link da ficha" no painel Editar, ao lado de Exportar/Importar (`screen-sheet-levelup.js`).
- Tela de visualização somente leitura renderizada pelos renderizadores existentes, que escapam o texto, com os botões "Usar como modelo" e "Baixar .voxchar".
- Funções com no máximo 30 LLOC e JSDoc em todo export.
- Não toca em Fairplay, `vtt-sync.js` nem no harness E2E.

### 9.6 Decisões abertas para o mantenedor

- **D1.** Aceita o link por fragmento comprimido como forma de compartilhar a ficha?
  - Decidido em 25/11/2026: sim (opção recomendada; autorização geral do mantenedor).
- **D2.** Rota e nome do link (proposta: `#/ficha/ver#voxchar=…`)?
  - Decidido em 25/11/2026: `#/ficha/ver#voxchar=…` (opção recomendada; autorização geral do mantenedor).
- **D3.** Limite de tamanho do link (proposta: ~8 KB) e o que fazer acima dele (proposta: só arquivo).
  - Decidido em 25/11/2026: ~8 KB para gerar e só arquivo acima disso (opção recomendada; autorização geral do mantenedor).
- **D4.** Revogação: aceitar que não existe no v1 (proposta) ou adiar o link até haver servidor?
  - Decidido em 25/11/2026: sem revogação no v1, com a tela avisando (opção recomendada; autorização geral do mantenedor).
- **D5.** Confirmação antes de gerar o link, mostrando o que vai.
  - Decidido em 25/11/2026: sim, confirmar antes de gerar (opção recomendada; autorização geral do mantenedor).
- **D6.** Cópia-modelo sem marca gravada na ficha (proposta) ou com marca de "modelo"?
  - Decidido em 25/11/2026: sem marca (opção recomendada; autorização geral do mantenedor).
- **D7.** O botão de gerar entra no mesmo PR da tela de visualização, ou atrás de flag?
  - Decidido em 25/11/2026: o botão entra no mesmo PR da tela de visualização (opção recomendada; autorização geral do mantenedor).

### 9.7 Testes previstos e o que falharia na base

| # | Teste | Falha na base? |
| :-- | :--- | :--- |
| 1 | `buildVoxcharLink` e `parseVoxcharLink` fazem ida e volta e o resultado passa no `checkVoxchar` | Sim: o módulo não existe |
| 2 | Link acima do limite não é gerado, com o motivo | Sim |
| 3 | Descompressão que passa de 256 KiB é interrompida e recusada (bomba de compressão) | Sim |
| 4 | Link malformado, truncado, base64 inválido ou de `format` maior é recusado com motivo e nada é gravado (espiar store e `localStorage`) | Sim |
| 5 | Conteúdo hostil (`__proto__`, `constructor`, número fora da faixa, texto com marcação) é recusado ou escapado, igual à §4 | Parcial: `checkVoxchar` já cobre o conteúdo; falha pelo caminho do link |
| 6 | A visualização não grava nada ao abrir | Sim |
| 7 | "Usar como modelo" cria ficha com id novo, campanha da instalação e estado de jogo no padrão | Sim: depende do link |
| 8 | O link gerado não contém `notes_gm`, `owner_pubkey_p256`, `campaign_id`, `character_id` nem retrato | Sim |
| 9 | Entrada acima de ~12 KB de base64 é recusada antes de decodificar | Sim |
| 10 | Sem `CompressionStream`/`DecompressionStream`, cai para o arquivo com o motivo e não gera link | Sim |
| 11 | Abrir o link não dispara fetch nem XHR (espiar a rede) e a URL é trocada por `#/ficha/ver` | Sim |
| 12 | O módulo do link não está em `SHELL_ASSETS` e só carrega ao gerar ou abrir link | Parcial: a parte "fora de `SHELL_ASSETS`" passa na base; "só carrega ao gerar ou abrir" falha |

## 10. Emenda (rascunho): `pools_base` no `.voxchar` (SUB-18)

> **Status desta emenda:** proposta, para decisão do mantenedor (§10.8). Só docs: nenhum código muda até as decisões. O que não está no código vai marcado **(proposta)**. Esta emenda **substitui, só para `hp_max` e `<id>_max`,** a exclusão de `pools_base` da §3 e do teste 2 da §8.

### 10.1 Problema

Hoje o `.voxchar` não leva `pools_base` (§3). `importVoxchar` cria a ficha sem PV máximo nem reservas, e `projectReserves` (`client/js/dungeon/sheet-reserves.js`) só mostra o recurso com máximo maior que zero. Resultado: um personagem de Tormenta20 ou GURPS exportado chega **sem PM/PF/PV**; o jogador tem de redigitar cada máximo. O máximo é parte da ficha-base (muda no nível, não a cada rolagem); o atual é estado de jogo.

### 10.2 O que já existe

- `pools_base.hp_max` e `pools_base.<id>_max`, lidos por `projectReserves`, `reserveMax` e `reserveIds` (`sheet-reserves.js`); `RESERVE_CAP = 9999` (mesmo teto de `qty` do `.voxchar`, `VOXCHAR_LIMITS.qty`); máximo ausente, negativo ou inválido vale 0, e **ficha antiga sem o campo continua válida** (a reserva não existe).
- O atual é derivado: máximo mais a soma do `delta_ledger`, entre 0 e o máximo. Sem ledger, atual = máximo.
- `VOXCHAR_FORMAT = 1`; `checkVoxchar` recusa `format` maior com "Atualize o Vox" (`voxchar-check.js:37`). Campos fora da lista branca são **descartados**, não recusados (§4).
- `pools_base` tem outras chaves na ficha de demonstração (`gold_initial`, `spell_slots_max`, `dungeon-state.js:121`): **não** entram.

### 10.3 Formato **(proposta)**

Campo opcional `sheet.pools_base`, objeto plano só com:

```json
"pools_base": { "hp_max": 24, "mp_max": 12 }
```

- **Chaves aceitas:** `hp_max` (se o pacote declarado tem recurso `hp`) e `<id>_max` para cada `id` de `reserveIds(pack)` (recursos `pool` que não são PV). Qualquer outra chave é **descartada** (lista branca), inclusive `gold_initial`, `spell_slots_max`, `hp_current`, `*_current`, `__proto__`, `constructor`.
- **Valores:** inteiro de 0 a 9999 (`RESERVE_CAP`); mesmas regras da ficha (`reserveMax`). Fora da faixa, não inteiro ou não numérico: **recusa com o campo e o motivo** (igual a `qty`, §4), não trunca em silêncio. 0 é aceito e equivale a "sem o recurso".
- **Só ids do pacote declarado:** `mp_max` num arquivo de `dnd5e-2024` (que não declara `mp`) é descartado, não recusado (o arquivo continua válido). Pacote desconhecido já recusa o arquivo inteiro (§4).
- **Limites:** o campo tem no máximo `1 + nº de reservas` chaves e conta nos limites existentes (`maxNodes`, 256 KiB). Nenhum limite novo.

### 10.4 Versão e compatibilidade **(proposta)**

- **`format` continua 1 (D1).** O campo é opcional e aditivo; não muda o significado de nada existente.
- **Arquivo antigo (sem `pools_base`) em leitor novo:** continua válido; a ficha importada nasce sem máximos, como hoje.
- **Arquivo novo em leitor antigo (format 1 sem a emenda):** o leitor antigo **descarta** `pools_base` (campo fora da lista branca, §4) e importa o resto: o personagem chega sem PV/reservas, que é o comportamento de hoje. Não há erro nem alteração do arquivo em disco. Por isso não precisa subir `format` (subir faria leitores antigos recusarem o arquivo inteiro, pior).
- **Risco aceito:** o leitor antigo não avisa que descartou o campo. Mitigação **(proposta, D3)**: o leitor novo, ao importar de um sistema que declara reservas um arquivo sem `pools_base`, avisa "sem máximos no arquivo; defina PV/reservas na ficha".
- `system.version` segue como hoje (maior que a do pacote: recusa).
- Nota: a linha `SUB-17` do ROADMAP diz ".voxchar sem mudança de formato"; vale, porque o `format` não muda. O campo novo é desta emenda, não do `SUB-17`.

### 10.5 O que NÃO vai

- **Atual** (`hp_current`, `<id>_current`) e **`delta_ledger`**: estado de jogo (§3). O atual da ficha importada = máximo.
- `gold_initial` e `spell_slots_max`: espaços de magia e ouro continuam fora (D2); reavaliar em emenda própria.
- Condições, Exaustão, Dados de Vida gastos, marcas de morte, `spatial_state`.
- Máximos de outro sistema (descartados, §10.3) e qualquer chave não listada.

### 10.6 Exportar, importar, link e cópia-modelo **(proposta)**

- **Exportar:** `portableSheet` inclui `pools_base` só com as chaves da lista do pacote da ficha, com valores normalizados por `reserveMax`; máximo 0 ou ausente **não** é gravado.
- **Importar:** `checkVoxchar` valida o campo (§10.3) e `buildImportedSheet` grava `pools_base` na ficha nova; `ensureSheetMeta` e `migrateLegacySheet` seguem depois. O `delta_ledger` nasce vazio.
- **Link só leitura (§9):** o mesmo JSON, então o link passa a carregar os máximos; a visualização (somente leitura) mostra PV e reservas **no máximo**, sem gravar nada. Sem mudança de formato do link; o limite de ~8 KB (D3 da §9) praticamente não muda.
- **Cópia-modelo (§9.4):** leva os máximos (são ficha-base) e zera o estado: atual = máximo, `delta_ledger` vazio. Sem marca de "modelo" (D6 da §9).
- **Privacidade:** máximos são dado de ficha pública; nenhum campo de Mestre ou de identidade entra.

### 10.7 Testes de aceite **(proposta)**

| # | Teste | Falha na base? |
| :-- | :--- | :--- |
| 1 | Round-trip: exportar ficha T20 com `hp_max` e `mp_max` e importar devolve os mesmos máximos, id novo, atual = máximo, `delta_ledger` vazio | Sim |
| 2 | Arquivo antigo (sem `pools_base`) importa como hoje, sem erro | Não (regressão) |
| 3 | O arquivo exportado não contém `*_current`, `delta_ledger`, `gold_initial`, `spell_slots_max` nem as demais exclusões da §3 (o teste 2 da §8 passa a excluir só essas) | Parcial |
| 4 | Valor fora de 0–9999, fracionário, negativo, texto ou `NaN` é recusado com campo e motivo; 9999 e 0 são aceitos; 10000 é recusado | Sim |
| 5 | `mp_max` em arquivo de pacote sem `mp` é descartado e o resto importa; chave desconhecida e `__proto__`/`constructor` são descartadas sem efeito | Sim |
| 6 | Leitor format 1 sem a emenda (simulado com o `checkVoxchar` da base) importa arquivo novo ignorando `pools_base`, sem recusar | Não (documenta a compatibilidade) |
| 7 | `format: 2` continua recusado com "Atualize o Vox" | Não (regressão) |
| 8 | Link ida e volta leva os máximos; a visualização não grava nada | Sim |
| 9 | Cópia-modelo: máximos presentes, atual = máximo, ledger vazio | Sim |
| 10 | Aviso de "sem máximos no arquivo" ao importar de sistema com reservas sem `pools_base` | Sim (se D3 = sim) |

Funções novas com no máximo 30 LLOC e JSDoc em todo export; não toca em Fairplay, `vtt-sync.js` nem na identidade.

### 10.8 Decisões abertas para o mantenedor

- **D1.** Manter `format: 1` (campo opcional, descartado por leitor antigo) ou subir para `format: 2`? **Recomendada: manter 1.** Subir faria leitores antigos recusarem o arquivo inteiro, sem ganho: o campo é aditivo.
- **D2.** Levar só `hp_max` e `<id>_max` ou também `gold_initial` e `spell_slots_max`? **Recomendada: só os máximos de PV e reservas;** ouro e espaços em emenda própria.
- **D3.** Avisar na importação quando o arquivo não traz máximos de um sistema com reservas? **Recomendada: sim** (texto curto, sem bloquear).
- **D4.** Valor inválido recusa o arquivo com campo e motivo ou descarta só o campo? **Recomendada: recusar** (igual a `qty`); descartar deixaria a ficha sem PV em silêncio.
- **D5.** Máximo 0 no arquivo: aceitar e tratar como "sem o recurso" ou recusar? **Recomendada: aceitar.**
