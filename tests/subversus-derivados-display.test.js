/**
 * @file Fatia 1 do SUB-17: o `display` do pacote leva a faixa de derivados e o rótulo da defesa no HUD, com a 5e
 * idêntico ao de antes, validação fechada (tetos, texto puro, fonte desconhecida ignorada) e fallback sem `display`.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { renderDerivedStrip } from "../client/js/dungeon/screen-sheet-derived.js";
import { PACK_5E } from "../client/js/dungeon/system-pack-5e.js";
import { validateSystemPack, getSystemPack } from "../client/js/dungeon/system-pack.js";
import { deriveSheet } from "../client/js/dungeon/system-derive.js";
import { COMPUTED_STATS, DISPLAY_ENTRIES_MAX, defenseLabel, derivedStats, showBlock, validateDisplay } from "../client/js/dungeon/system-display.js";
import { buildMobileLine } from "../client/js/dungeon/hud-status-model.js";

const sheet = () => ({ character_id: "a", system: { id: "5e", version: 1 }, attributes_lww: { level: 5, armor_class: 16, abilities: { dex: 14, wis: 12 } }, pools_base: { hp_max: 24, hp_current: 18 }, inventory_orset: {} });
const entry = (id, label = "Rótulo", source = { formula: "speed" }) => ({ id, label, source });
const derived = () => deriveSheet(PACK_5E, { level: 5, abilities: { dex: 14, wis: 12 } }, []);

test("5e: a faixa continua byte a byte igual à de antes do display (golden)", () => {
  const html = renderDerivedStrip(sheet(), 18);
  assert.equal(html.length, 5051);
  assert.equal(createHash("sha256").update(html).digest("hex"), "2b13fcd781b73b098d59382150b9ccae4200ca2c12ece7015dbd1cb34e4c47e2");
  assert.match(html, /<dl class="dungeon-derived-list">\s*<div class="dungeon-derived-stat"><dt>Proficiência<\/dt><dd>\+3<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>CA sem armadura<\/dt><dd>12<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Iniciativa<\/dt><dd>\+2<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Percepção passiva<\/dt><dd>11<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Deslocamento<\/dt><dd>9 m<\/dd><\/div>\s*<\/dl>/);
});

test("fallback: pacote sem display mostra os mesmos cinco números que o pacote com display", () => {
  const { display, ...bare } = PACK_5E;
  assert.ok(display);
  assert.deepEqual(derivedStats(bare, derived()), derivedStats(PACK_5E, derived()));
  assert.equal(derivedStats(bare, derived()).length, 5);
  assert.equal(defenseLabel(bare), "CA");
});

test("validação: o pacote da 5e com display continua válido e o registro o guarda", () => {
  assert.deepEqual(validateSystemPack(PACK_5E), { ok: true, errors: [] });
  assert.equal(getSystemPack("5e").display.hud.defense, "armorClass");
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
  const pack = { ...PACK_5E, display: { derived: [entry("armorClass", mal, { formula: "armorClass" })], hud: { defense: "armorClass" } } };
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
  const display = { ...PACK_5E.display, derived: PACK_5E.display.derived.map((e) => (e.id === "armorClass" ? { ...e, label: "<b>x</b>" } : e)) };
  registerSystemPack({ ...PACK_5E, id: "pacote-rotulo-html", display });
  const own = { character_id: "ana", char_id: "ana", name: "Lyra", system: { id: "pacote-rotulo-html" }, attributes_lww: { armor_class: 12 }, pools_base: { hp_max: 10 }, delta_ledger: [] };
  const html = renderHudStatus({ sheet: own }, { tokens: [] });
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt; 12/);
  assert.equal(html.includes("<b>x</b>"), false);
});

test("faixa: deslocamento fracionário usa vírgula decimal (25 pés = 7,5 m)", () => {
  const d = deriveSheet(PACK_5E, { level: 5, abilities: { dex: 14, wis: 12 }, speedFt: 25 }, []);
  assert.equal(d.speed.meters, 7.5);
  assert.deepEqual(derivedStats(PACK_5E, d).at(-1), { label: "Deslocamento", value: "7,5 m" });
});

const t20Sheet = () => ({ ...sheet(), system: { id: "t20", version: 1 } });

test("T20: a faixa mostra Defesa, Iniciativa e Deslocamento, sem salvaguardas por atributo nem testes contra a morte", () => {
  const html = renderDerivedStrip(t20Sheet(), 0);
  assert.match(html, /<dl class="dungeon-derived-list">\s*<div class="dungeon-derived-stat"><dt>Defesa<\/dt><dd>14<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Iniciativa<\/dt><dd>\+4<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>Deslocamento<\/dt><dd>9 m<\/dd><\/div>\s*<div class="dungeon-derived-stat"><dt>PV<\/dt><dd>24\/24<\/dd><\/div>\s*<\/dl>/);
  assert.equal(/<dt>PM<\/dt>/.test(html), false, "sem máximo de PM gravado a reserva não aparece na lista de números");
  assert.equal(html.includes("Condições"), false, "o pacote t20 não declara condições; o bloco só aparece quando houver lista");
  assert.equal(html.includes("sem armadura"), false);
  for (const gone of ["Proficiência", "Percepção passiva", "Salvaguardas", "Testes contra a morte", "Sucessos", "Descanso"]) assert.equal(html.includes(gone), false, gone);
});

test("T20: o HUD chama a defesa de Defesa; a 5e segue com o mesmo hash e com CA", () => {
  assert.equal(defenseLabel(getSystemPack("t20")), "Defesa");
  assert.equal(defenseLabel(getSystemPack("5e")), "CA");
  assert.equal(buildMobileLine({ name: "A", hp: "18/24", ac: 14, acLabel: defenseLabel(getSystemPack("t20")) }), "A · PV 18/24 · Defesa 14");
  assert.equal(createHash("sha256").update(renderDerivedStrip(sheet(), 18)).digest("hex"), "2b13fcd781b73b098d59382150b9ccae4200ca2c12ece7015dbd1cb34e4c47e2");
});

test("blocos: sem display.blocks valem todos; com a lista, só os listados; blocks que não é lista recusa o pacote", () => {
  assert.equal(showBlock(null, "saves"), true);
  assert.equal(showBlock({ display: { blocks: ["conditions"] } }, "saves"), false);
  assert.equal(showBlock({ display: { blocks: ["conditions"] } }, "conditions"), true);
  assert.equal(validateDisplay({ blocks: "saves" }).length, 1);
  assert.deepEqual(validateDisplay({ blocks: ["saves", "desconhecido"] }), []);
  assert.deepEqual(validateSystemPack(getSystemPack("t20")), { ok: true, errors: [] });
});

test("blocos: teto de 8, só textos, e o erro de blocks não esconde erro de derived", () => {
  const ok = Array.from({ length: 8 }, (_, i) => `b${i}`);
  assert.deepEqual(validateDisplay({ blocks: ok }), []);
  assert.equal(validateDisplay({ blocks: [...ok, "b8"] }).length, 1);
  assert.equal(validateDisplay({ blocks: ["saves", 3] }).length, 1);
  const ruins = validateDisplay({ blocks: "x", derived: [entry("a", "")] });
  assert.equal(ruins.length, 2);
  assert.match(ruins.join("|"), /display\.blocks/);
  assert.match(ruins.join("|"), /display\.derived\[0\]/);
});

test("Defesa sem sufixo em pacote sem armadura; 5e mantém o sufixo", () => {
  const nua = { ...derived(), armored: false };
  const semArmor = { labels: {}, formulas: {}, display: { derived: [entry("armorClass", "Defesa", { formula: "armorClass" })] } };
  assert.equal(derivedStats(semArmor, nua)[0].label, "Defesa");
  assert.equal(derivedStats(PACK_5E, nua).find((s) => s.label.startsWith("CA")).label, "CA sem armadura");
});

const gurpsSheet = (inv = {}) => ({ character_id: "g", system: { id: "gurps4e", version: 1 }, attributes_lww: { abilities: { st: 13, dx: 11, iq: 10, ht: 12 } }, pools_base: { hp_max: 12, hp_current: 12 }, inventory_orset: inv });
const gstat = (html, label) => html.match(new RegExp(`<dt>${label.replace(/[.()]/g, (c) => `\\${c}`)}</dt><dd>([^<]*)</dd>`))?.[1];
const bag = (weightLb, extra = {}) => ({ saco: { id: "saco", label: "Saco", qty: 1, weightLb, equipped: false, tags: [], ...extra } });

test("GURPS: a faixa mostra PV, PF, Esquiva, Deslocamento, Desloc. Básico, Velocidade Básica e Carga, sem blocos da 5e", () => {
  const html = renderDerivedStrip(gurpsSheet());
  const got = Object.fromEntries(["PV (ST)", "PF (HT)", "Esquiva", "Deslocamento", "Desloc. Básico", "Velocidade Básica", "Carga"].map((l) => [l, gstat(html, l)]));
  assert.deepEqual(got, { "PV (ST)": "13", "PF (HT)": "12", Esquiva: "8", Deslocamento: "5", "Desloc. Básico": "5", "Velocidade Básica": "5,75", Carga: "Nenhuma" });
  for (const gone of ["Proficiência", "CA", "Percepção passiva", "Salvaguardas", "Testes contra a morte", "Condições"]) assert.equal(html.includes(`<dt>${gone}`) || html.includes(gone + "</h4>"), false, gone);
});

test("GURPS: o peso do inventário muda Carga, Deslocamento e Esquiva; item sem peso é avisado", () => {
  const html = renderDerivedStrip(gurpsSheet(bag(70)));
  assert.deepEqual([gstat(html, "Carga"), gstat(html, "Deslocamento"), gstat(html, "Esquiva")], ["Média", "3", "6"]);
  assert.equal(gstat(renderDerivedStrip(gurpsSheet(bag(1000))), "Carga"), "Sobrecarga");
  const sem = renderDerivedStrip(gurpsSheet(bag(undefined)));
  assert.equal(gstat(sem, "Carga"), "Nenhuma (itens sem peso)");
});

test("GURPS: o registro de computed é fechado (só nomes gurps.*) e 5e e T20 seguem iguais", () => {
  assert.deepEqual(Object.keys(COMPUTED_STATS).sort(), ["gurps.basicMove", "gurps.basicSpeed", "gurps.dodge", "gurps.fp", "gurps.hp", "gurps.load", "gurps.move"]);
  assert.deepEqual(validateSystemPack(getSystemPack("gurps4e")), { ok: true, errors: [] });
  assert.equal(createHash("sha256").update(renderDerivedStrip(sheet(), 18)).digest("hex"), "2b13fcd781b73b098d59382150b9ccae4200ca2c12ece7015dbd1cb34e4c47e2");
  assert.equal(gstat(renderDerivedStrip(t20Sheet()), "Defesa"), "14");
});

test("GURPS: pesos absurdos (Infinity, estouro 1e308 × 1e308) caem em Sobrecarga; negativo é Nenhuma", () => {
  const carga = (inv) => gstat(renderDerivedStrip(gurpsSheet(inv)), "Carga");
  assert.equal(carga(bag(Infinity)), "Sobrecarga");
  assert.equal(carga(bag(1e308, { qty: 1e308 })), "Sobrecarga");
  assert.equal(carga({ ...bag(1e308), outro: { id: "outro", label: "Outro", qty: 1, weightLb: 1e308, equipped: false, tags: [] } }), "Sobrecarga");
  assert.equal(carga(bag(-50)), "Nenhuma");
});

test("GURPS: peso null ou vazio conta como sem peso e os níveis Pesada e Muito pesada aparecem", () => {
  const carga = (inv) => gstat(renderDerivedStrip(gurpsSheet(inv)), "Carga");
  assert.equal(carga(bag(null)), "Nenhuma (itens sem peso)");
  assert.equal(carga(bag("")), "Nenhuma (itens sem peso)");
  assert.equal(carga(bag(150)), "Pesada");
  assert.equal(carga(bag(300)), "Muito pesada");
});
