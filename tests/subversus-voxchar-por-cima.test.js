/**
 * @file "Importar por cima" do `.voxchar` (SUB-27): troca só a lista branca na ficha aberta, mantém `character_id`,
 * dono, PV atual e estado de jogo, pede confirmação e nunca aceita dono, id ou estado vindos do arquivo.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { markSheetDeathSave } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";
import { toggleSheetCondition } from "../client/js/dungeon/dungeon-persistence-sheet-rest.js";
import { importVoxchar } from "../client/js/dungeon/voxchar.js";
import { createCampaign } from "../client/js/dungeon/vtt-schema.js";
import { checkVoxchar } from "../client/js/dungeon/voxchar-check.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";
import { runHudOp } from "../client/js/dungeon/dungeon-hud-actions.js";
import { isPlayerAuthorizedForSheetOp } from "../client/js/dungeon/vtt-sheet-auth.js";

const over = await import("../client/js/dungeon/voxchar-over.js").catch(() => ({}));
const need = (name) => { assert.equal(typeof over[name], "function", `voxchar-over.js deve exportar ${name}`); return over[name]; };
const enc = (obj) => new TextEncoder().encode(JSON.stringify(obj));

const incoming = (extra = {}) => ({
  kind: "voxchar", format: 1, system: { id: "5e", version: 1 },
  sheet: {
    attributes_lww: { name: "Lyra", class_name: "Ladina", level: 3, armor_class: 14, abilities: { str: 10, dex: 16 } },
    inventory_orset: {},
    sheet_meta: { notes_public: "da Lyra" },
    ...extra,
  },
});

async function currentState() {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", class_name: "Mago", con: 14, hitDie: "6" });
  await mutateSheetInventory(state, "add", { label: "Cota", qty: 1, weightLb: 20 });
  await toggleSheetCondition(state, "prone");
  await markSheetDeathSave(state, "failure");
  state.sheet = {
    ...state.sheet,
    owner_pubkey_p256: "vx_dono",
    delta_ledger: [{ op_id: "d1", target_pool: "hp_current", delta: -7 }],
    sheet_meta: { ...state.sheet.sheet_meta, notes_gm: "segredo do mestre" },
  };
  return state;
}

const sheetOf = (state) => state.sheet;
const pending = (state) => state.voxcharOver?.pending;

test("o módulo exporta a API do importar por cima", () => {
  for (const name of ["buildOverwrittenSheet", "stageVoxcharOver", "confirmVoxcharOver", "cancelVoxcharOver", "runVoxcharOver"]) {
    assert.equal(typeof over[name], "function", name);
  }
});

test("buildOverwrittenSheet troca a lista branca e mantém id, dono, PV atual, estado de jogo e notas do Mestre", async () => {
  const state = await currentState();
  const before = sheetOf(state);
  const checked = checkVoxchar(enc(incoming()));
  const next = need("buildOverwrittenSheet")(before, checked.doc, checked.pack);
  assert.equal(next.attributes_lww.name, "Lyra");
  assert.equal(next.attributes_lww.class_name, "Ladina");
  assert.equal(next.attributes_lww.level, 3);
  assert.equal(next.sheet_meta.notes_public, "da Lyra");
  assert.equal(Object.values(next.inventory_orset).some((i) => i.label === "Cota"), false, "inventário vem do arquivo");
  assert.equal(next.character_id, before.character_id);
  assert.equal(next.owner_pubkey_p256, "vx_dono");
  assert.deepEqual(next.delta_ledger, before.delta_ledger, "PV atual (ledger) fica");
  assert.equal(next.sheet_meta.notes_gm, "segredo do mestre");
  assert.deepEqual(next.system_choices.conditions, before.system_choices.conditions, "condições ficam");
  assert.deepEqual(next.system_choices.deathSaves, before.system_choices.deathSaves, "salvaguardas contra a morte ficam");
});

test("arquivo de outro dono não troca dono, id, campanha nem ledger; campo fora da lista branca é ignorado", async () => {
  const state = await currentState();
  const before = sheetOf(state);
  const hostile = incoming({
    owner_pubkey_p256: "vx_outro", character_id: "char_outro", campaign_id: "camp_outra",
    delta_ledger: [{ op_id: "x", target_pool: "hp_current", delta: 999 }],
    spatial_state: { x: 99 }, extra: "lixo", __proto__: { admin: true },
  });
  hostile.sheet.sheet_meta.notes_gm = "do arquivo";
  hostile.sheet.attributes_lww.owner_pubkey_p256 = "vx_outro";
  const checked = checkVoxchar(enc(hostile));
  assert.equal(checked.ok, true);
  const next = need("buildOverwrittenSheet")(before, checked.doc, checked.pack);
  assert.equal(next.owner_pubkey_p256, "vx_dono");
  assert.equal(next.character_id, before.character_id);
  assert.equal(next.campaign_id, before.campaign_id);
  assert.deepEqual(next.delta_ledger, before.delta_ledger);
  assert.equal(next.sheet_meta.notes_gm, "segredo do mestre");
  assert.deepEqual(next.spatial_state, before.spatial_state);
  assert.equal("extra" in next, false);
  assert.equal("owner_pubkey_p256" in next.attributes_lww, false);
});

test("armado: o arquivo só fica pendente; a ficha não muda até confirmar; confirmar grava na mesma ficha", async () => {
  const state = await currentState();
  const id = sheetOf(state).character_id;
  await need("runVoxcharOver")(state, "arm", { checked: true });
  assert.equal(state.voxcharOver?.armed, true);
  const out = await importVoxchar(state, { bytes: enc(incoming()) });
  assert.equal(out.ok, true);
  assert.equal(sheetOf(state).attributes_lww.name, "Kael", "nada gravado antes da confirmação");
  assert.equal(pending(state).name, "Lyra");
  await need("runVoxcharOver")(state, "confirm", {});
  assert.equal(sheetOf(state).attributes_lww.name, "Lyra");
  assert.equal(sheetOf(state).character_id, id, "mesma ficha, sem ficha nova");
  assert.equal(sheetOf(state).owner_pubkey_p256, "vx_dono");
  assert.equal(sheetOf(state).sheet_meta.notes_gm, "segredo do mestre");
  assert.equal(pending(state), null);
  assert.match(state.campaignNotice, /Lyra/);
});

test("cancelar descarta o pendente e não grava nada", async () => {
  const state = await currentState();
  await need("runVoxcharOver")(state, "arm", { checked: true });
  await importVoxchar(state, { bytes: enc(incoming()) });
  assert.ok(pending(state));
  await need("runVoxcharOver")(state, "cancel", {});
  assert.equal(pending(state), null);
  assert.equal(sheetOf(state).attributes_lww.name, "Kael");
});

test("confirmar depois de trocar a ficha aberta descarta o pendente e não grava", async () => {
  const state = await currentState();
  await need("runVoxcharOver")(state, "arm", { checked: true });
  await importVoxchar(state, { bytes: enc(incoming()) });
  state.sheet = { ...state.sheet, character_id: "char_outra_aberta" };
  await need("runVoxcharOver")(state, "confirm", {});
  assert.equal(sheetOf(state).attributes_lww.name, "Kael");
  assert.equal(pending(state), null);
  assert.match(state.campaignNotice, /outra ficha|mudou/i);
});

test("armado com arquivo inválido: recusa com motivo e nada fica pendente", async () => {
  const state = await currentState();
  await need("runVoxcharOver")(state, "arm", { checked: true });
  const out = await importVoxchar(state, { bytes: enc({ kind: "nao-e-voxchar" }) });
  assert.equal(out.ok, false);
  assert.ok(out.issues.length > 0);
  assert.equal(pending(state) ?? null, null);
});

test("sem armar, importar continua criando ficha nova", async () => {
  const state = await currentState();
  const id = sheetOf(state).character_id;
  const out = await importVoxchar(state, { bytes: enc(incoming()) });
  assert.equal(out.ok, true);
  assert.notEqual(sheetOf(state).character_id, id);
  assert.equal(sheetOf(state).attributes_lww.name, "Lyra");
});

test("o portão barra quem não é dono: SHEET_UPSERT sobre ficha existente só passa para o dono", async () => {
  const camp = { sheetsById: { char_a: { character_id: "char_a", owner_pubkey_p256: "vx_dono" } } };
  const op = (actor) => ({ type: "SHEET_UPSERT", actor, payload: { sheet: { character_id: "char_a", owner_pubkey_p256: actor } } });
  assert.equal(isPlayerAuthorizedForSheetOp(camp, op("vx_dono")), true);
  assert.equal(isPlayerAuthorizedForSheetOp(camp, op("vx_intruso")), false);
});

test("painel: caixa 'substituir esta ficha' e o bloco de confirmação com nome, Substituir e Cancelar", async () => {
  const state = await currentState();
  const off = renderSheetEditPanel(state.sheet, {});
  assert.match(off, /data-dungeon="hud-op" data-hud-op="voxchar-over" data-step="arm"/);
  assert.doesNotMatch(off, /data-step="confirm"/);
  const armed = renderSheetEditPanel(state.sheet, { over: { armed: true, pending: null } });
  assert.match(armed, /data-step="arm"[^>]*checked/);
  const html = renderSheetEditPanel(state.sheet, { over: { armed: true, pending: { name: "<b>Lyra</b>" } } });
  assert.match(html, /data-step="confirm"/);
  assert.match(html, /data-step="cancel"/);
  assert.match(html, /&lt;b&gt;Lyra&lt;\/b&gt;/, "nome do arquivo sai escapado");
  assert.equal(typeof ACTION_HANDLERS["hud-op"], "function", "a ação hud-op existe e leva o passo");
});

test("a ação voxchar-over arma, confirma e cancela pelo handler da tela", async () => {
  const state = await currentState();

  await runHudOp(state, { dataset: { hudOp: "voxchar-over", step: "arm" }, checked: true });
  assert.equal(state.voxcharOver?.armed, true);
  await runHudOp(state, { dataset: { hudOp: "voxchar-over", step: "arm" }, checked: false });
  assert.equal(state.voxcharOver?.armed, false);
});

test("o spec do importar por cima existe e cita a lista de campos mantidos", () => {
  const file = new URL("../docs/specs/voxchar-importar-por-cima.md", import.meta.url);
  assert.equal(existsSync(file), true, "docs/specs/voxchar-importar-por-cima.md");
  const doc = readFileSync(file, "utf8");
  assert.match(doc, /character_id/);
  assert.match(doc, /delta_ledger/);
  assert.match(doc, /confirma/i);
});

const FOCUS_ARM = '[data-hud-op="voxchar-over"][data-step="arm"]';
const FOCUS_CONFIRM = '[data-hud-op="voxchar-over"][data-step="confirm"]';

/** Estado com par P2P simulado: `accept` diz se o portão grava ou devolve a campanha como estava. */
async function peerState(accept) {
  const state = await currentState();
  const before = state.sheet;
  const campaign = { ...createCampaign({ id: "camp_p" }), sheetsById: { [before.character_id]: before }, activeSheetId: before.character_id };
  const accepted = (op) => ({ ...campaign, sheetsById: { [before.character_id]: op.payload.sheet } });
  state.syncPeer = { dispatchOp: async (op) => (accept ? accepted(op) : campaign) };
  return state;
}

async function stageAndConfirm(state) {
  await need("runVoxcharOver")(state, "arm", { checked: true });
  await importVoxchar(state, { bytes: enc(incoming()) });
  return need("runVoxcharOver")(state, "confirm", {});
}

test("portão recusa (intruso): a ficha não muda e o aviso não diz 'atualizada'", async () => {
  const state = await peerState(false);
  const out = await stageAndConfirm(state);
  assert.equal(out.ok, false);
  assert.equal(sheetOf(state).attributes_lww.name, "Kael");
  assert.doesNotMatch(state.campaignNotice, /atualizada/);
  assert.match(state.campaignNotice, /Não foi possível substituir/);
});

test("portão aceita: o aviso 'atualizada' aparece e o resultado é ok", async () => {
  const state = await peerState(true);
  const out = await stageAndConfirm(state);
  assert.equal(out.ok, true);
  assert.match(state.campaignNotice, /Lyra.*atualizada/);
});

test("jogador no par P2P: o pedido segue ao Mestre sem afirmar 'atualizada' nem recusa", async () => {
  const state = await peerState(false);
  state.joinMode = "p2p_player";
  const out = await stageAndConfirm(state);
  assert.equal(out.ok, true);
  assert.doesNotMatch(state.campaignNotice, /atualizada|Não foi possível/);
  assert.match(state.campaignNotice, /Mestre/);
});

test("foco volta a um ponto previsível: Substituir após escolher o arquivo, a caixa após cancelar ou confirmar", async () => {
  const state = await peerState(true);
  await need("runVoxcharOver")(state, "arm", { checked: true });
  await importVoxchar(state, { bytes: enc(incoming()) });
  assert.equal(state.hudPanelFocus, FOCUS_CONFIRM);
  state.hudPanelFocus = "";
  await need("runVoxcharOver")(state, "cancel", {});
  assert.equal(state.hudPanelFocus, FOCUS_ARM);
  await need("runVoxcharOver")(state, "arm", { checked: true });
  await importVoxchar(state, { bytes: enc(incoming()) });
  state.hudPanelFocus = "";
  await need("runVoxcharOver")(state, "confirm", {});
  assert.equal(state.hudPanelFocus, FOCUS_ARM);
});
