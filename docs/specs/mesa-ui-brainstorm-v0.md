# Mesa Soberana — brainstorm de UI VTT (v0)

> **Status:** canônico (produto) · **Owner:** mantenedor · **Revisado:** 2026-11-20
> **Relacionados:** [mesa-referenciais-vtt-v0.md](./mesa-referenciais-vtt-v0.md) · [ai-social-dungeon-v0.md](./ai-social-dungeon-v0.md) · [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md) · `client/js/dungeon/dungeon-ui-contract.js`

Documento de **anatomia de interface** dos referenciais de mercado e do **modelo de zonas** da Mesa Soberana (E5.0 UI). Não substitui ADR-033 nem o roadmap de engenharia em `mesa-referenciais-vtt-v0.md` §5.

---

## 1. Objetivo e escopo

1. Decompor a lógica de UI de **Mesa C**, **Mesa hospedada A**, **Mesa hospedada B** e **Mesa hospedada D** em padrões reutilizáveis (hierarquia, navegação, GM vs jogador).
2. Consolidar o **layout alvo** da Mesa: mapa como herói (Mesa A), fluxo campanha (Mesa D), ferramentas de mestre em rota/gaveta (Mesa B), hábitos de chat e dado (Mesa C) **sem** clonar o layout tricoluna fixo.
3. Ligar implementação ao código existente: `dungeon-chrome.js`, `screen-table.js`, `dungeon-ui-contract.js`, `dungeon-layout.css` (lazy).

**Fora do escopo v0:** VTT 3D, áudio/mixer, marketplace, login Google, PDF como ficha principal.

---

## 2. Anatomia por referencial

### 2.1 Mesa C

| Zona típica | Função | Padrão de interação |
| :--- | :--- | :--- |
| Toolbar superior | Ferramentas de desenho, camadas, medidas, seleção | Estado global da página; muitos ícones sem onboarding |
| Coluna esquerda | Chat, log de rolagens, turnos | Scroll infinito; macro `/roll` e whisper |
| Centro | Mapa / página dinâmica | Tokens arrastáveis; grid opcional; páginas múltiplas por sala |
| Coluna direita | Character sheets, journal, compêndio | Abas por personagem; GM vê NPCs ocultos |
| Modais | Handouts, compêndio, config da sala | Sobrepõem mapa; densidade alta |

**Fluxo mental:** uma **URL de sala** concentra tudo; o jogador alterna entre mapa, chat e aba de ficha no mesmo chrome.

**Prós para copiar:** integração **narrativa + rolagem + atalhos de fórmula** na mesma sessão; log público de dados.

**Contras para evitar:** três colunas fixas em desktop estreito; dezenas de abas; journal como segundo app dentro do app; performance ruim em mobile.

**Para a Mesa:** manter **crônica + bandeja de dados** (Z3) como satélites colapsáveis, não como colunas permanentes de 50% da viewport. Grimório permanece **rota dedicada** (`#/dungeon/ficha`), não sidebar direita tipo Mesa C.

### 2.2 Mesa hospedada A

| Zona típica | Função | Padrão de interação |
| :--- | :--- | :--- |
| Canvas | Mapa 2D full bleed | Pan/zoom gesture-first; tokens e fog |
| Toolbar flutuante | POI, medida, luz, fog brush | Mínima; some quando não usada |
| Lista de participantes | Presença, pins, follow | Leve; sem ficha embutida |
| Scratchpad / scenes | Troca de cena | Poucos cliques |

**Fluxo mental:** “abrir sala → arrastar mapa → jogar”; ficha e regras **fora** do VTT (PDF).

**Prós:** **clareza perceptiva**; baixo lag; jogador não vê ferramenta de mestre.

**Contras:** fricção de ficha externa.

**Para a Mesa:** **Z2 mapa hero** (mín. ~60vh em sessão jogador); ocultar formulários GM na rota Mesa quando `viewerRole !== 'gm'`. **Não** regredir a PDF-only: ficha CRDT no Grimório é diferencial.

### 2.3 Mesa hospedada B

| Zona típica | Função | Padrão de interação |
| :--- | :--- | :--- |
| Dock esquerdo | Scenes, Actors, Items, Journal, playlists | Lista densa; GM heavy |
| Canvas central | Cena ativa | Camadas, iluminação, módulos |
| Sidebar direita | Combat tracker, chat, tabs configuráveis | Módulos injetam painéis |
| Application header | Mundo, usuários, config | Shell de “app desktop” |

**Fluxo mental:** GM opera o servidor; jogador recebe **projeção filtrada** da cena.

**Prós:** iniciativa, camadas, automação de ficha, fog/AoE alinhados ao mapa.

**Contras:** superfície enorme; F5 imperfeito; risco de **clone de jogador** na reconexão.

**Para a Mesa:** concentrar poder tático em **`#/dungeon/mestre`** + toolbar em `screen-table-tactics.js`; jogador só vê `projectStateForPlayer` / camada `player`. E5 P0 sync: um `routeId` ativo (ver referenciais §2.2).

### 2.4 Mesa hospedada D

| Zona típica | Função | Padrão de interação |
| :--- | :--- | :--- |
| Hub campanha | Calendário, fichas, mesas, wiki | Fluxo “all-in-one” PT |
| VTT 2D/3D | Mesa ativa | Alternância 2D/3D; fog; som |
| Tela do mestre | Escudo, handouts só GM | Segundo painel / modo |
| Quadro de pistas | Cortiça, handouts visuais | Investigação |
| Mobile dock | Navegação inferior | Ícones grandes |

**Fluxo mental:** campanha → mesa → pistas; menos abas que abrir em apps separados.

**Prós:** workflow **BR** integrado; investigação nativa; mobile-first em partes.

**Contras:** hosted; limites no free tier; 3D pesado.

**Para a Mesa:** **Z5 Acampamento** espelha hub (calendário, inventário, level-up E4); pins e `.canvas` Obsidian espelham pistas; **sem** SaaS obrigatório. Dock móvel já existe em `dungeon-mobile-dock`.

---

## 3. Modelo de zonas Mesa + wireframes

### 3.1 Tabela de zonas

| Zona | Função | Inspiração | Código atual |
| :---: | :--- | :--- | :--- |
| Z0 | Segregação Vox ↔ Dungeon | Mesa | `.dungeon-segregation-strip` |
| Z1 | Topbar, presença, nav | Mesa B lite | `dungeon-chrome.js` |
| Z2 | Mapa 2D hero | Mesa A | `#dungeon-vtt-canvas`, `.dungeon-map-hero` |
| Z3 | Crônica, ação, dados | Mesa C + Mesa D drawer | `.dungeon-z3-drawer`, `screen-table-layout.js` |
| Z4 | Rail mestre (tático, notas) | Mesa B + Mesa D GM | `screen-dm.js`, `screen-notes.js`, tactics |
| Z5 | Meta-campanha | Mesa D hub | `screen-camp.js` |

### 3.2 Wireframe — sessão jogador (`#/dungeon/mesa`)

```text
┌─ Z0 segregação ─────────────────────────────────────────────┐
├─ Z1: [Sair] Marca · Mesa · Grimório (Mestre oculto) ────────┤
│ ░░ faixa resumo PV (compacta) ░░                            │
│ ┌─ Z2 MAPA HERO (min-height ~60vh) ───────────────────────┐ │
│ │  canvas + zoom chips                                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌─ Z3 drawer ─────────────────────────────────────────────┐ │
│ │ [Crônica ▼]  [Dados ▼]  (details, não 2 colunas fixas) │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

### 3.3 Wireframe — mestre (`#/dungeon/mestre`)

```text
Z1 com aba Mestre · Z2 mapa + toolbar tática · Z4 painéis (iniciativa, notas, pins)
Sem coluna direita Mesa C: abas internas Tático | Tokens | Notas | Iniciativa
```

### 3.4 Wireframe — mobile

```text
Z2 fullscreenish · Z3 drawer acima do dock · dungeon-mobile-dock (4 rotas)
Mestre: mesma regra — rota separada, não expor no dock do jogador (chrome contract)
```

### 3.5 Modos de cromo (`dungeon-ui-contract.js`)

| Modo | Rota | Abas visíveis (jogador) | Abas (GM) |
| :--- | :--- | :--- | :--- |
| `campaign` | `#/dungeon` | Todas exceto ocultar nada | Todas |
| `player_session` | `#/dungeon/mesa/:id` | Acampamento, Mesa, Grimório | + Mestre |
| `gm_session` | `#/dungeon/mesa` (role gm) | idem + ferramentas mapa | + Mestre |
| `gm_screen` | `#/dungeon/mestre/:id` | — | Foco mestre |
| `sheet` | `#/dungeon/ficha/:id` | Grimório em destaque | Todas |

**Nota (demo):** `createDungeonSessionState()` inicia com `viewerRole: "gm"` para o laboratório mostrar ferramentas de mestre; o layout E5 `is-session-player` ativa ao alternar “Visão: Jogador” na Mesa ou em testes/E2E explícitos. Não é regressão — decisão de demo (ADR-033).

---

## 4. Matriz decisões UI

| Tema | Mesa C | Mesa A | Mesa B | Mesa D | Mesa v0 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| Mapa hero na sessão | Parcial | Sim | Sim | Sim | **Sim** (E5.0) |
| Chat/crônica integrada | Sim | Não | Sim | Sim | **Drawer Z3** |
| Ficha na sidebar | Sim | Não | Sim | Sim | **Rota Grimório** |
| GM screen separada | Parcial | Não | Sim | Sim | **Rota Mestre** |
| Três colunas fixas | Sim | Não | Sim | Parcial | **Não** |
| Hub campanha | Parcial | Não | Sim | Sim | **Acampamento Z5** |
| 3D / áudio / marketplace | Sim | Áudio SO | Módulos | Sim | **Não v1** |

---

## 5. Backlog E5.0 UI (implementação)

| ID | Item | Módulos | Critério |
| :---: | :--- | :--- | :--- |
| UI-01 | Contrato zonas/modos | `dungeon-ui-contract.js` | Testes unitários puros |
| UI-02 | Extrair layout Mesa | `screen-table-layout.js` | IDs `data-dungeon` preservados |
| UI-03 | Mesa orquestrador fino | `screen-table.js` | Mapa antes de Z3 |
| UI-04 | Cromo por modo | `dungeon-chrome.js` | Abas filtradas por `visibleChromeTabs` |
| UI-05 | CSS sessão hero + drawer | `dungeon-layout.css` + loader lazy | Sem editar `agora.css` neste lote |
| UI-06 | P0 roadmap | Ver `mesa-referenciais-vtt-v0.md` §5 | Sync P2P + modo jogador enxuto |

**Próximo PR sugerido:** `feature/mesa-ui-e5` no worktree `vox-wt-mesa-e4`, após fila E2–E4 conforme §5.1 do referenciais.

### 5.1 Matriz de testes TTRPG

Cobertura por **import direto** em `tests/*.test.js` (worktree `vox-wt-mesa-e4`, 2026-11-20). Sem import → **UNTESTED** (pode haver cobertura indireta).

| Módulo `client/js/dungeon/` | Arquivo de teste |
| :--- | :--- |
| `canvas-input.js` | `vtt-tactics-combat.test.js` |
| `canvas-renderer.js` | `vtt-tactics-combat.test.js` |
| `canvas-tactics-layers.js` | `canvas-tactics-layers.test.js` |
| `dice-3d.js` | `dice-3d.test.js` |
| `dice-engine.js` | `vtt-dice-engine.test.js`, `vtt-e1-adversarial.test.js`, `vtt-reducer.test.js` |
| `dungeon-chrome.js` | `ai-social-dungeon-coverage.test.js` |
| `dungeon-controller-e4.js` | `dungeon-controller-e4.test.js` |
| `dungeon-controller.js` | `ai-social-dungeon-coverage.test.js`, `ai-social-dungeon.test.js`, `dungeon-revisao.test.js`, `ttrpg-screens-smoke.test.js`, `vtt-e1-adversarial.test.js`, `vtt-tactics-combat.test.js`, `vtt-ui-e1.test.js` |
| `dungeon-layout-style.js` | `dungeon-layout-style.test.js` |
| `dungeon-persistence.js` | `vtt-e1-adversarial.test.js`, `vtt-store.test.js` |
| `dungeon-scene-actions.js` | `ttrpg-actions-smoke.test.js` |
| `dungeon-state.js` | `ai-social-dungeon-coverage.test.js`, `ai-social-dungeon.test.js`, `dungeon-revisao.test.js`, `ttrpg-screens-smoke.test.js`, `vtt-e1-adversarial.test.js`, `vtt-tactics-combat.test.js`, `vtt-ui-e1.test.js` |
| `dungeon-tactics-actions.js` | `ttrpg-actions-smoke.test.js` |
| `dungeon-ui-contract.js` | `dungeon-ui-contract.test.js` |
| `obsidian-bridge.js` | `vtt-canvas.test.js`, `vtt-e1-adversarial.test.js`, `vtt-e4-adversarial.test.js`, `vtt-obsidian-bridge.test.js` |
| `rpg-illustrations.js` | `ai-social-dungeon-coverage.test.js` |
| `screen-camp.js` | `ai-social-dungeon-coverage.test.js`, `dungeon-revisao.test.js`, `ttrpg-screens-smoke.test.js` |
| `screen-dm.js` | `ai-social-dungeon-coverage.test.js`, `dungeon-revisao.test.js` |
| `screen-notes.js` | `ttrpg-screens-smoke.test.js` |
| `screen-sheet-levelup.js` | `ttrpg-screens-smoke.test.js` |
| `screen-sheet.js` | `ai-social-dungeon-coverage.test.js` |
| `screen-table-layout.js` | `ttrpg-screens-smoke.test.js` |
| `screen-table-tactics.js` | `ttrpg-table-tactics.test.js` |
| `screen-table.js` | `ai-social-dungeon-coverage.test.js`, `ttrpg-screens-smoke.test.js` |
| `vtt-calendar.js` | `vtt-calendar.test.js` |
| `vtt-campaign-reducer.js` | `vtt-campaign-reducer.test.js` |
| `vtt-geometry.js` | `vtt-geometry.test.js` |
| `vtt-inventory.js` | `vtt-campaign-reducer.test.js`, `vtt-inventory.test.js` |
| `vtt-levelup.js` | `vtt-e4-adversarial.test.js`, `vtt-levelup.test.js` |
| `vtt-note-pins.js` | `vtt-note-pins.test.js` |
| `vtt-portable.js` | `vtt-e1-adversarial.test.js`, `vtt-portable.test.js` |
| `vtt-reducer.js` | `vtt-e1-adversarial.test.js`, `vtt-e4-adversarial.test.js`, `vtt-inventory.test.js`, `vtt-reducer.test.js`, `vtt-tactics-combat.test.js` |
| `vtt-scene-schema.js` | `vtt-tactics-combat.test.js` |
| `vtt-schema.js` | `vtt-campaign-reducer.test.js`, `vtt-e1-adversarial.test.js`, `vtt-e4-adversarial.test.js`, `vtt-inventory.test.js`, `vtt-note-pins.test.js`, `vtt-obsidian-bridge.test.js`, `vtt-portable.test.js`, `vtt-reducer.test.js`, `vtt-store.test.js`, `vtt-sync.test.js`, `vtt-tactics-combat.test.js` |
| `vtt-store.js` | `vtt-e1-adversarial.test.js`, `vtt-store.test.js`, `vtt-sync.test.js`, `vtt-tactics-combat.test.js`, `vtt-ui-e1.test.js` |
| `vtt-sync-codec.js` | `vtt-sync.test.js` |
| `vtt-sync.js` | `vtt-sync.test.js` |
| `vtt-tactics-geometry.js` | `vtt-tactics-geometry.test.js` |
| `vtt-tactics-reducer.js` | `vtt-tactics-reducer.test.js` |
| `vtt-tactics-schema.js` | `vtt-tactics-schema.test.js` |

**Lacunas diretas (0):** todos os módulos em `client/js/dungeon/` possuem import direto ou smoke dedicado (`dice-3d.test.js`).

### 5.2 E2E Playwright (UI real)

| Arquivo | Cenários |
| :--- | :--- |
| [`e2e/test_vox_e2e.py`](../../e2e/test_vox_e2e.py) | Demo honesta: acampamento → mesa (d20, grid, cofre) → ficha → mestre → sair |
| [`e2e/test_mesa_ttrpg_e2e.py`](../../e2e/test_mesa_ttrpg_e2e.py) | E5 jogador (chrome, Z3, CSS lazy), GM (zoom, fórmula, crônica), acampamento (rotas, calendário), mobile, grimório/level-up, convite (12), join 2 contextos (13), handouts (14), BC indisponível (15) |

Comando: `npm run test:e2e` · só Mesa: `python -m unittest discover -s e2e -p test_mesa_ttrpg_e2e.py -v`

Matriz feature×camada e lacunas UX: [`mesa-ui-audit-2026-11.md`](./mesa-ui-audit-2026-11.md) §8.

---

## 6. Histórico

| Data | Nota |
| :--- | :--- |
| 2026-11-20 | v0: anatomia Mesa C/Mesa A/Mesa B/Mesa D, zonas, wireframes, backlog E5.0 UI. |
| 2026-11-20 | Auditoria UI/UX E5: [`mesa-ui-audit-2026-11.md`](./mesa-ui-audit-2026-11.md) (Z0–Z5, jornadas J1–J7, backlog P0–P3, E2E 12–15). |