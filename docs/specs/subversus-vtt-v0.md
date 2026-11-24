# Proposta de Feature — Subversus VTT (Diorama 2.5D/3D, Fairplay e SLM Cooperativa)

> **Status:** rascunho (v0.2) · **Owner:** mantenedor / revisor · **Criado:** 2026-11-24 · **Escopo:** módulo `dungeon/` (**Subversus VTT**; rótulo na barra do Vox: **Subversus**) · **Alvo de índice:** `docs/README.md` (seção `1. Arquitetura e protocolo`) · **Relacionados:** `ROADMAP.md` (Candidatas), `ADR-017`, `ADR-024`, `ADR-033`, `ADR-035`, `PM-01`, `PM-91`, `PM-98`, `LAN-20`, `REV-10`, [ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md)
> **Nota de governança (`ADR-017`):** este documento especifica arquitetura, contratos e critérios de aceite; não contém caixas `[ ]` de acompanhamento (que existem exclusivamente no `ROADMAP.md`).

---

## 1. Resumo Executivo e Identidade

**Subversus VTT** é o motor de mesa virtual de RPG local-first e P2P do Vox (exibido na barra de navegação do Vox simplesmente como **Subversus**). Mesas virtuais costumam cair em dois extremos: planos 2D estáticos sem sensação espacial, ou clientes 3D pesados (dezenas de megabytes de bibliotecas e malhas `.glb`) que travam em celulares Android comuns, drenam bateria e inviabilizam sincronização leve em P2P.

Esta proposta define a evolução do **Subversus VTT** em **3 trilhas desacopladas**:
1. **Trilha A — Fairplay no VTT 2D base:** conectar os módulos já existentes e testados de dados auditáveis (**Commit-Reveal²** em `client/js/rpg-crypto-table.js`) e **Zero-Spoiler** (`projectStateForPlayer` em `vtt-reducer.js` / `vtt-sync.js`) ao fluxo real de sessão.
2. **Trilha B — Lente Diorama 2.5D/3D (`vox.lab.diorama`):** camada opcional WebGL2 construída sobre o mesmo `FloorDoc` 2D já sincronizado em P2P, com **0 byte extra no precache inicial (`SHELL_ASSETS`)**, **zero dependência externa nova** e **<= 12 KB gzip**.
3. **Trilha C — SLM Cooperativa P2P (`vox.lab.slm`):** extensão opcional estritamente regida por `ADR-033` e `ADR-024`, via PCs voluntários com servidor local `127.0.0.1` (`OpenAI-compatible`), mantendo celulares com **0 MB de modelo baixado** e **custo zero de servidor de IA**.

---

## 2. Objetivos, Não-Objetivos e Invariantes

### 2.1 Objetivos
1. **Lente 2.5D/3D sobre `FloorDoc` 2D único:** cada participante escolhe localmente entre **Topo (2D)**, **Isométrico**, **Diorama (3D)** ou **Olhos do Token (1ª Pessoa)** sem alterar a tela dos demais e sem trafegar malhas 3D no WebRTC.
2. **PWA único multiplataforma (mobile-first + desktop):** experiência completa via link direto no navegador, sem instalação, com layout responsivo (4 abas no mobile: `Acampamento`, `Mapa`, `Grimório`, `Escudo`; mapa protagonista + gaveta lateral no desktop `>= 1024px`).
3. **Integridade sem duplicação:** reutilizar `rpg-crypto-table.js` (Commit-Reveal² resistente a *Last Revealer Attack*) e `projectStateForPlayer` (Zero-Spoiler fail-closed) em vez de criar uma segunda pilha criptográfica ou de filtragem.
4. **IA auxiliar honesta, opt-in e justa com celulares (`ADR-033` / `ADR-024`):** PCs voluntários da própria mesa oferecem suporte via `127.0.0.1` com consentimento explícito de todos os jogadores; celulares ficam com **0 MB de modelo**.
5. **Precedência clara de produto:** a **Ficha multi-sistema + HUD 2D** ([ficha-personagem-brainstorm-v0.md](./ficha-personagem-brainstorm-v0.md)) continua sendo a fonte única de números e vocabulário e tem precedência sobre a lente 3D.

### 2.2 Não-Objetivos (explicitamente fora de escopo)
- **Sem servidor autoritativo de mundo massivo (MMORPG 2.5D).**
- **Sem empacotamento nativo dedicado para IA** (sem binários C++/NDK ou app nativo pago).
- **Sem importação de malhas 3D pesadas (`.glb`, `.fbx`, `.obj`):** geometria nasce apenas da extrusão 2D + 3 primitivas procedurais (`box`, `cylinder`, `ramp`).
- **Sem runtime WebGPU vanilla embutido na v0:** compilar shaders WGSL, tokenizers BPE e KV-cache em `0 deps` contradiz o teto de peso e `LAN-20`. WebGPU na aba só entra se/quando houver API nativa do navegador ou módulo opt-in externo formalmente aprovado fora do bundle.
- **Sem inferência distribuída por camadas na internet** e **sem arbitragem autônoma de regras por IA** (nenhuma SLM altera PV, dano, inventário ou dados sem aprovação do Mestre).

### 2.3 Invariantes de Engenharia do Vox
- **Licença e modelo:** `AGPL-3.0-or-later`, local-first, sem verificação por celular nem autoridade central.
- **Dieta do shell (`PM-01`):** todo código das trilhas B e C é carregado sob demanda (`import()`); `0 byte` adicionado a `SHELL_ASSETS`.
- **Cadeia de suprimentos (`LAN-20`):** zero pacotes novos em `package.json` (WebGL2, Web Crypto API, WebRTC e APIs padrão do navegador).
- **Segurança de loopback (`PM-91`):** conexões `http://127.0.0.1` só ocorrem por ação explícita do usuário nas configurações locais, nunca via parâmetro de URL ou mensagem de par.
- **Governança de IA (`ADR-033` / `ADR-024`):** IA restrita às rotas de RPG, isolada do feed cívico; consentimento unânime dos jogadores antes de envio externo; sem modelo ativo, a UI exibe honestamente `"Sem IA"`.
- **Hardening de código (`PM-98` / `ADR-035`):** `@file` + JSDoc em todos os exports, `<= 350` linhas por arquivo, `LLOC <= 30` (prod) / `<= 45` (testes), `CC <= 15`, `max-depth <= 4`, `max-params <= 5`, `escapeHtml` em todo HTML dinâmico e proibição de `Math.random()` bruto.

---

## 3. Experiência do Usuário, Navegação e Controles

### 3.1 Arquitetura de Telas (Sovereign Agora)
- **Identidade:** marca **Subversus** (título completo **Subversus VTT**); vocabulário 100% leigo (zero jargão de rede, latência em ms, hash ou CRDT no cabeçalho de jogo).
- **Mobile (`< 1024px`) — 4 abas fixas:** `Acampamento` (hub, grupo, descanso, espólios), `Mapa` (canvas + HUD rápido `<= 6` atalhos + Crônica), `Grimório` (ficha multi-sistema modo Jogar padrão + `✏️ Editar` + busca `"Rolar…"` + mochila 10×4) e `Escudo` (painel GM com salvaguardas em lote, rolagens secretas e segredos locais).
- **Desktop (`>= 1024px`):** `Mapa` protagonista (~70% da viewport) + gaveta lateral retrátil com abas `Grimório`, `Crônica` e `Escudo`.
- **Fonte única de estado:** PV, recursos condicionais (`PM` / `Espaços` / `PF`), defesa do sistema (`CA` / `Defesa` / `Esquiva`) e nome do token são sempre derivados da ficha ativa — nenhuma tela mantém cópia própria.

### 3.2 Modos de Câmera (preferência local por aparelho, atrás de `vox.lab.diorama`)
Pílula compacta `2D | Iso | 3D | 1ª` no canto do canvas, persistida em `localStorage`:
- **Topo (2D):** renderizador Canvas 2D tradicional (padrão seguro e fallback automático).
- **Isométrico:** projeção ortográfica inclinada em 45° para leitura tática limpa.
- **Diorama (3D):** câmera orbital livre com inclinação limitada (`15°` a `85°`) e rebaixamento automático (*cutaway*) de paredes frontais.
- **Olhos do Token (1ª Pessoa):** câmera na altura dos olhos `(worldX, elevation + 1.5, worldY)`, com *cutaway* desligado.

### 3.3 Controles (Desktop e Touch) e Acessibilidade
- **Desktop:** botão esquerdo arrasta token (ou move o mapa no vazio); botão direito (ou `Alt` + arraste) gira/inclina a câmera; rolagem ajusta zoom; clique duplo interage com porta ou portal; em `1ª Pessoa`, setas/`WASD` ou clique no chão deslocam o personagem.
- **Mobile / Touch:** `touch-action: none` no canvas; 1 dedo sobre token arrasta no plano da elevação atual (área mínima `44×44 px`, *snap* opcional à grade); 1 dedo no vazio faz *pan*; 2 dedos executam pinça (zoom) e rotação/inclinação.
- **Acessibilidade e Degradação Honesta:** respeita `prefers-reduced-motion`; gera descrição textual estruturada do entorno do token ativo em código puro (sem SLM); em ausência de WebGL2, erro de shader ou `webglcontextlost`, alterna automaticamente para 2D com aviso discreto e estado intacto.

---

## 4. Modelo de Dados Retrocompatível (sobre o Schema Real `1.0.0`)

### 4.1 Convenção de Eixos e Escala (`px` → unidades de grade → 3D)
Para evitar *drift* entre o mapa 2D (`FloorDoc` em pixels) e o espaço 3D:
- **Conversão pura única:** `floorPxToWorld(px, py, floor)` converte pixels do mapa para unidades de grade dividindo por `floor.grid.cellPx` (considerando `offsetX`/`offsetY`). `1.0` unidade = `1` célula da grade.
- **Mapeamento determinístico 2D → 3D:** um ponto em unidades de grade `(wx, wy)` com altura vertical `elevation` mapeia para **`X = wx` (leste), `Y = elevation` (altura para cima), `Z = wy` (sul)**.
- **Sem colisão com `floor.z`:** `floor.z` permanece estritamente o **índice inteiro do andar** (`0` térreo, `-1` subsolo, `1` superior) conforme `vtt-scene-schema.js`. Altura vertical dentro do andar usa exclusivamente `elevation` (nunca `z`).

### 4.2 Extensão Opcional em `FloorDoc` e `TokenDoc`
Todos os campos abaixo são opcionais dentro de `VTT_SCHEMA_VERSION = "1.0.0"`. **Portas continuam exclusivamente em `floor.doors[]`** (`createDoorDoc` em `vtt-tactics-schema.js`, com `state: "closed" | "open" | "locked" | "secret"`) — proibida segunda fonte de verdade para portas.

```json
{
  "floor": {
    "z": 0,
    "name": "Térreo",
    "widthPx": 768,
    "heightPx": 576,
    "grid": { "type": "square", "cellPx": 64, "offsetX": 0, "offsetY": 0, "unitMeters": 1.5 },
    "doors": [
      { "doorId": "door-1", "x1": 4, "y1": 2, "x2": 5, "y2": 2, "state": "closed" }
    ],
    "diorama": {
      "ambient": "dungeon",
      "wallDefaultHeight": 2.4,
      "wallCutaway": true
    },
    "walls": [
      { "wallId": "w1", "x1": 2, "y1": 2, "x2": 8, "y2": 2, "height": 2.6, "color": "#4a4e57" }
    ],
    "volumes": [
      { "volumeId": "v1", "shape": "box", "x": 6, "y": 5, "elevation": 0, "w": 2, "d": 1, "h": 0.9, "rot": 0, "color": "#6b4f35", "layer": "player" },
      { "volumeId": "v2", "shape": "cylinder", "x": 3, "y": 4, "elevation": 0, "r": 0.4, "h": 2.6, "color": "#7b8089", "layer": "player" },
      { "volumeId": "v3", "shape": "ramp", "x": 8, "y": 4, "elevation": 0, "w": 2, "d": 2, "h": 1.2, "rot": 90, "color": "#5f656e", "layer": "player" }
    ],
    "portals": [
      { "portalId": "p1", "x": 8, "y": 2, "radius": 0.8, "targetSceneId": "scene_taverna", "targetFloorZ": 0, "label": "Escada para a Taverna", "layer": "player" }
    ]
  },
  "tokenPatch": {
    "tokenId": "tok-gareth",
    "elevation": 0,
    "display": "standee"
  }
}
```

- **`volumes[]`:** exatamente 3 primitivas procedurais (`box`, `cylinder` de 12 segmentos, `ramp`), com `layer: "player" | "gm"` para filtragem Zero-Spoiler.
- **`portals[]`:** transições entre cenas/andares, também sujeitas a `layer: "player" | "gm"`.
- **`TokenDoc`:** mantém `tokenId`, `sheetId`, `layer` e `color` existentes; acrescenta apenas `display` (`"standee"` padrão em 3D ou `"flat"`) e `elevation` (padrão `0`).

---

## 5. Arquitetura Modular (Reuso Primeiro)

Os módulos respeitam a regra de camadas (`ADR-035`) e o teto de `<= 350` linhas por arquivo:

| Trilha / Arquivo | Responsabilidade | Cobertura em Node puro |
|---|---|---|
| **A (reuso)** `client/js/rpg-crypto-table.js` + adaptador `dungeon/vtt-fairplay-roll.js` | Conecta **Commit-Reveal²** (já pronto e resistente a *Last Revealer Attack* via Shamir GF(256) + *Rejection Sampling*) ao `VttOp` `ROLL_RECORDED` | 100% pura |
| **A (reuso)** `dungeon/vtt-reducer.js` + `dungeon/vtt-tactics-reducer.js` | Estende `projectStateForPlayer` / `projectTacticsFloorForPlayer` (Zero-Spoiler já existente) para ocultar `volumes`/`portals` com `layer: "gm"` | 100% pura |
| **B1** `dungeon/diorama/diorama-math.js` | Matrizes 4×4, `floorPxToWorld`, `(wx, wy, elevation) → (X, Y, Z)`, interseção `ray-plane` (chão) e **`ray-cylinder` / `ray-AABB`** (seleção de standees em ângulos baixos e 1ª Pessoa) | 100% pura |
| **B1** `dungeon/diorama/diorama-geom.js` | Extrusão de `walls` e `floor.doors`, *Vertex AO*, geração de `box`/`cylinder`/`ramp` e descrição acessível do entorno | 100% pura |
| **B1** `dungeon/diorama/diorama-camera.js` | Estado orbital (`yaw`, `pitch`, `zoom`, `target`), presets (`2D`, `Iso`, `3D`, `1ª`) e limites de câmera | 100% pura |
| **B1** `dungeon/diorama/diorama-gl.js` | Contexto WebGL2, shaders com `discard` (`alphaTest`), cache de textura Fog `R8` por `fogVersion`, batching (`<= 6` draw calls) e *dirty loop* | Mock/smoke |
| **B1/B2** `dungeon/diorama/diorama-view.js` | Orquestração com o VTT, *picking* de standees/portas/portais, gestos touch e fallback 2D em `webglcontextlost` | Integração |
| **C** `dungeon/slm/slm-router.js` | Fila cooperativa P2P entre PCs com tags (`chat`, `json`, `embed`, `voz`), *rate-limit*, *timeout*, *failover* e bloqueio de notas privadas do Mestre | 100% pura |
| **C** `dungeon/slm/slm-bridge.js` | Adaptador exclusivo para `http://127.0.0.1` (`OpenAI-compatible`) com diagnóstico de CORS e aviso de suporte de navegador | Mock HTTP |
| **C** `dungeon/slm/slm-prompts.js` | Templates enxutos e validador determinístico de patch JSON (sempre sujeito à aprovação do Mestre) | 100% pura |

---

## 6. Pipeline Gráfico WebGL2 Ultraleve

Uma cena típica (1 mapa + 80 paredes + 20 primitivas + 25 tokens) totaliza **< 1.500 triângulos** e executa em **4 a 6 *draw calls*** por quadro:

1. **Chão + Névoa de Guerra em passe único com cache:** o mapa é 1 *quad* em `Y = 0`. A máscara de visibilidade 2D é rasterizada em canvas oculto `512×512` e enviada via `gl.texSubImage2D` (`R8`, `gl.LINEAR`) **somente quando `fogVersion` mudar** — nunca a cada quadro.
2. **Iluminação estática barata (*Vertex AO* + *Ambient Tint*):** vértices na base recebem fator `0.62` e vértices no topo `1.0`, gerando sombreamento natural sem *shadow maps*. Uniforme de ambiente alterna entre **Dia**, **Crepúsculo**, **Noite** e **Masmorra**.
3. **Standees 2.5D com `alphaTest` (`discard`) e *picking* volumétrico:** cada token combina disco de base + *quad* vertical *billboard* no eixo `Y`. O *fragment shader* usa `if (alpha < 0.5) discard;` para recorte limpo sem precisar ordenar transparência *back-to-front* a cada quadro. Cliques usam `ray-cylinder` antes de cair para `ray-plane`.
4. ***Cutaway* automático de paredes:** paredes no cone câmera→foco reduzem altura visual para `0.25` unidade; desligado em `1ª Pessoa`.
5. **Renderização sob demanda (*Dirty Flag*):** `requestAnimationFrame` roda apenas em gestos, animações ou mudança de estado; `0%` de GPU em repouso.
6. **Proteção de VRAM (Android e iOS Safari):** mapas acima de `2048×2048` são redimensionados no upload; texturas e buffers são destruídos (`gl.deleteTexture` / `gl.deleteBuffer`) ao trocar de cena ou voltar para 2D.

---

## 7. Integridade, Fairplay e Limitações de Rede

1. **Dados verificáveis via `rpg-crypto-table.js` (Commit-Reveal²):** reutiliza o duplo compromisso SHA-256 + backup Shamir GF(256) (que neutraliza desconexão oportunista / *Last Revealer Attack*) + *Rejection Sampling* sem viés modular. Na Crônica, aparece apenas um selo discreto `✓` tocável para ver o resumo em linguagem leiga.
2. **Zero-Spoiler via `projectStateForPlayer`:** o Mestre mantém o estado completo localmente e projeta o subconjunto visível por jogador antes do WebRTC. Tokens `gm`, portas `secret`, `volumes`/`portals` da camada `gm` e `notes_gm` nunca saem da máquina do Mestre.
3. **Log assinado:** eventos críticos seguem o encadeamento assinado (`sigv: 2`).
4. **CGNAT em redes móveis:** em 4G/5G restritivo, conectividade P2P plena depende do TURN (`REV-10` / `INF-01`), exibindo diagnóstico honesto (`LAN-21`) enquanto o TURN não estiver ativo.

---

## 8. Extensão Opcional: SLM Cooperativa P2P (`vox.lab.slm` · `ADR-033`)

Camada **100% desacoplada** do renderizador Diorama e sujeita integralmente a `ADR-033` e `ADR-024`:

### 8.1 Modelo de Execução Honesto (v0)
- **Celulares (Android e iOS): `0 MB` de modelo.** Recebem apenas respostas curtas e propostas de patch pelo WebRTC.
- **PCs voluntários (desktop Chromium/Firefox, opt-in *"Compartilhar SLM com a mesa"*):** conectam exclusivamente a um servidor local `http://127.0.0.1` (`OpenAI-compatible`) já executado pelo próprio usuário.
- **Limitações explícitas e diagnóstico:**
  - **CORS:** servidores locais bloqueiam origens HTTPS por padrão; `slm-bridge.js` executa teste rápido de `OPTIONS`/saúde e exibe instrução objetiva caso o cabeçalho CORS esteja ausente.
  - **Safari/iOS:** navegadores Apple bloqueiam *mixed content* `https:// → http://127.0.0.1`; a UI informa claramente que o compartilhamento como provedor local exige desktop Chromium/Firefox.

### 8.2 Orquestração e Governança (`ADR-033` / `ADR-024`)
1. **Consentimento unânime da mesa:** antes de rotear contexto compartilhado para o PC de um participante (ou serviço externo com chave da mesa), **todos os jogadores** confirmam em tela de consentimento explícito; qualquer recusa mantém a mesa em modo **`Sem IA`**.
2. **Isolamento de segredos do Mestre:** notas privadas, armadilhas ocultas e rolagens secretas **jamais** saem para o PC de outro jogador.
3. **Transparência e proteção de GPU voluntária:** o painel do Escudo exibe qual par processa a fila (`Assistente · PC de Brenor` ou `Sem IA`), com *rate-limit*, teto de `60–200` tokens por resposta, *failover* automático e botão instantâneo de pausa para o dono do PC.
4. **Aprovação humana obrigatória:** qualquer patch JSON sugerido passa por validação determinística (`slm-prompts.js`) e só altera a cena após clique explícito do Mestre.

---

## 9. Orçamento de Recursos e Conformidade de CI

| Métrica / Portão | Teto / Exigência |
|---|---|
| Precache inicial (`SHELL_ASSETS`) | `0 byte` (carregamento 100% lazy) |
| Peso do núcleo Diorama B1 (`dungeon/diorama/` core) | `<= 12 KB` gzip (`<= 25 KB` fonte no núcleo; extras B2 em chunk lazy separado — sem *code golf* que viole SLAP) |
| Peso do adaptador Fairplay (`vtt-fairplay-roll.js`) | `<= 4 KB` fonte (reutilizando `rpg-crypto-table.js`) |
| Peso do pacote `dungeon/slm/` | `<= 8 KB` fonte (`0` modelo no repositório) |
| Novas dependências em `package.json` | `0` (`LAN-20`) |
| *Draw calls* por quadro (cena típica) | `<= 6` |
| Reconstrução de geometria (100 paredes + 30 tokens) | `< 4 ms` |
| Tempo de quadro em movimento (Android de entrada) | `< 8 ms` (alvo 60 FPS) |
| Teto defensivo de VRAM | `<= 32 MB` (textura de mapa `<= 2048×2048`) |
| Portões obrigatórios de CI | `npm run lint:all`, `npm run audit:docs`, `npm run audit:layers`, `node scripts/innerhtml-audit.mjs`, `tests/shell-reachability.test.js`, `tests/release-metadata-drift.test.js` |

---

## 10. Plano de Entrega em 3 Trilhas Independentes

Cada trilha entrega valor reversível sem bloquear o caminho crítico do Vox (`G0`, `LAN-36` NLnet, `REV-12` parecer), respeitando o teto de paralelismo do roadmap:

| Trilha | Escopo | Critério de Aceite (DoD) |
|---|---|---|
| **Trilha A — Fairplay no VTT 2D** *(1–2 PRs, pós-G0)* | Plugar `rpg-crypto-table.js` (Commit-Reveal²) no `ROLL_RECORDED` via `vtt-fairplay-roll.js`; estender `projectStateForPlayer` para novos campos `gm`; selo discreto `✓` na Crônica | 100% de testes unitários verdes em Node; prova de detecção de fraude e resistência a *Last Revealer*; prova de não-vazamento de `layer: "gm"`; beneficia todas as mesas 2D imediatamente |
| **Trilha B1 — Diorama Core** *(pós-G1, `vox.lab.diorama`)* | Extensão retrocompatível de `FloorDoc`/`TokenDoc`; `diorama-{math,geom,camera,gl,view}.js` com chão, Fog `R8` cacheado por `fogVersion`, `walls` + `floor.doors`, standees (`discard` + `ray-cylinder`) e alternador `2D \| Iso \| 3D` | Fora de `SHELL_ASSETS` confirmado por `shell-reachability.test.js`; `<= 12 KB` gzip; cena 2D legada abre sem erro; fallback automático para 2D testado em `webglcontextlost` |
| **Trilha B2 — Extras Diorama** *(só após B1 validar FPS real)* | Primitivas `box`/`cylinder`/`ramp`, presets de luz ambiente, `portals`, `1ª Pessoa` (com *cutaway* desligado), descrição acessível e gestos 2 dedos | Teste manual em Android de entrada e iOS Safari `>= 30 FPS` (alvo 60) sem recarregamento por memória |
| **Trilha C — SLM Cooperativa P2P** *(PR próprio sob `ADR-033`, `vox.lab.slm`)* | `slm-router.js`, `slm-bridge.js` (`127.0.0.1` + diagnóstico CORS), `slm-prompts.js` e tela de consentimento unânime da mesa + revisão `COMPLIANCE-BR` | Testes em Node provam consentimento obrigatório, *failover* 3→2 nós, bloqueio de envio de notas privadas do Mestre, *rate-limit* e rejeição de patch JSON inválido |

---

## 11. Riscos, Mitigações e Critérios de Pausa/Abandono

| Risco | Impacto | Mitigação |
|---|---|---|
| **Desvio do caminho crítico 2026–2027** (`LAN-36` NLnet, `REV-12` parecer, piloto `G1`) | Alto | Manter Trilhas B/C como **Candidatas** até aceite formal; Trilha A só entra após liberação do G0 |
| **Atrito de CORS no `127.0.0.1` / bloqueio *mixed-content* no Safari** | Alto | Diagnóstico automático de CORS em `slm-bridge.js` + aviso honesto de requisito desktop Chromium/Firefox para provedores locais |
| **CGNAT em redes móveis 4G/5G derrubar P2P** | Médio | Reutilizar diagnóstico honesto (`LAN-21`) e acoplar conectividade móvel plena ao TURN (`REV-10` / `INF-01`) |
| **Perda de contexto WebGL / limite de RAM no Safari iOS** | Médio | Loop *dirty flag*, teto `2048×2048`, descarte imediato de VRAM e fallback transparente para Canvas 2D |
| **Inconsistência de estado entre telas (🔑 única)** | Médio | Proibir cópias locais de PV/recursos/defesa; toda UI (Acampamento, Mapa, Grimório, Escudo e standees) lê do estado derivado da ficha |

### Critérios de Pausa ou Abandono
- **Pausar promoção da Trilha B** se o núcleo `dungeon/diorama/` ultrapassar `12 KB` gzip, cair abaixo de `30 FPS` em Android de entrada em cena padrão, ou adicionar qualquer byte a `SHELL_ASSETS`.
- **Desligar `vox.lab.slm`** se testes reais mostrarem alta taxa de erro em patches JSON ou se o atrito de configuração CORS no PC do voluntário inviabilizar o uso prático.

---

## 12. Decisões Pendentes para Aceite do Mantenedor

1. **Priorização no `ROADMAP.md`:** confirmar **Trilha A (Fairplay 2D)** para a fila pós-G0 e **Trilhas B/C** como **Candidatas** pós-`LAN-36` (NLnet) / corte `develop → main`.
2. **Flags padronizadas:** confirmar `vox.lab.diorama` e `vox.lab.slm` (alinhadas a `vox.lab.aviso` e `vox.lab.moderador`).
3. **Renomeação em UI (pós-G0):** confirmar o rótulo **`Subversus`** na barra de navegação do Vox (com ícone de d20 + tooltip `"Mesa de RPG"`) quando o congelamento de código em `client/js/dungeon/` for liberado.
