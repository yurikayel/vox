/**
 * @file SUB-22: "Só para o Mestre" na ficha. O chip liga a próxima rolagem de atributo ou perícia como `gm` (só o autor e
 * o Mestre veem), desliga depois de uma rolagem que deu certo e não afeta a rolagem seguinte.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { d20Formula, recordAbilityRoll, recordSkillRoll } from "../client/js/dungeon/dungeon-sheet-rolls.js";
import { recordFormulaRoll } from "../client/js/dungeon/dungeon-persistence.js";
import { filterOpForPlayer } from "../client/js/dungeon/vtt-sync.js";
import { renderSheetScreen } from "../client/js/dungeon/screen-sheet.js";
import { renderPlayTab } from "../client/js/dungeon/screen-sheet-tabs.js";

function stateFor(systemId = "t20") {
  const state = createDungeonSessionState({ viewerRole: "player", campaignId: "", syncPeer: null });
  Object.assign(state.sheet, { system: { id: systemId, version: 1 }, attributes_lww: { level: 3, abilities: { dex: 14 } }, pools_base: { hp_max: 20, hp_current: 20 }, inventory_orset: {} });
  state.loreNodes = [];
  return state;
}

const chip = (html) => /<button[^>]*data-dungeon="roll-secret"[^>]*>/.exec(html)?.[0] || "";

test("a) perícia com secret: a rolagem e a crônica saem para o Mestre (gm)", async () => {
  const state = stateFor();
  const roll = await recordSkillRoll(state, "acrobacia", { secret: true });
  assert.equal(roll.ok, true);
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  assert.equal(state.rolls.at(-1).visibility, "gm");
});

test("b) atributo com secret também sai gm; sem secret, público", async () => {
  const state = stateFor();
  await recordAbilityRoll(state, "dex", { secret: true });
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  await recordAbilityRoll(state, "dex");
  assert.equal(state.lastFormulaRoll.visibility, "public");
});

test("c) o chip ligado vale para uma rolagem só: a seguinte sai pública e o chip desliga", async () => {
  const state = stateFor();
  state.rollSecret = true;
  await recordSkillRoll(state, "acrobacia");
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  assert.equal(state.rollSecret, false);
  await recordSkillRoll(state, "acrobacia");
  assert.equal(state.lastFormulaRoll.visibility, "public");
});

test("d) rolagem que falha (perícia inexistente) não desliga o chip", async () => {
  const state = stateFor();
  state.rollSecret = true;
  const roll = await recordSkillRoll(state, "nao-existe");
  assert.equal(roll.ok, false);
  assert.equal(state.rollSecret, true);
});

test("e) roll-secret alterna o chip e o clique no atributo respeita o estado", async () => {
  const state = stateFor();
  assert.equal(typeof ACTION_HANDLERS["roll-secret"], "function", "tratador roll-secret existe");
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  assert.equal(state.rollSecret, true);
  await ACTION_HANDLERS["roll-ability"](state, { dataset: { ability: "dex" } }, null, {});
  assert.equal(state.lastFormulaRoll.visibility, "gm");
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  ACTION_HANDLERS["roll-secret"](state, { dataset: {} }, null, {});
  assert.equal(state.rollSecret, false);
});

test("f) a ficha mostra o chip com aria-pressed e a dica de que vale para atributo e perícia", () => {
  const state = stateFor();
  assert.match(chip(renderSheetScreen(state)), /aria-pressed="false"/);
  state.rollSecret = true;
  const html = renderSheetScreen(state);
  assert.match(chip(html), /aria-pressed="true"/);
  assert.match(chip(html), /aria-describedby="dungeon-secret-hint"/);
  assert.match(html, /id="dungeon-secret-hint"[^>]*>Vale para testes de atributo e perícia/);
  assert.match(html, />Só para o Mestre</);
});

test("g) d20Formula só ganha o prefixo /gmroll com secret", () => {
  assert.equal(d20Formula(4, "Teste"), "1d20+4 # Teste");
  assert.equal(d20Formula(4, "Teste", true), "/gmroll 1d20+4 # Teste");
});

test("h) perícia sem atributo declarado e fórmula com @var desconhecida não some da aba Jogar", () => {
  const html = renderPlayTab([{ id: "x", label: "Ofício", roll: "1d20+@xyz", damage: "", tag: "pericia" }], [{ id: "oficio", label: "Ofício", bonus: 0 }]);
  assert.match(html, /data-dungeon="roll-action" data-action-id="x"/);
});

/** Estado que captura a op `ROLL_RECORDED` que iria para o Mestre. */
function stateWithPeer() {
  const state = stateFor();
  state.vttKeypair = { routeId: "autor" };
  state.sent = [];
  state.syncPeer = { dispatchOp: async (op) => { state.sent.push(op); return null; } };
  return state;
}

test("i) a op da rolagem do chip não chega a um jogador que não é o autor (filterOpForPlayer)", async () => {
  const state = stateWithPeer();
  state.rollSecret = true;
  await recordSkillRoll(state, "acrobacia");
  const [op] = state.sent;
  assert.equal(op.type, "ROLL_RECORDED");
  assert.equal(op.payload.rollResult.visibility, "gm");
  assert.equal(filterOpForPlayer(null, op, "outro-jogador"), null, "outro jogador não recebe");
  assert.equal(filterOpForPlayer(null, op, "autor"), op, "o autor recebe o eco");
  await recordSkillRoll(state, "acrobacia");
  assert.equal(filterOpForPlayer(null, state.sent[1], "outro-jogador"), state.sent[1], "controle: a pública chega");
});

test("j) ação clicável e fórmula livre ignoram o chip e o desligam: saem públicas e o chip não fica ligado", async () => {
  const state = stateFor();
  state.sheet.sheet_meta = { clickable_actions: [{ id: "a1", label: "Espada", roll: "1d20+2", damage: "", tag: "ataque" }] };
  state.rollSecret = true;
  await ACTION_HANDLERS["roll-action"](state, { dataset: { actionId: "a1" } }, null, {});
  assert.equal(state.lastFormulaRoll.visibility, "public");
  assert.equal(state.rollSecret, false);
  state.rollSecret = true;
  await recordFormulaRoll(state, "1d6");
  assert.equal(state.lastFormulaRoll.visibility, "public");
  assert.equal(state.rollSecret, false);
  state.rollSecret = true;
  await ACTION_HANDLERS["roll-quick"](state, { dataset: { formula: "1d20" } }, null, {});
  assert.equal(state.rollSecret, false);
});

test("m) rolagem pela mesa de fair-play e fórmula inválida também desligam o chip", async () => {
  const state = stateFor();
  state.campaignId = "c1";
  state.fairplayDriver = { openRoll: async () => "r1" };
  const store = { loadCampaign: async () => ({ fairplay: { keys: { a: 1, b: 2 }, rolls: { r1: { phase: "done" } } } }) };
  const storage = { getItem: () => "1" };
  state.rollSecret = true;
  const viaTable = await recordFormulaRoll(state, "1d20", { store, storage, maxWaitMs: 1, pollMs: 1, sleep: async () => {} });
  assert.equal(viaTable.pending, true, "a rolagem foi pela mesa");
  assert.equal(state.rollSecret, false);
  state.rollSecret = true;
  const bad = await recordFormulaRoll(state, "isso não é dado", { store });
  assert.equal(bad.ok, false);
  assert.equal(state.rollSecret, false);
});

test("k) clique no painel do HUD ignora o chip (que ali não aparece) e o desliga", async () => {
  const state = stateFor();
  state.rollSecret = true;
  const el = { dataset: { ability: "dex" }, closest: (sel) => (sel === "[data-hud-panel]" ? {} : null) };
  await ACTION_HANDLERS["roll-ability"](state, el, null, {});
  assert.equal(state.lastFormulaRoll.visibility, "public");
  assert.equal(state.rollSecret, false);
  state.rollSecret = true;
  await ACTION_HANDLERS["roll-skill"](state, { ...el, dataset: { skill: "acrobacia" } }, null, {});
  assert.equal(state.lastFormulaRoll.visibility, "public");
  assert.equal(state.rollSecret, false);
});

test("l) 'Última rolagem' da rolagem secreta mostra 🔒 e 'Só para o Mestre'; a pública não", async () => {
  const state = stateFor();
  await recordSkillRoll(state, "acrobacia", { secret: true });
  const banner = (html) => /<p class="dungeon-inline-status"[^>]*>.*?<\/p>/s.exec(html)?.[0] || "";
  assert.match(banner(renderSheetScreen(state)), /<span aria-hidden="true">🔒<\/span> Só para o Mestre/);
  await recordSkillRoll(state, "acrobacia");
  assert.doesNotMatch(banner(renderSheetScreen(state)), /🔒|Só para o Mestre/);
});
