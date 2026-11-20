# Mesa Soberana — auditoria UI/UX (novembro 2026)

> **Status:** canônico (produto) · **SHA auditado:** `b6095f426807459fc353021986b4e66da8cb4d3d` (branch local `docs/doc-04-profile-community`; alinhar com `main` `eee34e7` pós-merge dos PRs #340–#345)  
> **Relacionados:** [mesa-ui-brainstorm-v0.md](./mesa-ui-brainstorm-v0.md) · [mesa-referenciais-vtt-v0.md](./mesa-referenciais-vtt-v0.md) · ADR-033  
> **Escopo:** rotas `#/dungeon/*`, join P2P mesma origem, drawer Handouts, prefs `viewerRole`, honestidade demo.

---

## 1. Sumário executivo

1. **E5 jogador (Z0–Z3)** está implementado e coberto por smoke + E2E 07/10: chrome sem aba Mestre, mapa herói, drawer Crônica/Dados/**Handouts** (`screen-table-layout.js`, #340).
2. **Default GM** (`loadDungeonPrefs` → `viewerRole: "gm"`) obriga toggle ou E2E de alternância — risco de onboarding jogador (P1, UX-002).
3. **Convite P2P** funciona em laboratório (codec + `attachVttPlayerJoin` + `BroadcastChannel`); UX de cópia ainda é `<pre>` na tela Mestre (P2, UX-004). Mensagem de falha BC foi reforçada no controller (UX-014).
4. **Ruído demo** (grade 5×5, W-DRF, vignette) coexiste com VTT 2D real na Mesa GM/jogador — carga cognitiva acima do alvo mesa hospedada A-speed para jogadores (P2, UX-003).
5. **SLM / IA local / Maritaca no device do jogador:** fora do produto (ADR-033); testes permanecem **N/A** com asserts negativos (`ai-social-dungeon.test.js`).

---

## 2. Mapa de rotas e modos

| Rota / hash | `route-parse` | Tela (`screen`) | Módulo render | Modo (`resolveSessionMode`) | Zonas |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `#/dungeon` | `acampamento` | acampamento | `screen-camp.js` | `campaign` | Z0, Z1, Z5 |
| `#/dungeon/mesa/:id` | `mesa` | mesa | `screen-table.js` + layout/tactics | `gm_session` \| `player_session` | Z0–Z3 (+ Z2 tático GM) |
| `#/dungeon/ficha/:id` | `ficha` | ficha | `screen-sheet.js` | `sheet` | Z0, Z1, Z5 |
| `#/dungeon/mestre/:id` | `mestre` | mestre | `screen-dm.js` | `gm_screen` | Z0, Z1, Z4 |
| `#/dungeon/entrar/:id?gm=&k=` | `mesa` + `joinP2p` | mesa | join em `wireDungeonView` | força `player_session` | Z0–Z3 |
| `#/labs/dungeon` | labs | (igual dungeon) | `ai-social-dungeon-lab.js` | — | — |

**Variantes chrome:** `dungeon-ui-contract.js` — `visibleChromeTabs` oculta `mestre` quando `!isGm`; `chromeVariantForMode` → `is-session-player` \| `is-session-gm`.

---

## 3. Matriz de conformidade por zona (Z0–Z5)

| Zona | Spec (brainstorm §3) | Implementado | Gap | Sev. |
| :--- | :--- | :--- | :--- | :--- |
| **Z0** segregação feed cívico | Faixa saída + badge demo | `dungeon-chrome.js` strip + badge ADR-033 | — | — |
| **Z1** topbar / abas | Abas filtradas GM/jogador | `buildDungeonTabs` + `visibleChromeTabs` | Jogador GM oculto OK; default GM confunde novatos | P1 |
| **Z2** mapa herói | Canvas ~60vh, pan/zoom | `#dungeon-vtt-canvas`, `dungeon-layout.css` | Mini-grade 5×5 demo no drawer GM | P2 |
| **Z3** crônica + dados + handouts | Drawer 3 segmentos (jogador) | `renderZ3SessionBlock` player | Desktop 960px: 3º `<details>` validado manual código; E2E 14 cobre conteúdo | P2 |
| **Z4** escudo mestre | Convite, demo IA honesta | `screen-dm.js` narrador fixo, `generate-invite` | Convite só em `<pre>` | P2 |
| **Z5** acampamento | Campanha, notas, import | `screen-camp.js` + `renderNotesPanel` | Densidade W-DRF/guardiões vs “entrar na mesa” | P2 |

---

## 4. Jornadas avaliadas (J1–J7)

Critério: **OK** = comportamento confirmado (E2E ou code review + teste unitário); **FAIL** = violação spec; **N/A** = fora escopo.

### J1 — Jogador first-time (mesa hospedada A-speed)

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| Onboarding → Mesa | OK | E2E 07 |
| Toggle visão jogador | OK | `_set_viewer_player`, prefs `viewerRole` em `dungeon-persistence.js` |
| Sem aba Mestre / sem token form | OK | E2E 07, 10 |
| Drawer Handouts | OK | E2E 14, smoke `ttrpg-screens-smoke.test.js` |
| Rolagem + crônica | OK | E2E 08 (GM path; jogador equiparado em 07 estrutura) |

### J2 — Mestre tático

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| Toolbar, zoom, fórmulas | OK | E2E 08, `vtt-tactics-*` |
| Convite P2P | OK | E2E 12–13 |
| Copy demo não “hosted” | OK | `screen-dm.js` + badge chrome |

### J3 — Convite P2P (2 abas)

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| GM gera convite | OK | E2E 12–13 |
| Player entra, visão filtrada | OK | E2E 13 (`is-session-player`, sem `add-token-form`) |
| Erro BC legível | OK | E2E 15, `hydrateP2pJoin` → `rollError` |

### J4 — Acampamento

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| Criar campanha, calendário | OK | E2E 09 |
| Notas GM vs shared | OK parcial | Import `.md`; painel GM em `renderNotesPanel` |
| Carga cognitiva demo | FAIL leve | UX-003 (muitos painéis demo em `screen-camp.js`) |

### J5 — Grimório

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| Ficha, level-up wizard | OK | E2E 11 |
| Preset `tormenta20` na UI | N/A | só API `vtt-levelup.js` — sem seletor na UI |

### J6 — Responsivo

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| 390×844 dock sem Mestre | OK | E2E 10 |
| 1280+ grid Z3 | OK (código) | `dungeon-layout.css` `@media (min-width: 960px)` |

### J7 — A11y (amostragem)

| Passo | Resultado | Evidência |
| :--- | :--- | :--- |
| `aria-label` nav/canvas/crônica | OK | smoke layout ids |
| `:focus-visible` | OK (código) | `agora.css` ~4384 |
| Contraste badge demo | N/A manual | inspeção visual pendente |

---

## 5. Achados detalhados

| ID | Título | Evidência | Sev. |
| :--- | :--- | :--- | :--- |
| UX-001 | Handouts `public` vs `shared` corrigido (#340) | `screen-notes.js` L26–27 | — (fechado) |
| UX-002 | Default `viewerRole: gm` sem onboarding papel | `dungeon-persistence.js` L442; `dungeon-state.js` | P1 |
| UX-003 | Demo 5×5 + VTT no mesmo ecrã | `screen-table-layout.js` L134–138 | P2 |
| UX-004 | Convite em `<pre>` pouco copiável | `screen-dm.js` L105–119 | P2 |
| UX-005 | `campaignNotice` join não visível na mesa até sync | join só altera notice; mesa mostra `mapNotice` GM | P2 |
| UX-006 | Grid desktop 3 drawers — layout não E2E pixel | CSS grid; E2E 14 abre Handouts | P3 |
| UX-007 | E2E join/handouts ausentes (pré-lote) | lacuna UX-TEST | — (fechado test 12–15) |
| UX-008 | Tormenta20 não exposto na UI | `vtt-levelup.js` apenas | P3 |
| UX-009 | Segregação `#/dungeon` fora shell cívico — foco h1 | revisão manual parcial | P3 |
| UX-010 | ADR-033: narrador honesto | `screen-dm.js` L14–21, E2E `test_vox_e2e` | — (OK) |
| UX-011 | Join invalid → rollError | `dungeon-controller-p2p-join.test.js` | — (OK) |
| UX-012 | Prefs viewerRole persistidas | `dungeon-controller-e4.test.js` | — (OK) |
| UX-013 | Player join não aplica prefs GM | `wireDungeonView` `joinMode === p2p_player` | — (OK) |
| UX-014 | BC indisponível → mensagem | `dungeon-controller.js` `joinFailureRollMessage` | — (OK) |

---

## 6. Backlog correção (UX)

| Prioridade | Itens |
| :--- | :--- |
| **P0** | — (nenhum vazamento GM→jogador confirmado; join utilizável com BC) |
| **P1** | — (UX-002 entregue **#356**: default jogador na mesa sem prefs) |
| **P2** | — (UX-003/004/005 entregues **#356**) |
| **P3** | UX-008 tormenta20 seletor; UX-009 foco rota |

**Ondas opcionais pós-aprovação:** UX-A (E2E join+handouts — **entregue neste lote**), UX-B layout Handouts 960px, UX-C convite UX, UX-D foco civil/dungeon.

---

## 7. Apêndice — cobertura de testes vs lacunas UX

| Suíte | Comando | Status (pós-implementação) | Notas |
| :--- | :--- | :--- | :--- |
| `npm run validate` | raiz `vox/` | Ver §8 após execução | lint + docs + unit |
| Mesa E2E 07–11 | `python -m unittest e2e.test_mesa_ttrpg_e2e -v` | Baseline E5 | |
| Mesa E2E 12–15 | idem | **Novos** join, handout, BC | fecha UX-TEST |
| `dungeon-controller-p2p-join.test.js` | `npm test` | Integração `joinP2p` | test-wave-b |
| SLM / IA device | — | **N/A** | ADR-033 |
| Maritaca HTTP E2E | — | **N/A** | router unit only |

**Lacuna histórica (pré-11/2026):** E2E não exercitava `#/dungeon/entrar`, Handouts com nota `shared`, nem convite na UI Mestre — corrigido nos testes 12–15.

---

## 8. Matriz de testes TTRPG (feature × camada)

Legenda: **C** coberto · **P** planejado neste lote · **N/A** não produto.

| Feature | Comportamento assertado | Unit/smoke | E2E | Status |
| :--- | :--- | :--- | :--- | :--- |
| E1 fórmulas | `2d20kh1`, persistência | C | C (08) | C |
| E1 backup/import | `.voxrpg.zip` | C | P (UI import) | C unit / P E2E camp |
| E2 canvas/tokens | zoom, layer GM oculto player | C | C (08) | C |
| E2 convite codec | build/parse simétrico | C | C (12) | C |
| E2/E5 join | BC 2 contextos, visão player | C | C (13) | C |
| E3 tático | iniciativa, fog | C | P parcial | C unit |
| E4 calendário/inventário/level-up | reducer + botões | C | C (09, 11) | C |
| E4 tormenta20 UI | seletor sistema | N/A UI | N/A | N/A |
| E5 chrome jogador | sem Mestre, Z3 | C | C (07, 10) | C |
| E5 handouts | `shared` no drawer | C | C (14) | C |
| E5 prefs `viewerRole` | localStorage | C | implícito 07 | C |
| Demo W-DRF | não quebra nav | C | C (`test_vox_e2e`) | C |
| Join BC erro | mensagem legível | C | C (15) | C |
| Narrador / SLM local | sem rede, sem “IA on” | C negativo | N/A | N/A |
| Maritaca cloud | router sem HTTP E2E | C | N/A | N/A |

### Inventário `data-dungeon` (visibilidade resumida)

| Ação | Superfície típica | GM | Jogador |
| :--- | :--- | :--- | :--- |
| `toggle-viewer-role` | Mesa | sim | sim |
| `generate-invite` | Mestre | sim | oculto (sem rota) |
| `add-token-form` / tático | Mesa GM | sim | não (E2E 07/13) |
| `roll-*` / crônica | Z3 | sim | sim |
| `create-campaign-form` | Acampamento | sim | sim |
| `import-file` | Acampamento | sim | sim |
| Demo (`failover`, `unlock-vault`, …) | Várias | sim | parcial |

### Evidência automatizada (2026-11-20, working tree deste lote)

| Comando | Saída | Classificação |
| :--- | :--- | :--- |
| `npm run validate` | exit **0** · Node **2113** tests, **2108** pass, **5** skip, **0** fail · Python relay **320** OK (1 skipped) | **PASS** |
| `python -m unittest e2e.test_mesa_ttrpg_e2e -v` | **9** tests OK (07–15), ~23s | **PASS** |

**SHA `develop` pós-onda (20/11):** `30e823d` — merges **#355** (audit+E2E), **#356** (UX P1–P2), **#354** (DOC-04 feed/composer). **P1/P2 UX-002…006** implementados; **P3** (tormenta20 UI, foco h1) em fila.

---

## Referências de arquivo

- Contrato zonas: `client/js/dungeon/dungeon-ui-contract.js`
- Join: `client/js/dungeon/dungeon-vtt-join.js`, `dungeon-controller.js` (`hydrateP2pJoin`)
- Handouts: `client/js/dungeon/screen-notes.js`, `screen-table-layout.js`
- E2E: `e2e/test_mesa_ttrpg_e2e.py` (07–15)