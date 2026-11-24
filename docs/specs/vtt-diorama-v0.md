# Proposta de Feature — Vox VTT Diorama (2.5D/3D, Fairplay e SLM Cooperativa)

> **Status:** rascunho · **Owner:** mantenedor / revisor · **Criado:** 2026-11-24 · **Escopo:** módulo `dungeon/` (VTT) · **Alvo de índice:** `docs/README.md` (seção `specs/`) · **Relacionados:** `ROADMAP.md` (Candidatas), `ADR-017`, `ADR-035`, `PM-01`, `PM-91`, `PM-98`, `LAN-20`, `REV-10`
> **Nota de governança (`ADR-017`):** este documento especifica arquitetura, contratos e critérios de aceite; não contém caixas `[ ]` de acompanhamento (que existem exclusivamente no `ROADMAP.md`).

---

## 1. Resumo Executivo e Problema

Mesas virtuais de RPG (VTT) costumam cair em dois extremos: ou são planos 2D estáticos sem sensação espacial, ou são clientes 3D pesados (dezenas de megabytes de bibliotecas e malhas `.glb`) que travam em celulares Android comuns, drenam bateria e inviabilizam sincronização leve em P2P.

Esta proposta define o **Vox VTT Diorama**: uma camada opcional de visualização 2.5D/3D construída sobre a **mesma planta baixa 2D já sincronizada em P2P**, somada a duas extensões desacopladas — **integridade de sessão no protocolo (*Fairplay*)** e **assistência opcional por SLMs cooperativas via PCs conectados à mesa**.

O objetivo é entregar imersão tática estilo diorama de mesa física com **0 byte extra no precache inicial do app**, **zero dependência externa nova**, **60 FPS estáveis em celulares comuns** e **custo zero de servidor de IA**.

---

## 2. Objetivos, Não-Objetivos e Invariantes

### 2.1 Objetivos
1. **Lente 2.5D/3D sobre estado 2D único:** cada participante escolhe localmente entre **Topo (2D)**, **Isométrico**, **Diorama (3D)** ou **Olhos do Token (1ª pessoa)** sem alterar a tela dos demais e sem trafegar malhas 3D no WebRTC.
2. **PWA único multiplataforma:** experiência completa em navegadores de Android, iOS e PC via link direto, preservando a entrada sem instalação.
3. **Integridade sem confiança no cliente:** impedir manipulação local de rolagens de dados e leitura indevida de áreas ocultas na Névoa de Guerra.
4. **IA auxiliar opcional e justa com celulares:** permitir que PCs voluntários da própria mesa ofereçam suporte de SLM via P2P, mantendo celulares com **0 MB de modelo baixado**.
5. **Ganchos mínimos de evolução:** incluir no schema apenas `1ª pessoa` e `portais entre cenas`, permitindo expansões futuras sem inflar o escopo atual.

### 2.2 Não-Objetivos (explicitamente fora de escopo)
- **Sem servidor autoritativo de mundo massivo (MMORPG 2.5D):** fica fora desta proposta e de 2027.
- **Sem empacotamento nativo dedicado para IA:** não construir nem manter binários C++/NDK (Android) ou app nativo pago (iOS) para embutir runtimes de LLM.
- **Sem importação de malhas 3D pesadas (`.glb`, `.fbx`, `.obj`):** geometria de cenário nasce apenas da extrusão 2D + 3 primitivas procedurais.
- **Sem inferência distribuída por camadas na internet:** PCs cooperam por paralelismo de tarefas independentes, nunca fatiando um único modelo gigante sobre conexões domésticas.
- **Sem arbitragem de regras por IA:** nenhuma SLM altera HP, dano, inventário ou resultado de dados de forma autônoma.

### 2.3 Invariantes de Engenharia do Vox
- **Licença e modelo:** `AGPL-3.0-or-later`, local-first, sem verificação por celular nem autoridade central.
- **Dieta do shell (`PM-01`):** todo código desta proposta é carregado sob demanda (`import()`); `0 byte` adicionado a `SHELL_ASSETS`.
- **Cadeia de suprimentos (`LAN-20`):** zero pacotes novos em `package.json` (uso exclusivo de WebGL2, Web Crypto API, WebRTC e APIs padrão do navegador).
- **Segurança de loopback (`PM-91`):** conexões `http://127.0.0.1` só ocorrem mediante escolha explícita do usuário nas configurações locais, nunca via parâmetro de URL ou mensagem de par.
- **Hardening de código (`PM-98` / `ADR-035`):** `@file` + JSDoc em todos os exports, `<= 350` linhas por arquivo, `LLOC <= 30` (prod) / `<= 45` (testes), `CC <= 15`, `max-depth <= 4`, `max-params <= 5`, `escapeHtml` em todo HTML dinâmico e proibição de `Math.random()` bruto.

---

## 3. Experiência do Usuário e Controles

### 3.1 Modos de Câmera (preferência local por aparelho)
Um controle compacto `2D | Iso | 3D | 1ª Pessoa` fica no topo da mesa e salva a escolha em `localStorage`:
- **Topo (2D):** renderizador Canvas 2D tradicional (padrão seguro e fallback automático).
- **Isométrico:** projeção ortográfica/suave inclinada em 45° para leitura tática limpa.
- **Diorama (3D):** câmera orbital livre com limite seguro de inclinação (`15°` a `85°`) e rebaixamento automático (*cutaway*) de paredes frontais.
- **Olhos do Token (1ª Pessoa):** posiciona a câmera na altura dos olhos do token selecionado `(mapX, elevation + 1.5, mapY)`, desliga o *cutaway* e permite inspecionar o ambiente na escala do personagem.

### 3.2 Controles (Desktop e Touch)
- **Desktop:** botão esquerdo arrasta token (ou move o mapa no vazio); botão direito (ou `Alt` + arraste) gira/inclina a câmera; rolagem ajusta zoom; clique duplo interage com porta ou portal; no modo 1ª pessoa, setas/`WASD` ou clique no chão deslocam o personagem.
- **Mobile / Touch (Android e iOS):** `touch-action: none` no canvas; 1 dedo sobre token arrasta no plano da elevação atual (área de toque mínima `44×44 px`, com *snap* opcional à grade); 1 dedo no vazio faz *pan*; 2 dedos executam pinça (zoom) e rotação/inclinação suave.

### 3.3 Acessibilidade e Degradação Honesta
- Respeita `prefers-reduced-motion` (trocas instantâneas de câmera sem interpolação).
- Gera **descrição textual estruturada** do entorno do token ativo (distância e direção de portas, portais e tokens visíveis) para leitores de tela, funcionando em código puro mesmo sem SLM.
- Em dispositivos sem WebGL2, falha de compilação de shader ou evento `webglcontextlost`, alterna automaticamente para o renderizador 2D exibindo aviso discreto e preservando integralmente o estado da mesa.

---

## 4. Modelo de Dados e Convenção de Coordenadas

### 4.1 Convenção de Eixos (2D → 3D)
Para eliminar ambiguidades entre o plano da planta e a altura vertical:
- **Unidade:** `1.0` unidade equivale a `1` célula da grade 2D (ou escala configurada no mapa).
- **Mapeamento determinístico:** um ponto 2D `(x, y)` com elevação `z` no JSON mapeia em 3D para **`X = x` (leste), `Y = z` (altura para cima), `Z = y` (sul)**.

### 4.2 Extensão Retrocompatível do JSON de Cena
Todos os novos campos são opcionais. Clientes em modo 2D continuam operando normalmente sem interpretá-los, e cenas antigas renderizam em 3D usando valores padrão:

```json
{
  "schemaVersion": 1,
  "diorama": {
    "ambient": "dungeon",
    "wallDefaultHeight": 2.4,
    "wallCutaway": true
  },
  "walls": [
    {
      "id": "w1",
      "x1": 2, "y1": 2, "x2": 8, "y2": 2,
      "height": 2.6,
      "kind": "wall",
      "color": "#4a4e57"
    },
    {
      "id": "d1",
      "x1": 4, "y1": 2, "x2": 5, "y2": 2,
      "height": 2.2,
      "kind": "door",
      "open": false,
      "secret": false
    }
  ],
  "volumes": [
    { "id": "v1", "shape": "box", "x": 6, "y": 5, "z": 0, "w": 2, "d": 1, "h": 0.9, "rot": 0, "color": "#6b4f35" },
    { "id": "v2", "shape": "cylinder", "x": 3, "y": 4, "z": 0, "r": 0.4, "h": 2.6, "color": "#7b8089" },
    { "id": "v3", "shape": "ramp", "x": 8, "y": 4, "z": 0, "w": 2, "d": 2, "h": 1.2, "rot": 90, "color": "#5f656e" }
  ],
  "portals": [
    { "id": "p1", "x": 8, "y": 2, "radius": 0.8, "targetScene": "scene_taverna", "label": "Escada para a Taverna" }
  ],
  "tokens": [
    {
      "id": "t1",
      "x": 4.5, "y": 3.5, "z": 0,
      "size": 1,
      "display": "standee",
      "ringColor": "#38bdf8",
      "npcCardId": "npc_taverneiro"
    }
  ]
}
```

- **`volumes`:** suporta exatamente 3 primitivas procedurais (`box`, `cylinder` de 12 segmentos e `ramp`), suficientes para pilares, mobiliário, barricadas e desníveis.
- **`tokens[].display`:** `"standee"` (miniatura vertical com base circular colorida e sombrinha radial) ou `"flat"` (disco rente ao chão para alçapões e áreas de efeito).
- **`portals`:** marcadores leves que permitem ao Mestre (ou jogador autorizado) transitar para outra cena cadastrada.

---

## 5. Arquitetura Modular

Os módulos ficam isolados em três subpacotes independentes sob `dungeon/`, respeitando a regra de camadas (`ADR-035`) e mantendo cada arquivo abaixo de `350` linhas:

| Subpacote / Arquivo | Responsabilidade | Cobertura em Node puro |
|---|---|---|
| `dungeon/diorama/diorama-math.js` | Matrizes 4×4 (perspectiva/ortográfica), mapeamento `(x, y, z) → (X, Y, Z)`, projeção tela↔mundo e interseção raio-plano | 100% pura |
| `dungeon/diorama/diorama-geom.js` | Extrusão de paredes/portas, cálculo de *Vertex AO*, geração de `box`/`cylinder`/`ramp` e descrição acessível do entorno | 100% pura |
| `dungeon/diorama/diorama-camera.js` | Estado orbital (`yaw`, `pitch`, `zoom`, `target`), presets (`2D`, `Iso`, `3D`, `1ª Pessoa`) e limites de câmera | 100% pura |
| `dungeon/diorama/diorama-gl.js` | Contexto WebGL2, 2 programas de shader, upload/limpeza de texturas, batching (`<= 6` draw calls) e *dirty loop* | Mock/smoke |
| `dungeon/diorama/diorama-view.js` | Orquestração com o VTT, *picking* de standees/portas/portais, eventos touch e fallback 2D em `webglcontextlost` | Integração |
| `dungeon/fairplay/dice-commit.js` | Protocolo *Commit–Reveal* com SHA-256 (Web Crypto) para rolagens auditáveis sem servidor central | 100% pura |
| `dungeon/fairplay/fog-filter.js` | Filtragem *Zero-Trust* do estado da cena por jogador antes da transmissão WebRTC | 100% pura |
| `dungeon/slm/slm-router.js` | Fila cooperativa P2P entre PCs com tags de capacidade (`chat`, `json`, `embed`, `voz`, `img`), *rate-limit*, *timeout* e *failover* | 100% pura |
| `dungeon/slm/slm-bridge.js` | Adaptador opcional para API local `OpenAI-compatible` em `127.0.0.1` e adaptador WebGPU sob demanda | Mock HTTP/WebGPU |
| `dungeon/slm/slm-prompts.js` | Templates enxutos (NPC com cartão JSON, escriba, audiodescrição) e validador estrito de patch JSON | 100% pura |

---

## 6. Pipeline Gráfico WebGL2 Ultraleve

Uma cena típica (1 mapa + 80 paredes + 20 primitivas + 25 tokens) totaliza **< 1.500 triângulos** e executa em **4 a 6 *draw calls*** por quadro:

1. **Chão + Névoa de Guerra em passe único:** o battlemap é desenhado como 1 *quad* (2 triângulos) no plano `Y = 0`. A máscara de visibilidade já calculada pelo motor 2D sobe como textura `R8` (`512×512`) e é multiplicada no *fragment shader* sobre piso e paredes — sem raycast 3D.
2. **Iluminação estática barata (*Vertex AO* + *Ambient Tint*):** durante a geração da malha na CPU, vértices em contato com o chão recebem fator de sombra `0.62` e vértices superiores `1.0`, gerando sombreamento natural nos cantos sem *shadow maps*. Um uniforme de cor ambiente alterna entre **Dia**, **Crepúsculo**, **Noite** e **Masmorra**.
3. **Standees 2.5D (billboard cilíndrico):** cada token combina base circular fina (cor de time/seleção + sombra radial) e um *quad* vertical que gira apenas no eixo `Y` na direção da câmera, mantendo leitura estável mesmo visto de cima.
4. ***Cutaway* automático de paredes:** segmentos de parede que cruzam o cone entre a câmera orbital e o foco interpolam sua altura visual para `0.25` unidade (mureta baixa), preservando leitura espacial sem ocultar tokens. Desativado automaticamente no modo `1ª Pessoa`.
5. **Renderização sob demanda (*Dirty Flag*):** o `requestAnimationFrame` roda apenas durante gestos, transições de câmera ou atualizações de estado; em repouso, hiberna com `0%` de uso de GPU.
6. **Proteção de VRAM (Android e iOS Safari):** mapas acima de `2048×2048` são redimensionados defensivamente no upload; todos os buffers e texturas são liberados (`gl.deleteTexture` / `gl.deleteBuffer`) ao trocar de cena ou retornar ao modo 2D, evitando recarregamentos abruptos de aba por limite de RAM.

---

## 7. Integridade, Anti-Trapaça e Rede P2P

Por ser software livre executado no navegador, o cliente é tratado como ambiente não confiável:

1. **Rolagem de dados por *Commit–Reveal* (`dice-commit.js`):**
   - Etapa 1 (*Commit*): jogador e Mestre (ou um par testemunha) trocam `SHA-256(seed || nonce || rollId)`.
   - Etapa 2 (*Reveal*): após ambos registrarem o compromisso, revelam `seed` e `nonce`.
   - Etapa 3 (*Derivação*): todos conferem os hashes e derivam o valor do dado de `SHA-256(seedA || seedB || rollId)` via mapeamento uniforme sem viés de módulo. Nenhum participante consegue escolher ou alterar o resultado após o compromisso.
2. ***Zero-Trust Fog of War* (`fog-filter.js`):**
   - O Mestre mantém a cena completa apenas na própria máquina e envia a cada jogador somente o subconjunto filtrado pela área visível daquele jogador.
   - Tokens ocultos, portas marcadas com `"secret": true` e anotações do Mestre **não trafegam** no canal WebRTC do jogador, neutralizando inspeção via DevTools.
3. **Log assinado da sessão:** alterações de HP, inventário, ficha e marcos relevantes são assinadas com a chave ECDSA da conta (formato `sigv: 2`) e encadeadas por hash, impedindo fraudes retroativas silenciosas.
4. **Limitação explícita de rede (CGNAT):** em redes móveis 4G/5G com CGNAT restritivo, a conectividade P2P completa depende da ativação de TURN (`REV-10` / `INF-01`). Enquanto o TURN não estiver em produção, a UI exibe diagnóstico honesto de conexão conforme `LAN-21`.

---

## 8. Extensão Opcional: SLM Cooperativa P2P

Esta camada é **100% desacoplada** do renderizador Diorama e ativada apenas sob demanda (`vtt.slm`).

### 8.1 Modelo de Execução por Dispositivo
- **Celulares (Android e iOS): `0 MB` de modelo por padrão.** Consomem apenas respostas curtas e patches JSON enviados pelo WebRTC, sem competir por RAM com o WebGL2.
- **PCs voluntários (chave *"Compartilhar SLM com a mesa"*):**
  - **Modo WebGPU na aba (zero instalação):** indicado para notebooks/PCs comuns (`8–16 GB RAM`) com modelos quantizados em 4 bits de `1,5B` a `4B` em cache local.
  - **Modo Loopback `127.0.0.1` (avançado):** conecta a um servidor local `OpenAI-compatible` já mantido pelo usuário no PC (suportando modelos `7B–14B`, contexto longo e persistência mesmo após `F5`).

### 8.2 Orquestração Cooperativa e Escala Orgânica (`slm-router.js`)
Cada PC voluntário anuncia no canal da mesa suas capacidades suportadas por tags (`chat`, `json`, `embed`, `voz`, `img`) e seu estado de disponibilidade:
- **1 PC:** atende resumos de sessão, consultas de regras (RAG local) e falas curtas de NPC para o grupo inteiro.
- **3 PCs básicos:** dividem papéis com janelas de contexto enxutas e focadas (**Árbitro/Escriba**, **Elenco de NPCs** e **Improviso/Acessibilidade**), com execução paralela e *failover* automático em caso de queda.
- **5 PCs (especialmente com GPU dedicada):** habilitam pré-geração em segundo plano da próxima sala, busca semântica (embeddings), transcrição/síntese de voz e geração sob demanda de retratos/standees.

### 8.3 Controles de Privacidade, Segurança e Confiança
1. **Isolamento de segredos do Mestre:** consultas marcadas como privadas do Mestre (notas ocultas, preparação de armadilhas, DMs) **jamais** são roteadas para o PC de outro jogador — executam apenas localmente na máquina do próprio Mestre.
2. **Transparência de roteamento:** a UI informa explicitamente qual par da mesa processou uma requisição compartilhada, com opção individual de não enviar mensagens pessoais à fila de IA.
3. **Proteção de GPU voluntária:** `slm-router.js` aplica fila justa, *rate-limit* por participante, limite máximo de tokens de entrada/saída (`60–200` tokens por padrão em diálogos) e botão instantâneo de pausa para o dono do PC.
4. **Validação estrita e confirmação humana:** todo patch JSON sugerido pela SLM (ex.: sala improvisada ou posicionamento de tokens) passa por validação determinística de schema (`slm-prompts.js`) e só altera a cena após **aprovação explícita do Mestre**.

---

## 9. Orçamento de Recursos e Conformidade de CI

| Métrica / Portão | Teto / Exigência |
|---|---|
| Precache inicial (`SHELL_ASSETS`) | `0 byte` (carregamento 100% lazy) |
| Peso do pacote `dungeon/diorama/` | `<= 25 KB` fonte (`<= 9 KB` gzip) |
| Peso do pacote `dungeon/fairplay/` | `<= 8 KB` fonte |
| Peso do pacote `dungeon/slm/` | `<= 10 KB` fonte (`0` modelo no repositório) |
| Novas dependências em `package.json` | `0` (`LAN-20`) |
| *Draw calls* por quadro (cena típica) | `<= 6` |
| Reconstrução de geometria (100 paredes + 30 tokens) | `< 4 ms` |
| Tempo de quadro em movimento (Android de entrada) | `< 8 ms` (alvo 60 FPS) |
| Teto defensivo de VRAM | `<= 32 MB` (textura de mapa `<= 2048×2048`) |
| Portões obrigatórios de CI | `npm run lint:all`, `npm run audit:docs`, `npm run audit:layers`, `node scripts/innerhtml-audit.mjs`, `tests/shell-reachability.test.js`, `tests/release-metadata-drift.test.js` |

---

## 10. Plano de Entrega Incremental (5 Fases Reversíveis)

Cada fase entrega valor independente atrás das flags locais `vtt.diorama` e `vtt.slm`, respeitando a regra do roadmap de no máximo 2 frentes de código simultâneas:

| Fase | Escopo | Critério de Aceite (DoD) |
|---|---|---|
| **Fase 0 — Núcleo Puro e Fairplay** | Schema JSON retrocompatível; `diorama-math.js`, `diorama-geom.js`, `diorama-camera.js`, `dice-commit.js`, `fog-filter.js` | 100% de testes unitários verdes em Node; cena 2D legada abre sem erro; prova de não-vazamento de tokens ocultos no `fog-filter` e prova de detecção de fraude no `dice-commit` |
| **Fase 1 — Mesa 3D e Standees** | `diorama-gl.js` e `diorama-view.js` mínimos (plano do mapa, tokens `standee`/`flat`, arraste *ray-plane* e alternador lazy `2D \| Iso \| 3D`) | Módulo fora de `SHELL_ASSETS` confirmado por `shell-reachability.test.js`; `<= 25 KB`; fallback automático para 2D testado em `webglcontextlost` |
| **Fase 2 — Paredes, Fog 2D e 1ª Pessoa** | Extrusão de `walls`/`doors`, *cutaway* automático, projeção da textura `R8` de Fog 2D e preset `1ª Pessoa` | Zero regressão de FPS em cena de 100 paredes + 30 tokens; portas abrem/fecham sincronizadas; *cutaway* desliga automaticamente em `1ª Pessoa` |
| **Fase 3 — Primitivas, Portais e Hardening Mobile** | Ferramentas para `box`/`cylinder`/`ramp`, presets de luz ambiente, `portals`, descrição acessível do entorno e gestos 2 dedos | Teste manual numerado validado em Android de entrada e iOS Safari sem recarregamento de aba por memória |
| **Fase 4 — SLM Cooperativa P2P (Opcional)** | `slm-router.js`, `slm-bridge.js` (`127.0.0.1` + WebGPU no PC) e `slm-prompts.js` (Escriba, NPCs com cartão JSON e Patch JSON com aprovação do Mestre) | Testes em Node provam *failover* de 3→2 nós, bloqueio de envio de notas privadas do Mestre a terceiros, *rate-limit* e rejeição de JSON malformado |

---

## 11. Riscos, Mitigações e Critérios de Pausa/Abandono

| Risco | Impacto | Mitigação |
|---|---|---|
| **Desvio de foco do caminho crítico 2026–2027** (`LAN-36` NLnet, `REV-12` parecer, piloto `G1`) | Alto | Tratar como **Candidata** até aceite formal; só abrir código em janela livre sem concorrer com entregas G1/NLnet |
| **CGNAT em redes móveis 4G/5G derrubar P2P da sessão** | Médio | Reutilizar diagnóstico honesto (`LAN-21`) e acoplar conectividade móvel garantida ao destravamento do TURN (`REV-10` / `INF-01`) |
| **Perda de contexto WebGL / limite de RAM no Safari iOS** | Médio | Loop *dirty flag*, teto `2048×2048`, descarte imediato de VRAM e fallback transparente para Canvas 2D |
| **Ergonomia touch confusa em telas pequenas** | Médio | `touch-action: none`, hit-area mínima `44×44 px`, separação rígida 1 dedo (token/pan) vs. 2 dedos (zoom/órbita) |
| **Abuso ou lentidão em PCs voluntários de SLM** | Baixo/Médio | Chave opt-in explícita, *rate-limit*, teto curto de tokens, pausa imediata pelo dono e degradação silenciosa sem travar a mesa |

### Critérios de Pausa ou Abandono
- **Pausar promoção para produção** se o pacote lazy `dungeon/diorama/` ultrapassar `25 KB`, se o desempenho cair abaixo de `30 FPS` em Android de entrada em cena padrão, ou se aumentar o tamanho do precache inicial (`SHELL_ASSETS`).
- **Desligar extensão `vtt.slm`** se testes reais mostrarem alta taxa de erro em JSON gerado por modelos `1,5B–3B` mesmo após validação ou atrito excessivo de configuração no PC do Mestre.

---

## 12. Decisões Pendentes para Aceite do Mantenedor

1. **Priorização no `ROADMAP.md`:** confirmar entrada como **Candidata** pós-corte `develop → main` e pós-submissão `LAN-36` (NLnet), ou autorizar desde já um protótipo isolado da **Fase 0** (apenas módulos puros + testes em Node, sem tocar `sw.js`).
2. **Alinhamento de nomes de flags:** confirmar os nomes `vtt.diorama` e `vtt.slm` (ou prefixo `vox.lab.*`, seguindo `vox.lab.aviso` / `vox.lab.moderador`).
3. **Política de `Fairplay`:** confirmar se `dice-commit.js` e `fog-filter.js` nascem já ativos para o VTT 2D base (beneficiando todas as mesas imediatamente, independentemente de ligarem o modo Diorama).
