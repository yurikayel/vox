# Mesa Soberana — referenciais VTT e posicionamento (v0)

> **Status:** canônico (produto) · **Owner:** mantenedor · **Revisado:** 2026-11-20
> **Relacionados:** [ai-social-dungeon-v0.md](./ai-social-dungeon-v0.md) · [mesa-ui-brainstorm-v0.md](./mesa-ui-brainstorm-v0.md) · [ADR-033](../adr/033-ia-so-no-rpg-local-primeiro.md) · `client/js/dungeon/`

Este documento fixa **referenciais de mercado** (Roll20, Owlbear Rodeo, Foundry VTT, Mini Kraken) e o que a Mesa Soberana **copia, evita ou já entrega**, sem endorse comercial. **Anatomia de UI** consolidada em [mesa-ui-brainstorm-v0.md](./mesa-ui-brainstorm-v0.md). Roadmap de engenharia da Entrega 5 está na §5.

---

## 1. Síntese comparativa

| Dimensão | Roll20 | Owlbear Rodeo | Foundry VTT | Mini Kraken | Mesa Soberana (alvo) |
| :--- | :--- | :--- | :--- | :--- |
| Filosofia | Sala única SaaS; mapa + chat + sheets | Canvas minimalista; ficha em geral fora (PDF) | Self-host + módulos; GM “dono” do servidor | SaaS all-in-one no browser | **Local-first** + sync P2P Vox; cópia CRDT por participante |
| UI sessão | Três colunas (chat, mapa, journal) | Canvas quase fullscreen | Dock + canvas + sidebar tabs | Hub → VTT + escudo mestre | **Mapa hero + drawer Z3** (ver UI brainstorm) |
| Onboarding | Conta + curva de abas | Quase instantâneo | Pesado (host, módulos, updates) | Link; curva média | Campanha no aparelho; módulo `#/dungeon` **lazy** |
| Ficha | Abas na coluna direita | Externa ao VTT | Builder rico + automação | Schemas + fórmulas (D&D, Tormenta, Ordem, etc.) | Ficha **CRDT clicável** + export Obsidian / `.voxrpg.zip` |
| Mapa | 2D; páginas; tokens | 2D leve, fog, tokens | 2D/3D, extensível | 2D/3D, fog, GM screen, som | Canvas **2D em 8 camadas** (E3); sem VTT 3D no v1 |
| Performance | Denso em mobile | Pouca UI → menos lag | Risco de engasgo, F5, clone de jogador | Infra gerenciada; foco mobile | Canvas **0% CPU em repouso**; projeção Zero-Spoiler fail-closed |
| Áudio / mídia | Integrações limitadas | Player de áudio do SO + mídia na conta | Depende de módulos/setup | Soundboard, mixer, storage na nuvem | **Fora do escopo civil v1** (sem áudio/vídeo no precache) |
| Investigação | Journal / handouts | Fraca nativamente | Via módulos | Quadro cortiça, handouts visuais, wiki | `.canvas` Obsidian, pins no mapa, notas por pasta (E4) |
| Ecossistema | Marketplace próprio | Extensões (ex.: Kraken → Owlbear) | Marketplace grande | Discord, OBS, integração Owlbear/Foundry | Malha **comunitária Vox** (futuro; não Discord Activity) |
| Brasil / idioma | EN-first | EN-first | EN-first | **PT-first**, BRL, sistemas BR | UI em PT; presets `libre` / `d20_fantasy` / `investigacao` (expandir Tormenta20) |

### 1.0 Roll20 (leitura de produto + UI)

| | |
| :--- | :--- |
| **Prós** | Chat + log de rolagens na mesma sala; macros e fórmulas; journal/handouts no fluxo da sessão. |
| **Contras** | Layout tricoluna pesado; muitas abas; mobile fraco; ficha competindo com mapa por espaço. |
| **Para a Mesa** | Copiar **hábito** crônica + rolagem (Z3), **não** o layout 3 colunas fixas. Grimório em rota própria. Detalhe: [mesa-ui-brainstorm-v0.md](./mesa-ui-brainstorm-v0.md) §2.1. |

### 1.1 Owlbear Rodeo (feedback da mesa + leitura de produto)

| | |
| :--- | :--- |
| **Prós** | Intuitivo; pouca informação na tela; login com Google e armazenamento de mídia por usuário; player de áudio do sistema para atmosfera. |
| **Contras** | Sem ficha embutida — sessão com PDF e conta manual como no presencial. |
| **Para a Mesa** | Adotar **simplicidade perceptiva** para o jogador (mapa como foco). **Não** regressar a “só PDF”: ficha local já é diferencial. **Não** copiar login Google nem nuvem de mídia no núcleo civil. |

### 1.2 Foundry VTT

| | |
| :--- | :--- |
| **Prós** | Ficha e automação na própria ferramenta; customização e cena profunda; dados sob controle do mestre no servidor. |
| **Contras** | Superfície enorme → engasgos; F5 nem sempre resolve; risco de **clone/trava** de jogador na sala ao reconectar. |
| **Para a Mesa** | Manter poder tático (fog, AoE, portas, iniciativa) e automação de rolagem. **Evitar** marketplace infinito e estado pesado. **E5:** reconexão P2P com **um** `routeId` ativo, ops idempotentes por `opId` (`vtt-reducer.js`, `vtt-sync.js`). |

### 1.3 Mini Kraken ([erpg.app](https://erpg.app/pt/))

Referência **brasileira** all-in-one (ficha, VTT 3D, wiki, handouts, Discord/OBS). Fontes: [guia do usuário](https://erpg.app/pt/docs/guide/), [planos](https://erpg.app/pricing/), material oficial de comparação com Owlbear e Foundry.

| | |
| :--- | :--- |
| **Prós** | Fluxo integrado (menos abas); quadro investigativo; escudo do mestre; som/mixer; mobile; PT/BRL; templates Tormenta, Ordem, D&D; free tier para começar; extensões que levam ficha/handout para Owlbear ou Foundry. |
| **Contras** | Mais complexo que Owlbear; **hosted** (limites de cenas/storage no free); ecossistema menor que Foundry; produto mais novo; usar integração ainda depende de outra mesa para o mapa em alguns fluxos. |
| **Para a Mesa** | Mesmo “pacote mental” (campanha + ficha + pistas + mapa), com **soberania**: dados no aparelho, backup `.voxrpg.zip`, sem servidor central obrigatório. **Não competir** no v1 com VTT 3D full, Discord Activity ou storage em nuvem. |

### 1.4 Links oficiais (consulta externa)

- Roll20: [https://roll20.net/](https://roll20.net/)
- Owlbear Rodeo: [https://www.owlbear.rodeo/](https://www.owlbear.rodeo/)
- Foundry VTT: [https://foundryvtt.com/](https://foundryvtt.com/)
- Mini Kraken: [https://erpg.app/pt/](https://erpg.app/pt/)

---

## 2. Princípios de produto (E5+)

1. **Owlbear-speed no jogador:** projeção fail-closed já existe; E5 reforça UI enxuta (mesa + atalhos de ficha).
2. **Foundry-power só onde paga:** fórmulas, inventário, tático — **sem** loja de módulos no cliente cívico.
3. **Kraken-workflow sem lock-in:** handouts, pistas e campanha num fluxo; portabilidade zip/Obsidian em vez de biblioteca proprietária.
4. **Anti-sessão fantasma (Foundry):** uma presença P2P por `routeId`; reconexão idempotente.
5. **Performance como feature:** `client/js/dungeon/` lazy; precache civil **0 bytes** (`SHELL_ASSETS` sem entradas `dungeon/`, auditado 2026-11-20 pós-fila E2–E5); dados 3D opcionais e leves (E4).
6. **BR como dados, não SaaS:** presets nomeados (Tormenta20, etc.) em schema/redutor, não dependência de template cloud.

---

## 3. Matriz fazer / não fazer / já temos

| Tema | Referência | Decisão Mesa | Evidência no repo |
| :--- | :--- | :--- | :--- |
| Mapa 2D + tokens + fog | Owlbear / Foundry / Kraken | **Já temos** (E2–E3) | `canvas-renderer.js`, `vtt-tactics-*` |
| Ficha clicável + ledger | Foundry / Kraken | **Já temos** (E1) | `rpg-sheet-and-lore.js`, `screen-sheet.js` |
| GM screen / segredos | Foundry / Kraken | **Já temos** | `projectStateForPlayer`, camada GM |
| Backup portátil | — (diferencial) | **Já temos** | `vtt-portable.js`, `.voxrpg.zip` |
| Quadro de pistas | Kraken | **Parcial** (E4) | `obsidian-bridge.js` (`.canvas`), `screen-notes.js` |
| Pin no mapa | Kraken POI | **Parcial** (E4.1) | `NOTE_PIN`, `vtt-note-pins.js` |
| Sync P2P real em sessão | Foundry world / Kraken sala | **Parcial (E5 P0)** | `vtt-sync.js` + `#/dungeon/entrar/…` via `BroadcastChannel` (2 abas, mesma origem); WebRTC/cross-device **fora do P0** |
| UI jogador mínima | Owlbear ✅ | **Já temos (E5.0)** | `screen-table.js`, `dungeon-ui-contract.js`, `dungeon-layout.css` |
| Login Google + mídia nuvem | Owlbear ✅ | **Não fazer** (civil) | Identidade Vox local |
| Marketplace de módulos | Foundry | **Não fazer** | — |
| VTT 3D WebGL | Kraken | **Não v1** | ADR futuro se necessário |
| Áudio / mixer | Owlbear / Kraken | **Lab opt-in só** | Zero áudio no escopo atual |
| Discord bot / Activity | Kraken | **Não fazer** | Malha Vox, não Discord |
| PDF como ficha principal | Owlbear ❌ | **Não fazer** | Obsidian/md preferido |
| Preset Tormenta20 | Kraken ✅ | **Já temos (E5 P1)** | `vtt-levelup.js` · `dungeonPrefs.preset` |
| Handout viewer rico | Kraken / PDF Owlbear | **Parcial (E5 P1)** | drawer Z3 `renderHandoutViewer` · links `https?` externos; sem renderizador PDF embutido |

---

## 4. Posicionamento (resumo executivo)

A Mesa Soberana ocupa o quadrante **local soberano + complexidade média**: mais capacidade que Owlbear (ficha + tático + backup), menos superfície e infraestrutura que Foundry/Kraken hosted, com honestidade sobre o que é demo (IA, guardiões — ADR-033).

---

## 5. Roadmap Entrega 5 (E5)

Cada item = PR pequeno, `npm run validate`, **precache civil inalterado**.

| P | Entrega | Inspiração | Módulos prováveis | Explicitamente não |
| :---: | :--- | :--- | :--- | :--- |
| **P0** | Sync P2P jogável (2 clientes, sem clone) | Foundry ❌ reconexão | `vtt-sync.js`, `vtt-sync-codec.js`, testes adversariais | Servidor VTT dedicado |
| **P0** | Modo jogador enxuto (mapa hero + Z3 drawer) | Owlbear ✅ simples | `screen-table.js`, `dungeon-chrome.js`, `dungeon-ui-contract.js`, `dungeon-layout.css` | Esconder mecânica da ficha |
| **P1** | Handout viewer (imagem / link PDF externo) | Owlbear PDF + Kraken handouts | `screen-notes.js`, portable | Editor visual tipo Kraken |
| **P1** | Preset **Tormenta20** (ficha + level-up) | Kraken ✅ BR | `vtt-levelup.js`, `vtt-schema.js` | Loja de templates |
| **P2** | Pin de nota por clique no mapa | Kraken POI | `canvas-input.js`, `NOTE_PIN` | — |
| **P2** | Wiki de campanha leve (páginas ligadas) | Kraken Worlds | notas + export Obsidian | CMS completo |
| **P3** | Atmosfera áudio (somente lab, lazy) | Owlbear/Kraken áudio | módulo fora do precache | Áudio no SW cívico |
| — | VTT 3D | Kraken 3D | — | **Fora v2** até ADR |

### 5.1 Integração git (fila E1→E4, operacional)

E1 mergeado em `develop` via [#314](https://github.com/yurikayel/vox/pull/314). Branches E2–E4 empilhadas localmente: usar **`git rebase --onto origin/develop <base-da-entrega>^ feature/mesa-soberana-eN`** (um commit por PR), **não** `git rebase origin/develop` na ponta empilhada (reaplica E1 e conflita).

---

## 6. Histórico

| Data | Nota |
| :--- | :--- |
| 2026-11-20 | v0: referenciais Owlbear/Foundry/Mini Kraken + princípios + matriz + roadmap E5. |