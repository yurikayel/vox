# Stitch — Mesa Vox (guia designer)
> Consolidado 2026-11-20. Dossiê Owlbear: [OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md)

# Stitch — brief de assets para Mesa Vox TTRPG

> **Status:** pesquisa (brief de design) · **Data:** 2026-11-20 · **Uso:** anexar no Stitch ao redesenhar `#/dungeon/*`  
> **Relacionados:** [../stitch-mesa-vtt-references.md](../stitch-mesa-vtt-references.md) · [OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md) · [mesa-ui-brainstorm-v0.md](../../specs/mesa-ui-brainstorm-v0.md)

Copiar **padrão de interação e hierarquia**, não logotipos, cores de marca nem battle-map art. Tokens visuais Vox: [sovereign-agora.md](../sovereign-agora.md).

---

## 1. Objetivo no Stitch

Para cada uma das **12 zonas de produto** (`feature_id`), o designer precisa de referência visual que mostre **como o mercado resolve a mesma dor** na sessão ao vivo — sem marketplace, art packs ou UI de módulos third-party.

| `feature_id` | O que a Mesa Vox precisa decidir | Zona Mesa |
| :--- | :--- | :---: |
| `hub_campaign` | Entrar na campanha, salas, biblioteca de assets, onboarding jogador | Z5 |
| `session_map_gm` | Layout GM: mapa herói, sidebar, cena ativa, grid, multi-página/cena | Z2 |
| `session_map_player` | Projeção jogador: o que some (tools GM, fog brush, metadados) | Z2 |
| `toolbar_tactical` | Ferramentas flutuantes: medir, desenhar, snap grid, marcadores, atalhos | Z4 |
| `fog_visibility` | FoW, luz dinâmica, LoS, opacidade GM vs jogador | Z4 |
| `tokens_layers` | Tokens, camadas/z-order, link entidade, props, HUD no token | Z2 |
| `chat_roll_log` | Chat + log de rolagens na mesma coluna/satélite | Z3 |
| `dice_tray` | Bandeja ou superfície dedicada de dados (3D ou inline) | Z3 |
| `character_sheet` | Ficha em sessão ou rota Grimório — blocos, rolagem de atributos | Grimório |
| `initiative_combat` | Turn order / combat tracker / trackers HP | Z4 |
| `journal_handouts` | Journal, handouts, pins no mapa, revelar só GM | Z3 / Z5 |
| `mobile_or_dock` | Dock inferior, gestos, mesa em telefone | Z1 |

---

## 2. Pacote pronto (anexar no Stitch)

| Pacote | Conteúdo |
| :--- | :--- |
| **Prompts (este guia §9)** | **13 blocos** coláveis na ordem da jornada (`#/dungeon` → sair) |
| **`dungeon-ui-2026-11-20__*.png`** | Estado atual Vox `#/dungeon/*` (**24** capturas desktop + mobile) |
| **`vtt-references-full-2026-11-20__*.png`** | **58** refs mercado (YT + docs, flat) |
| **`vtt-references-v3-2026-11-20__*.png`** | **140** tiles v3 (doc/yt fatiados) |
| **[OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md)** | Guias Owlbear + **139** figuras em `owlbear-stitch-dossier/assets/` |

**Regenerar:** Vox → `python -m http.server 8080 --directory client` + `python e2e/capture_dungeon_stitch.py` (achatar para `dungeon-ui-<data>__*.png`). Mercado v3 → `python e2e/vtt_refs/run_v3.py --fresh`. Owlbear → `python e2e/owlbear_stitch_dossier.py`.

### Breakdown por plataforma (disco, prefixo `vtt-references-full-2026-11-20__`)

| Plataforma | PNG flat v2 |
| :--- | ---: |
| **Foundry** | 23 |
| **Owlbear** | 20 |
| **Roll20** | 12 |
| **Mini Kraken** | 5 |
| **Total v2** | **58** (+ **140** v3 + **24** Vox + dossiê Owlbear) |

---

## 3. Prioridade de plataforma (Mesa Vox)

Ordem sugerida ao **escrever prompts** e escolher **primária** por tela:

1. **Foundry + Mini Kraken (profundidade)** — dock GM, combat, journal, fichas integradas, mobile/dock; Foundry para camadas, luz e tokens vanilla (KB + Basics YT).
2. **Owlbear (leveza perceptiva)** — mapa full-bleed, toolbar mínima, fog gesture-first; anexar [OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md) (texto + figuras oficiais) para scene-as-container e Image Types (não clonar PDF-only).
3. **Roll20 (hábitos sociais)** — chat+log, layers Map/Token/Lighting, sidebar tabs, fichas laterais; Help Center para hex/grid e token markers quando precisar de still estático.

**Síntese produto (brainstorm v0):** mapa herói tipo Owlbear + fluxo campanha Kraken + poder tático em rota mestre tipo Foundry + crônica/dados tipo Roll20 **sem** tricoluna fixa.

---

## 4. Por ecrã Vox → assets (primário + alternates)

Paths relativos à pasta `stitch-captures/` — prefixo `vtt-references-full-2026-11-20__{plataforma}__{arquivo}.png` (ou equivalente v3 / dossiê).  
**Mínimo por écran no checklist (§7):** 1 primário + ≥1 alternativa quando existir no disco.

### Hub campanha (`#/dungeon` · sala · entrar)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `vtt-references-full-2026-11-20__minikraken__12-docs-getting-started.png` |
| **Alternates** | `vtt-references-full-2026-11-20__foundry__01-yt-world-setup.png`, `vtt-references-full-2026-11-20__foundry__19-docs-guide-gm.png`; `vtt-references-full-2026-11-20__owlbear__13-docs-getting-started.png`, `vtt-references-full-2026-11-20__owlbear__14-docs-rooms.png`, `vtt-references-full-2026-11-20__owlbear__19-docs-assets.png` |

### Mesa GM — mapa / cena (`#/dungeon/mesa` · GM)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/02-yt-scene-grid.png`, `foundry/14-docs-scenes.png` |
| **Alternates** | `owlbear/02-yt-sync-view.png`, `15-docs-scenes.png`, `16-docs-images.png`, `09-yt-outliner.png`, `22-docs-grid.png`; `minikraken/03-docs-scenes.png`; `roll20/02-yt-tabletop-layout.png`, `03-yt-tabletop-center.png`, `13-help-tabletop-overview.png`, `14-help-the-tabletop.png`, `41-help-sidebar.png` |

### Mesa jogador (`#/dungeon/mesa` · viewer)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/10-yt-player-view.png`, `foundry/22-docs-guide-player.png` |
| **Alternates** | `owlbear/03-yt-player-cast.png`; Roll20 **sem** shot dedicado — inferir por contraste com layout GM |

### Toolbar tática (`screen-table-tactics` · mestre)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/03-yt-measure-tools.png`, `foundry/21-docs-keybindings.png`, `foundry/23-docs-regions.png` |
| **Alternates** | `minikraken/05-docs-tabletop-tools.png`; `owlbear/06-yt-fog-toolbar.png`, `07-yt-map-toolbar.png`, `18-docs-drawing.png`, `22-docs-grid.png`; `roll20/09-yt-token-toolbar.png`, `15-help-sizing-maps.png`, `32-help-hex-measure.png`, `40-help-toolbar-overview.png` |

### Fog / visibilidade

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/05-yt-walls-los.png`, `06-yt-lights.png`, `15-docs-lighting.png` |
| **Alternates** | `owlbear/04-yt-fog.png`, `05-yt-dynamic-fog.png`, `17-docs-fog.png` (bônus `21-yt-weather.png` só FX); `minikraken/05-docs-tabletop-tools.png`, `12-docs-getting-started.png`; `roll20/11-yt-dynamic-lighting.png`, `17-help-dynamic-lighting.png`, `29–31-help-fog-*.png` |

### Tokens / camadas

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/04-yt-tokens.png`, `13-docs-tokens.png` |
| **Alternates** | `minikraken/04-docs-tokens.png`; `owlbear/08-yt-prefabs.png`, `16-docs-images.png`, `12-yt-assets.png`; `roll20/08-yt-tokens.png`, `16-help-layers.png`, `19–20-help-token-*.png`, `21-help-token-markers.png` |

### Chat / crônica

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `roll20/04-yt-chat-log.png` · `foundry/11-yt-chat.png`, `18-docs-chat.png` |
| **Alternates** | `minikraken/10-docs-chat-journal.png`; Owlbear **N/A** (sem chat core) |

### Dados / bandeja

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `roll20/10-yt-dice.png`, `owlbear/10-yt-dice.png`, `foundry/08-yt-dice.png` |
| **Alternates** | Mini Kraken **N/A** (roll via ficha/chat — `09-docs-character-sheets.png` como apoio) |

### Ficha / Grimório (`#/dungeon/ficha`)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `minikraken/09-docs-character-sheets.png` |
| **Alternates** | `roll20/06-yt-character-sheet.png`, `23-help-character-tips.png`, `24-help-dnd2024-sheet.png`; `foundry/09-yt-character-sheet.png`; Owlbear **N/A** |

### Iniciativa / combate

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `foundry/07-yt-combat.png`, `16-docs-combat.png` |
| **Alternates** | `minikraken/06-docs-gm-screen.png`; `owlbear/11-yt-trackers.png`; `roll20/12-yt-initiative.png` |

### Journal / handouts

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `minikraken/07-docs-handouts.png`, `10-docs-chat-journal.png` |
| **Alternates** | `foundry/12-yt-journal.png`, `17-docs-journal.png`; `roll20/05-yt-journal.png`, `07-yt-handouts.png`, `22-help-journal.png`, `18-help-map-pins.png`; Owlbear **N/A** (Note em `16-docs-images` não substitui journal) |

### Mobile / dock (Z1)

| Papel | Arquivos |
| :--- | :--- |
| **Primário** | `minikraken/02-docs-vtt-dock.png`, `08-docs-mobile.png`, `13-docs-apps.png` |
| **Alternates** | Roll20/Foundry/Owlbear **sem** shot core — desenhar a partir de contrato Vox + dock Kraken |

---

## 5. Excluídos (ruído — não anexar)

| Fonte | Motivo |
| :--- | :--- |
| **Google Images harvest** | **BLOCKED** (reCAPTCHA) / descontinuado |
| **Module marketplace** | Foundry Bazaar/packages, Roll20 marketplace, Owlbear extension stores, Kraken Marketplace |
| **Art packs / battle maps** | Thumbnails de mapas, token sprites Pinterest, packs Cze & Peku, grid overlays estéticos |
| **UI de módulos** | Ember, Monk's, Perfect Vision, quest-tracker QoL, battle systems Owlbear third-party |
| **Hosting / Forge confusão** | The Forge, Owlbear «forge» na busca, heroes `erpg.app/pt/` sem chrome |
| **Token makers third-party** | TokenForge, 2-Minute Tabletop — Owlbear usa Image Editor core |
| **Marketing / changelog** | Tweets de release, blog heroes, badges de loja, fan art kraken |

---

## 6. Gaps explícitos (design sem referência no pacote)

Projetar no Figma/Stitch **sem** esperar novo PNG:

| Gap | Direção Vox |
| :--- | :--- |
| **Roll20 / Foundry / Kraken — `session_map_player` ausente ou fraco** | Contraste explícito GM vs jogador no contrato `dungeon-ui-contract.js`; ocultar Z4 e GM chrome |
| **Roll20 / Owlbear / Foundry — `mobile_or_dock`** | Só Kraken cobre; validar thumb-zone e dock inferior soberano |
| **Owlbear — `character_sheet`, `journal_handouts`, `chat_roll_log`** | Ficha e journal na rota Grimório + crônica Vox; não imitar extensões Sheets |
| **Mini Kraken — `dice_tray`** | Bandeja soberana ou inline na Z3; rolagem na ficha como fallback |
| **Mini Kraken — PNGs em disco (8/13)** | Completar capture manifest antes de depender só de Kraken para handouts/ficha |
| **Roll20 — captura parcial Help (19 vs 29 no manifest)** | Usar índice para URLs; priorizar layers, fog, sidebar já presentes |
| **Quest tracker / objectives** | Sem vanilla Foundry — usar journal + combat tracker como metáfora de estado |
| **Identidade Vox** | Paleta/agora soberana; refs só para densidade e fluxo |

Matriz core×plataforma: [../stitch-mesa-vtt-references.md](../stitch-mesa-vtt-references.md) (§ Matriz feature × plataforma).

---

## 7. Checklist — designer Stitch

Por **écran/rota** listado na §4:

- [ ] **Hub** — ≥2 refs (`hub_campaign`); incluir Kraken dashboard  
- [ ] **Mesa GM** — ≥3 refs (`session_map_gm`); 1 Owlbear + 1 Foundry obrigatórios  
- [ ] **Mesa player** — ≥2 refs (`session_map_player`)  
- [ ] **Fog** — ≥3 refs (`fog_visibility`); par Foundry walls+lights  
- [ ] **Tokens** — ≥3 refs (`tokens_layers`); 1 doc estático (Help ou KB)  
- [ ] **Toolbar** — ≥2 refs (`toolbar_tactical`)  
- [ ] **Chat** — ≥2 refs (`chat_roll_log`)  
- [ ] **Dados** — ≥2 refs (`dice_tray`)  
- [ ] **Ficha** — ≥2 refs (`character_sheet`)  
- [ ] **Iniciativa** — ≥2 refs (`initiative_combat`)  
- [ ] **Journal** — ≥2 refs (`journal_handouts`); Kraken ou Roll20 primário  
- [ ] **Mobile/dock** — ≥2 refs (`mobile_or_dock`) ou wireframe com Kraken `02`+`08`  
- [ ] Anexou **dungeon-ui-2026-11-20__*.png** + refs §4 + [OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md)  
- [ ] Nenhum logo/marca terceira no mock final  
- [ ] Gaps §6 documentados no comentário do frame Stitch  

---

## 8. Nota legal

Screenshots de Roll20, Owlbear Rodeo, Foundry Gaming LLC e Mini Kraken — uso interno mood board; **não** publicar no bundle PWA.

---

**Handoff:** Testes **NOT RUN** (documento design-only).  
**Cópia espelho:** user store `STITCH-VOX-ASSET-BRIEF.md`.
## Pasta flat (nov/2026)

Todos os PNG e estes dois `.md` vivem em `docs/design/stitch-captures/`. Padrão: `{origem}__{resto}.png` — ex.: `dungeon-ui-2026-11-20__03-mesa-gm-vila-nova-desktop-1440x900-dark.png`, `vtt-references-full-2026-11-20__owlbear__17-docs-fog.png`.

No Stitch: anexar **prompts §9** (colar na ordem) + **Vox** (`dungeon-ui-2026-11-20__*.png`) + PNG de §4/Anexar de cada passo + dossiê Owlbear quando citado.

---

## 9. Prompts Stitch (ordem da jornada)

Colar **Prompt 0** primeiro; depois **1 → 12** na ordem. Cada passo traz **Anexar** (ficheiros no disco) e **Não desenhar**.

# Prompts por tela (Stitch)

### Prompt 0 — Moldura global (Z0 + Z1 + dock)

**Anexar:** `dungeon-ui-2026-11-20__01-acampamento-desktop-1440x900-dark.png` · [sovereign-agora.md](../sovereign-agora.md)

**Não desenhar:** logos Roll20/Foundry/Owlbear/Kraken; três colunas fixas estilo Roll20.

```
Redesenhar a moldura soberana do AI Social Dungeon (Vox), aplicável a todas as rotas #/dungeon/*.

Tokens Sovereign Agora (não usar #10b981 nem #facc15 genéricos):
- Fundo canvas #0c0e11 (--sa-surface-lowest); superfície #111316; painéis #1a1c1f e #1e2023
- Primária marina #78d6cf (botões; texto sobre primária #00201e); container #4baca5
- Secundária bronze #e7c26b (badges, relógio); terciária #69dba9 / #39b081
- Contorno hairline #3e4948 ou rgba(255,255,255,0.08) — sem cards pesados
- Títulos Domine; UI Work Sans

Z0: faixa superior com link «Sair da Mesa · Voltar ao Vox» (#/) e badge «DEMONSTRAÇÃO · ROTEIRO FIXO, SEM IA E SEM REDE (ISOLADO DO FEED CÍVICO)».
Z1: marca «VOX · AI SOCIAL DUNGEON», pílula de guardiões, nav desktop: Acampamento | A Mesa | Grimório | Mestre (Mestre só para GM).
Z1 mobile: dock inferior thumb-zone — jogador 3 rotas (Campanhas, A Mesa, Grimório); GM 4ª aba «Mestre» em bronze.
Viewport: desktop 1440×900; variante mobile 390×844 com dock fixo.
```

---

### Prompt 1 — Acampamento (`#/dungeon`)

`feature_id`: `hub_campaign`, `mobile_or_dock` · **Z5** · Papel: GM e jogador (hub local).

**Anexar:** `dungeon-ui-2026-11-20__01-acampamento-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__minikraken__12-docs-getting-started.png` · `vtt-references-full-2026-11-20__owlbear__13-docs-getting-started.png` · [OWLBEAR-STITCH-DOSSIER.md](./OWLBEAR-STITCH-DOSSIER.md) § Getting Started / Assets

**Não desenhar:** marketplace de módulos; hero art de battle map sem chrome.

```
Tela Acampamento — hub de campanhas locais antes da sessão ao vivo.

Layout Z5 denso mas hierárquico: hero «Suas Campanhas neste Aparelho», formulário «Criar Campanha», cartões salvos com «Jogar na Mesa →», «Abrir Grimório», calendário in-world (+1 Rodada, Descanso Curto/Longo), bloco backup «Exportar .voxrpg.zip» / «Importar .voxrpg.zip, .voxrpg.enc, .md ou .canvas», painel «Pistas e Lore».
Estados: vazio «Nenhuma campanha salva ainda…»; aviso de armazenamento; demo «Santuário da Guilda (exemplo)» separado visualmente dos dados reais.
Inspiração: hub Kraken + salas Owlbear (dossiê) sem clonar logotipos.
Manter moldura Prompt 0; desktop 1440 e mobile 390.
```

---

### Prompt 2 — Mesa do Mestre (`#/dungeon/mesa/:id`, visão GM)

`feature_id`: `session_map_gm`, `toolbar_tactical`, `tokens_layers` · **Z2** (+ formulários GM) · Papel: Mestre.

**Anexar:** `dungeon-ui-2026-11-20__03-mesa-gm-vila-nova-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__foundry__14-docs-scenes.png` · `vtt-references-full-2026-11-20__owlbear__15-docs-scenes.png` · dossiê § Scenes

**Não desenhar:** luz dinâmica / LoS avançada (não existe no produto); logos terceiros.

```
Mesa tática — visão Mestre, mapa herói full-bleed (Z2).

Canvas infinito com grelha (Quadrada/Hex), zoom − / Ajustar / 100% / +, eyebrow «Mapa 2D Interativo…». Toggle «Visão: Mestre»; ferramentas: Mover/Porta, Régua, Desenhar, Esfera, Cone, Cubo, Linha; «Adicionar Token», «Carregar imagem do mapa», roster com Ocultar GM / Revelar.
GM vê camada oculta de tokens (contorno tracejado). Z3 em duas colunas fixas (não drawer): Crônica + Bandeja de dados lado a lado.
Contraste jogador vs GM: toda barra de fog e upload só aqui.
Owlbear: mapa domina; Kraken/Foundry: densidade de painéis laterais — síntese Vox.
```

---

### Prompt 3 — Névoa e camadas (`#/dungeon/mesa`, ferramentas GM)

`feature_id`: `fog_visibility`, `toolbar_tactical` · **Z2/Z4** · Papel: Mestre.

**Anexar:** `vtt-references-full-2026-11-20__owlbear__17-docs-fog.png` · `vtt-references-full-2026-11-20__foundry__15-docs-lighting.png` · `owlbear-stitch-dossier/assets/fog/` (qualquer figura do dossiê) · dossiê § Fog

**Não desenhar:** pincel livre de fog; lighting engine 3D; preview estilo Foundry Dynamic Lighting.

```
Foco na barra de névoa e camadas na Mesa GM.

Controles reais do produto: «Névoa: ON/OFF», «Cobrir Névoa», «Cortar Névoa» (revelação por retângulo, não brush), «Limpar Desenhos», «Limpar AoE», pills «+ Andar» (z=0, z=-1).
GM enxerga névoa translúcida; jogador verá opaco (prompt 6).
Copiar gestalt Owlbear (modos vs ações na toolbar de fog) sem cores de marca.
Inset ou callout sobre canvas existente; tokens Sovereign Agora.
```

---

### Prompt 4 — Escudo do Mestre (`#/dungeon/mestre/:id`)

`feature_id`: `hub_campaign`, `journal_handouts` · **Z4** · Papel: GM only.

**Anexar:** `dungeon-ui-2026-11-20__05-escudo-mestre-vila-nova-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__foundry__19-docs-guide-gm.png`

**Não desenhar:** chat de IA ao vivo (demo = roteiro fixo).

```
Escudo do Mestre — painel segregado «fica só neste aparelho».

Banner «Escudo do Mestre», bloco P2P «Gerar Convite da Mesa (P2P)» + «Copiar link»; toggles «Papel atual: Mestre» vs «Prévia Jogador (Zero-Spoiler)»; notas secretas; pastas de notas; cofres Shamir; inspetor por papel (Juiz de Regras, Guardião de Lore, Voz NPC).
Estado UX: convite copiável (evitar <pre> cru).
Aba Mestre invisível para jogador no dock; dourado/bronze só para selo GM.
```

---

### Prompt 5 — Entrada por convite (`#/dungeon/entrar/...`)

`feature_id`: `session_map_player`, `hub_campaign` · **Z2** · Papel: Jogador convidado.

**Anexar:** `dungeon-ui-2026-11-20__04-mesa-jogador-vila-nova-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__owlbear__03-yt-player-cast.png` · dossiê § Casting / Permissions

**Não desenhar:** onboarding multi-step além do sync; logos Owlbear.

```
Primeiro frame do jogador que abre link P2P (#/dungeon/entrar/:id?gm=…#k=…).

Abre direto na Mesa (não Acampamento). Chip «Conectado P2P» ou «Próximo Turno» conforme sync.
Loading: «Sincronizando com a Mesa do Mestre (aba paralela na mesma origem)…»
Erros: «Link de convite inválido ou incompleto.»; «Convite P2P exige duas abas na mesma origem…»
Toggle «Visão: Jogador (P2P)»; sem upload de mapa, sem Névoa GM, sem aba Mestre.
```

---

### Prompt 6 — Mesa do Jogador (`#/dungeon/mesa/:id`, visão jogador)

`feature_id`: `session_map_player` · **Z2** · Papel: Jogador.

**Anexar:** `dungeon-ui-2026-11-20__04-mesa-jogador-vila-nova-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__foundry__10-yt-player-view.png` · `vtt-references-full-2026-11-20__owlbear__03-yt-player-cast.png`

**Não desenhar:** toolbar de fog GM; metadados de token ocultos; iniciativa GM-only.

```
Mesa jogador — projeção imersiva full-bleed.

Zero chrome de administração: sem «Cobrir Névoa», sem «Adicionar Token», sem formulários de upload. Ferramentas player: Mover/Porta, Régua, Desenhar, AoE templates, «Abrir Ficha →».
Tokens: só camada player + monstros revelados; HP simplificado se visível.
Mapa ocupa ≥70% viewport; moldura Prompt 0 com dock 3 rotas.
Mobile: mesmo conteúdo com Z3 em drawers (próximos prompts).
```

---

### Prompt 7 — Crônica (`#/dungeon/mesa`, Z3)

`feature_id`: `chat_roll_log` · **Z3** · Papel: ambos (GM vê entradas secretas).

**Anexar:** `vtt-references-full-2026-11-20__roll20__04-yt-chat-log.png` · `vtt-references-full-2026-11-20__foundry__11-yt-chat.png` · `vtt-references-v3-2026-11-20__assets__foundry__chat_roll_log__legacy-18-docs-chat__01.png`

**Não desenhar:** terceira coluna fixa Roll20; chat separado do log.

```
Z3 — Crônica da mesa (gaveta no jogador, coluna fixa no GM).

Player: `<details>` resumo «Crônica da mesa»; GM: coluna sempre aberta «Crônica da mesa».
Tipografia Domine para entradas narrativas; chips de ação «Examinar inscrições…», «Conversar…»; compositor «Descreva o que … faz agora (ou /roll 1d20)…» + «Declarar Ação →».
Filtrar para jogador: sem entradas gm/blind (mostrar só público).
Drawer lateral desktop; bottom sheet mobile 390px — nunca três colunas iguais.
```

---

### Prompt 8 — Bandeja de dados (`#/dungeon/mesa`, Z3)

`feature_id`: `dice_tray` · **Z3** · Papel: ambos.

**Anexar:** `dungeon-ui-2026-11-20__03-mesa-gm-vila-nova-desktop-1440x900-dark.png` (recorte Z3) · `vtt-references-full-2026-11-20__roll20__10-yt-dice.png` · `vtt-references-full-2026-11-20__owlbear__10-yt-dice.png`

**Não desenhar:** dado 3D Unity; Commit-Reveal² (não usado na demo).

```
Bandeja de dados — «Bandeja de Dados» / summary «Bandeja de dados».

Controles: «Rolar d20»; modos «Normal» | «Vantagem» | «Desvantagem»; toggle «Dados 3D ligados/desligados» (SVG 2.5D, não mesh 3D); botão «Rolar»; chip `/gmroll 1d20` para mestre.
Destaque d20 em bronze #e7c26b; auditoria opcional «Como o dado funciona» (crypto.getRandomValues).
Integrar na gaveta Z3 no mobile; ao lado da crônica no GM desktop.
```

---

### Prompt 9 — Iniciativa e combate (`#/dungeon/mesa`, GM)

`feature_id`: `initiative_combat` · **Z2/Z4** · Papel: GM (player vê pílula de turno).

**Anexar:** `vtt-references-full-2026-11-20__foundry__07-yt-combat.png` · `vtt-references-full-2026-11-20__foundry__16-docs-combat.png`

**Não desenhar:** sistema de regras completo D&D Beyond.

```
Painel «Rastreador de Iniciativa»: «Rolar Iniciativa», «Próximo Turno →», «Limpar»; vazio «Nenhuma iniciativa ativa…».
Player: pílula discreta no topo «Vez de [nome]» / rodada — sem reordenar lista.
Estilo Foundry combat tracker com tokens Sovereign; compacto para não roubar mapa herói.
```

---

### Prompt 10 — Handouts e pins (`#/dungeon/mesa` + notas)

`feature_id`: `journal_handouts` · **Z3 / Z5** · Papel: ambos.

**Anexar:** `vtt-references-full-2026-11-20__foundry__12-yt-journal.png` · `vtt-references-full-2026-11-20__roll20__18-help-map-pins.png` · dossiê § Images (pins)

**Não desenhar:** PDF viewer full-page; journal Roll20 de três colunas.

```
Handouts compartilhados na Mesa Z3; notas no Acampamento/Escudo.

Mesa jogador: «Nenhum handout compartilhado com a mesa ainda.» ou cards com «Abrir anexo».
GM: toggle visibilidade Compartilhar na Mesa / Só Mestre; «Pinar no Mapa» com badge «Alfinete (x,y)».
Markdown handout legível; pins no canvas sem obscurer o mapa.
```

---

### Prompt 11 — Grimório (`#/dungeon/ficha/:charId`)

`feature_id`: `character_sheet` · **Grimório** · Papel: ambos (GM audita).

**Anexar:** `dungeon-ui-2026-11-20__02-grimorio-ficha-lyra-desktop-1440x900-dark.png` · `vtt-references-full-2026-11-20__minikraken__09-docs-character-sheets.png` · `vtt-references-full-2026-11-20__foundry__09-yt-character-sheet.png`

**Não desenhar:** ficha como sidebar direita Roll20; PDF estático.

```
Rota dedicada Grimório — «Ficha Local Soberana (CRDT Offline)».

Blocos: atributos roláveis, PV, CA, ataques, mochila, «Histórico da Mesa», «Crônica @tag», notas públicas. Wizard «Subir de Nível» (d20 Fantasia / Tormenta20 / Livre / Investigação) com «Confirmar Nível N».
Empty: «Mochila vazia». Link «Entrar na Mesa →» no hub; navegação dock Prompt 0.
Rota separada, não painel lateral na mesa.
```

---

### Prompt 12 — Sair da Mesa (Z0)

`feature_id`: (transição) · **Z0** · Papel: ambos.

**Anexar:** `dungeon-ui-2026-11-20__01-acampamento-desktop-1440x900-dark.png` (faixa Z0 visível)

**Não desenhar:** modal de confirmação pesado; mistura com feed cívico Vox.

```
Reforçar Z0 de saída: «Sair da Mesa · Voltar ao Vox» sempre visível, teal #78d6cf, ícone seta.

Ao sair (#/), transição visual clara da ficção P2P para a Ágora — sem perder estado da campanha local.
Mobile: faixa Z0 acima do dock; não esconder atrás do gesture home.
```