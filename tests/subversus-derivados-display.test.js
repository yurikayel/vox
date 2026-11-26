/**
 * @file Fatia 1 do SUB-17: o `display` do pacote leva a faixa de derivados e o rótulo da defesa no HUD, com o D&D
 * idêntico ao de antes, validação fechada (tetos, texto puro, fonte desconhecida ignorada) e fallback sem `display`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { DND5E_2024_PACK } from "../client/js/dungeon/system-pack-dnd5e-2024.js";
import { validateSystemPack, getSystemPack } from "../client/js/dungeon/system-pack.js";
import { deriveSheet } from "../client/js/dungeon/system-derive.js";
import { DISPLAY_ENTRIES_MAX, defenseLabel, derivedStats, showBlock, validateDisplay } from "../client/js/dungeon/system-display.js";
import { buildMobileLine } from "../client/js/dungeon/hud-status-model.js";

const sheet = () => ({ character_id: "a", system: { id: "dnd5e-2024", version: 1 }, attributes_lww: { level: 5, armor_class: 16, abilities: { dex: 14, wis: 12 } }, pools_base: { hp_max: 24, hp_current: 18 }, inventory_orset: {} });
const entry = (id, label = "Rótulo", source = { formula: "speed" }) => ({ id, label, source });
const derived = () => deriveSheet(DND5E_2024_PACK, { level: 5, abilities: { dex: 14, wis: 12 } }, []);

test("D&D: a faixa continua byte a byte igual à de antes do display (golden)", () => {
  const html = renderDerivedStrip(sheet(), 18);
  assert.equal(html.length, 5051);
  assert.equal(createHash("sha256").update(html).digest("hex"), "d99b75c71813aa2c29c82c81b2fdf7d9aa01e619ef706c3423b7af6ac5e1f85d");
  assert.match(html, /<dl class="dungeon-derived-list">\s*<div class="dungeon-derived-stat"><dt>Proficiência<\/dt><dd>\+3<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>CA sem armadura<\/dt><dd>12<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Iniciativa<\/dt><dd>\+2<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Percepção passiva<\/dt><dd>11<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Deslocamento<\/dt><dd>9 m<\/dd><\/div>\s*<\/dl>/);
});

test("fallback: pacote sem display mostra os mesmos cinco números que o pacote com display", () => {
  const { display, ...bare } = DND5E_2024_PACK;
  assert.ok(display);
  assert.deepEqual(derivedStats(bare, derived()), derivedStats(DND5E_2024_PACK, derived()));
  assert.equal(derivedStats(bare, derived()).length, 5);
  assert.equal(defenseLabel(bare), "CA");
});

test("validação: o pacote do D&D com display continua válido e o registro o guarda", () => {
  assert.deepEqual(validateSystemPack(DND5E_2024_PACK), { ok: true, errors: [] });
  assert.equal(getSystemPack("dnd5e-2024").display.hud.defense, "armorClass");
});

test("validação: tetos, rótulo e ids repetidos recusam o pacote", () => {
  assert.deepEqual(validateDisplay(undefined), []);
  assert.equal(validateDisplay("x").length, 1);
  assert.equal(validateDisplay({ derived: "x" }).length, 1);
  const cheio = Array.from({ length: 16 }, (_, i) => entry(`e${i}`));
  assert.deepEqual(validateDisplay({ derived: cheio }), []);
  assert.equal(validateDisplay({ derived: [...cheio, entry("extra")] }).length, 1);
  assert.equal(validateDisplay({ derived: [entry("a", "")] }).length, 1);
  assert.equal(validateDisplay({ derived: [entry("a", "x".repeat(25))] }).length, 1);
  assert.deepEqual(validateDisplay({ derived: [entry("a", "x".repeat(24))] }), []);
  assert.equal(validateDisplay({ derived: [entry("a"), entry("a")] }).length, 1);
  assert.equal(validateDisplay({ derived: [entry("1x")] }).length, 1);
  assert.equal(validateDisplay({ derived: [null] }).length, 1);
});

test("fonte desconhecida, computed fora do registro e computed que lança somem sem derrubar o resto", () => {
  const pack = { labels: {}, display: { derived: [entry("a", "A", { formula: "nope" }), entry("b", "B", { computed: "nope" }), entry("c", "C", { computed: "boom" }), entry("d", "D", { formula: "speed" })] } };
  assert.deepEqual(validateDisplay(pack.display), []);
  const registry = Object.freeze({ boom: () => { throw new Error("x"); } });
  assert.deepEqual(derivedStats(pack, derived(), registry), [{ label: "D", value: "9 m" }]);
});

test("computed registrado roda; saída malformada é descartada; nomes herdados do Object não valem", () => {
  const pack = { labels: {}, display: { derived: [entry("a", "A", { computed: "ok" }), entry("b", "B", { computed: "bad" }), entry("c", "C", { computed: "toString" }), entry("d", "D", { formula: "constructor" })] } };
  const registry = Object.freeze({ ok: (d, label) => ({ label, value: "7" }), bad: () => ({ label: 1 }) });
  assert.deepEqual(derivedStats(pack, derived(), registry), [{ label: "A", value: "7" }]);
});

test("texto puro: rótulo com HTML é escapado na faixa e no HUD", () => {
  const mal = "<b>x</b>";
  const pack = { ...DND5E_2024_PACK, display: { derived: [entry("armorClass", mal, { formula: "armorClass" })], hud: { defense: "armorClass" } } };
  assert.equal(defenseLabel(pack), mal);
  const hud = buildMobileLine({ name: "A", hp: null, ac: 12, acLabel: defenseLabel(pack) });
  assert.equal(hud, `A · ${mal} 12`);
  assert.equal(buildMobileLine({ name: "A", hp: "1/2", ac: 12 }), "A · PV 1/2 · CA 12");
});

test("defesa do HUD: id que não existe ou rótulo grande demais cai no literal CA", () => {
  assert.equal(defenseLabel(null), "CA");
  assert.equal(defenseLabel({ display: { derived: [entry("a")], hud: { defense: "zzz" } } }), "CA");
  assert.equal(defenseLabel({ display: { derived: [entry("a", "x".repeat(30))], hud: { defense: "a" } } }), "CA");
  assert.equal(defenseLabel({ display: { derived: [entry("a", "Defesa")], hud: { defense: "a" } } }), "Defesa");
});

test("registro herdado não vale e pacote sem validar é cortado no teto de entradas", () => {
  const herdado = Object.create({ viaProto: (d, label) => ({ label, value: "1" }) });
  const pack = { labels: {}, display: { derived: [entry("a", "A", { computed: "viaProto" })] } };
  assert.deepEqual(derivedStats(pack, derived(), herdado), []);
  const muitos = { labels: {}, display: { derived: Array.from({ length: 20 }, (_, i) => entry(`e${i}`)) } };
  assert.equal(derivedStats(muitos, derived()).length, DISPLAY_ENTRIES_MAX);
  assert.equal(DISPLAY_ENTRIES_MAX, 16);
});

test("HUD: rótulo da defesa com HTML vindo do pacote sai escapado no HTML renderizado", async () => {
  const { renderHudStatus } = await import("../client/js/dungeon/screen-hud-status.js");
  const { registerSystemPack } = await import("../client/js/dungeon/system-pack.js");
  const display = { ...DND5E_2024_PACK.display, derived: DND5E_2024_PACK.display.derived.map((e) => (e.id === "armorClass" ? { ...e, label: "<b>x</b>" } : e)) };
  registerSystemPack({ ...DND5E_2024_PACK, id: "pacote-rotulo-html", display });
  const own = { character_id: "ana", char_id: "ana", name: "Lyra", system: { id: "pacote-rotulo-html" }, attributes_lww: { armor_class: 12 }, pools_base: { hp_max: 10 }, delta_ledger: [] };
  const html = renderHudStatus({ sheet: own }, { tokens: [] });
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt; 12/);
  assert.equal(html.includes("<b>x</b>"), false);
});

test("faixa: deslocamento fracionário usa vírgula decimal (25 pés = 7,5 m)", () => {
  const d = deriveSheet(DND5E_2024_PACK, { level: 5, abilities: { dex: 14, wis: 12 }, speedFt: 25 }, []);
  assert.equal(d.speed.meters, 7.5);
  assert.deepEqual(derivedStats(DND5E_2024_PACK, d).at(-1), { label: "Deslocamento", value: "7,5 m" });
});

const t20Sheet = () => ({ ...sheet(), system: { id: "t20", version: 1 } });

test("T20: a faixa mostra Defesa, Iniciativa e Deslocamento, sem salvaguardas por atributo nem testes contra a morte", () => {
  const html = renderDerivedStrip(t20Sheet(), 0);
  assert.match(html, /<dl class="dungeon-derived-list">\s*<div class="dungeon-derived-stat"><dt>Defesa sem armadura<\/dt><dd>14<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Iniciativa<\/dt><dd>\+4<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Deslocamento<\/dt><dd>9 m<\/dd><\/div>\s*<\/dl>/);
  for (const gone of ["Proficiência", "Percepção passiva", "Salvaguardas", "Testes contra a morte", "Sucessos"]) assert.equal(html.includes(gone), false, gone);
});

test("T20: o HUD chama a defesa de Defesa; o D&D segue com o mesmo hash e com CA", () => {
  assert.equal(defenseLabel(getSystemPack("t20")), "Defesa");
  assert.equal(defenseLabel(getSystemPack("dnd5e-2024")), "CA");
  assert.equal(buildMobileLine({ name: "A", hp: "18/24", ac: 14, acLabel: defenseLabel(getSystemPack("t20")) }), "A · PV 18/24 · Defesa 14");
  assert.equal(createHash("sha256").update(renderDerivedStrip(sheet(), 18)).digest("hex"), "d99b75c71813aa2c29c82c81b2fdf7d9aa01e619ef706c3423b7af6ac5e1f85d");
});

test("blocos: sem display.blocks valem todos; com a lista, só os listados; blocks que não é lista recusa o pacote", () => {
  assert.equal(showBlock(null, "saves"), true);
  assert.equal(showBlock({ display: { blocks: ["conditions"] } }, "saves"), false);
  assert.equal(showBlock({ display: { blocks: ["conditions"] } }, "conditions"), true);
  assert.equal(validateDisplay({ blocks: "saves" }).length, 1);
  assert.deepEqual(validateDisplay({ blocks: ["saves", "desconhecido"] }), []);
  assert.deepEqual(validateSystemPack(getSystemPack("t20")), { ok: true, errors: [] });
});
