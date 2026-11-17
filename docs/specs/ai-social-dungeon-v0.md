# AI Social Dungeon — Mesas P2P, Cota de 2 Comunidades Favoritas e Colunas de IA (v0)

> **Status:** parcial (a tela é **demonstração de laboratório sem IA** ([ADR-033](../adr/033-ia-so-no-rpg-local-primeiro.md)); módulos puros testados, mesa entre aparelhos ainda não) · **Owner:** mantenedor · **Revisado:** 2026-11-16
> Relacionados: [replicacao-por-grau-v0.md](./replicacao-por-grau-v0.md), [guardioes-v0.md](./guardioes-v0.md), `client/js/community-pillar-pool.js`, `client/js/rpg-sheet-and-lore.js`, `client/js/rpg-crypto-table.js`, `client/js/rpg-maritaca-router.js`, `client/js/dungeon/dungeon-controller.js`, `client/js/labs/ai-social-dungeon-lab.js`.

## 0. O que existe hoje (SW v7.122)

| Parte | Estado |
| :--- | :--- |
| As 4 telas (`#/dungeon…`, `#/labs/dungeon`) | **Demonstração** numa aba só: jogadores, guardiões e mesas são de exemplo; nada vai para a rede. |
| Narrador | **Roteiro fixo** (3 frases), sem IA. O selo na crônica diz "Roteiro". |
| d20 da tela | Sorteio de verdade neste aparelho (`crypto.getRandomValues` + amostragem sem viés). |
| Cofre de Shamir da tela | De verdade: `sealLoreVaultSecret` / `unlockLoreVaultSecret`, abre só com o gatilho do jogo e 3 de 5 partes. Na demo, as 5 partes ficam neste aparelho. |
| Ficha CRDT, lore `@tag`, inspetor por papel | Funções puras de verdade, rodando sobre dados de exemplo. |
| Commit-Reveal² entre jogadores, W-DRF, leases, DataChannels | Escritos e testados como funções puras; **não usados** (não há mesa com outros aparelhos). |
| Roteador Maritaca | Só monta rota e payload; **não faz chamada de rede** e não tem tela. Usar exige as regras do ADR-033. |

## 1. Visão geral

O módulo de laboratório **AI Social Dungeon** (`#/labs/dungeon`) combina utilitários local-first para mesas de RPG P2P no Vox com sustentação comunitária de disco e clock ocioso, sem exigir servidor central nem dependências npm externas.

Os contratos normativos estão divididos em quatro módulos puros de cliente e uma tela de laboratório:

1. **`client/js/community-pillar-pool.js`**: alocação de até 2 comunidades favoritas (`MAX_FAVORITE_COMMUNITIES = 2`), escalonador *Weighted Dominant Resource Fairness* (W-DRF) entre GPU/clock e disco/banda, eleição das 5 Colunas de Sustentação priorizando nós ociosos fora da sessão ("Nó de Acampamento" do membro ausente), leases de `10000 ms` sobre `WANT`/`HAVE`, estabilidade de fila MoA e separação em dois DataChannels WebRTC (`vox-rpg-ctrl` ≤ 2048 bytes e `vox-rpg-bulk` em blocos de 64 KiB).
2. **`client/js/rpg-sheet-and-lore.js`**: ficha CRDT com `delta_ledger` comutativo e redutor determinístico com `clamp()` (detectando `INVARIANT_CONFLICT_OVERDRAFT`), grafo bilateral de lore com `@tag` de personagem (`PENDING_BILATERAL`, `BILATERAL_CANON`, `DM_NOTARIZED`, `DISPUTED_LORE`) e ranqueador híbrido RRF + vizinhança 1-hop do DAG + memória espacial por quadrado `(map_id, grid_x, grid_y)`.
3. **`client/js/rpg-crypto-table.js`**: rolagens verificáveis **Commit-Reveal²** (≤ 1 RTT) com duplo hash SHA-256 ($c_o = \mathcal{H}(s)$, $c_v = \mathcal{H}(c_o)$), recuperação anti-abort via `client/js/shamir-gf256.js` (3-de-4), amostragem sem viés modular (*Unbiased Rejection Sampling*) e cofres de lore secreta 3-de-5 (`THRESHOLD_VAULT`) desbloqueados por predicado determinístico de estado.
4. **`client/js/rpg-maritaca-router.js`**: roteador híbrido de custo/qualidade entre SLM local (`TIER_0_LOCAL`, R$ 0,00) e API BYOK **Maritaca AI** (`TIER_1_BUDGET_CLOUD` com `sabiazinho-4` / `S5` e `TIER_2_CLIMAX_CLOUD` com `sabia-3`, suportando sufixo `-br-sp` com multiplicador `1.3×` para residência nacional), além de validador estrito para JSON plano XGrammar (`mechanical_reasoning` em 1ª posição).

---

## 2. Alocação de 2 Comunidades Favoritas & W-DRF (`community-pillar-pool.js`)

- Cada usuário pode marcar **no máximo 2 comunidades favoritas** (`MAX_FAVORITE_COMMUNITIES = 2`) com pesos percentuais $w_1 + w_2 \le 100\%$ aplicados sobre o teto de disco de `supporter-mode.js` (`clampDiskMb` e `dailyCapForDisk`).
- O escalonador **W-DRF** calcula, para cada comunidade favorita $c$, o uso normalizado de computação ($u_{\text{gpu},c}$) e de armazenamento/I/O ($u_{\text{io},c}$), determinando a fatia dominante ponderada:

$$S_c = \frac{\max(u_{\text{gpu}, c},\; u_{\text{io}, c})}{w_c / 100}$$

- A próxima tarefa (inferência de coluna SLM ou sincronização RAG) vai para a comunidade com menor $S_c$, evitando que sincronizações pesadas de uma comunidade esfomeiem uma sessão ao vivo da outra.
- **Guardas de elegibilidade do nó (`isPillarNodeEligible`):** exige Wi-Fi ativo, bateria carregando ou ≥ 50%, ausência de `deviceLost` WebGPU, ausência de `thermalThrottle` e duty-cycle abaixo do teto (`maxDutyCyclePct = 25%`).
- **Eleição das 5 Colunas (`assignPillarLeases`):**
  - `STAGE1_JUDGE_RULES` (Peer 1 — validação de regras e diffs JSON)
  - `STAGE1_LORE_RAG` (Peer 2 — índice híbrido RRF e memória espacial)
  - `STAGE1_NPC_ACTOR` (Peer 3 — reação tática de NPC sob visão parcial)
  - `STAGE1_ACT_DIRECTOR` (Peer 4 — ritmo narrativo / *Abstract Acts*)
  - `STAGE2_LEAD_NARRATOR` (Peer 5 — síntese final no nó de maior capacidade; ter chave de serviço externo **não** dá prioridade, ADR-033)
- **Prioridade ao "Nó de Acampamento":** membros ociosos que favoritaram a comunidade e estão fora da mesa ativa (`isIdleCampfireNode: true`, ex.: jogador que faltou à sessão com o PC na tomada) têm precedência para assumir as colunas do Estágio 1, poupando bateria dos jogadores ativos.
- **Failover `< 1 RTT` e Recibo do Acampamento:** `reassignFailedPillarLease` substitui imediatamente leases de nós que perdem GPU/rede usando backups elegíveis, enquanto `issueCampfireContributionReceipt` audita turnos, chunks RAG e tempo de GPU cedidos pelo membro ausente.
- **Estabilidade de fila MoA (`checkMoaQueueStability`):** verifica $((k + 1)M + 1)\lambda < 1/\alpha$ (com $M = 1$ camada propositora, $k \le 4$ colunas e timeout `STAGE1_TIMEOUT_MS = 1400`).

---

## 3. Ficha CRDT, Lore DAG Bilateral & RAG Híbrido (`rpg-sheet-and-lore.js`)

- Recursos consumíveis (`hp_current`, `hp_temp`, `currency_gp`, `spell_slot_l1..l3`, `xp`) nunca sofrem sobrescrita absoluta concorrente: cada mudança anexa uma operação assinada ao `delta_ledger` ordenada deterministicamente por `(lamport_clock, op_id)`:

$$V_{\text{effective}}(t) = \text{clamp}\Big(V_{\text{base}} + \sum_{k=1}^{t} \Delta_k,\; B_{\text{min}},\; B_{\text{max}}\Big)$$

- O `op_id` gerado é aleatório (`crypto.randomUUID()`), nunca derivado do tamanho do ledger ou da hora: dois jogadores no mesmo instante geravam o mesmo id e a junção dos ledgers descartava uma jogada como repetida. A idempotência vale para a **mesma** operação reenviada.
- Na demonstração, cada pessoa tem uma atestação por card de lore: confirmar de novo ou passar a contestar troca a anterior, sem somar testemunha.
- Se mutações concorrentes offline levarem a soma não truncada abaixo de $B_{\text{min}}$, as operações permanecem auditáveis no ledger e `overdraftConflicts` sinaliza `INVARIANT_CONFLICT_OVERDRAFT`.
- Menções `@char_id` em diários criam arestas inicialmente em `PENDING_BILATERAL`, transitando por atestação assinada para `BILATERAL_CANON` (`ACCEPT_CANON`), `DM_NOTARIZED` (`DM_NOTARIZE`) ou `DISPUTED_LORE` (`DISPUTE_CLAIM` com `dispute_fork_event_id`).
- **Ponte `TurnResolution → Sheet` e Empacotador 4-Tiers:** `applyTurnResolutionToSheet` grava mutações de `state_mutations` no `delta_ledger`, sincroniza condições e aplica `spatial_updates`; `packFourTierTurnContext` empacota o orçamento de 3.000 tokens combinando filtro Zero-Spoiler (Tier 1), memória espacial `(map_id, grid_x, grid_y)` (Tier 2), projeção `clamp()` da ficha (Tier 3) e fatos canônicos vs boatos `DISPUTED_LORE` (Tier 4).
- O ranqueamento de contexto filtra primeiro por `allowedPubkey` (Zero-Spoiler) e calcula:

$$\text{Score}_{\text{Vox}}(d) = \frac{1}{60 + \text{rank}_{\text{BM25}}(d)} + \frac{1}{60 + \text{rank}_{\text{vec}}(d)} + \gamma_{\text{graph}} \cdot \mathbb{I}(d \in \mathcal{N}_1) \cdot \tau(d)$$

onde $\tau(\text{BILATERAL\_CANON}) = \tau(\text{DM\_NOTARIZED}) = 1.0$, $\tau(\text{DISPUTED\_LORE}) = 0.5$ e $\tau(\text{PENDING\_BILATERAL}) = 0.35$.

---

## 4. Dados Commit-Reveal² & Cofres Shamir (`rpg-crypto-table.js`)

- Cada slot pré-comprometido gera $c_o = \text{SHA-256}(s)$ e $c_v = \text{SHA-256}(c_o)$, fatiando $s$ via `shamir-gf256.js` (padrão 3-de-4). Se um jogador cair ao ver uma rolagem desfavorável, o quórum reconstrói $s$ e valida $\text{SHA-256}(s) = c_o$.
- O digest final $\Omega_o = \text{SHA-256}(s_1 \parallel \dots \parallel s_n)$ é convertido para o dado solicitado (`d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`) por *Unbiased Rejection Sampling* em janelas de 32 bits, descartando valores $\ge \lfloor 2^{32} / D \rfloor \times D$.
- Cofres de lore (`THRESHOLD_VAULT`) exigem simultaneamente satisfação de um predicado determinístico de estado (`mapId`, `gridX`, `gridY`, `minRollTotal`, `requiredFlag`) e quórum Shamir (padrão 3-de-5) para reconstrução do segredo.
- **Particionamento epistêmico de prompts:** `buildBlindedPillarPrompt` cega o contexto enviado a cada Coluna de Sustentação para evitar que inspeção local de DevTools vaze segredos fora do papel atribuído.

---

## 5. Roteador Maritaca AI & Contratos JSON (`rpg-maritaca-router.js`)

- Calcula $C_{\text{turn}} \in [0, 1]$ e seleciona:
  - `TIER_0_LOCAL` ($C_{\text{turn}} < 0.35$ ou sem chave BYOK): SLM local a R$ 0,00.
  - `TIER_1_BUDGET_CLOUD` ($0.35 \le C_{\text{turn}} < 0.75$): `sabiazinho-4` (R$ 1,00 / R$ 4,00 por 1M) ou `S5`.
  - `TIER_2_CLIMAX_CLOUD` ($C_{\text{turn}} \ge 0.75$): `sabia-3` (R$ 5,00 / R$ 10,00 por 1M).
  - Residência nacional `-br-sp`: adiciona sufixo `-br-sp` e aplica multiplicador `1.3×`.
- **Fan-In MoA, Co-Mestre Silencioso e Adaptador HTTP:** `aggregateMoaStage1Proposals` consolida propostas paralelas em até `1400 ms` aceitando degradação graciosa ($k-1$); `buildOverhearingCoDmSuggestion` extrai cartões laterais silenciosos de regras/atmosfera (*Overhearing Agents* + *CALYPSO*); `buildInferenceHttpRequest` prepara o payload JSON Schema compatível com daemon local `127.0.0.1:11434` e API Maritaca AI.

### Os 3 JSON Schemas canônicos

#### 5.1. `VoxCRDTCharacterSheet`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vox.local/schemas/crdt-character-sheet.v1.json",
  "title": "VoxCRDTCharacterSheet",
  "type": "object",
  "required": [
    "schema_version",
    "character_id",
    "campaign_id",
    "owner_pubkey_p256",
    "attributes_lww",
    "pools_base",
    "delta_ledger",
    "inventory_orset",
    "spatial_state"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0.0" },
    "character_id": { "type": "string" },
    "campaign_id": { "type": "string" },
    "owner_pubkey_p256": { "type": "string" },
    "attributes_lww": { "type": "object" },
    "pools_base": { "type": "object" },
    "delta_ledger": { "type": "array" },
    "inventory_orset": { "type": "object" },
    "spatial_state": { "type": "object" }
  }
}
```

#### 5.2. `VoxLoreDAGNode`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vox.local/schemas/cross-tagged-lore-event.v1.json",
  "title": "VoxLoreDAGNode",
  "type": "object",
  "required": [
    "event_id",
    "campaign_id",
    "session_number",
    "turn_serial",
    "parent_event_ids",
    "timestamp_ms",
    "author_char_id",
    "author_pubkey_p256",
    "visibility",
    "content_body",
    "spatial_anchor",
    "cross_character_edges",
    "author_ecdsa_sig"
  ],
  "properties": {
    "event_id": { "type": "string" },
    "campaign_id": { "type": "string" },
    "session_number": { "type": "integer" },
    "turn_serial": { "type": "integer" },
    "parent_event_ids": { "type": "array" },
    "timestamp_ms": { "type": "integer" },
    "author_char_id": { "type": "string" },
    "author_pubkey_p256": { "type": "string" },
    "visibility": { "type": "object" },
    "content_body": { "type": "string" },
    "spatial_anchor": { "type": "object" },
    "cross_character_edges": { "type": "array" },
    "author_ecdsa_sig": { "type": "string" }
  }
}
```

#### 5.3. `VoxAIDMTurnResolution`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vox.local/schemas/ai-dm-turn-resolution.v1.json",
  "title": "VoxAIDMTurnResolution",
  "type": "object",
  "required": [
    "mechanical_reasoning",
    "action_legality",
    "rejection_explanation_ptbr",
    "dice_check_request",
    "state_mutations",
    "spatial_updates",
    "lore_tags_emitted",
    "whisper_handout",
    "narrative_prose_ptbr",
    "turn_control"
  ],
  "properties": {
    "mechanical_reasoning": { "type": "string", "maxLength": 280 },
    "action_legality": {
      "type": "string",
      "enum": ["LEGAL_RESOLVED", "REQUIRES_DICE_ROLL", "REJECTED_RULE_VIOLATION", "REJECTED_THEME_VIOLATION"]
    },
    "rejection_explanation_ptbr": { "type": ["string", "null"] },
    "dice_check_request": { "type": ["object", "null"] },
    "state_mutations": { "type": "array" },
    "spatial_updates": { "type": "array" },
    "lore_tags_emitted": { "type": "array" },
    "whisper_handout": { "type": ["object", "null"] },
    "narrative_prose_ptbr": { "type": "string" },
    "turn_control": {
      "type": "string",
      "enum": ["AWAIT_PLAYER_INPUT", "AWAIT_COMMIT_REVEAL_ROLL", "ADVANCE_INITIATIVE_TURN", "COMBAT_ENDED"]
    }
  }
}
```

---

## 6. Interface Segregada — Círculo Mágico e 4 Telas (`client/js/dungeon/*`)

Para separar visualmente ficção colaborativa P2P de debates e votações cívicas da Ágora, as rotas `#/dungeon*` (e `#/labs/dungeon`) montam a moldura isolada `.dungeon-sanctum` direto em `#app-root`, ocultando a barra lateral de feeds e exibindo barra fixa de retorno (`← Sair da Mesa · Voltar ao Vox`) + selo `MODO FICÇÃO · MESA DE RPG P2P (ISOLADO DO FEED CÍVICO)`.

| Tela | Rota | Foco Visual & Baixa Carga Cognitiva |
| :--- | :--- | :--- |
| **1. Acampamento dos Guardiões** | `#/dungeon` | Fogueira SVG offline, 5 guardiões de exemplo, recibo de exemplo, slider duplo de **2 comunidades favoritas (W-DRF)** e mesas da vizinhança. |
| **2. A Mesa de Jogo** | `#/dungeon/mesa/:id` | Vinheta da Cripta SVG, crônica epigráfica, bandeja D20 (sorteio local; Commit-Reveal² fica para mesa com outros aparelhos), chips de ação rápida e grade tática 5×5 interativa. |
| **3. Grimório da Ficha & Crônica `@tag`** | `#/dungeon/ficha/:charId` | Emblema SVG local, medidores CRDT (`clamp` anti-overdraft), mochila rápida, histórico e cards `@tag` (*Fato Confirmado* vs *Boato de Taverna*). |
| **4. Escudo do Mestre** | `#/dungeon/mestre/:id` | Aviso de que o escudo fica neste aparelho, painel "Roteiro fixo, sem IA" (sem seletor de modelo), dicas por regras, **cofre de Shamir 3-de-5 de verdade** e inspetor de contexto por papel. |

Todos os ícones e ilustrações vetoriais residem offline em `client/js/dungeon/rpg-illustrations.js`, sem dependências de CDNs externas ou telemetria de rede.
