/**
 * @file Estado e ações da demonstração do AI Social Dungeon (laboratório).
 *
 * Demonstração honesta (ADR-033): tudo roda só nesta aba, com jogadores e guardiões de exemplo, e a
 * narração é um roteiro fixo, sem IA. São de verdade: o dado (sorteio sem viés com `crypto`), a ficha
 * CRDT e o cofre de Shamir (`sealLoreVaultSecret` / `unlockLoreVaultSecret`), com as partes neste aparelho.
 */
import {
  normalizeFavoriteAllocations,
  computeWeightedDrfSchedule,
  assignPillarLeases,
  reassignFailedPillarLease,
  issueCampfireContributionReceipt,
  checkMoaQueueStability,
} from "../community-pillar-pool.js";
import {
  createCharacterSheetDoc,
  appendPoolDeltaOp,
  projectCharacterPools,
  applyLoreEdgeAttestation,
  applyTurnResolutionToSheet,
  packFourTierTurnContext,
} from "../rpg-sheet-and-lore.js";
import {
  evaluateVaultTrigger,
  buildBlindedPillarPrompt,
  sampleUnbiasedDieFromDigest,
  sealLoreVaultSecret,
  unlockLoreVaultSecret,
} from "../rpg-crypto-table.js";
import { buildOverhearingCoDmSuggestion } from "../rpg-maritaca-router.js";
import { ensureSheetMeta } from "./vtt-schema.js";
import { createDefaultScene } from "./vtt-scene-schema.js";
import { createInitiativeState } from "./vtt-tactics-schema.js";
import { applyInventoryMutation, listInventoryItems, totalCarriedWeight } from "./vtt-inventory.js";

/** Selo do narrador na crônica: é roteiro fixo, não IA (ADR-033). */
export const NARRATOR_BADGE = "Roteiro";

/** Segredo do mestre na demonstração. Só existe em claro aqui e depois de aberto pelas partes. */
const VAULT_DEMO_SECRET = "O antigo sino sob a praça foi silenciado pelo próprio Conselho de Pedra para ocultar a nascente.";

const VAULT_FAIL_PTBR = {
  trigger_not_met: "O gatilho ainda não foi cumprido: vá até [3, 1] com um d20 de 15 ou mais.",
  insufficient_shares: "Faltam partes para abrir o cofre.",
  commit_mismatch: "As partes não batem com o lacre: o cofre continua fechado.",
};

const DEFAULT_PEER_FAVS = [{ communityId: "vila-teste", weightPct: 60 }, { communityId: "bela-vista", weightPct: 40 }];
const HEALTHY_STATUS = { wifi: true, charging: true, batteryLevel: 0.92, dutyCycleUsedPct: 8 };

const BASE_MANIFESTS = [
  { peerId: "peer-ana", alias: "Ana · Nó Fogueira", tokensPerSec: 32, vramMb: 4096, isIdleCampfireNode: true, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
  { peerId: "peer-bruno", alias: "Bruno · Nó Crônica", tokensPerSec: 28, vramMb: 4096, isIdleCampfireNode: true, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
  { peerId: "peer-carla", alias: "Carla · Nó Personagens", tokensPerSec: 22, vramMb: 3072, isIdleCampfireNode: false, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
  { peerId: "peer-diego", alias: "Diego · Nó Ritmo", tokensPerSec: 29, vramMb: 4096, isIdleCampfireNode: true, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
  { peerId: "peer-elena", alias: "Elena · Nó Narrador", tokensPerSec: 44, vramMb: 8192, isIdleCampfireNode: false, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
  { peerId: "peer-felipe", alias: "Felipe · Backup Local", tokensPerSec: 35, vramMb: 6144, isIdleCampfireNode: true, status: HEALTHY_STATUS, favorites: DEFAULT_PEER_FAVS },
];

const INITIAL_CHRONICLE = [
  {
    id: "turn-01",
    speaker: "Guardião da Mesa",
    badge: "Cena Inicial",
    text: "As tochas lançam sombras úmidas sobre a água negra da Cripta. O altar de três olhos pulsa com runas frias.",
    rollNote: "Ambiente estável",
  },
  {
    id: "turn-02",
    speaker: "Lyra (Você)",
    badge: "Exploração",
    text: "Aproximo a lanterna das inscrições laterais procurando marcas recentes na pedra.",
    rollNote: "Investigação (d20 = 16)",
  },
];

const INITIAL_LORE_NODES = [
  {
    id: "lore-duque",
    targetCharId: "ermitao",
    tag: "@ermitão",
    title: "Identidade do Ermitão da Fonte",
    summary: "O ermitão cego guarda a chave da comporta e serviu como escrivão da antiga Vila Nova.",
    authorName: "Thiago · Mago",
    cross_character_edges: [{ target_char_id: "ermitao", trust_status: "DM_NOTARIZED" }],
    attestations: [
      { actorPubkey: "pk-thiago", verdict: "CONFIRM", reason: "Selo observado no diário" },
      { actorPubkey: "pk-dm", verdict: "DM_NOTARIZE", reason: "Fato canônico da campanha" },
    ],
    verified: true,
    disputed: false,
  },
  {
    id: "lore-ferreiro",
    targetCharId: "ferreiro",
    tag: "@ferreiro",
    title: "Ferreiro Vendeu Prata para os Goblins",
    summary: "Boato ouvido na taberna: alguém viu carroças deixando a forja depois da meia-noite.",
    authorName: "Marcos · Ladino",
    cross_character_edges: [{ target_char_id: "ferreiro", trust_status: "PENDING_BILATERAL" }],
    attestations: [{ actorPubkey: "pk-marcos", verdict: "CLAIM", reason: "Ouvi na taverna" }],
    verified: false,
    disputed: false,
  },
];

const STARTER_GEAR = [
  { itemId: "espada-ferro", label: "Espada de Ferro Limpo", qty: 1, weightLb: 1.5, equipped: true },
  { itemId: "lanterna-oleo", label: "Lanterna de Óleo", qty: 1, weightLb: 1, equipped: false },
  { itemId: "pocao-vigilia", label: "Poção de Vigília", qty: 1, weightLb: 0.5, equipped: false },
  { itemId: "corda-canhamo", label: "Corda de Cânhamo (10m)", qty: 1, weightLb: 2, equipped: false },
];

function createSeedSheet() {
  let doc = ensureSheetMeta(createCharacterSheetDoc({
    character_id: "lyra",
    name: "Lyra, A Espada da Vila",
    class_name: "Paladina de Vigília · Vila Teste",
    abilities: { str: 16, dex: 12, con: 14, int: 11, wis: 14, cha: 15 },
    pools_base: { hp_max: 24, gold_initial: 50, spell_slots_max: { l1: 3, l2: 1, l3: 0 } },
  }));
  for (const gear of STARTER_GEAR) doc = applyInventoryMutation(doc, "add", gear);
  const invItems = listInventoryItems(doc.inventory_orset);
  return {
    ...doc,
    char_id: "lyra",
    name: "Lyra, A Espada da Vila",
    role_title: "Paladina de Vigília · Vila Teste",
    attributes: { vitalidade: 16, astucia: 12, sabedoria: 14 },
    inventory: invItems.map((it) => it.label),
    inventoryItems: invItems,
    carryWeight: totalCarriedWeight(doc.inventory_orset),
  };
}

let activeSession = null;

function createInitialVaultSecret() {
  return {
    id: "vault-altar",
    title: "Segredo do Altar dos Três Olhos",
    ruleLabel: "Revela ao explorar a coordenada [3, 1] após um d20 >= 15.",
    threshold: 3,
    totalPeers: 5,
    sharesSubmitted: 0,
    unlocked: false,
    triggerMet: false,
    envelope: null,
    lastAttemptPtBr: "",
    trigger: { mapId: "cripta", gridX: 3, gridY: 1, minRollTotal: 15 },
    revealedText: "",
  };
}

function createNetworkDefaults(favorites, nowMs) {
  const leaseResult = assignPillarLeases(BASE_MANIFESTS, { communityId: "vila-teste", nowMs });
  const allocations = normalizeFavoriteAllocations(favorites, { supporter: true, maxMb: 1024 });
  const usage = { "vila-teste": { usedGpu: 0.35, usedIo: 0.25, capGpu: 1, capIo: 1 }, "bela-vista": { usedGpu: 0.2, usedIo: 0.4, capGpu: 1, capIo: 1 } };
  const drf = computeWeightedDrfSchedule(allocations, usage);
  const receipt = issueCampfireContributionReceipt({ communityId: "vila-teste", peerId: "peer-local", memberName: "Você", turnsServed: 6, ragChunksServed: 14, gpuSecondsLent: 900, nowMs });
  return { leases: leaseResult.leases, allocations, drf, receipt, stability: checkMoaQueueStability(0.45, 0.35, 3) };
}

function createSeedFavorites() {
  return [
    { id: "vila-teste", communityId: "vila-teste", name: "Vila Teste (Guilda)", weightPct: 60, sliderWeight: 60 },
    { id: "bela-vista", communityId: "bela-vista", name: "Bela Vista Ecológica", weightPct: 40, sliderWeight: 40 },
  ];
}

function createPersistenceDefaults() {
  return {
    campaignId: "",
    campaignDoc: null,
    campaigns: [],
    rolls: [],
    notes: [],
    scene: createDefaultScene("local"),
    initiative: createInitiativeState(),
    activeTool: "select",
    viewerRole: "gm",
    camera: { panX: 0, panY: 0, zoom: 1 },
    selectedTokenId: "",
    inviteHref: "",
    connectedPeersCount: 0,
    levelUpOpen: false,
    levelUpPreset: "d20_fantasy",
    mapNotice: "",
    rollMode: "normal",
    lastFormulaRoll: null,
    rollError: "",
    campaignNotice: "",
    pendingRestore: null,
    sheetEditIssues: [],
    sheetEditDraft: null,
    storageUsage: null,
    persistenceReady: false,
    localActor: "local",
  };
}

/**
 * Faz `campaignNotice` gravar também `noticePending`, o aviso que a região viva ainda não anunciou. O aviso visível
 * (`campaignNotice`) fica até outro o trocar; o pendente é zerado por quem anuncia. É instalado depois do literal do
 * estado porque o spread (`...overrides`, cópias do estado) acharia o acessador em um valor simples.
 * @param {object} state Estado da sessão.
 * @returns {object} O mesmo estado, com o acessador.
 */
function trackNoticePending(state) {
  let shown = state.campaignNotice ?? "";
  state.noticePending = shown;
  Object.defineProperty(state, "campaignNotice", {
    enumerable: true,
    configurable: true,
    get: () => shown,
    set: (v) => {
      shown = v;
      if (v) state.noticePending = v;
    },
  });
  return state;
}

/**
 * Cria um estado completo e independente para uma sessão do AI Social Dungeon.
 *
 * @param {object} [overrides={}] Sobrescritas opcionais de estado inicial.
 * @returns {object} Objeto de estado da sessão P2P RPG.
 */
export function createDungeonSessionState(overrides = {}) {
  const favorites = createSeedFavorites();
  const net = createNetworkDefaults(favorites, Date.now());
  return trackNoticePending({
    tableId: "vila-nova",
    tableName: "A Cripta sob a Vila Nova",
    communityName: "Vila Teste",
    sliderPct: 60,
    favorites,
    ...net,
    ...createPersistenceDefaults(),
    manifests: BASE_MANIFESTS,
    peerAliases: Object.fromEntries(BASE_MANIFESTS.map((m) => [m.peerId, m.alias])),
    failoverNotice: "Todos os 5 guardiões aquecendo a fogueira sem falhas.",
    sheet: createSeedSheet(),
    chronicle: [...INITIAL_CHRONICLE],
    playerPos: { x: 2, y: 3 },
    lastRoll: { dieSides: 20, value: 16, committed: false },
    coDmWhispers: buildOverhearingCoDmSuggestion({ speaker: "Lyra", text: "Examino as runas da porta antes de abrir", locationName: "Cripta Subterrânea", hasDisputedRumor: true }),
    vaultSecret: createInitialVaultSecret(),
    inspectedRole: "STAGE1_JUDGE_RULES",
    loreNodes: INITIAL_LORE_NODES.map((n) => ({ ...n })),
    ...overrides,
  });
}

/**
 * Retorna ou reinicializa a sessão ativa do AI Social Dungeon em memória.
 *
 * @param {boolean} [reset=false] Se verdadeiro, recria a sessão do zero.
 * @returns {object} Estado atual da sessão.
 */
export function getDungeonSession(reset = false) {
  if (!activeSession || reset) activeSession = createDungeonSessionState();
  return activeSession;
}

/**
 * Atualiza a divisão percentual entre as 2 comunidades favoritas e recalcula o agendamento W-DRF.
 *
 * @param {object} state Estado da sessão atual.
 * @param {number} pct Percentual (`0` a `100`) destinado à primeira comunidade favorita.
 * @returns {object} Estado atualizado.
 */
export function updateFavoriteSlider(state, pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  state.sliderPct = clamped;
  state.favorites = [
    { ...state.favorites[0], weightPct: clamped, sliderWeight: clamped },
    { ...state.favorites[1], weightPct: 100 - clamped, sliderWeight: 100 - clamped },
  ];
  state.allocations = normalizeFavoriteAllocations(state.favorites, { supporter: true, maxMb: 1024 });
  const usage = { "vila-teste": { usedGpu: 0.35, usedIo: 0.25, capGpu: 1, capIo: 1 }, "bela-vista": { usedGpu: 0.2, usedIo: 0.4, capGpu: 1, capIo: 1 } };
  state.drf = computeWeightedDrfSchedule(state.allocations, usage);
  return state;
}

/**
 * Simula queda de um guardião ativo e aciona failover automático para nó reserva.
 *
 * @param {object} state Estado da sessão atual.
 * @returns {object} Estado atualizado com nova locação e recibo incrementado.
 */
export function simulatePillarFailover(state) {
  const targetLease = state.leases[0];
  if (!targetLease) return state;
  const result = reassignFailedPillarLease(state.leases, targetLease.peerId, state.manifests, {
    communityId: state.favorites[0].id,
    nowMs: Date.now(),
  });
  state.leases = result.leases;
  const backupAlias = state.peerAliases[result.backupPeerIds?.[0]] || "Nó reserva";
  state.failoverNotice = `Falha simulada absorvida sem travar a mesa · ${backupAlias} assumiu o posto.`;
  state.receipt = issueCampfireContributionReceipt({
    communityId: state.favorites[0].id,
    peerId: "peer-local",
    memberName: "Você",
    turnsServed: (state.receipt.turnsServed || 6) + 1,
    ragChunksServed: 18,
    gpuSecondsLent: 960,
    nowMs: Date.now(),
  });
  return state;
}

/**
 * Rola um d20 neste aparelho: 32 bytes de `crypto.getRandomValues` e amostragem sem viés.
 * Não é o Commit-Reveal² entre jogadores (`resolveCommitReveal2Roll`), que pede outros aparelhos na mesa.
 *
 * @param {object} state Estado da sessão atual.
 * @param {Uint8Array} [randomBytes] Bytes aleatórios (testes podem fixar).
 * @returns {object} Novo estado com valor de D20 atualizado.
 */
export function performFairD20Roll(state, randomBytes = crypto.getRandomValues(new Uint8Array(32))) {
  const hex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  state.lastRoll = { dieSides: 20, value: sampleUnbiasedDieFromDigest(hex, 20), committed: false };
  markVaultTrigger(state);
  return state;
}

function markVaultTrigger(state) {
  const gameState = { mapId: "cripta", gridX: state.playerPos.x, gridY: state.playerPos.y, lastRollTotal: state.lastRoll.value };
  state.vaultSecret.triggerMet = evaluateVaultTrigger(gameState, state.vaultSecret.trigger).unlocked;
}

/**
 * Registra uma ação do jogador na crônica e aplica resposta mecânica via CRDT de ficha.
 *
 * @param {object} state Estado da sessão atual.
 * @param {string} actionText Texto da ação declarada pelo jogador.
 * @returns {object} Estado atualizado com novo turno na crônica e ficha projetada.
 */
export function submitTableAction(state, actionText) {
  const clean = String(actionText || "").trim();
  if (!clean) return state;
  const roll = performFairD20Roll(state).lastRoll.value;
  const coinDelta = /poção|comprar|pagar|moeda/i.test(clean) ? -5 : roll >= 16 ? 4 : 0;
  const hpDelta = /armadilha|cair|ferir|veneno/i.test(clean) ? -3 : /descans|curar|poção/i.test(clean) ? 4 : 0;
  state.chronicle.push({ id: `turn-${state.chronicle.length + 1}`, speaker: "Lyra (Você)", badge: "Ação do Turno", text: clean, rollNote: `d20 = ${roll}` });
  const outcome = coinDelta > 0
    ? "Seu movimento preciso revela algumas moedas antigas junto à fenda de pedra (+4 moedas)."
    : hpDelta > 0
      ? "Você retoma o fôlego e firma a guarda sob a luz âmbar (+4 PV)."
      : "O eco percorre a cripta; o altar responde com um zumbido baixo e atento.";
  state.chronicle.push({ id: `turn-dm-${state.chronicle.length + 1}`, speaker: "Narrador da Mesa", badge: NARRATOR_BADGE, text: outcome, rollNote: coinDelta ? `CRDT ${coinDelta > 0 ? "+" : ""}${coinDelta} moedas` : "Cena viva" });
  const mutations = [...(hpDelta ? [{ target_pool: "hp_current", delta: hpDelta, reason: clean.slice(0, 28) }] : []), ...(coinDelta ? [{ target_pool: "currency_gp", delta: coinDelta, reason: clean.slice(0, 28) }] : [])];
  if (mutations.length) state.sheet = { ...state.sheet, ...applyTurnResolutionToSheet(state.sheet, { state_mutations: mutations }, "pk-lyra") };
  state.coDmWhispers = buildOverhearingCoDmSuggestion({ speaker: "Lyra", text: clean, locationName: "Cripta Subterrânea", hasDisputedRumor: state.loreNodes.some((n) => !n.verified) });
  return state;
}

/**
 * Move o marcador do jogador na grade tática 5x5 e testa gatilhos de área.
 *
 * @param {object} state Estado da sessão atual.
 * @param {number} gridX Coordenada X (`0`–`4`).
 * @param {number} gridY Coordenada Y (`0`–`4`).
 * @returns {object} Estado atualizado.
 */
export function movePlayerOnGrid(state, gridX, gridY) {
  state.playerPos = { x: Math.max(0, Math.min(4, Number(gridX) || 0)), y: Math.max(0, Math.min(4, Number(gridY) || 0)) };
  markVaultTrigger(state);
  return state;
}

/**
 * Aplica alteração CRDT de recurso na ficha (compra normal ou teste de saldo insuficiente).
 *
 * @param {object} state Estado da sessão atual.
 * @param {string} poolKey Chave do recurso (`coins`/`currency_gp`, `hp_current`, `spell_slot_l1`).
 * @param {number} delta Valor delta a aplicar.
 * @param {string} reason Motivo legível no histórico da mesa.
 * @returns {object} Resultado da projeção CRDT (`pools`, `overdraftConflicts`).
 */
export function applySheetResourceDelta(state, poolKey, delta, reason) {
  const targetPool = poolKey === "coins" ? "currency_gp" : poolKey;
  const ledgerLen = state.sheet.delta_ledger?.length || 0;
  const updated = appendPoolDeltaOp(state.sheet, {
    // Aleatório, não hora + tamanho do histórico: dois jogadores no mesmo milissegundo geravam o mesmo id, e o
    // CRDT descarta o segundo como repetido.
    op_id: `op_${crypto.randomUUID()}`,
    lamport_clock: ledgerLen + 1,
    actor_pubkey: "pk-lyra",
    target_pool: targetPool,
    delta,
    reason,
  });
  state.sheet = { ...state.sheet, ...updated };
  return projectCharacterPools(state.sheet.pools_base, state.sheet.delta_ledger);
}

/**
 * Registra confirmação ou contestação bilateral em um card `@tag` de crônica.
 *
 * @param {object} state Estado da sessão atual.
 * @param {string} loreId Identificador do nó de lore.
 * @param {string} verdict `"CONFIRM"` ou `"REJECT"`.
 * @returns {object} Estado atualizado.
 */
export function attestLoreNodeInState(state, loreId, verdict) {
  const idx = state.loreNodes.findIndex((n) => n.id === loreId);
  if (idx < 0) return state;
  const current = state.loreNodes[idx];
  const decision = verdict === "CONFIRM" ? "ACCEPT_CANON" : "DISPUTE_CLAIM";
  const updated = applyLoreEdgeAttestation(current, { target_char_id: current.targetCharId, signer_pubkey: "pk-lyra", decision });
  const status = updated.cross_character_edges?.[0]?.trust_status || "PENDING_BILATERAL";
  // Uma atestação por pessoa: confirmar de novo (ou mudar para contestar) troca a anterior, não soma testemunha.
  const others = current.attestations.filter((a) => a.actorPubkey !== "pk-lyra");
  const nextAttest = [...others, { actorPubkey: "pk-lyra", verdict, reason: decision }];
  state.loreNodes[idx] = { ...current, ...updated, attestations: nextAttest, verified: status === "BILATERAL_CANON" || status === "DM_NOTARIZED", disputed: status === "DISPUTED_LORE" };
  return state;
}

/**
 * Tenta abrir o cofre de Shamir de verdade: sela o segredo em partes na primeira vez e só abre se o
 * gatilho do jogo estiver cumprido e as partes recompuserem o lacre. Na demonstração, as partes
 * ficam todas neste aparelho; numa mesa real, cada jogador guardaria a sua.
 *
 * @param {object} state Estado da sessão atual.
 * @returns {Promise<object>} Estado atualizado com o resultado da tentativa.
 */
export async function triggerShamirVaultUnlock(state) {
  const vault = state.vaultSecret;
  if (vault.unlocked) return state;
  vault.envelope ||= await sealLoreVaultSecret(VAULT_DEMO_SECRET, vault.threshold, vault.totalPeers, vault.trigger);
  const gameState = { mapId: "cripta", gridX: state.playerPos.x, gridY: state.playerPos.y, lastRollTotal: state.lastRoll.value };
  const shares = vault.envelope.shares.slice(0, vault.threshold);
  const res = await unlockLoreVaultSecret(vault.envelope, shares, gameState);
  vault.unlocked = res.ok;
  vault.sharesSubmitted = res.ok ? shares.length : 0;
  vault.revealedText = res.ok ? res.secretText : "";
  vault.lastAttemptPtBr = res.ok ? "" : VAULT_FAIL_PTBR[res.reason] || "O cofre continua fechado.";
  return state;
}

/**
 * Gera a visualização auditável do prompt cegado para um pilar específico.
 *
 * @param {object} state Estado da sessão atual.
 * @param {string} [role=state.inspectedRole] Papel do guardião inspecionado.
 * @returns {object} Payload retornado por `buildBlindedPillarPrompt`.
 */
export function inspectPeerPromptForRole(state, role = state.inspectedRole) {
  state.inspectedRole = role;
  const loreChunks = state.loreNodes.map((n) => ({ id: n.id, text: n.summary, trustStatus: n.verified ? "DM_NOTARIZED" : "DISPUTED_LORE" }));
  const context = packFourTierTurnContext({
    sheetDoc: { ...state.sheet, spatial_state: { map_id: "cripta", grid_x: state.playerPos.x, grid_y: state.playerPos.y } },
    loreChunks,
    queryText: "altar ermitão ferreiro",
    allowedPubkey: "pk-lyra",
    globalPlotSummary: "Exploração da Cripta sob a Vila Nova.",
    lastThreePhases: ["Entrada na Cripta", "Runas da Água", "Diante do Altar"],
  });
  return buildBlindedPillarPrompt(role, context, "Avaliar o próximo passo de Lyra diante do altar.");
}
