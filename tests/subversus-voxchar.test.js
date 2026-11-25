/**
 * @file Ficha portátil `.voxchar` (docs/specs/voxchar-v0.md §8): exportar e importar com validação. O arquivo é
 * entrada não confiável; identidade, estado de jogo e notas do Mestre nunca viajam.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { mutateSheetInventory, updateSheetBasicInfo } from "../client/js/dungeon/dungeon-persistence.js";
import { markSheetDeathSave } from "../client/js/dungeon/dungeon-persistence-sheet-system.js";
import { toggleSheetCondition } from "../client/js/dungeon/dungeon-persistence-sheet-rest.js";
import { exportVoxchar, importVoxchar } from "../client/js/dungeon/voxchar.js";
import { checkVoxchar, VOXCHAR_MAX_BYTES } from "../client/js/dungeon/voxchar-check.js";
import { renderSheetEditPanel } from "../client/js/dungeon/screen-sheet-levelup.js";
import { ACTION_HANDLERS } from "../client/js/dungeon/dungeon-controller-actions.js";

const enc = (obj) => new TextEncoder().encode(typeof obj === "string" ? obj : JSON.stringify(obj));
const dec = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

async function richState() {
  const state = createDungeonSessionState();
  await updateSheetBasicInfo(state, { name: "Kael", class_name: "Mago", con: 14, speedFt: 25, hitDie: "6", proficientSaves: ["int"] });
  await mutateSheetInventory(state, "add", { label: "Cota", qty: 2, weightLb: 20, armor: { kind: "media", ac: 14 } });
  state.sheet = { ...state.sheet, owner_pubkey_p256: "CHAVE-SECRETA", campaign_id: "camp_x", sheet_meta: { ...state.sheet.sheet_meta, notes_gm: "segredo do mestre", notes_public: "olá" } };
  await toggleSheetCondition(state, "prone");
  await markSheetDeathSave(state, "failure");
  return state;
}

const valid = (over = {}) => ({
  kind: "voxchar", format: 1, system: { id: "dnd5e-2024", version: 1 },
  sheet: { attributes_lww: { name: "Lyra", class_name: "Ladina", level: 3, armor_class: 14, abilities: { str: 10, dex: 16 } }, ...over },
});

test("round-trip: exportar e importar devolve a ficha-base com id novo e estado de jogo no padrão", async () => {
  const src = await richState();
  const artifact = exportVoxchar(src.sheet);
  assert.match(artifact.filename, /^Kael\.voxchar$/);
  const dst = createDungeonSessionState();
  const out = await importVoxchar(dst, { bytes: artifact.bytes });
  assert.equal(out.ok, true);
  assert.equal(dst.sheet.attributes_lww.name, "Kael");
  assert.equal(dst.sheet.attributes_lww.class_name, "Mago");
  assert.equal(dst.sheet.system_choices.hitDie, 6);
  assert.deepEqual(dst.sheet.system_choices.proficientSaves, ["int"]);
  assert.equal(dst.sheet.attributes_lww.speed_ft, 25);
  assert.equal(Object.values(dst.sheet.inventory_orset).find((i) => i.label === "Cota").qty, 2);
  assert.notEqual(dst.sheet.character_id, src.sheet.character_id);
  assert.equal(dst.sheet.pools_base.hp_max, 20, "PV e espaços iniciais vêm dos padrões da ficha nova");
  assert.deepEqual(dst.sheet.delta_ledger, []);
  assert.deepEqual(dst.sheet.system_choices.conditions ?? [], []);
  assert.equal(dst.sheet.system_choices.deathSaves, undefined);
});

test("exportar não leva identidade, campanha, notas do Mestre, estado de jogo nem retrato", async () => {
  const raw = new TextDecoder().decode(exportVoxchar((await richState()).sheet).bytes);
  for (const banned of ["owner_pubkey_p256", "CHAVE-SECRETA", "campaign_id", "character_id", "spatial_state", "notes_gm", "segredo do mestre", "pools_base", "delta_ledger", "deathSaves", "conditions", "portrait", "avatar"]) {
    assert.equal(raw.includes(banned), false, banned);
  }
  assert.equal(dec(new TextEncoder().encode(raw)).sheet.sheet_meta.notes_public, "olá");
});

test("arquivo acima do limite é recusado sem chamar JSON.parse", () => {
  const original = JSON.parse;
  let calls = 0;
  JSON.parse = (...args) => { calls++; return original(...args); };
  try {
    const out = checkVoxchar(new Uint8Array(VOXCHAR_MAX_BYTES + 1).fill(32));
    assert.equal(out.ok, false);
    assert.match(out.issues[0], /grande demais/);
    assert.equal(calls, 0, "o limite vale antes do parse");
  } finally { JSON.parse = original; }
});

test("malformado, tipo errado, formato e sistema inválidos são recusados com motivo e nada é gravado", async () => {
  const state = createDungeonSessionState();
  const before = JSON.stringify(state.sheet);
  const cases = [
    [enc("{não é json"), /JSON válido/],
    [enc({ ...valid(), kind: "outro" }), /Não é um arquivo \.voxchar/],
    [enc({ ...valid(), format: 2 }), /formato 2/],
    [enc({ ...valid(), system: { id: "t20", version: 1 } }), /não está instalado/],
    [enc({ ...valid(), system: { id: "dnd5e-2024", version: 99 } }), /versão 99/],
    [new Uint8Array(0), /vazio/],
  ];
  for (const [bytes, re] of cases) {
    const out = await importVoxchar(state, { bytes });
    assert.equal(out.ok, false);
    assert.match(out.issues.join(" "), re);
  }
  assert.equal(JSON.stringify(state.sheet), before);
});

test("número fora da faixa e itens em excesso são recusados com o campo e o motivo", () => {
  const ca = checkVoxchar(enc(valid({ attributes_lww: { name: "A", armor_class: 99 } })));
  assert.match(ca.issues[0], /CA: 99 está fora do intervalo 1–40/);
  const qty = checkVoxchar(enc(valid({ attributes_lww: { name: "A" }, inventory_orset: { a: { label: "x", qty: 10 ** 9 } } })));
  assert.match(qty.issues[0], /quantidade/);
  const many = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`i${i}`, { label: `x${i}` }]));
  assert.match(checkVoxchar(enc(valid({ attributes_lww: { name: "A" }, inventory_orset: many }))).issues[0], /mais de 200 itens/);
  const deep = JSON.parse('{"a":'.repeat(12) + "1" + "}".repeat(12));
  assert.match(checkVoxchar(enc({ ...valid(), extra: deep })).issues[0], /complexo demais/);
});

test("campos extras, __proto__ e constructor são descartados sem efeito", async () => {
  const hostile = '{"kind":"voxchar","format":1,"system":{"id":"dnd5e-2024","version":1},"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},'
    + '"sheet":{"__proto__":{"polluted":true},"constructor":{"x":1},"owner_pubkey_p256":"ROUBADA","attributes_lww":{"name":"Mal","__proto__":{"polluted":true},"constructor":"x","abilities":{"str":12}},'
    + '"system_choices":{"deathSaves":{"failures":2},"conditions":["prone"],"constructor":{"prototype":{"polluted":true}}}}}';
  const state = createDungeonSessionState();
  const out = await importVoxchar(state, { bytes: enc(hostile) });
  assert.equal(out.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(state.sheet.owner_pubkey_p256, "");
  assert.equal(state.sheet.attributes_lww.constructor, Object.prototype.constructor);
  assert.notEqual(state.sheet.system_choices.deathSaves?.failures, 2, "estado de jogo do arquivo é ignorado");
  assert.equal(Object.hasOwn(state.sheet.system_choices, "conditions"), false);
});

test("texto com marcação aparece escapado no painel e nunca vira elemento", async () => {
  const state = createDungeonSessionState();
  const evil = valid({ attributes_lww: { name: "<img src=x onerror=alert(1)>", class_name: "<b>x</b>" } });
  await importVoxchar(state, { bytes: enc(evil) });
  const html = renderSheetEditPanel(state.sheet, { issues: [{ field: "voxchar", message: "<script>x</script>" }] });
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("<script>x"), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("importar cria ficha nova e não altera a existente; painel traz os dois botões", async () => {
  const state = await richState();
  const before = state.sheet.character_id;
  await importVoxchar(state, { bytes: enc(valid()) });
  assert.notEqual(state.sheet.character_id, before);
  assert.equal(state.sheet.attributes_lww.name, "Lyra");
  const html = renderSheetEditPanel(state.sheet);
  assert.match(html, /data-dungeon="export-voxchar"/);
  assert.match(html, /type="file"[^>]*data-dungeon="import-voxchar"/);
  assert.equal(typeof ACTION_HANDLERS["export-voxchar"], "function");
});

test("exportar sem ficha não quebra", () => {
  assert.equal(exportVoxchar(null), null);
});
