# HUD de jogo (v0)

> **Status:** aceita (v0) (decisões D1–D10 tomadas em 25/11/2026; código do `SUB-06` em partes: 1, 2a e 2b em PR)
> **Relacionados:** [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) (§7, brainstorm) · [subversus-vtt-v0.md](./subversus-vtt-v0.md)

Fecha o desenho do HUD de jogo da mesa (`SUB-06`). A §7 do brainstorm descreve a ideia; esta spec define de onde vem cada dado, o que o jogador vê dos outros e como testar. A `SUB-D1` já decidiu: o HUD vem antes do T20.

## 1. O que já existe (#525)

- `client/js/dungeon/screen-map-hud.js:25` — `renderMapHud(state, scene)` desenha `<nav class="dungeon-hud dungeon-chips-row" aria-label="Atalhos rápidos" data-dungeon-zone="mapHud">`; `renderShortcut` está em `:11`.
- `client/js/dungeon/sheet-view-model.js:93-102` — `buildHudShortcuts`: fixos `roll-d20`, `move` (só com `ownTokenId`) e `sheet` (link `#/dungeon/ficha/<char_id>`); ações clicáveis da ficha ocupam a vaga restante (`HUD_MAX_SHORTCUTS` = 6).
- `client/js/dungeon/screen-table.js:9,155` — o HUD fica logo abaixo do canvas, dentro de `mapHero`.
- `tests/subversus-hud-rapido.test.js` — cobre os 6 atalhos.
- Não existe hoje: retrato, condições no HUD, retratos do grupo, indicador de magia, cinto, favoritos, painéis em meia tela, linha móvel.

## 2. Elementos e origem dos dados

| Elemento | Origem do dado | Comportamento |
| :-- | :-- | :-- |
| Retrato + nome + condições | Token próprio (`tokenId`, `initials`, `color`, `name`) e `system_choices.conditions` da ficha (lista do pacote, `normalizeTokenConditions` no token) | Iniciais sobre a cor do token (sem bitmap); até 4 condições como chips com texto; excedente vira "+N" |
| Retratos do grupo + PV | Tokens `layer === "player"` da cena (`projectSceneForPlayer`, `vtt-reducer.js:311`) | Linha compacta abaixo do retrato; PV conforme §4 |
| Indicador de magia | Recurso `spell-slots` do pacote; máximo em `pools_base.spell_slots_max` (`vtt-schema.js:217`) | Só aparece se o total de recursos de magia for > 0; rótulo vem do pacote (espaços de magia no D&D, PM no T20, PF no GURPS com magias) |
| Cinto 4×1 | `inventory_orset` (item com `id`, `label`, `qty`, `tags`, `vtt-inventory.js`) | 4 vagas de consumíveis (`tags` com `consumivel`); clique usa 1 (`SHEET_UPSERT`); vaga vazia mostra "vazio" |
| Barra de 6 favoritos | Novo campo `sheet_meta.favorites` (lista de até 6 ids de ação ou item) | Substitui os atalhos livres de `buildHudShortcuts`; `roll-d20`, `move`, `sheet` continuam fixos à esquerda |
| Painéis em meia tela | Ficha (C), Itens (I), Habilidades (S), Mapa (Tab), Crônica | Abrem sobre a metade do tabuleiro, sem modal; Esc fecha; o canvas continua visível. Atalhos C, I, S, M e R (Tab não é atalho: continua navegando o foco) |
| Linha móvel | Nome, PV atual/máximo e CA da ficha própria | "Lyra · PV 18/24 · CA 16", uma linha, sempre visível |

Não há hoje conceito de favoritos nem de cinto no modelo: ambos são campos novos em `sheet_meta` e entram no `.voxchar` só se a `voxchar-v0` os listar (fora do escopo desta spec).

## 3. Acessibilidade e celular

- HUD é `nav`/`region` com `aria-label` próprio; cada vaga é `button` com nome acessível (ex.: "Poção de cura, 2 restantes").
- PV muda → `aria-live="polite"` só para a ficha própria (sem anunciar o grupo todo).
- Cor nunca é o único sinal: condição e PV levam texto; contraste WCAG AA com tokens `--sa-*` (`client/css/agora.css`).
- Alvos de toque ≥ 44 px; respeita `prefers-reduced-motion` (sem animação de barra).
- Painéis: foco entra no painel ao abrir e volta ao botão que o abriu ao fechar; atalhos de teclado só quando o foco não está em campo de texto.
- Celular (≤ 390 px, `@media (max-width: 1023.98px)`): some o cinto e o grupo; ficam a linha "Nome · PV · CA" e a barra de favoritos com rolagem horizontal; painéis ocupam a tela inteira como folha.

## 4. O que o jogador vê dos outros

Critério de dono: uma ficha é **própria** quando um token ligado a ela (`token.sheetId`) tem `ownerRouteId` igual à identidade de quem lê. O resto é **alheia**.

- **Mestre:** vê tudo.
- **Ficha própria:** completa, exceto as notas do Mestre.
- **Ficha alheia (lista de permissão):** o jogador recebe só nome, CA e retrato (iniciais e cor), mais PV atual e máximo gravados no **token projetado**, e apenas quando o modo `hpVisible` permitir; com `status`, só o rótulo (`Ileso`, `Ferido`, `Crítico`, `Caído`). Todo o resto sai da projeção: inventário, favoritos e demais metadados, escolhas do sistema, recursos e histórico de recursos, atributos.
- **Grupo:** retratos só de tokens visíveis na cena; condições de outros são só as do token.
- **Cinto, favoritos e magia:** só da ficha própria.
- **Achado medido:** a projeção ainda entrega a jogadores dados de fichas alheias além do necessário; a D4 passa a filtrar por lista de permissão.

## 5. Testes previstos

- Unidade (`node:test`, sem DOM): construtor do modelo do HUD (retrato, condições com corte "+N", magia oculta com 0, cinto com 4 vagas, favoritos com teto 6, linha móvel).
- Projeção: teste por campo (cada campo fora da lista de permissão some da ficha alheia; ficha própria e visão do Mestre completas); jogador não recebe PV numérico de token `status`; remover o filtro falha o teste.
- Acessibilidade: nomes acessíveis, `aria-live` só na ficha própria.
- e2e Python/Playwright: abrir/fechar painel com Esc e devolver o foco; viewport 390 px mostra a linha móvel.
- Evidência de teste segue `docs/process/qualidade-e-evidencia.md` (comando, contagem, mutantes conferidos).

## 6. Decisões

Cada uma: **Decidido em 25/11/2026: opção recomendada (autorização geral do mantenedor).** Estado de todas: aceita (v0).

- **D1 — Favoritos: onde guardar.** (a) `sheet_meta.favorites` na ficha *(recomendada)*; (b) só no navegador. Fica na ficha para acompanhar o personagem.
- **D2 — Cinto: critério de consumível.** (a) tag `consumivel` no item *(recomendada)*; (b) lista fixa por sistema.
- **D3 — Indicador de magia: fonte do rótulo.** (a) pacote do sistema *(recomendada)*; (b) texto livre na ficha.
- **D4 — Fichas alheias.** (a) lista de permissão explícita (nome, CA, retrato, PV pelo token conforme `hpVisible`) e dono pelo token ligado, como na §4 *(recomendada)*; (b) enviar a ficha inteira e esconder só na tela.
- **D5 — Retrato.** (a) iniciais sobre a cor do token, sem bitmap *(recomendada)*; (b) imagem enviada.
- **D6 — Painéis.** (a) meia tela sem modal no desktop e folha no celular *(recomendada)*; (b) modais.
- **D7 — Atalhos do #525.** (a) manter `roll-d20`, `move`, `sheet` fixos e trocar o restante pelos favoritos *(recomendada)*; (b) remover.
- **D8 — Limite de condições visíveis.** (a) 4 chips e "+N" *(recomendada)*; (b) todas.
- **D9 — Ordem de entrega do código.** (a) modelo + projeção, depois HUD base (retrato, PV, linha móvel), depois cinto/favoritos, depois painéis *(recomendada)*; (b) tudo em um PR.
- **D10 — Carregamento.** (a) módulos novos por `import()`, nada em `SHELL_ASSETS`, sem tocar `sw.js` *(recomendada)*; (b) pré-cache.

## 7. Fora do escopo

Fairplay e `vtt-sync.js`; testes e2e de espera; T20 (`SUB-10`); arrastar e soltar no cinto (fica para depois do v0).
