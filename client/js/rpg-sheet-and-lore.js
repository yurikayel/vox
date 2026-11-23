/**
 * @file Ficha CRDT com `delta_ledger` comutativo, Grafo Bilateral de Lore (`@tag`) e RAG Híbrido RRF.
 *
 * Mantém invariantes mecânicos em edições concorrentes offline via redutor `clamp()` determinístico,
 * previne god-modding com contra-assinaturas bilaterais e ranqueia memória da campanha por BM25 +
 * vetor + vizinhança 1-hop com filtro de visibilidade Zero-Spoiler.
 *
 * @module rpg-sheet-and-lore
 * @see docs/specs/ai-social-dungeon-v0.md
 */

const MENTION_RE = /@([a-zA-Z0-9_-]{2,32})/g;
const ATTESTATION_STATUS_MAP = {
  ACCEPT_CANON: "BILATERAL_CANON",
  DM_NOTARIZE: "DM_NOTARIZED",
  DISPUTE_CLAIM: "DISPUTED_LORE",
};

/**
 * Mapa padrão de limites superiores para cada recurso consumível da ficha CRDT.
 * @type {Readonly<Record<string, string>>}
 */
export const POOL_BOUNDS_MAP = Object.freeze({
  hp_current: "hp_max",
  hp_temp: "hp_temp_max",
  currency_gp: "UNBOUNDED",
  spell_slot_l1: "l1",
  spell_slot_l2: "l2",
  spell_slot_l3: "l3",
  xp: "UNBOUNDED",
});

/**
 * Pesos de confiança $\tau(d)$ aplicados ao boost de grafo por estado de atestação no DAG.
 * @type {Readonly<Record<string, number>>}
 */
export const LORE_TRUST_WEIGHTS = Object.freeze({
  BILATERAL_CANON: 1.0,
  DM_NOTARIZED: 1.0,
  DISPUTED_LORE: 0.5,
  PENDING_BILATERAL: 0.35,
});

/**
 * Constante de suavização $k_{\text{RRF}}$ usada na fusão Reciprocal Rank Fusion.
 * @type {number}
 */
export const RRF_SMOOTHING_K = 60;

/**
 * Monta os máximos padrão dos recursos da ficha.
 * @param {object} [base={}] Valores base
 * @returns {object} Máximos dos recursos.
 */
function defaultPoolsBase(base = {}) {
  const slots = base.spell_slots_max || {};
  return {
    hp_max: Math.max(1, Number(base.hp_max) || 20),
    hp_temp_max: Math.max(0, Number(base.hp_temp_max) || 20),
    gold_initial: Math.max(0, Number(base.gold_initial) || 0),
    spell_slots_max: {
      l1: Math.max(0, Number(slots.l1) || 0),
      l2: Math.max(0, Number(slots.l2) || 0),
      l3: Math.max(0, Number(slots.l3) || 0),
    },
  };
}

/**
 * Normaliza os atributos (padrão 10 quando faltam).
 * @param {object} [abilities={}] Atributos
 * @returns {object} Atributos completos.
 */
function normalizeAbilities(abilities = {}) {
  const out = {};
  for (const key of ["str", "dex", "con", "int", "wis", "cha"]) {
    out[key] = Number(abilities[key]) || 10;
  }
  return out;
}

/**
 * Monta os atributos padrão da ficha.
 * @param {object} [init={}] Valores iniciais
 * @returns {object} Atributos da ficha.
 */
function defaultAttributesLww(init = {}) {
  return {
    name: String(init.name || "Aventureiro"),
    ancestry: String(init.ancestry || "Humano"),
    class_name: String(init.class_name || "Guerreiro"),
    level: Math.max(1, Number(init.level) || 1),
    armor_class: Math.max(1, Number(init.armor_class) || 10),
    speed_ft: Math.max(0, Number(init.speed_ft) || 30),
    abilities: normalizeAbilities(init.abilities),
    conditions: Array.isArray(init.conditions) ? [...init.conditions] : [],
  };
}

/**
 * Monta o estado espacial padrão.
 * @param {object} [spatial={}] Posição informada
 * @returns {object} Estado espacial.
 */
function defaultSpatialState(spatial = {}) {
  return {
    map_id: String(spatial?.map_id || "taverna_01"),
    grid_x: Number(spatial?.grid_x) || 0,
    grid_y: Number(spatial?.grid_y) || 0,
    elevation_z: Number(spatial?.elevation_z) || 0,
  };
}

/**
 * Cria um documento inicial de ficha no contrato `VoxCRDTCharacterSheet`.
 *
 * @param {object} [init={}] Dados iniciais do personagem, atributos, pools e posição.
 * @returns {object} Documento CRDT estruturado e pronto para mutações `delta_ledger`.
 */
export function createCharacterSheetDoc(init = {}) {
  return {
    schema_version: "1.0.0",
    character_id: String(init.character_id || "char_0000000000000001"),
    campaign_id: String(init.campaign_id || "camp_0000000000000001"),
    owner_pubkey_p256: String(init.owner_pubkey_p256 || ""),
    attributes_lww: defaultAttributesLww(init),
    pools_base: defaultPoolsBase(init.pools_base),
    delta_ledger: Array.isArray(init.delta_ledger) ? [...init.delta_ledger] : [],
    inventory_orset: init.inventory_orset ? { ...init.inventory_orset } : {},
    spatial_state: defaultSpatialState(init.spatial_state),
  };
}

/**
 * Normaliza uma operação de delta do livro-razão.
 * @param {object} opInput Operação bruta
 * @param {string} opId Id da operação
 * @param {number} fallbackClock Relógio lógico de reserva
 * @returns {object} Operação normalizada.
 */
function buildNormalizedDeltaOp(opInput, opId, fallbackClock) {
  const pool = String(opInput.target_pool || "hp_current");
  return {
    op_id: opId,
    lamport_clock: Math.max(1, Number(opInput.lamport_clock) || fallbackClock),
    target_pool: pool,
    delta: Math.trunc(Number(opInput.delta) || 0),
    min_bound: Math.trunc(Number(opInput.min_bound ?? 0)),
    max_bound_ref: String(opInput.max_bound_ref || POOL_BOUNDS_MAP[pool] || "UNBOUNDED"),
    reason: String(opInput.reason || "").slice(0, 120),
    roll_ref_id: opInput.roll_ref_id ?? null,
    actor_pubkey: String(opInput.actor_pubkey || ""),
    ecdsa_sig: String(opInput.ecdsa_sig || ""),
  };
}

/**
 * Acrescenta uma mutação assinada ao `delta_ledger` da ficha de forma idempotente por `op_id`.
 *
 * @param {object} sheetDoc Documento de ficha CRDT.
 * @param {object} [opInput={}] Operação com `op_id`, `lamport_clock`, `target_pool`, `delta`, etc.
 * @returns {object} Nova cópia da ficha com a operação incluída.
 */
export function appendPoolDeltaOp(sheetDoc, opInput = {}) {
  const ledger = Array.isArray(sheetDoc?.delta_ledger) ? sheetDoc.delta_ledger : [];
  const opId = String(opInput.op_id || "");
  if (!opId || ledger.some((item) => item.op_id === opId)) {
    return { ...sheetDoc, delta_ledger: [...ledger] };
  }
  const op = buildNormalizedDeltaOp(opInput, opId, ledger.length + 1);
  return { ...sheetDoc, delta_ledger: [...ledger, op] };
}

/**
 * Monta os valores iniciais dos recursos a partir dos máximos.
 * @param {object} base Valores base
 * @returns {object} Valores iniciais.
 */
function initialPoolValues(base) {
  const slots = base.spell_slots_max || {};
  return {
    hp_current: base.hp_max,
    hp_temp: 0,
    currency_gp: base.gold_initial,
    spell_slot_l1: slots.l1,
    spell_slot_l2: slots.l2,
    spell_slot_l3: slots.l3,
    xp: 0,
  };
}

/**
 * Resolve o teto de um recurso a partir da referência.
 * @param {string} ref Nome da referência
 * @param {object} base Valores base
 * @returns {number} Teto do recurso.
 */
function resolveMaxBound(ref, base) {
  const slots = base.spell_slots_max || {};
  if (ref === "hp_max") return base.hp_max;
  if (ref === "hp_temp_max") return base.hp_temp_max;
  if (ref === "spell_slots_max.l1" || ref === "l1") return slots.l1;
  if (ref === "spell_slots_max.l2" || ref === "l2") return slots.l2;
  if (ref === "spell_slots_max.l3" || ref === "l3") return slots.l3;
  return Infinity;
}

/**
 * Ordena as operações do livro-razão pelo relógio lógico.
 * @param {object[]} deltaLedger Operações
 * @returns {object[]} Operações ordenadas.
 */
function sortLedgerOps(deltaLedger) {
  return [...deltaLedger].sort((a, b) => {
    const clockDiff = (Number(a.lamport_clock) || 0) - (Number(b.lamport_clock) || 0);
    if (clockDiff !== 0) return clockDiff;
    return String(a.op_id || "").localeCompare(String(b.op_id || ""));
  });
}

/**
 * Soma os deltas por recurso, com os limites mínimo e máximo.
 * @param {object[]} ops Operações ordenadas
 * @returns {object} Somas, mínimos e referências de máximo.
 */
function accumulatePoolDeltas(ops) {
  const sums = {};
  const minBounds = {};
  const maxRefs = {};
  for (const op of ops) {
    const pool = op?.target_pool;
    if (!pool) continue;
    sums[pool] = (sums[pool] || 0) + (Math.trunc(Number(op.delta) || 0));
    minBounds[pool] = Math.max(minBounds[pool] ?? 0, Math.trunc(Number(op.min_bound ?? 0)));
    maxRefs[pool] = op.max_bound_ref || POOL_BOUNDS_MAP[pool] || "UNBOUNDED";
  }
  return { sums, minBounds, maxRefs };
}

/**
 * Redutor determinístico com `clamp()` que projeta recursos consumíveis e detecta conflito de overdraft.
 *
 * @param {object} [poolsBase={}] Tetos base da época da ficha.
 * @param {Array<object>} [deltaLedger=[]] Lista de operações assinadas do `delta_ledger`.
 * @returns {{pools: Object<string, number>, overdraftConflicts: Array<object>, orderedOpsCount: number}} Projeção efetiva.
 */
export function projectCharacterPools(poolsBase = {}, deltaLedger = []) {
  const base = defaultPoolsBase(poolsBase);
  const initial = initialPoolValues(base);
  const ordered = sortLedgerOps(Array.isArray(deltaLedger) ? deltaLedger : []);
  const { sums, minBounds, maxRefs } = accumulatePoolDeltas(ordered);
  const pools = {};
  const overdraftConflicts = [];
  for (const [pool, startVal] of Object.entries(initial)) {
    const minB = minBounds[pool] ?? 0;
    const maxB = resolveMaxBound(maxRefs[pool] || POOL_BOUNDS_MAP[pool], base);
    const unclamped = startVal + (sums[pool] || 0);
    const clamped = Math.max(minB, Math.min(maxB, unclamped));
    pools[pool] = clamped;
    if (unclamped < minB) {
      overdraftConflicts.push({
        code: "INVARIANT_CONFLICT_OVERDRAFT",
        targetPool: pool,
        unclampedValue: unclamped,
        minBound: minB,
        clampedValue: clamped,
      });
    }
  }
  return { pools, overdraftConflicts, orderedOpsCount: ordered.length };
}

/**
 * Extrai menções `@personagem` de um relato e cria arestas pendentes de contra-assinatura bilateral.
 *
 * @param {string} [contentBody=""] Texto do diário ou log de sessão.
 * @param {Object<string, object>} [knownChars={}] Mapa opcional `{ slug: { characterId, ownerPubkey, relationType } }`.
 * @returns {Array<object>} Arestas no estado inicial `PENDING_BILATERAL`.
 */
export function extractCrossCharacterMentions(contentBody = "", knownChars = {}) {
  const text = String(contentBody || "");
  const edges = [];
  const seenTargets = new Set();
  for (const match of text.matchAll(MENTION_RE)) {
    const slug = match[1];
    const info = knownChars[slug] || {};
    const targetCharId = String(info.characterId || slug);
    if (seenTargets.has(targetCharId)) continue;
    seenTargets.add(targetCharId);
    edges.push({
      target_char_id: targetCharId,
      target_owner_pubkey: String(info.ownerPubkey || ""),
      relation_type: String(info.relationType || "MENTIONED"),
      trust_status: "PENDING_BILATERAL",
      attestation: null,
    });
  }
  return edges;
}

/**
 * Diz se a aresta do grafo corresponde ao atestado.
 * @param {object} edge Aresta
 * @param {object} attestation Atestado
 * @returns {boolean} `true` se corresponde.
 */
function edgeMatchesAttestation(edge, attestation) {
  if (attestation.target_char_id && edge.target_char_id === attestation.target_char_id) return true;
  if (!attestation.target_char_id && attestation.signer_pubkey) {
    return edge.target_owner_pubkey === attestation.signer_pubkey;
  }
  return false;
}

/**
 * Aplica contra-assinatura bilateral ou contestação sobre uma aresta `@tag` do nó de lore.
 *
 * @param {object} loreNode Nó `VoxLoreDAGNode` com `cross_character_edges`.
 * @param {object} [attestation={}] Atestação (`decision`, `signer_pubkey`, `target_char_id`, `ecdsa_countersig`).
 * @returns {object} Cópia atualizada do nó com o novo `trust_status` da aresta.
 */
export function applyLoreEdgeAttestation(loreNode, attestation = {}) {
  const nextStatus = ATTESTATION_STATUS_MAP[attestation.decision];
  const edges = Array.isArray(loreNode?.cross_character_edges) ? loreNode.cross_character_edges : [];
  if (!nextStatus) return { ...loreNode, cross_character_edges: edges.map((e) => ({ ...e })) };
  const normalizedAttest = {
    signer_pubkey: String(attestation.signer_pubkey || ""),
    decision: attestation.decision,
    dispute_fork_event_id: attestation.dispute_fork_event_id ?? null,
    signed_at_ms: Number(attestation.signed_at_ms) || Date.now(),
    ecdsa_countersig: String(attestation.ecdsa_countersig || ""),
  };
  const updatedEdges = edges.map((edge) =>
    edgeMatchesAttestation(edge, attestation)
      ? { ...edge, trust_status: nextStatus, attestation: normalizedAttest }
      : { ...edge },
  );
  return { ...loreNode, cross_character_edges: updatedEdges };
}

/**
 * Diz se o trecho de lore pode ser visto pelo par.
 * @param {object} chunk Trecho
 * @param {string} allowedPubkey Chave pública do par
 * @returns {boolean} `true` se visível.
 */
function isChunkVisibleToPeer(chunk, allowedPubkey) {
  const vis = chunk?.visibility || {};
  const mode = vis.mode || "PUBLIC_TABLE";
  if (mode === "PUBLIC_TABLE") return true;
  const list = Array.isArray(vis.allowed_pubkeys) ? vis.allowed_pubkeys : [];
  return Boolean(allowedPubkey && list.includes(allowedPubkey));
}

/**
 * Quebra o texto em termos de busca em minúsculas.
 * @param {string} text Texto
 * @returns {string[]} Termos com 2 ou mais caracteres.
 */
function tokenizeTerms(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9áéíóúâêôãõç_]+/i).filter((t) => t.length >= 2);
}

/**
 * Calcula a sobreposição lexical entre o trecho e a consulta.
 * @param {string} chunkText Texto do trecho
 * @param {string[]} queryTerms Termos da consulta
 * @returns {number} Pontuação.
 */
function lexicalOverlapScore(chunkText, queryTerms) {
  if (!queryTerms.length) return 0;
  const terms = new Set(tokenizeTerms(chunkText));
  let hits = 0;
  for (const qt of queryTerms) {
    if (terms.has(qt)) hits += 1;
  }
  return hits / queryTerms.length;
}

/**
 * Calcula a vizinhança do trecho (entidades ativas e posição).
 * @param {object} chunk Trecho
 * @param {Set<string>} activeCharIds Personagens ativos
 * @param {object} anchor Âncora espacial
 * @returns {object} Vizinhança calculada.
 */
function computeChunkNeighbors(chunk, activeCharIds, anchor) {
  const chunkEntities = Array.isArray(chunk.entityIds) ? chunk.entityIds : [];
  const sharesEntity = chunkEntities.some((id) => activeCharIds.has(id));
  const sa = chunk.spatialAnchor || {};
  const nearSpatial = Boolean(
    anchor?.map_id &&
      sa.map_id === anchor.map_id &&
      Math.abs((sa.grid_x ?? 999) - anchor.grid_x) <= 2 &&
      Math.abs((sa.grid_y ?? 999) - anchor.grid_y) <= 2,
  );
  return sharesEntity || nearSpatial ? 1 : 0;
}

/**
 * Atribui a posição (1 é o maior valor) a cada item.
 * @param {object[]} items Itens com `id`
 * @param {Function} valueFn Devolve o valor de um item
 * @returns {Map<string, number>} Posição por id.
 */
function assignRanks(items, valueFn) {
  const sorted = [...items].sort((a, b) => valueFn(b) - valueFn(a));
  const map = new Map();
  sorted.forEach((entry, idx) => map.set(entry.id, idx + 1));
  return map;
}

/**
 * Ranqueia fragmentos de lore combinando BM25 + vetor via RRF e boost 1-hop com filtro Zero-Spoiler.
 *
 * @param {Array<object>} [chunks=[]] Chunks candidatos indexados no aparelho.
 * @param {object} [queryContext={}] Contexto (`queryText`, `allowedPubkey`, `activeCharIds`, `spatialAnchor`, `maxTokens`, `graphBoost`).
 * @returns {{selected: Array<object>, totalTokens: number, droppedPrivateCount: number}} Seleção dentro do orçamento.
 */
export function rankLoreChunksHybridRrf(chunks = [], queryContext = {}) {
  const list = Array.isArray(chunks) ? chunks : [];
  const visible = list.filter((c) => isChunkVisibleToPeer(c, queryContext.allowedPubkey));
  const droppedPrivateCount = list.length - visible.length;
  const queryTerms = tokenizeTerms(queryContext.queryText);
  const bm25Ranks = assignRanks(visible, (c) => c.bm25Score ?? lexicalOverlapScore(c.text, queryTerms));
  const vecRanks = assignRanks(visible, (c) => Number(c.vecScore) || 0);
  const activeSet = new Set(Array.isArray(queryContext.activeCharIds) ? queryContext.activeCharIds : []);
  const graphBoost = Number(queryContext.graphBoost ?? 0.02);
  const scored = visible.map((chunk) => {
    const rrf = 1 / (RRF_SMOOTHING_K + bm25Ranks.get(chunk.id)) + 1 / (RRF_SMOOTHING_K + vecRanks.get(chunk.id));
    const tau = LORE_TRUST_WEIGHTS[chunk.trustStatus] ?? 1.0;
    const neighbor = computeChunkNeighbors(chunk, activeSet, queryContext.spatialAnchor);
    return { ...chunk, rrfScore: Number((rrf + graphBoost * neighbor * tau).toFixed(6)) };
  });
  scored.sort((a, b) => b.rrfScore - a.rrfScore);
  return packChunksWithinBudget(scored, Number(queryContext.maxTokens) || 1200, droppedPrivateCount);
}

/**
 * Escolhe os trechos que cabem no orçamento de tokens.
 * @param {object[]} scored Trechos pontuados
 * @param {number} maxTokens Orçamento de tokens
 * @param {number} droppedPrivateCount Trechos privados já descartados
 * @returns {object} Trechos escolhidos e contagens.
 */
function packChunksWithinBudget(scored, maxTokens, droppedPrivateCount) {
  const selected = [];
  let totalTokens = 0;
  for (const chunk of scored) {
    const est = Number(chunk.tokens) || Math.max(1, Math.ceil(String(chunk.text || "").length / 4));
    if (totalTokens + est > maxTokens && selected.length > 0) continue;
    selected.push(chunk);
    totalTokens += est;
  }
  return { selected, totalTokens, droppedPrivateCount };
}

/**
 * Atualiza a lista de condições, somando as novas e tirando as removidas.
 * @param {string[]} currentList Condições atuais
 * @param {string[]} [added=[]] Condições novas
 * @param {string[]} [removed=[]] Condições removidas
 * @returns {string[]} Lista atualizada.
 */
function syncConditionsList(currentList, added = [], removed = []) {
  const next = new Set(Array.isArray(currentList) ? currentList : []);
  for (const item of Array.isArray(added) ? added : []) if (item) next.add(String(item));
  for (const item of Array.isArray(removed) ? removed : []) next.delete(String(item));
  return [...next];
}

/**
 * Aplica uma mutação de turno ao documento da ficha.
 * @param {object} doc Documento da ficha
 * @param {object} mut Mutação
 * @param {string} actorPubkey Chave pública de quem age
 * @returns {object} Documento atualizado.
 */
function applySingleTurnMutation(doc, mut, actorPubkey) {
  if (!mut || (mut.character_id && mut.character_id !== doc.character_id)) return doc;
  let next = doc;
  if (mut.target_pool && mut.delta !== undefined) {
    // Id aleatório: derivado do tamanho do histórico, dois jogadores geravam o mesmo e o merge perdia um.
    const opId = String(mut.op_id || `turn_${crypto.randomUUID()}_${mut.target_pool}`);
    next = appendPoolDeltaOp(next, { ...mut, op_id: opId, actor_pubkey: mut.actor_pubkey || actorPubkey });
  }
  if (mut.conditions_added || mut.conditions_removed) {
    const conditions = syncConditionsList(next.attributes_lww?.conditions, mut.conditions_added, mut.conditions_removed);
    next = { ...next, attributes_lww: { ...next.attributes_lww, conditions } };
  }
  return next;
}

/**
 * Aplica `state_mutations` e `spatial_updates` de um turno validado sobre a ficha CRDT.
 *
 * @param {object} sheetDoc Documento de ficha CRDT atual.
 * @param {object} [turnResolution={}] Saída no contrato `VoxAIDMTurnResolution`.
 * @param {string} [actorPubkey=""] Chave pública P-256 emissora padrão para novas operações.
 * @returns {object} Nova cópia da ficha CRDT com ledger, condições e posição atualizados.
 */
export function applyTurnResolutionToSheet(sheetDoc, turnResolution = {}, actorPubkey = "") {
  let next = sheetDoc && typeof sheetDoc === "object" ? sheetDoc : createCharacterSheetDoc();
  const mutations = Array.isArray(turnResolution?.state_mutations) ? turnResolution.state_mutations : [];
  mutations.forEach((mut) => {
    next = applySingleTurnMutation(next, mut, actorPubkey);
  });
  const spatialUpdates = Array.isArray(turnResolution?.spatial_updates) ? turnResolution.spatial_updates : [];
  const matching = spatialUpdates.find((u) => u && (!u.character_id || u.character_id === next.character_id));
  if (matching) next = { ...next, spatial_state: defaultSpatialState({ ...next.spatial_state, ...matching }) };
  return next;
}

/**
 * Diz se o evento está a até 2 casas da âncora, no mesmo mapa.
 * @param {object} ev Evento
 * @param {object} anchor Âncora
 * @returns {boolean} `true` se for vizinho.
 */
function isSameTileNeighborhood(ev, anchor) {
  if (!ev || !anchor?.map_id || ev.map_id !== anchor.map_id) return false;
  return Math.abs((ev.grid_x ?? 999) - anchor.grid_x) <= 2 && Math.abs((ev.grid_y ?? 999) - anchor.grid_y) <= 2;
}

/**
 * Empacota o contexto de turno nos 4 Tiers (3.000 tokens): Zero-Spoiler, Espacial, Ficha e RAG.
 *
 * @param {object} [contextInput={}] Entradas (`sheetDoc`, `loreChunks`, `queryText`, `allowedPubkey`, `spatialMemory`, `globalPlotSummary`, `lastThreePhases`, `maxLoreTokens`).
 * @returns {object} Pacote estruturado em 4 níveis pronto para particionamento nas Colunas IA.
 */
export function packFourTierTurnContext(contextInput = {}) {
  const sheet = contextInput.sheetDoc || createCharacterSheetDoc();
  const anchor = defaultSpatialState(sheet.spatial_state);
  const proj = projectCharacterPools(sheet.pools_base, sheet.delta_ledger);
  const ranked = rankLoreChunksHybridRrf(contextInput.loreChunks, {
    queryText: contextInput.queryText || "",
    allowedPubkey: contextInput.allowedPubkey || "",
    activeCharIds: [sheet.character_id],
    spatialAnchor: anchor,
    maxTokens: Number(contextInput.maxLoreTokens) || 1200,
  });
  const phases = Array.isArray(contextInput.lastThreePhases) ? contextInput.lastThreePhases.slice(-3) : [];
  const localEvents = (Array.isArray(contextInput.spatialMemory) ? contextInput.spatialMemory : []).filter((e) =>
    isSameTileNeighborhood(e, anchor),
  );
  return {
    tokenBudgetTotal: 3000,
    tier1Entitlement: { allowedPubkey: String(contextInput.allowedPubkey || ""), droppedPrivateCount: ranked.droppedPrivateCount },
    tier2SpatialMemory: { globalPlotSummary: String(contextInput.globalPlotSummary || ""), lastThreePhases: phases, anchor, localEvents },
    tier3PartySheet: { characterId: sheet.character_id, name: sheet.attributes_lww?.name, pools: proj.pools, conditions: sheet.attributes_lww?.conditions || [], overdraftConflicts: proj.overdraftConflicts },
    tier4LoreRrf: { selected: ranked.selected, canonicalFacts: ranked.selected.filter((c) => c.trustStatus !== "DISPUTED_LORE"), disputedRumors: ranked.selected.filter((c) => c.trustStatus === "DISPUTED_LORE"), totalTokens: ranked.totalTokens },
  };
}
