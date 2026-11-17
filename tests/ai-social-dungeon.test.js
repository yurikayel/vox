import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FAVORITE_COMMUNITIES,
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
  resolveCommitReveal2Roll,
  sampleUnbiasedDieFromDigest,
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
import { renderDungeonLab } from "../client/js/labs/ai-social-dungeon-lab.js";
import { renderDungeonView } from "../client/js/dungeon/dungeon-controller.js";
import {
  createDungeonSessionState,
  updateFavoriteSlider,
  simulatePillarFailover,
  submitTableAction,
  movePlayerOnGrid,
  applySheetResourceDelta,
  attestLoreNodeInState,
  triggerShamirVaultUnlock,
  inspectPeerPromptForRole,
} from "../client/js/dungeon/dungeon-state.js";
import { showDungeonScreen } from "../client/js/app/screens-labs.js";

function seedFromByte(seedByte) {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = (seedByte + i * 13) & 0xff;
  return bytes;
}

test("community-pillar-pool: 2 favorite communities and W-DRF fair scheduling", () => {
  const allocs = normalizeFavoriteAllocations(
    [
      { communityId: "guilda-dragao", weightPct: 80 },
      { communityId: "assoc-bairro", weightPct: 20 },
      { communityId: "extra-ignorada", weightPct: 50 },
    ],
    { supporter: true, maxMb: 1000 },
  );
  assert.equal(allocs.length, MAX_FAVORITE_COMMUNITIES);
  assert.equal(allocs[0].allocatedDiskMb, 800);
  assert.equal(allocs[1].allocatedDiskMb, 200);
  const drf = computeWeightedDrfSchedule(allocs, {
    "guilda-dragao": { usedGpu: 0.4, usedIo: 0.1 },
    "assoc-bairro": { usedGpu: 0.05, usedIo: 0.25 },
  });
  assert.equal(drf.nextCommunityId, "guilda-dragao");
  assert.ok(drf.schedule[0].weightedDominantShare < drf.schedule[1].weightedDominantShare);
});

test("community-pillar-pool: idle campfire node priority, guardrails and MoA queue stability", () => {
  assert.equal(isPillarNodeEligible({ wifi: false, charging: true }).reason, "requires_wifi");
  assert.equal(isPillarNodeEligible({ wifi: true, charging: false, batteryLevel: 0.2 }).reason, "low_battery_unplugged");
  const manifests = [
    { peerId: "active-phone", isIdleCampfireNode: false, vramMb: 2048, tokensPerSec: 10, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
    { peerId: "absent-pc", isIdleCampfireNode: true, vramMb: 8192, tokensPerSec: 40, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
    { peerId: "host-maritaca", isIdleCampfireNode: false, hasMaritacaKey: true, vramMb: 4096, tokensPerSec: 30, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
  ];
  const { leases } = assignPillarLeases(manifests, { communityId: "rpg", nowMs: 1000 });
  assert.equal(leases.length, 5);
  // Sem bônus por chave de serviço externo (ADR-033): o narrador é o aparelho mais capaz, e ter a chave não muda nada.
  assert.equal(leases.find((l) => l.role === "STAGE2_LEAD_NARRATOR")?.peerId, "absent-pc");
  const withoutKey = manifests.map((m) => ({ ...m, hasMaritacaKey: false }));
  assert.deepEqual(assignPillarLeases(withoutKey, { communityId: "rpg", nowMs: 1000 }).leases, leases);
  assert.equal(checkMoaQueueStability(0.05, 1.4, 4).stable, true);
  assert.equal(checkMoaQueueStability(0.5, 1.4, 4).stable, false);
});

test("community-pillar-pool: lease failover <1 RTT and campfire contribution receipt", () => {
  const manifests = [
    { peerId: "absent-pc-1", isIdleCampfireNode: true, vramMb: 8192, tokensPerSec: 40, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
    { peerId: "absent-pc-2", isIdleCampfireNode: true, vramMb: 4096, tokensPerSec: 30, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
    { peerId: "host-pc", isIdleCampfireNode: false, hasMaritacaKey: true, vramMb: 4096, tokensPerSec: 25, favorites: [{ communityId: "rpg", weightPct: 50 }], status: { wifi: true, charging: true } },
  ];
  const { leases } = assignPillarLeases(manifests, { communityId: "rpg", nowMs: 1000 });
  const failover = reassignFailedPillarLease(leases, "absent-pc-1", manifests, { communityId: "rpg", nowMs: 2000 });
  assert.ok(failover.replacedRoles.length >= 1);
  assert.ok(!failover.leases.some((l) => l.peerId === "absent-pc-1"));
  assert.ok(failover.backupPeerIds.includes("absent-pc-2"));
  const receipt = issueCampfireContributionReceipt({ communityId: "rpg", peerId: "absent-pc-1", memberName: "Thorin", turnsServed: 4, ragChunksServed: 10, gpuSecondsLent: 20, nowMs: 3000 });
  assert.equal(receipt.supportPoints, 70);
  assert.ok(receipt.summaryPtBr.includes("Thorin sustentou 4 turno(s)"));
});

test("rpg-sheet-and-lore: commutative delta_ledger mutations and offline overdraft clamp", () => {
  let doc = createCharacterSheetDoc({ pools_base: { hp_max: 24, gold_initial: 100 } });
  doc = appendPoolDeltaOp(doc, { op_id: "op2", lamport_clock: 2, target_pool: "currency_gp", delta: -60, reason: "Poção" });
  doc = appendPoolDeltaOp(doc, { op_id: "op1", lamport_clock: 1, target_pool: "currency_gp", delta: -50, reason: "Espada" });
  doc = appendPoolDeltaOp(doc, { op_id: "op3", lamport_clock: 3, target_pool: "hp_current", delta: -12, reason: "Veneno" });
  doc = appendPoolDeltaOp(doc, { op_id: "op3", lamport_clock: 3, target_pool: "hp_current", delta: -12, reason: "Duplicado" });
  const proj = projectCharacterPools(doc.pools_base, doc.delta_ledger);
  assert.equal(proj.orderedOpsCount, 3);
  assert.equal(proj.pools.hp_current, 12);
  assert.equal(proj.pools.currency_gp, 0);
  assert.equal(proj.overdraftConflicts[0].code, "INVARIANT_CONFLICT_OVERDRAFT");
  assert.equal(proj.overdraftConflicts[0].unclampedValue, -10);
});

test("rpg-sheet-and-lore: bilateral @tag transitions and Zero-Spoiler Hybrid RRF", () => {
  const edges = extractCrossCharacterMentions("Salvei @lyra na ponte de ferro", {
    lyra: { characterId: "char_lyra", ownerPubkey: "pk_lyra", relationType: "ASSISTED" },
  });
  assert.equal(edges[0].trust_status, "PENDING_BILATERAL");
  const canonNode = applyLoreEdgeAttestation({ cross_character_edges: edges }, { target_char_id: "char_lyra", decision: "ACCEPT_CANON", signer_pubkey: "pk_lyra" });
  assert.equal(canonNode.cross_character_edges[0].trust_status, "BILATERAL_CANON");
  const disputedNode = applyLoreEdgeAttestation({ cross_character_edges: edges }, { target_char_id: "char_lyra", decision: "DISPUTE_CLAIM", dispute_fork_event_id: "evt_fork_2" });
  assert.equal(disputedNode.cross_character_edges[0].trust_status, "DISPUTED_LORE");
  const ranked = rankLoreChunksHybridRrf(
    [
      { id: "c1", text: "Segredo oculto do boss", vecScore: 0.99, visibility: { mode: "THRESHOLD_VAULT", allowed_pubkeys: ["pk_dm"] } },
      { id: "c2", text: "Ponte de ferro destruída", vecScore: 0.6, trustStatus: "BILATERAL_CANON", entityIds: ["char_lyra"] },
    ],
    { queryText: "ponte ferro", allowedPubkey: "pk_player", activeCharIds: ["char_lyra"], maxTokens: 500 },
  );
  assert.equal(ranked.droppedPrivateCount, 1);
  assert.equal(ranked.selected[0].id, "c2");
});

test("rpg-sheet-and-lore: TurnResolution-to-Sheet bridge and 4-tier context packer", () => {
  let sheet = createCharacterSheetDoc({ character_id: "char_aldric", name: "Aldric", pools_base: { hp_max: 25, gold_initial: 50 }, spatial_state: { map_id: "cripta", grid_x: 3, grid_y: 4 } });
  sheet = applyTurnResolutionToSheet(sheet, {
    state_mutations: [{ character_id: "char_aldric", target_pool: "hp_current", delta: -6, conditions_added: ["CAIDO"], reason: "Armadilha" }],
    spatial_updates: [{ character_id: "char_aldric", map_id: "cripta", grid_x: 4, grid_y: 4 }],
  }, "pk_dm");
  assert.deepEqual(sheet.attributes_lww.conditions, ["CAIDO"]);
  assert.equal(sheet.spatial_state.grid_x, 4);
  const packed = packFourTierTurnContext({
    sheetDoc: sheet,
    loreChunks: [
      { id: "c_secret", text: "Segredo oculto", visibility: { mode: "THRESHOLD_VAULT", allowed_pubkeys: ["pk_dm"] } },
      { id: "c_rumor", text: "Dizem que o altar guarda ouro", vecScore: 0.7, trustStatus: "DISPUTED_LORE" },
    ],
    queryText: "altar",
    allowedPubkey: "pk_aldric",
    spatialMemory: [{ map_id: "cripta", grid_x: 5, grid_y: 4, summary: "Estatua rachada" }],
    globalPlotSummary: "Exploração da cripta",
    lastThreePhases: ["F1", "F2", "F3", "F4"],
  });
  assert.equal(packed.tier1Entitlement.droppedPrivateCount, 1);
  assert.equal(packed.tier2SpatialMemory.lastThreePhases.length, 3);
  assert.equal(packed.tier2SpatialMemory.localEvents.length, 1);
  assert.equal(packed.tier3PartySheet.pools.hp_current, 19);
  assert.equal(packed.tier4LoreRrf.disputedRumors.length, 1);
});

test("rpg-crypto-table: Commit-Reveal2 roll, Shamir recovery and unbiased rejection sampling", async () => {
  const s1 = seedFromByte(10);
  const s2 = seedFromByte(77);
  const slot1 = await createCommitReveal2Slot(s1);
  const slot2 = await createCommitReveal2Slot(s2);
  const res = await resolveCommitReveal2Roll([
    { peerId: "p1", commitO: slot1.commitO, seedBytes: s1 },
    { peerId: "p2-aborted", commitO: slot2.commitO, aborted: true, backupShares: slot2.backupShares.slice(0, 3) },
  ], 20);
  assert.deepEqual(res.recoveredPeerIds, ["p2-aborted"]);
  assert.ok(res.rollValue >= 1 && res.rollValue <= 20);
  const biasedBoundary = "ffffffff0000000a000000000000000000000000000000000000000000000000";
  assert.equal(sampleUnbiasedDieFromDigest(biasedBoundary, 20), 11);
});

test("rpg-crypto-table: 3-of-5 Shamir vault triggers and blinded epistemic prompts", async () => {
  const vault = await sealLoreVaultSecret("O traidor é o Duque.", 3, 5, { mapId: "cripta", gridX: 4, gridY: 9, minRollTotal: 16 });
  const locked = await unlockLoreVaultSecret(vault, vault.shares.slice(0, 3), { mapId: "cripta", gridX: 1, gridY: 1, lastRollTotal: 18 });
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, "trigger_not_met");
  const unlocked = await unlockLoreVaultSecret(vault, vault.shares.slice(1, 4), { mapId: "cripta", gridX: 4, gridY: 9, lastRollTotal: 17 });
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.secretText, "O traidor é o Duque.");
  const judge = buildBlindedPillarPrompt("STAGE1_JUDGE_RULES", { tier3PartySheet: { name: "Lyra", pools: { hp_current: 20 } }, tier4LoreRrf: { canonicalFacts: [{ text: "Segredo secreto" }] } }, "Atacar goblin");
  assert.equal(judge.epistemicScope, "MECHANICAL_SHEET_ONLY");
  assert.ok(!judge.promptText.includes("Segredo secreto"));
  const npc = buildBlindedPillarPrompt("STAGE1_NPC_ACTOR", { tier2SpatialMemory: { anchor: { map_id: "taverna", grid_x: 1, grid_y: 2 } }, tier4LoreRrf: { disputedRumors: [{ text: "O ferreiro sumiu" }] } }, "Ouvir boatos");
  assert.ok(npc.promptText.includes("boato de taverna não confirmado"));
});

test("rpg-maritaca-router & lab: tier routing, XGrammar check and HTML lab render", () => {
  const low = computeTurnComplexityScore({ combatantsCount: 0 });
  const med = computeTurnComplexityScore({ isDialogueHeavy: true, hasDisputedLore: true });
  const high = computeTurnComplexityScore({ isBossClimax: true, vaultJustUnlocked: true, combatantsCount: 4 });
  assert.equal(selectNarrativeRoute(low, { hasMaritacaKey: true }).tier, "TIER_0_LOCAL");
  assert.equal(selectNarrativeRoute(med, { hasMaritacaKey: true }).modelId, "sabiazinho-4");
  const climaxRoute = selectNarrativeRoute(high, { hasMaritacaKey: true, nationalResidencyBrSp: true });
  assert.equal(climaxRoute.tier, "TIER_2_CLIMAX_CLOUD");
  assert.equal(climaxRoute.modelId, "sabia-3-br-sp");
  assert.ok(climaxRoute.estimatedCostBrl > 0);
  const valid = validateTurnResolutionPayload({
    mechanical_reasoning: "Teste válido.",
    action_legality: "LEGAL_RESOLVED",
    rejection_explanation_ptbr: null,
    dice_check_request: null,
    state_mutations: [],
    spatial_updates: [],
    lore_tags_emitted: [],
    whisper_handout: null,
    narrative_prose_ptbr: "A porta se abre.",
    turn_control: "AWAIT_PLAYER_INPUT",
  });
  assert.equal(valid.valid, true);
  const html = renderDungeonLab();
  assert.ok(html.includes("Lab AI Social Dungeon"));
  assert.ok(html.includes("data-dungeon=\"failover\""));
});

test("rpg-maritaca-router: MoA k-1 aggregation, overhearing Co-DM and HTTP request builder", () => {
  const moa = aggregateMoaStage1Proposals([
    { role: "STAGE1_JUDGE_RULES", latencyMs: 300, summaryPtBr: "Acerto crítico.", stateMutations: [{ target_pool: "hp_current", delta: -5 }] },
    { role: "STAGE1_LORE_RAG", latencyMs: 500, summaryPtBr: "Altar antigo." },
    { role: "STAGE1_NPC_ACTOR", latencyMs: 1800, timedOut: true, summaryPtBr: "Ignorado" },
    { role: "STAGE1_ACT_DIRECTOR", latencyMs: 450, summaryPtBr: "Tensão crescente." },
  ], 1400);
  assert.equal(moa.degraded, true);
  assert.deepEqual(moa.droppedRoles, ["STAGE1_NPC_ACTOR"]);
  assert.equal(moa.quorumMet, true);
  assert.equal(moa.stateMutations.length, 1);
  const coDm = buildOverhearingCoDmSuggestion({ speaker: "Aldric", text: "Examino o altar em silêncio", locationName: "Cripta", hasDisputedRumor: true });
  assert.equal(coDm.shouldIntervene, true);
  assert.equal(coDm.silentToolCall.skill, "Investigação");
  assert.ok(coDm.rumorAlertPtBr.includes("DISPUTED_LORE"));
  const cloudReq = buildInferenceHttpRequest({ tier: "TIER_2_CLIMAX_CLOUD", modelId: "sabia-3-br-sp", endpoint: "https://chat.maritaca.ai/api/chat/inference" }, [{ role: "user", content: "Oi" }], "mk-123");
  assert.equal(cloudReq.headers.Authorization, "Key mk-123");
  const localReq = buildInferenceHttpRequest({ tier: "TIER_0_LOCAL", modelId: "qwen2.5-3b-instruct" }, [{ role: "user", content: "Oi" }]);
  assert.equal(localReq.headers.Authorization, undefined);
  assert.equal(localReq.body.response_format.type, "json_object");
});

test("ui segregada: 4 telas offline renderizam no santuário sem CDN externa", () => {
  const state = createDungeonSessionState();
  const screens = [
    renderDungeonView({ screen: "acampamento", state }),
    renderDungeonView({ screen: "mesa", tableId: "vila-nova", state }),
    renderDungeonView({ screen: "ficha", charId: "lyra", state }),
    renderDungeonView({ screen: "mestre", tableId: "vila-nova", state }),
  ];
  for (const html of screens) {
    assert.ok(html.includes("dungeon-sanctum"));
    assert.ok(html.includes("DEMONSTRAÇÃO · ROTEIRO FIXO, SEM IA E SEM REDE"));
    assert.ok(html.includes("esta mesa é uma demonstração"));
    for (const claim of ["IA Local", "Sabiá", "Maritaca Sabiá-3", "Guardiões Online", "Ω_o", "ZERO VAZAMENTO", "0 servidores centrais", "Zaps de Apoio", "navigator.storage.persist", "data-dungeon=\"brain-maritaca\""]) {
      assert.ok(!html.includes(claim), `tela não pode prometer: ${claim}`);
    }
    assert.ok(html.includes("<svg"));
    assert.ok(!html.includes("cdn.tailwindcss.com"));
    assert.ok(!html.includes("fonts.googleapis.com"));
    assert.ok(!html.includes("lh3.googleusercontent.com"));
  }
  assert.ok(screens[0].includes("<details class=\"dungeon-audit\""));
  assert.ok(screens[1].includes("Bandeja de Dados"));
  assert.ok(screens[2].includes("Boato de Taverna"));
  assert.ok(screens[3].includes("Cofres de Shamir"));
});

test("dungeon-state: interações de slider W-DRF, mesa, ficha CRDT e escudo do mestre", () => {
  const state = createDungeonSessionState();
  updateFavoriteSlider(state, 80);
  assert.equal(state.favorites[0].sliderWeight, 80);
  assert.equal(state.favorites[1].sliderWeight, 20);
  simulatePillarFailover(state);
  assert.ok(state.failoverNotice.includes("Falha simulada absorvida"));
  submitTableAction(state, "Examinar o altar e beber poção");
  assert.ok(state.chronicle.length >= 4);
  state.lastRoll.value = 8;
  movePlayerOnGrid(state, 3, 1);
  assert.equal(state.vaultSecret.triggerMet, false);
  state.lastRoll.value = 18;
  movePlayerOnGrid(state, 3, 1);
  assert.equal(state.vaultSecret.triggerMet, true);
  assert.equal(state.vaultSecret.unlocked, false, "gatilho cumprido não abre sozinho: falta juntar as partes");
  const proj = applySheetResourceDelta(state, "coins", -500, "Teste overdraft");
  assert.ok(proj.overdraftConflicts.length >= 1);
  attestLoreNodeInState(state, "lore-ferreiro", "CONFIRM");
  assert.equal(state.loreNodes[1].verified, true);
  const inspection = inspectPeerPromptForRole(state, "STAGE1_JUDGE_RULES");
  assert.equal(inspection.epistemicScope, "MECHANICAL_SHEET_ONLY");
});

test("showDungeonScreen monta interface isolada diretamente no #app-root sem sidebar cívica", async () => {
  let wired = false;
  const fakeHost = { dataset: {}, addEventListener: () => { wired = true; }, querySelector: () => null };
  const fakeRoot = { innerHTML: "", querySelector: (sel) => (sel === "#dungeon-host" ? fakeHost : null) };
  const prevDoc = globalThis.document;
  globalThis.document = { getElementById: (id) => (id === "app-root" ? fakeRoot : null) };
  try {
    await showDungeonScreen({ screen: "mesa", tableId: "vila-nova" });
    assert.ok(fakeRoot.innerHTML.includes("dungeon-sanctum"));
    assert.ok(!fakeRoot.innerHTML.includes("agora-sidebar"));
    assert.equal(wired, true);
  } finally {
    globalThis.document = prevDoc;
  }
  const s = createDungeonSessionState();
  await triggerShamirVaultUnlock(s);
  assert.equal(s.vaultSecret.unlocked, false, "sem o gatilho do jogo, as partes não abrem o cofre");
  assert.match(s.vaultSecret.lastAttemptPtBr, /gatilho/);
  assert.equal(s.vaultSecret.revealedText, "");
  s.playerPos = { x: 3, y: 1 };
  s.lastRoll.value = 17;
  await triggerShamirVaultUnlock(s);
  assert.equal(s.vaultSecret.unlocked, true);
  assert.equal(s.vaultSecret.sharesSubmitted, 3);
  assert.equal(s.vaultSecret.envelope.shares.length, 5);
  assert.match(s.vaultSecret.revealedText, /sino sob a praça/);
});
