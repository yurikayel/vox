/**
 * @file Roteador híbrido Local/Maritaca AI (`sabiazinho-4`, `sabia-3`, `S5`) e validador XGrammar.
 *
 * Mantém ~50% dos turnos em custo zero na SLM local e direciona apenas síntese narrativa de
 * média/alta complexidade para a API PT-BR da Maritaca (com suporte a residência `-br-sp`).
 *
 * @module rpg-maritaca-router
 * @see docs/specs/ai-social-dungeon-v0.md
 */

const REQUIRED_RESOLUTION_KEYS = [
  "mechanical_reasoning",
  "action_legality",
  "rejection_explanation_ptbr",
  "dice_check_request",
  "state_mutations",
  "spatial_updates",
  "lore_tags_emitted",
  "whisper_handout",
  "narrative_prose_ptbr",
  "turn_control",
];

const LEGALITY_ENUM = new Set([
  "LEGAL_RESOLVED",
  "REQUIRES_DICE_ROLL",
  "REJECTED_RULE_VIOLATION",
  "REJECTED_THEME_VIOLATION",
]);

const TURN_CONTROL_ENUM = new Set([
  "AWAIT_PLAYER_INPUT",
  "AWAIT_COMMIT_REVEAL_ROLL",
  "ADVANCE_INITIATIVE_TURN",
  "COMBAT_ENDED",
]);

const MARITACA_ENDPOINT = "https://chat.maritaca.ai/api/chat/inference";
const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:11434/v1/chat/completions";

/**
 * Catálogo de modelos e preços (R$ por 1 milhão de tokens) da Maritaca AI.
 * @type {Readonly<Record<string, {id: string, inputPer1M: number, outputPer1M: number, contextWindow: number}>>}
 */
export const MARITACA_MODELS = Object.freeze({
  sabiazinho4: { id: "sabiazinho-4", inputPer1M: 1.0, outputPer1M: 4.0, contextWindow: 128000 },
  sabia3: { id: "sabia-3", inputPer1M: 5.0, outputPer1M: 10.0, contextWindow: 128000 },
  s5: { id: "s5", inputPer1M: 0.5, outputPer1M: 2.5, contextWindow: 1000000 },
  s5Nano: { id: "s5-nano", inputPer1M: 0.1, outputPer1M: 0.6, contextWindow: 128000 },
});

/**
 * Multiplicador tarifário para execução estritamente em território brasileiro (`-br-sp`).
 * @type {number}
 */
export const BR_SP_RESIDENCY_MULTIPLIER = 1.3;

/**
 * Calcula a complexidade normalizada $C_{\text{turn}} \in [0, 1]$ do turno para roteamento.
 *
 * @param {object} [turnSignals={}] Sinais táticos e narrativos da rodada atual.
 * @returns {number} Escore entre `0` e `1`.
 */
export function computeTurnComplexityScore(turnSignals = {}) {
  let score = 0.15;
  if (turnSignals.isBossClimax) score += 0.45;
  if (turnSignals.vaultJustUnlocked) score += 0.35;
  if (turnSignals.hasDisputedLore) score += 0.2;
  if (turnSignals.isDialogueHeavy) score += 0.25;
  const combatants = Math.max(0, Number(turnSignals.combatantsCount) || 0);
  score += Math.min(0.25, combatants * 0.05);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function estimateCostBrl(spec, inTok, outTok, useBrSp) {
  const mult = useBrSp ? BR_SP_RESIDENCY_MULTIPLIER : 1;
  const raw = ((inTok * spec.inputPer1M + outTok * spec.outputPer1M) / 1000000) * mult;
  return Number(raw.toFixed(6));
}

function buildMaritacaRoute(tier, spec, routerOptions, defaults) {
  const useBrSp = Boolean(routerOptions.nationalResidencyBrSp);
  const inTok = Math.max(0, Number(routerOptions.inputTokens ?? defaults.inTok));
  const outTok = Math.max(0, Number(routerOptions.outputTokens ?? defaults.outTok));
  return {
    tier,
    modelId: useBrSp ? `${spec.id}-br-sp` : spec.id,
    endpoint: MARITACA_ENDPOINT,
    estimatedCostBrl: estimateCostBrl(spec, inTok, outTok, useBrSp),
    nationalResidencyBrSp: useBrSp,
  };
}

/**
 * Seleciona a rota de síntese narrativa entre Tier 0 (SLM local), Tier 1 (`sabiazinho-4`/`S5`) e Tier 2 (`sabia-3`).
 *
 * @param {number} complexityScore Escore $C_{\text{turn}} \in [0, 1]$ de {@link computeTurnComplexityScore}.
 * @param {object} [routerOptions={}] Preferências (`hasMaritacaKey`, `nationalResidencyBrSp`, `preferS5`, `localModelId`, `inputTokens`, `outputTokens`).
 * @returns {object} Decisão de roteamento com modelo, endpoint e custo estimado em R$.
 */
export function selectNarrativeRoute(complexityScore, routerOptions = {}) {
  const score = Number(complexityScore) || 0;
  if (score < 0.35 || !routerOptions.hasMaritacaKey) {
    return {
      tier: "TIER_0_LOCAL",
      modelId: String(routerOptions.localModelId || "qwen2.5-3b-instruct"),
      endpoint: String(routerOptions.localEndpoint || DEFAULT_LOCAL_ENDPOINT),
      estimatedCostBrl: 0,
      nationalResidencyBrSp: false,
    };
  }
  if (score < 0.75) {
    const spec = routerOptions.preferS5 ? MARITACA_MODELS.s5 : MARITACA_MODELS.sabiazinho4;
    return buildMaritacaRoute("TIER_1_BUDGET_CLOUD", spec, routerOptions, { inTok: 1000, outTok: 250 });
  }
  return buildMaritacaRoute("TIER_2_CLIMAX_CLOUD", MARITACA_MODELS.sabia3, routerOptions, { inTok: 1200, outTok: 350 });
}

function checkReasoningAndEnums(payload, errors) {
  const keys = Object.keys(payload);
  if (keys[0] !== "mechanical_reasoning") {
    errors.push("mechanical_reasoning deve ser a primeira propriedade do JSON XGrammar.");
  }
  const reasoning = payload.mechanical_reasoning;
  if (typeof reasoning !== "string" || !reasoning.trim() || reasoning.length > 280) {
    errors.push("mechanical_reasoning inválido (exige string não vazia com até 280 caracteres).");
  }
  if (!LEGALITY_ENUM.has(payload.action_legality)) errors.push("action_legality fora do enum permitido.");
  if (!TURN_CONTROL_ENUM.has(payload.turn_control)) errors.push("turn_control fora do enum permitido.");
}

function checkResolutionCollections(payload, errors) {
  if (!Array.isArray(payload.state_mutations)) errors.push("state_mutations deve ser array.");
  if (!Array.isArray(payload.spatial_updates)) errors.push("spatial_updates deve ser array.");
  if (!Array.isArray(payload.lore_tags_emitted)) errors.push("lore_tags_emitted deve ser array.");
  if (typeof payload.narrative_prose_ptbr !== "string") errors.push("narrative_prose_ptbr deve ser string.");
}

/**
 * Valida deterministicamente uma saída estruturada no contrato plano `VoxAIDMTurnResolution`.
 *
 * @param {object} payload Objeto JSON emitido pela SLM local ou pela API Maritaca.
 * @returns {{valid: boolean, errors: string[]}} Resultado da validação de contrato.
 */
export function validateTurnResolutionPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["Payload deve ser um objeto JSON plano."] };
  }
  const errors = [];
  for (const key of REQUIRED_RESOLUTION_KEYS) {
    if (!Object.hasOwn(payload, key)) errors.push(`Campo obrigatório ausente: ${key}.`);
  }
  checkReasoningAndEnums(payload, errors);
  checkResolutionCollections(payload, errors);
  return { valid: errors.length === 0, errors };
}

const EXPECTED_STAGE1_ROLES = [
  "STAGE1_JUDGE_RULES",
  "STAGE1_LORE_RAG",
  "STAGE1_NPC_ACTOR",
  "STAGE1_ACT_DIRECTOR",
];

function buildNarratorBrief(accepted) {
  const lines = accepted.map((p) => `[${p.role}] ${String(p.summaryPtBr || "").trim()}`);
  return lines.filter(Boolean).join("\n").slice(0, 4000);
}

/**
 * Agrega propostas paralelas do Estágio 1 MoA em até `stage1TimeoutMs`, com degradação k-1.
 *
 * @param {Array<object>} [proposals=[]] Propostas recebidas das colunas (`role`, `latencyMs`, `summaryPtBr`, `stateMutations`, `timedOut`).
 * @param {number} [stage1TimeoutMs=1400] Limite de latência para fan-in em ms.
 * @returns {{acceptedRoles: string[], droppedRoles: string[], degraded: boolean, quorumMet: boolean, stateMutations: Array<object>, narratorBriefPtBr: string}} Síntese para o Estágio 2.
 */
export function aggregateMoaStage1Proposals(proposals = [], stage1TimeoutMs = 1400) {
  const limitMs = Math.max(100, Number(stage1TimeoutMs) || 1400);
  const byRole = new Map();
  for (const prop of Array.isArray(proposals) ? proposals : []) {
    if (!prop?.role || prop.timedOut || Number(prop.latencyMs ?? 0) > limitMs) continue;
    byRole.set(prop.role, prop);
  }
  const accepted = EXPECTED_STAGE1_ROLES.map((r) => byRole.get(r)).filter(Boolean);
  const acceptedRoles = accepted.map((p) => p.role);
  const droppedRoles = EXPECTED_STAGE1_ROLES.filter((r) => !byRole.has(r));
  const stateMutations = accepted.flatMap((p) => (Array.isArray(p.stateMutations) ? p.stateMutations : []));
  return {
    acceptedRoles,
    droppedRoles,
    degraded: droppedRoles.length > 0,
    quorumMet: accepted.length >= 2,
    stateMutations,
    narratorBriefPtBr: buildNarratorBrief(accepted),
  };
}

const OVERHEAR_RULES = [
  { re: /procur|exam|investig|armadilh|altar/i, skill: "Investigação", dc: 15 },
  { re: /furtiv|escond|sil[eê]nc|espreit/i, skill: "Furtividade", dc: 14 },
  { re: /convenc|ment|persuad|amea[cç]|tavern/i, skill: "Persuasão", dc: 13 },
  { re: /atac|golp|espada|flech|magia/i, skill: "Ataque", dc: 14 },
];

/**
 * Gera um cartão lateral silencioso de Co-Mestre (padrão Overhearing Agents + CALYPSO).
 *
 * @param {object} [transcriptEntry={}] Turno falado/escrito (`text`, `speaker`, `locationName`, `hasDisputedRumor`).
 * @returns {{shouldIntervene: boolean, silentToolCall: object|null, sensoryOptionsPtBr: string[], rumorAlertPtBr: string|null}} Sugestão não intrusiva para o DM.
 */
export function buildOverhearingCoDmSuggestion(transcriptEntry = {}) {
  const text = String(transcriptEntry.text || "");
  const loc = String(transcriptEntry.locationName || "cena atual");
  const rule = OVERHEAR_RULES.find((r) => r.re.test(text)) || null;
  const hasRumor = Boolean(transcriptEntry.hasDisputedRumor);
  const shouldIntervene = Boolean(rule || hasRumor);
  const silentToolCall = rule
    ? { tool: "suggest_skill_check", speaker: String(transcriptEntry.speaker || "Jogador"), skill: rule.skill, suggestedDc: rule.dc }
    : hasRumor
      ? { tool: "flag_disputed_lore_npc", location: loc }
      : null;
  return {
    shouldIntervene,
    silentToolCall,
    sensoryOptionsPtBr: [
      `Som abafado ecoa pelas pedras úmidas em ${loc}.`,
      `Cheiro de ozônio e cera derretida denuncia movimento recente.`,
    ],
    rumorAlertPtBr: hasRumor ? "Há um boato DISPUTED_LORE ativo: NPCs podem reagir com versões contraditórias." : null,
  };
}

/**
 * Monta os parâmetros HTTP prontos para `fetch` contra daemon local (`127.0.0.1`) ou Maritaca AI.
 *
 * @param {object} [route={}] Decisão de rota retornada por {@link selectNarrativeRoute}.
 * @param {Array<object>} [messages=[]] Lista de mensagens `{ role, content }`.
 * @param {string} [apiKey=""] Chave BYOK opcional (Maritaca ou token local).
 * @returns {{url: string, method: string, headers: Object<string, string>, body: object}} Requisição estruturada.
 */
export function buildInferenceHttpRequest(route = {}, messages = [], apiKey = "") {
  const url = String(route.endpoint || DEFAULT_LOCAL_ENDPOINT);
  const headers = { "Content-Type": "application/json" };
  const cleanKey = String(apiKey || "").trim();
  if (cleanKey) {
    const isMaritaca = url.includes("maritaca.ai") || (route.tier && route.tier !== "TIER_0_LOCAL");
    headers.Authorization = isMaritaca ? `Key ${cleanKey}` : `Bearer ${cleanKey}`;
  }
  return {
    url,
    method: "POST",
    headers,
    body: {
      model: String(route.modelId || "qwen2.5-3b-instruct"),
      messages: Array.isArray(messages) ? messages : [],
      response_format: { type: "json_object" },
      temperature: route.tier === "TIER_0_LOCAL" ? 0.35 : 0.7,
    },
  };
}
