/**
 * @file SUB-18: `pools_base` (PV máximo e reservas `<id>_max`) no `.voxchar` (docs/specs/voxchar-v0.md §10). O arquivo
 * é entrada não confiável: inteiros de 0 a 9999, só ids do pacote declarado, nada de atual nem de `delta_ledger`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createDungeonSessionState } from "../client/js/dungeon/dungeon-state.js";
import { exportVoxchar, importVoxchar } from "../client/js/dungeon/voxchar.js";
import { checkVoxchar } from "../client/js/dungeon/voxchar-check.js";
import { buildVoxcharLink, parseVoxcharLink } from "../client/js/dungeon/voxchar-link.js";
import { projectReserves } from "../client/js/dungeon/sheet-reserves.js";
import { getSystemPack } from "../client/js/dungeon/system-pack.js";

const enc = (obj) => new TextEncoder().encode(typeof obj === "string" ? obj : JSON.stringify(obj));
const dec = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

const file = (pools, { system = "t20", format = 1, extra = {} } = {}) => enc({
  kind: "voxchar", format, system: { id: system, version: 1 },
  sheet: { attributes_lww: { name: "Thora", level: 3, armor_class: 14 }, ...(pools === undefined ? {} : { pools_base: pools }), ...extra },
});
const importTo = async (bytes) => {
  const state = createDungeonSessionState();
  const out = await importVoxchar(state, { bytes });
  return { state, out };
};

test("1. round-trip: PV e PM máximos exportados voltam na ficha nova, atual = máximo, ledger vazio", async () => {
  const { state } = await importTo(file({ hp_max: 24, mp_max: 12 }));
  assert.equal(state.sheet.pools_base.hp_max, 24);
  assert.equal(state.sheet.pools_base.mp_max, 12);
  const again = await importTo(exportVoxchar(state.sheet).bytes);
  assert.equal(again.state.sheet.pools_base.hp_max, 24);
  assert.equal(again.state.sheet.pools_base.mp_max, 12);
  assert.notEqual(again.state.sheet.character_id, state.sheet.character_id);
  assert.deepEqual(again.state.sheet.delta_ledger, []);
  const proj = projectReserves(again.state.sheet, getSystemPack("t20"));
  assert.deepEqual([proj.hp, proj.mp], [{ cur: 24, max: 24 }, { cur: 12, max: 12 }]);
});

test("2. arquivo antigo, sem pools_base, importa como antes e sem reserva", async () => {
  const { state, out } = await importTo(file(undefined));
  assert.equal(out.ok, true);
  assert.equal(Object.hasOwn(state.sheet.pools_base, "mp_max"), false);
  assert.equal(checkVoxchar(file(undefined)).ok, true);
});

test("3. o arquivo exportado não leva atual, ledger, ouro, espaços nem as exclusões da §3", async () => {
  const { state } = await importTo(file({ hp_max: 24, mp_max: 12, hp_current: 3, mp_current: 1, gold_initial: 99, spell_slots_max: { l1: 4 }, hp_temp_max: 5 }));
  state.sheet = { ...state.sheet, owner_pubkey_p256: "CHAVE", sheet_meta: { ...state.sheet.sheet_meta, notes_gm: "segredo" } };
  const raw = new TextDecoder().decode(exportVoxchar(state.sheet).bytes);
  for (const banned of ["hp_current", "mp_current", "delta_ledger", "gold_initial", "spell_slots_max", "hp_temp_max", "owner_pubkey_p256", "notes_gm", "campaign_id", "character_id", "spatial_state"]) {
    assert.equal(raw.includes(banned), false, banned);
  }
  assert.deepEqual(dec(enc(raw)).sheet.pools_base, { hp_max: 24, mp_max: 12 });
  assert.equal(state.sheet.pools_base.gold_initial, 0, "ouro e espaços vêm dos padrões da ficha nova, não do arquivo");
});

test("4. valor fora de 0–9999, fracionário, negativo, texto ou nulo é recusado com campo e motivo; 0 e 9999 passam", () => {
  for (const bad of [10000, -1, 1.5, "12", null, true, [], {}]) {
    const out = checkVoxchar(file({ hp_max: bad }));
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.match(out.issues.join(" "), /PV máximo/);
  }
  assert.match(checkVoxchar(file({ mp_max: 10000 })).issues.join(" "), /PM máximo.*0–9999/);
  assert.equal(checkVoxchar(file({ hp_max: 9999, mp_max: 0 })).ok, true);
  assert.equal(checkVoxchar(file(5)).ok, false, "o campo precisa ser um objeto");
  assert.equal(checkVoxchar(file([1])).ok, false);
});

test("5. id de outro pacote e chave desconhecida são descartados; __proto__ e constructor não têm efeito", async () => {
  const raw = '{"kind":"voxchar","format":1,"system":{"id":"5e","version":1},"sheet":{"attributes_lww":{"name":"Lyra"},"pools_base":{"hp_max":30,"mp_max":8,"fp_max":3,"xyz":9,"__proto__":{"hp_max":1},"constructor":{"x":1}}}}';
  const { state, out } = await importTo(enc(raw));
  assert.equal(out.ok, true);
  assert.equal(state.sheet.pools_base.hp_max, 30);
  for (const k of ["mp_max", "fp_max", "xyz"]) assert.equal(Object.hasOwn(state.sheet.pools_base, k), false, k);
  assert.equal(Object.getPrototypeOf(state.sheet.pools_base), Object.prototype);
  assert.equal(({}).hp_max, undefined);
  const gurps = await importTo(file({ hp_max: 10, fp_max: 11, mp_max: 5 }, { system: "gurps4e" }));
  assert.equal(gurps.state.sheet.pools_base.fp_max, 11);
  assert.equal(Object.hasOwn(gurps.state.sheet.pools_base, "mp_max"), false, "mp não é recurso do GURPS");
});

test("6. leitor antigo: campo fora da lista branca é descartado sem recusar o arquivo (compatibilidade do format 1)", async () => {
  const { state, out } = await importTo(file({ hp_max: 24 }, { extra: { campo_do_futuro: { x: 1 } } }));
  assert.equal(out.ok, true);
  assert.equal(JSON.stringify(state.sheet).includes("campo_do_futuro"), false);
});

test("7. format 2 continua recusado com 'Atualize o Vox'", () => {
  const out = checkVoxchar(file({ hp_max: 24 }, { format: 2 }));
  assert.equal(out.ok, false);
  assert.match(out.issues.join(" "), /Atualize o Vox/);
});

test("8. o link leva os máximos e abrir não grava nada", async () => {
  const { state } = await importTo(file({ hp_max: 24, mp_max: 12 }));
  const before = JSON.stringify(globalThis.localStorage ?? {});
  const parsed = await parseVoxcharLink((await buildVoxcharLink(state.sheet)).href);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.doc.sheet.pools_base, { hp_max: 24, mp_max: 12 });
  assert.equal(JSON.stringify(globalThis.localStorage ?? {}), before);
});

test("9. cópia-modelo (import do link): máximos presentes, atual = máximo, ledger vazio, id novo", async () => {
  const { state: src } = await importTo(file({ hp_max: 24, mp_max: 12 }));
  const parsed = await parseVoxcharLink((await buildVoxcharLink(src.sheet)).href);
  const { state: dst } = await importTo(parsed.bytes);
  assert.notEqual(dst.sheet.character_id, src.sheet.character_id);
  assert.deepEqual(dst.sheet.delta_ledger, []);
  assert.deepEqual(projectReserves(dst.sheet, getSystemPack("t20")).mp, { cur: 12, max: 12 });
});

test("10. aviso ao importar sistema com reservas sem máximos; sem aviso quando vêm ou quando o sistema não tem reserva", async () => {
  const warned = await importTo(file(undefined));
  assert.match(warned.state.campaignNotice, /não traz os máximos/);
  assert.doesNotMatch((await importTo(file({ hp_max: 20, mp_max: 6 }))).state.campaignNotice, /máximos/);
  assert.doesNotMatch((await importTo(file(undefined, { system: "5e" }))).state.campaignNotice, /máximos/);
});

test("chaves permitidas: hp_max só se o pacote tem PV; reservas pelo id e rótulo do pacote", async () => {
  const { poolKeys } = await import("../client/js/dungeon/voxchar-pools.js");
  const sem = poolKeys({ resources: [{ id: "mp", label: "Mana", kind: "pool" }, { id: "slots", kind: "slots" }] });
  assert.deepEqual(sem, [{ key: "mp_max", label: "Mana máximo" }]);
  assert.deepEqual(poolKeys({ resources: [{ id: "hp", kind: "pool" }] }), [{ key: "hp_max", label: "PV máximo" }]);
  assert.deepEqual(poolKeys(null), []);
});
