import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFavoriteAllocations,
  computeWeightedDrfSchedule,
  isPillarNodeEligible,
  assignPillarLeases,
  reassignFailedPillarLease,
  issueCampfireContributionReceipt,
  checkMoaQueueStability,
} from "../client/js/community-pillar-pool.js";
import {
  createCharacterSheetDoc,
  appendPoolDeltaOp,
  projectCharacterPools,
  extractCrossCharacterMentions,
  applyLoreEdgeAttestation,
  rankLoreChunksHybridRrf,
  applyTurnResolutionToSheet,
  packFourTierTurnContext,
} from "../client/js/rpg-sheet-and-lore.js";
import {
  createCommitReveal2Slot,
  recoverAbortedSeed,
  sampleUnbiasedDieFromDigest,
  resolveCommitReveal2Roll,
  evaluateVaultTrigger,
  sealLoreVaultSecret,
  unlockLoreVaultSecret,
  buildBlindedPillarPrompt,
} from "../client/js/rpg-crypto-table.js";
import {
  computeTurnComplexityScore,
  selectNarrativeRoute,
  validateTurnResolutionPayload,
  aggregateMoaStage1Proposals,
  buildOverhearingCoDmSuggestion,
  buildInferenceHttpRequest,
} from "../client/js/rpg-maritaca-router.js";
import { dungeonIcon, renderD20DieSvg, renderHeroPortraitSvg, renderShamirSealSvg } from "../client/js/dungeon/rpg-illustrations.js";
import { buildDungeonTabs, renderDungeonChrome } from "../client/js/dungeon/dungeon-chrome.js";
import {
  createDungeonSessionState,
  getDungeonSession,
  updateFavoriteSlider,
  simulatePillarFailover,
  submitTableAction,
  movePlayerOnGrid,
  applySheetResourceDelta,
  attestLoreNodeInState,
  inspectPeerPromptForRole,
} from "../client/js/dungeon/dungeon-state.js";
import { renderDungeonView, wireDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import { renderCampScreen } from "../client/js/dungeon/screen-camp.js";
import { renderTableScreen } from "../client/js/dungeon/screen-table.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderDmScreen } from "../client/js/dungeon/screen-dm.js";
import { showDungeonScreen, showLabsDungeon } from "../client/js/app/screens-labs.js";

function makeMockDomHost() {
  const listeners = {};
  const inputMock = { value: "", focus: () => {} };
  const host = {
    dataset: {},
    innerHTML: "",
    addEventListener: (type, fn) => { listeners[type] = fn; },
    querySelector: (sel) => (sel === "#dungeon-action-input" ? inputMock : null),
    listeners,
    inputMock,
  };
  return host;
}

test("dungeon-controller: delegação DOM completa de cliques, chips, slider e submit", () => {
  const state = createDungeonSessionState();
  const host = makeMockDomHost();
  wireDungeonView(null, { state });
  wireDungeonView(host, { screen: "desconhecida", state });
  assert.equal(host.dataset.dungeonWired, "1");
  wireDungeonView(host, { state });
  host.listeners.click({ target: { closest: () => null } });
  host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "chip", text: "Testar chip" } }) } });
  assert.equal(host.inputMock.value, "Testar chip");
  host.listeners.click({ target: { closest: () => ({ dataset: { dungeon: "inexistente" } }) } });
  const domActions = [
    { dungeon: "failover" },
    { dungeon: "roll-d20" },
    { dungeon: "grid-cell", x: "3", y: "1" },
    { dungeon: "spend-10" },
    { dungeon: "test-overdraft" },
    { dungeon: "confirm-lore", loreId: "lore-ferreiro" },
    { dungeon: "dispute-lore", loreId: "lore-ferreiro" },
    { dungeon: "brain-local" },
    { dungeon: "brain-maritaca" },
    { dungeon: "unlock-vault" },
    { dungeon: "inspect-role", role: "STAGE1_LORE_RAG" },
  ];
  for (const ds of domActions) host.listeners.click({ target: { closest: () => ({ dataset: ds }) } });
  assert.equal(state.inspectedRole, "STAGE1_LORE_RAG");
  host.listeners.input({ target: { dataset: { dungeon: "outro" }, value: "10" } });
  host.listeners.input({ target: { dataset: { dungeon: "slider-fav" }, value: "75" } });
  assert.equal(state.sliderPct, 75);
  let prevented = false;
  host.listeners.submit({ target: { dataset: { dungeon: "other-form" } }, preventDefault: () => {} });
  host.listeners.submit({ target: { dataset: { dungeon: "action-form" }, querySelector: () => ({ value: "Beber poção" }) }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.ok(host.innerHTML.includes("dungeon-sanctum"));
});

test("dungeon-state & renderers: fallbacks, bordas, ícones offline e abas vazias", () => {
  const resetState = getDungeonSession(true);
  assert.equal(getDungeonSession(false), resetState);
  updateFavoriteSlider(resetState, "invalido");
  assert.equal(resetState.sliderPct, 0);
  assert.equal(simulatePillarFailover({ leases: [] }).leases.length, 0);
  const s2 = createDungeonSessionState({ peerAliases: {} });
  simulatePillarFailover(s2);
  assert.ok(s2.failoverNotice.includes("Nó reserva"));
  submitTableAction(s2, "   ");
  submitTableAction(s2, "Pisou na armadilha de veneno");
  submitTableAction(s2, "Apenas observo a parede");
  applySheetResourceDelta(s2, "hp_current", -2, "Arranhão");
  applySheetResourceDelta(s2, "spell_slot_l1", -1, "Bola de luz");
  attestLoreNodeInState(s2, "inexistente", "CONFIRM");
  attestLoreNodeInState(s2, "lore-ferreiro", "REJECT");
  movePlayerOnGrid(s2, -5, 99);
  s2.vaultSecret.unlocked = true;
  movePlayerOnGrid(s2, 3, 1);
  assert.ok(renderDungeonView({ screen: "invalida", tableId: "", charId: "" }).includes("acampamento"));
  assert.ok(inspectPeerPromptForRole(s2).epistemicScope);
  assert.ok(dungeonIcon("desconhecido", 24).includes("<svg"));
  assert.ok(renderD20DieSvg(null, false).includes("?") && renderHeroPortraitSvg("").includes("PAL"));
  assert.ok(renderShamirSealSvg(true).includes("#69dba9") && buildDungeonTabs("", "").length === 4);
  assert.ok(renderDungeonChrome({ activeTab: "mesa", tableId: "", charId: "", guardiansOnline: "nan", bodyHtml: "<p>ok</p>" }).includes("5 guardiões de exemplo"));
  const campEmpty = renderCampScreen({ ...s2, leases: [{ role: "CUSTOM_ROLE", peerId: "x" }], receipt: null, stability: null, drf: null });
  const sheetRich = renderSheetScreen(s2);
  const sheetEdge = renderSheetScreen({ ...s2, sheet: { ...s2.sheet, role_title: "", delta_ledger: [] }, loreNodes: [s2.loreNodes[1]] });
  const sheetEmptyProps = renderSheetScreen({ ...s2, sheet: { ...s2.sheet, name: "H", attributes: null, pools_base: undefined, inventory: null, delta_ledger: [{ delta: 5, target_pool: "outro", reason: "" }] }, loreNodes: [] });
  applySheetResourceDelta(s2, "coins", -999, "Overdraft UI");
  const sheetOverdraft = renderSheetScreen(s2);
  const dmUnlocked = renderDmScreen({ ...s2, aiBrainMode: "maritaca", vaultSecret: { ...s2.vaultSecret, unlocked: true, sharesSubmitted: 3 }, coDmWhispers: { silentToolCall: {}, sensoryOptionsPtBr: [], rumorAlertPtBr: "" } });
  const dmMinimal = renderDmScreen({ ...s2, coDmWhispers: null, activeRoute: null });
  assert.ok(campEmpty.includes("CUSTOM_ROLE") && sheetRich.includes("Histórico da Mesa") && sheetEdge.includes("Contestado") && sheetEmptyProps.includes("H") && sheetOverdraft.includes("gasto além do saldo") && dmUnlocked.includes("Segredo Já Aberto") && dmMinimal.includes("Sussurros"));
});

test("community-pillar-pool: todos os ramos de elegibilidade, W-DRF e failover sem backup", () => {
  assert.equal(isPillarNodeEligible({ wifi: false }).reason, "requires_wifi");
  assert.equal(isPillarNodeEligible({ wifi: true, deviceLost: true }).reason, "webgpu_device_lost");
  assert.equal(isPillarNodeEligible({ wifi: true, thermalThrottle: true }).reason, "thermal_throttle");
  assert.equal(isPillarNodeEligible({ wifi: true, batteryLevel: 0.2 }).reason, "low_battery_unplugged");
  assert.equal(isPillarNodeEligible({ wifi: true, charging: true, dutyCycleUsedPct: 30 }).reason, "duty_cycle_exceeded");
  const norm = normalizeFavoriteAllocations([{ communityId: "bad id!" }, { communityId: "a", weightPct: 80 }, { communityId: "a", weightPct: 10 }, { communityId: "b", weightPct: 60 }, { communityId: "c", weightPct: 50 }], {});
  assert.equal(norm.length, 2);
  assert.equal(Math.round(norm[0].weightPct + norm[1].weightPct), 100);
  assert.equal(assignPillarLeases([]).unassignedRoles.length, 5);
  assert.equal(checkMoaQueueStability(-1, 0.2).stable, false);
  assert.equal(checkMoaQueueStability(0.1, 0).maxSafeLambda, 0);
  const noBackup = reassignFailedPillarLease([{ role: "STAGE2_LEAD_NARRATOR", peerId: "p1", communityId: "c1" }], "p1", []);
  assert.equal(noBackup.leases.length, 0);
  assert.equal(issueCampfireContributionReceipt().communityId, "comunidade");
});

test("rpg-crypto-table: rejeições de Commit-Reveal², cofre 3-de-5 e cegamento por papel", async () => {
  await assert.rejects(() => createCommitReveal2Slot("nao-bytes"), TypeError);
  const slot = await createCommitReveal2Slot(new Uint8Array([1, 2, 3, 4]), { splitId: "sp-1", random: () => 0.25 });
  await assert.rejects(() => recoverAbortedSeed(slot.backupShares.slice(0, 3), "deadbeef", 3), /commitO/);
  assert.throws(() => sampleUnbiasedDieFromDigest("abc", 20), RangeError);
  assert.ok(sampleUnbiasedDieFromDigest("ffffffffffffffffffffffff", 7) >= 1);
  await assert.rejects(() => resolveCommitReveal2Roll([]), RangeError);
  await assert.rejects(() => resolveCommitReveal2Roll([{ peerId: "p1", seedBytes: new Uint8Array([9]), commitO: "0".repeat(64) }]), /inválida/);
  await assert.rejects(() => resolveCommitReveal2Roll([{ peerId: "p2", aborted: true }]), /sem semente/);
  const recovered = await resolveCommitReveal2Roll([{ peerId: "p3", aborted: true, commitO: slot.commitO, backupShares: slot.backupShares.slice(0, 3), threshold: 3 }], 20);
  assert.deepEqual(recovered.recoveredPeerIds, ["p3"]);
  const failEval = evaluateVaultTrigger({ mapId: "x", gridX: 0, gridY: 0, lastRollTotal: 5, flags: [] }, { mapId: "y", gridX: 1, gridY: 2, minRollTotal: 10, requiredFlag: "chave" });
  assert.equal(failEval.failedChecks.length, 5);
  await assert.rejects(() => sealLoreVaultSecret(""), TypeError);
  const vault = await sealLoreVaultSecret("Sino oculto", 3, 5, { mapId: "cripta" });
  const otherVault = await sealLoreVaultSecret("Outro texto!", 3, 5, { mapId: "cripta" });
  assert.equal((await unlockLoreVaultSecret(vault, vault.shares.slice(0, 2), { mapId: "cripta" })).reason, "insufficient_shares");
  assert.equal((await unlockLoreVaultSecret(vault, otherVault.shares.slice(0, 3), { mapId: "cripta" })).reason, "commit_mismatch");
  assert.equal(buildBlindedPillarPrompt("STAGE1_LORE_RAG", { tier4LoreRrf: { canonicalFacts: [{ text: "Fato" }] }, tier2SpatialMemory: { localEvents: [{ summary: "Porta" }] } }, "Ler").epistemicScope, "AUTHORIZED_LORE_AND_SPATIAL");
  assert.equal(buildBlindedPillarPrompt("STAGE1_ACT_DIRECTOR", { tier2SpatialMemory: { globalPlotSummary: "Atos" } }, "Mover").epistemicScope, "ABSTRACT_ACTS_PACING");
  assert.equal(buildBlindedPillarPrompt("OUTRO", { narratorBriefPtBr: "Resumo" }, "Olhar").epistemicScope, "PTBR_PROSE_SYNTHESIS_ONLY");
});

test("rpg-maritaca-router & rpg-sheet-and-lore: contratos inválidos, RRF, condições e showLabsDungeon", async () => {
  assert.equal(validateTurnResolutionPayload(null).valid, false);
  const bad = validateTurnResolutionPayload({ wrong_first: 1, mechanical_reasoning: "", action_legality: "X", turn_control: "Y", state_mutations: "z", spatial_updates: 1, lore_tags_emitted: {}, narrative_prose_ptbr: 123 });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.length >= 6);
  assert.equal(selectNarrativeRoute(0.8, { hasMaritacaKey: true, nationalResidencyBrSp: false }).modelId, "sabia-3");
  assert.equal(aggregateMoaStage1Proposals("bad").quorumMet, false);
  const doc = createCharacterSheetDoc({ character_id: "c1" });
  assert.equal(appendPoolDeltaOp(doc, { op_id: "" }).delta_ledger.length, 0);
  const withCond = applyTurnResolutionToSheet(doc, { state_mutations: [{ conditions_added: ["Enlameado"], conditions_removed: ["Nada"] }], spatial_updates: [{ map_id: "m2", grid_x: 2, grid_y: 4 }] }, "pk");
  assert.deepEqual(withCond.attributes_lww.conditions, ["Enlameado"]);
  const lore = { cross_character_edges: [{ target_char_id: "t1", target_owner_pubkey: "pk-a", trust_status: "PENDING_BILATERAL" }] };
  assert.equal(applyLoreEdgeAttestation(lore, { decision: "DESCONHECIDA" }).cross_character_edges[0].trust_status, "PENDING_BILATERAL");
  assert.equal(applyLoreEdgeAttestation(lore, { decision: "DISPUTE_CLAIM" }).cross_character_edges[0].trust_status, "PENDING_BILATERAL");
  assert.equal(applyLoreEdgeAttestation(lore, { decision: "DISPUTE_CLAIM", signer_pubkey: "pk-a" }).cross_character_edges[0].trust_status, "DISPUTED_LORE");
  const chunks = [
    { id: "c1", text: "altar antigo da cripta", tokens: 60, trustStatus: "DM_NOTARIZED", entityIds: ["npc1"], spatial_anchor: { map_id: "cripta", grid_x: 1, grid_y: 1 } },
    { id: "c2", text: "taverna distante", tokens: 40, trustStatus: "PENDING_BILATERAL", entityIds: [] },
    { id: "c3", text: "segredo privado", tokens: 800, visibility: { mode: "DM_ONLY", allowed_pubkeys: ["pk-dm"] } },
  ];
  const ranked = rankLoreChunksHybridRrf(chunks, { queryText: "altar cripta", allowedPubkey: "pk-lyra", activeCharIds: ["npc1"], spatialAnchor: { map_id: "cripta", grid_x: 1, grid_y: 1 }, maxTokens: 500 });
  assert.equal(ranked.selected.length, 2);
  assert.equal(ranked.droppedPrivateCount, 1);
  assert.equal(showLabsDungeon !== undefined && showDungeonScreen !== undefined, true);
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    await showLabsDungeon();
  } finally {
    globalThis.document = prevDoc;
  }
});

test("branch-sweep: valores padrão e limites em W-DRF, rotas Maritaca, Crypto e Ficha CRDT", async () => {
  const zeroWeight = computeWeightedDrfSchedule([{ communityId: "z", weightPct: 0 }, { communityId: "a", weightPct: 50 }], { a: { usedGpu: 0.1 } });
  assert.equal(zeroWeight.nextCommunityId, "a");
  assert.equal(isPillarNodeEligible().reason, "requires_wifi");
  assert.equal(computeWeightedDrfSchedule().nextCommunityId, null);
  assert.equal(createCharacterSheetDoc().character_id, "char_0000000000000001");
  assert.equal(projectCharacterPools().orderedOpsCount, 0);
  assert.equal(extractCrossCharacterMentions().length, 0);
  assert.equal(rankLoreChunksHybridRrf().selected.length, 0);
  assert.equal(applyTurnResolutionToSheet(null).schema_version, "1.0.0");
  const packed = packFourTierTurnContext({
    spatialMemory: [{ map_id: "taverna_01", grid_x: 1, grid_y: 1, summary: "Perto" }, { map_id: "outro", grid_x: 9, grid_y: 9, summary: "Longe" }],
    lastThreePhases: ["A1", "A2", "A3", "A4"],
  });
  assert.equal(packed.tokenBudgetTotal, 3000);
  assert.equal(packed.tier2SpatialMemory.localEvents.length, 1);
  assert.equal(evaluateVaultTrigger().unlocked, true);
  assert.equal((await unlockLoreVaultSecret({})).reason, "insufficient_shares");
  assert.equal(buildBlindedPillarPrompt("STAGE1_JUDGE_RULES").epistemicScope, "MECHANICAL_SHEET_ONLY");
  assert.equal(buildBlindedPillarPrompt("STAGE1_LORE_RAG", { tier2SpatialMemory: { localEvents: [{ text: "Eco" }] } }).epistemicScope, "AUTHORIZED_LORE_AND_SPATIAL");
  assert.equal(buildBlindedPillarPrompt("STAGE1_NPC_ACTOR").epistemicScope, "VISIBLE_SCENE_AND_TAVERN_RUMORS");
  assert.equal(buildBlindedPillarPrompt("STAGE1_ACT_DIRECTOR", { tier2SpatialMemory: { lastThreePhases: ["P1"] } }).epistemicScope, "ABSTRACT_ACTS_PACING");
  assert.equal(computeTurnComplexityScore(), 0.15);
  assert.equal(selectNarrativeRoute(0.5, { hasMaritacaKey: false }).tier, "TIER_0_LOCAL");
  assert.equal(buildOverhearingCoDmSuggestion().shouldIntervene, false);
  assert.equal(buildOverhearingCoDmSuggestion({ text: "examino o altar", locationName: "Cripta" }).shouldIntervene, true);
  assert.equal(buildInferenceHttpRequest({ tier: "TIER_1_BUDGET_CLOUD", modelId: "sabiazinho-4" }, [], "k").body.model, "sabiazinho-4");
});

test("branch-sweep extra: clamping CRDT, ordenação W-DRF, MoA timeouts e failover narrador", async () => {
  const s = createCharacterSheetDoc({ character_id: "c9", pools_base: { hp_max: 20, hp_temp_max: 5, gold_initial: 10, spell_slots_max: { l1: 2, l2: 1, l3: 1 } } });
  const healed = applyTurnResolutionToSheet(s, { state_mutations: [{ target_pool: "hp_current", delta: 99 }, { character_id: "outra", target_pool: "hp_current", delta: -5 }] }, "pk");
  assert.equal(projectCharacterPools(healed.pools_base, healed.delta_ledger).pools.hp_current, 20);
  const singleNarrator = assignPillarLeases([{ peerId: "n1", vramMb: 4096, tokensPerSec: 20, status: { wifi: true, charging: true }, favorites: [{ communityId: "c1", weightPct: 100 }] }], { communityId: "c1" });
  assert.equal(singleNarrator.leases.length, 5);
  const failNarr = reassignFailedPillarLease(singleNarrator.leases, "n1", [{ peerId: "w1", vramMb: 2048, tokensPerSec: 15, isIdleCampfireNode: true, status: { wifi: true, charging: true }, favorites: [{ communityId: "c1", weightPct: 100 }] }]);
  assert.equal(failNarr.replacedRoles.includes("STAGE2_LEAD_NARRATOR"), true);
  assert.equal(aggregateMoaStage1Proposals([{ role: "STAGE1_JUDGE_RULES", latencyMs: 1500 }, { role: "STAGE1_LORE_RAG", latencyMs: 200 }]).droppedRoles[0], "STAGE1_JUDGE_RULES");
  assert.equal(selectNarrativeRoute(0.1).modelId, "qwen2.5-3b-instruct");
});

test("branch-sweep final: orçamento RRF, deltas parciais e limites W-DRF", () => {
  const chunks = [
    { id: "a", text: "chave", bm25Score: 1, vecScore: 1, tokens: 10 },
    { id: "b", text: "porta", bm25Score: 0.2, vecScore: 0.2, tokens: 500 },
  ];
  const packed = rankLoreChunksHybridRrf(chunks, { queryText: "xyz", maxTokens: 20 });
  assert.equal(packed.selected.length, 1);
  const sheet = applyTurnResolutionToSheet(createCharacterSheetDoc(), {
    state_mutations: [{ target_pool: "hp_current" }, { delta: 1 }, { target_pool: "hp_current", delta: -1, op_id: "x1" }],
    spatial_updates: [{ character_id: "other", grid_x: 9 }, { grid_x: 3, grid_y: 4, elevation_z: 2 }],
  });
  assert.equal(sheet.spatial_state.grid_x, 3);
  const res = buildInferenceHttpRequest({ tier: "TIER_2_CLIMAX_CLOUD", modelId: "sabia-3", endpoint: "https://ex/api" }, [{ role: "user", content: "x" }]);
  assert.equal(res.headers.Authorization, undefined);
  assert.equal(normalizeFavoriteAllocations([{ communityId: "x", weightPct: -5 }], { supporter: false }).length, 1);
});

test("branch-sweep 90+: desempates MoA, limites l1..l3/hp_temp e recover sem commit", async () => {
  const tiedNarr = [
    { peerId: "a", vramMb: 4096, tokensPerSec: 20, isIdleCampfireNode: false, status: { wifi: true, charging: true }, favorites: [{ communityId: "c1", weightPct: 50 }] },
    { peerId: "b", vramMb: 4096, tokensPerSec: 20, isIdleCampfireNode: true, status: { wifi: true, charging: true }, favorites: [{ communityId: "c1", weightPct: 50 }] },
  ];
  assert.equal(assignPillarLeases(tiedNarr, { communityId: "c1" }).leases.length, 5);
  let doc = createCharacterSheetDoc({ abilities: { str: 16 }, conditions: ["Atento"], pools_base: { hp_max: 20, hp_temp_max: 5, spell_slots_max: { l1: 2, l2: 1, l3: 1 } } });
  doc = appendPoolDeltaOp(doc, { op_id: "b", lamport_clock: 1, target_pool: "hp_temp", delta: 9 });
  doc = appendPoolDeltaOp(doc, { op_id: "a", lamport_clock: 1, target_pool: "spell_slot_l2", delta: -5 });
  doc = appendPoolDeltaOp(doc, { op_id: "c", lamport_clock: 2, target_pool: "spell_slot_l3", max_bound_ref: "spell_slots_max.l3", delta: 4 });
  doc = appendPoolDeltaOp(doc, { op_id: "a", lamport_clock: 1, target_pool: "spell_slot_l2", delta: -5 });
  const proj = projectCharacterPools(doc.pools_base, doc.delta_ledger);
  assert.equal(proj.pools.hp_temp, 5);
  assert.equal(proj.pools.spell_slot_l2, 0);
  const slot = await createCommitReveal2Slot(new Uint8Array([7, 8, 9]));
  const raw = await recoverAbortedSeed(slot.backupShares.slice(0, 3));
  assert.equal(raw.length, 3);
  const directSeed = new Uint8Array([4, 5]);
  const directCommit = (await createCommitReveal2Slot(directSeed)).commitO;
  const directRoll = await resolveCommitReveal2Roll([{ peerId: "x", seedBytes: directSeed, commitO: directCommit }], 2);
  assert.ok(directRoll.rollValue >= 1 && directRoll.rollValue <= 2);
});

test("branch-sweep defesa: entradas nulas e showDungeonScreen com banner demo/notice", async () => {
  assert.equal(appendPoolDeltaOp(null, { op_id: "o1", target_pool: "hp_current", delta: -1 }).delta_ledger.length, 1);
  assert.equal(applyLoreEdgeAttestation(null, { decision: "ACCEPT_CANON" }).cross_character_edges.length, 0);
  const resRrf = rankLoreChunksHybridRrf([{ id: "1", text: "", tokens: 0, trustStatus: "UNK", vecScore: "nan" }], { queryText: "x" });
  assert.equal(resRrf.selected.length, 1);
  assert.equal(resolveMaxBoundCheck(), true);
  await assert.rejects(() => recoverAbortedSeed(), RangeError);
  assert.ok(buildBlindedPillarPrompt("", null).promptText.length > 0);
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    await showDungeonScreen();
  } finally {
    globalThis.document = prevDoc;
  }
});

function resolveMaxBoundCheck() {
  const s = createCharacterSheetDoc({ pools_base: { hp_max: 10, hp_temp_max: 4, spell_slots_max: { l1: 1, l2: 1, l3: 1 } } });
  let d = appendPoolDeltaOp(s, { op_id: "1", target_pool: "hp_temp", max_bound_ref: "hp_temp_max", delta: 9 });
  d = appendPoolDeltaOp(d, { op_id: "2", target_pool: "spell_slot_l1", max_bound_ref: "spell_slots_max.l1", delta: 5 });
  d = appendPoolDeltaOp(d, { op_id: "3", target_pool: "spell_slot_l2", max_bound_ref: "spell_slots_max.l2", delta: 5 });
  d = appendPoolDeltaOp(d, { op_id: "4", target_pool: "xp", delta: 10 });
  assert.equal(normalizeFavoriteAllocations().length, 0);
  assert.equal(reassignFailedPillarLease().leases.length, 0);
  assert.equal(projectCharacterPools({ hp_max: 10 }, null).orderedOpsCount, 0);
  assert.equal(extractCrossCharacterMentions("@ana e @ana repete", { ana: { characterId: "c-ana", ownerPubkey: "pk1" } }).length, 1);
  assert.equal(createCharacterSheetDoc({ spatial_state: null }).spatial_state.map_id, "taverna_01");
  assert.equal(assignPillarLeases(null).unassignedRoles.length, 5);
  assert.equal(reassignFailedPillarLease([null], "p1", null).leases.length, 1);
  assert.equal(applyTurnResolutionToSheet(s).character_id, s.character_id);
  assert.equal(packFourTierTurnContext({ spatialMemory: [null, { map_id: "x" }] }).tier2SpatialMemory.localEvents.length, 0);
  const dmState = createDungeonSessionState();
  attestLoreNodeInState(dmState, "lore-duque", "CONFIRM");
  submitTableAction(dmState, "Encontrei ouro e descansei com poção");
  assert.equal(projectCharacterPools({ hp_max: 10 }, [{ target_pool: null }, { target_pool: "hp_current", delta: -2, min_bound: 0, lamport_clock: 2 }, { target_pool: "hp_current", delta: -1, op_id: "z", lamport_clock: 1 }]).pools.hp_current, 7);
  return projectCharacterPools(d.pools_base, d.delta_ledger).pools.xp === 10;
}

test("revisão completa: 0 guardiões, XSS SVG, multi-mesa, pluralização, vault e submit vazio", () => {
  assert.match(renderDungeonChrome({ activeTab: "acampamento", guardiansOnline: 0, bodyHtml: "" }), /0 guardiões de exemplo/);
  assert.ok(!renderD20DieSvg("<19>").includes("<19>"));
  assert.ok(!renderHeroPortraitSvg("<x>").includes("<X>"));
  const state = createDungeonSessionState({ tableId: "floresta-de-vidro" });
  assert.match(renderCampScreen(state), /#\/dungeon\/mesa\/floresta-de-vidro/);
  assert.match(renderTableScreen(state), /Assembleia na Floresta de Vidro/);
  state.vaultSecret.unlocked = true;
  state.vaultSecret.sharesSubmitted = 3;
  assert.match(renderTableScreen(state), /Aberto com 3 de 5 partes/);
  assert.match(renderDmScreen(state), /disabled>Segredo Já Aberto/);
  state.loreNodes = [{ ...state.loreNodes[0], attestations: [{ actorPubkey: "pk1", verdict: "CONFIRM" }], verified: true }];
  assert.match(renderSheetScreen(state), /Assinado por 1 testemunha<\/span>/);
  const host = makeMockDomHost();
  wireDungeonView(host, { screen: "mesa", state });
  host.innerHTML = "UNTOUCHED";
  host.inputMock.value = "   ";
  host.listeners.submit({ target: { dataset: { dungeon: "action-form" }, querySelector: () => host.inputMock }, preventDefault: () => {} });
  assert.equal(host.innerHTML, "UNTOUCHED");
});
